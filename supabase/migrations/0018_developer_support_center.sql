-- Developer support is intentionally separate from pool administration.  A
-- manually designated developer can inspect a time-limited, read-only support
-- session for any account; the session never changes the developer's auth
-- cookie and cannot perform actions as the target account.

create table public.developer_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.developer_support_sessions (
  id uuid primary key default gen_random_uuid(),
  developer_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  ended_at timestamptz,
  check (developer_id <> target_user_id)
);

create index developer_support_sessions_active_idx
  on public.developer_support_sessions(developer_id, expires_at desc)
  where ended_at is null;

alter table public.developer_admins enable row level security;
alter table public.developer_support_sessions enable row level security;

create or replace function public.is_developer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select exists(select 1 from public.developer_admins where user_id = auth.uid()) $$;

create or replace function public.developer_account_directory(p_search text default '')
returns table(user_id uuid, display_name text, email text, created_at timestamptz, last_sign_in_at timestamptz, pool_count bigint)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_developer() then raise exception 'Not authorized'; end if;

  return query
  select profile.id, profile.display_name, account.email::text, account.created_at,
    account.last_sign_in_at,
    count(member.pool_id)::bigint
  from auth.users account
  join public.profiles profile on profile.id = account.id
  left join public.pool_members member on member.user_id = profile.id
  where nullif(trim(p_search), '') is null
    or profile.display_name ilike '%' || trim(p_search) || '%'
    or account.email ilike '%' || trim(p_search) || '%'
  group by profile.id, profile.display_name, account.email, account.created_at, account.last_sign_in_at
  order by account.created_at desc
  limit 100;
end;
$$;

create or replace function public.begin_developer_impersonation(p_target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
begin
  if not public.is_developer() then raise exception 'Not authorized'; end if;
  if p_target_user_id = auth.uid() then raise exception 'Choose a different account'; end if;
  if not exists (select 1 from public.profiles where id = p_target_user_id) then raise exception 'Account not found'; end if;

  update public.developer_support_sessions
  set ended_at = now()
  where developer_id = auth.uid()
    and ended_at is null;

  insert into public.developer_support_sessions(developer_id, target_user_id)
  values(auth.uid(), p_target_user_id)
  returning id into v_session_id;

  return v_session_id;
end;
$$;

create or replace function public.end_developer_impersonation(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.developer_support_sessions
  set ended_at = now()
  where id = p_session_id
    and developer_id = auth.uid()
    and ended_at is null;

  if not found then raise exception 'Support session not found'; end if;
end;
$$;

create or replace function public.developer_support_snapshot(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_session public.developer_support_sessions;
  v_account jsonb;
  v_memberships jsonb;
  v_picks jsonb;
  v_events jsonb;
begin
  select * into v_session
  from public.developer_support_sessions
  where id = p_session_id
    and developer_id = auth.uid()
    and ended_at is null
    and expires_at > now();
  if not found then raise exception 'Support session is unavailable or expired'; end if;

  select jsonb_build_object(
    'userId', profile.id,
    'displayName', profile.display_name,
    'email', account.email,
    'createdAt', account.created_at,
    'lastSignInAt', account.last_sign_in_at
  ) into v_account
  from public.profiles profile
  join auth.users account on account.id = profile.id
  where profile.id = v_session.target_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'poolId', pool.id,
    'poolName', pool.name,
    'role', member.role,
    'status', member.status,
    'joinedAt', member.joined_at,
    'pickBlocked', member.pick_blocked_at is not null,
    'activeMembers', (select count(*) from public.pool_members teammate where teammate.pool_id = pool.id and teammate.status = 'active')
  ) order by member.joined_at desc), '[]'::jsonb) into v_memberships
  from public.pool_members member
  join public.pools pool on pool.id = member.pool_id
  where member.user_id = v_session.target_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'poolName', pool.name,
    'week', week.nfl_week,
    'seasonType', week.season_type,
    'team', team.city || ' ' || team.name,
    'spread', pick.stored_spread,
    'submittedAt', pick.submitted_at,
    'points', pick.final_points
  ) order by pick.submitted_at desc), '[]'::jsonb) into v_picks
  from (
    select * from public.picks
    where player_id = v_session.target_user_id
    order by submitted_at desc
    limit 12
  ) pick
  join public.pools pool on pool.id = pick.pool_id
  join public.weeks week on week.id = pick.week_id
  join public.teams team on team.id = pick.team_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'action', event.action,
    'entityType', event.entity_type,
    'createdAt', event.created_at
  ) order by event.created_at desc), '[]'::jsonb) into v_events
  from (
    select action, entity_type, created_at
    from public.audit_events
    where actor_id = v_session.target_user_id
    order by created_at desc
    limit 12
  ) event;

  return jsonb_build_object(
    'sessionId', v_session.id,
    'startedAt', v_session.started_at,
    'expiresAt', v_session.expires_at,
    'account', v_account,
    'memberships', v_memberships,
    'recentPicks', v_picks,
    'recentActivity', v_events
  );
end;
$$;

revoke all on function public.is_developer() from public;
revoke all on function public.developer_account_directory(text) from public;
revoke all on function public.begin_developer_impersonation(uuid) from public;
revoke all on function public.end_developer_impersonation(uuid) from public;
revoke all on function public.developer_support_snapshot(uuid) from public;
grant execute on function public.is_developer() to authenticated;
grant execute on function public.developer_account_directory(text) to authenticated;
grant execute on function public.begin_developer_impersonation(uuid) to authenticated;
grant execute on function public.end_developer_impersonation(uuid) to authenticated;
grant execute on function public.developer_support_snapshot(uuid) to authenticated;
