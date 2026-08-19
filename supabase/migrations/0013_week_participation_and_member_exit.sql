create table public.pool_week_participation (
  week_id uuid not null references public.weeks(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  skipped_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (week_id, member_id)
);

alter table public.pool_week_participation enable row level security;

create policy "members see their own weekly participation"
on public.pool_week_participation for select
using (member_id = auth.uid());

create or replace function public.create_pool_week(p_pool_id uuid, p_week smallint)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season uuid;
  v_week uuid;
  v_status text;
  v_actor uuid := auth.uid();
begin
  if not public.is_pool_admin(p_pool_id) then raise exception 'Not authorized'; end if;
  if p_week not between 1 and 25 then raise exception 'Invalid NFL week'; end if;

  select id into v_season from public.seasons where pool_id = p_pool_id and is_active = true;
  if not found then raise exception 'No active season'; end if;

  select id, status into v_week, v_status
  from public.weeks where season_id = v_season and nfl_week = p_week;
  if found then
    if v_status = 'complete' then raise exception 'A completed week cannot be reopened'; end if;
    if v_status = 'draft' then update public.weeks set status = 'open' where id = v_week; end if;
  else
    insert into public.weeks(season_id, nfl_week, status)
    values(v_season, p_week, 'open') returning id into v_week;
  end if;

  insert into public.audit_events(pool_id, actor_id, action, entity_type, entity_id, after_data)
  values(p_pool_id, v_actor, 'week_opened', 'week', v_week::text, jsonb_build_object('nfl_week', p_week));
  return v_week;
end
$$;

create or replace function public.prevent_skipped_week_pick()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.pool_week_participation
    where week_id = new.week_id and member_id = new.player_id
  ) then raise exception 'You are skipping this week. Return to the week before making a pick.'; end if;
  return new;
end
$$;

create trigger picks_require_week_participation
before insert or update of pool_id, week_id, player_id on public.picks
for each row execute function public.prevent_skipped_week_pick();

create or replace function public.skip_pool_week(
  p_pool_id uuid,
  p_week_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_existing record;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.pool_members
    where pool_id = p_pool_id and user_id = v_actor and status = 'active'
  ) then raise exception 'You are not an active member of this pool'; end if;
  if not exists (
    select 1 from public.weeks w join public.seasons s on s.id = w.season_id
    where w.id = p_week_id and s.pool_id = p_pool_id and w.status = 'open'
  ) then raise exception 'This week is not open for skipping'; end if;

  select p.id, g.kickoff_at into v_existing
  from public.picks p join public.games g on g.id = p.game_id
  where p.pool_id = p_pool_id and p.week_id = p_week_id and p.player_id = v_actor
  for update;
  if found then
    if now() >= public.effective_pick_deadline(v_existing.kickoff_at) then
      raise exception 'Your locked pick cannot be removed';
    end if;
    delete from public.picks where id = v_existing.id;
  end if;

  insert into public.pool_week_participation(week_id, member_id)
  values (p_week_id, v_actor)
  on conflict (week_id, member_id) do update set updated_at = now();
  insert into public.audit_events(pool_id, actor_id, action, entity_type, entity_id, after_data)
  values (p_pool_id, v_actor, 'week_skipped', 'week_member', p_week_id::text || ':' || v_actor::text, jsonb_build_object('week_id', p_week_id));
end
$$;

create or replace function public.resume_pool_week(
  p_pool_id uuid,
  p_week_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.pool_members
    where pool_id = p_pool_id and user_id = v_actor and status = 'active'
  ) then raise exception 'You are not an active member of this pool'; end if;
  if not exists (
    select 1 from public.weeks w join public.seasons s on s.id = w.season_id
    where w.id = p_week_id and s.pool_id = p_pool_id and w.status = 'open'
  ) then raise exception 'This week is not open'; end if;
  delete from public.pool_week_participation where week_id = p_week_id and member_id = v_actor;
  if found then
    insert into public.audit_events(pool_id, actor_id, action, entity_type, entity_id, after_data)
    values (p_pool_id, v_actor, 'week_skip_cleared', 'week_member', p_week_id::text || ':' || v_actor::text, jsonb_build_object('week_id', p_week_id));
  end if;
end
$$;

create or replace function public.leave_pool(p_pool_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if exists (
    select 1 from public.pool_members
    where pool_id = p_pool_id and user_id = v_actor and role = 'commissioner' and status = 'active'
  ) then raise exception 'Transfer or close the pool before leaving as commissioner'; end if;
  update public.pool_members set status = 'removed'
  where pool_id = p_pool_id and user_id = v_actor and status = 'active';
  if not found then raise exception 'Active membership not found'; end if;
  insert into public.audit_events(pool_id, actor_id, action, entity_type, entity_id, after_data)
  values (p_pool_id, v_actor, 'member_left_pool', 'pool_member', v_actor::text, jsonb_build_object('status', 'removed'));
end
$$;

revoke all on function public.skip_pool_week(uuid, uuid) from public;
revoke all on function public.resume_pool_week(uuid, uuid) from public;
revoke all on function public.leave_pool(uuid) from public;
grant execute on function public.skip_pool_week(uuid, uuid) to authenticated;
grant execute on function public.resume_pool_week(uuid, uuid) to authenticated;
grant execute on function public.leave_pool(uuid) to authenticated;
