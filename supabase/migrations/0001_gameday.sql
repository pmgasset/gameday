-- GameDay core schema. Apply with `supabase db push`; never run this through a browser client.
create extension if not exists pgcrypto;

create type public.member_role as enum ('player', 'co_commissioner', 'commissioner');
create type public.member_status as enum ('pending', 'active', 'rejected', 'removed');
create type public.game_status as enum ('scheduled', 'in_progress', 'final', 'postponed', 'cancelled');

create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, display_name text not null check (char_length(display_name) between 1 and 60), avatar_url text, created_at timestamptz not null default now());
create table public.pools (id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 1 and 100), timezone text not null default 'America/New_York', created_at timestamptz not null default now());
create table public.pool_members (pool_id uuid not null references public.pools(id) on delete cascade, user_id uuid not null references public.profiles(id) on delete cascade, role public.member_role not null default 'player', status public.member_status not null default 'pending', joined_at timestamptz not null default now(), primary key(pool_id, user_id));
create table public.seasons (id uuid primary key default gen_random_uuid(), pool_id uuid not null references public.pools(id) on delete cascade, nfl_season integer not null check(nfl_season between 2020 and 2100), is_active boolean not null default false, unique(pool_id,nfl_season));
create table public.weeks (id uuid primary key default gen_random_uuid(), season_id uuid not null references public.seasons(id) on delete cascade, nfl_week smallint not null check(nfl_week between 1 and 25), status text not null default 'open' check(status in ('draft','open','complete')), unique(season_id,nfl_week));
create table public.teams (id uuid primary key default gen_random_uuid(), provider text not null default 'balldontlie', provider_id text, abbreviation text not null unique, city text not null, name text not null, conference text, division text, logo_key text, active boolean not null default true, unique(provider,provider_id));
create table public.games (id uuid primary key default gen_random_uuid(), provider text not null default 'balldontlie', provider_game_id text not null, nfl_season integer not null, nfl_week smallint not null, home_team_id uuid not null references public.teams(id), away_team_id uuid not null references public.teams(id), kickoff_at timestamptz not null, status public.game_status not null default 'scheduled', period text, game_clock text, home_score smallint, away_score smallint, winning_team_id uuid references public.teams(id), provider_synced_at timestamptz, manual_override boolean not null default false, override_by uuid references public.profiles(id), override_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(provider,provider_game_id));
create table public.pool_game_lines (id uuid primary key default gen_random_uuid(), pool_id uuid not null references public.pools(id) on delete cascade, game_id uuid not null references public.games(id) on delete cascade, underdog_team_id uuid not null references public.teams(id), favorite_team_id uuid not null references public.teams(id), underdog_spread numeric(5,1) not null check(underdog_spread > 0), source text, manual_override boolean not null default true, entered_by uuid references public.profiles(id), entered_at timestamptz not null default now(), unique(pool_id,game_id), check(underdog_team_id <> favorite_team_id));
create table public.picks (id uuid primary key default gen_random_uuid(), pool_id uuid not null references public.pools(id) on delete cascade, week_id uuid not null references public.weeks(id) on delete cascade, game_id uuid not null references public.games(id), player_id uuid not null references public.profiles(id), team_id uuid not null references public.teams(id), stored_spread numeric(5,1) not null check(stored_spread > 0), submitted_by uuid not null references public.profiles(id), submitted_at timestamptz not null default now(), updated_at timestamptz not null default now(), final_points numeric(5,1), scored_at timestamptz, unique(pool_id,week_id,player_id));
create table public.invitations (id uuid primary key default gen_random_uuid(), pool_id uuid not null references public.pools(id) on delete cascade, token_hash text not null unique, created_by uuid not null references public.profiles(id), expires_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now());
create table public.audit_events (id bigint generated always as identity primary key, pool_id uuid not null references public.pools(id) on delete cascade, actor_id uuid references public.profiles(id), action text not null, entity_type text not null, entity_id text not null, before_data jsonb, after_data jsonb, created_at timestamptz not null default now());
create table public.provider_syncs (id bigint generated always as identity primary key, provider text not null, attempted_at timestamptz not null default now(), succeeded_at timestamptz, error_message text, affected_games integer not null default 0);
create index picks_game_idx on public.picks(game_id); create index games_week_idx on public.games(nfl_season,nfl_week); create index members_user_idx on public.pool_members(user_id,status);

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$ begin insert into public.profiles(id,display_name) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'display_name',''), split_part(coalesce(new.email,'Player'),'@',1))); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create function public.is_active_member(target_pool uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists(select 1 from pool_members where pool_id=target_pool and user_id=auth.uid() and status='active') $$;
create function public.is_pool_admin(target_pool uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists(select 1 from pool_members where pool_id=target_pool and user_id=auth.uid() and status='active' and role in ('commissioner','co_commissioner')) $$;
create function public.shares_active_pool(other_user uuid) returns boolean language sql stable security definer set search_path = public as $$ select exists(select 1 from pool_members mine join pool_members theirs on theirs.pool_id=mine.pool_id where mine.user_id=auth.uid() and mine.status='active' and theirs.user_id=other_user and theirs.status='active') $$;
create function public.pick_is_revealed(target_game uuid) returns boolean language sql stable security definer set search_path = public as $$
  select now() >= least(g.kickoff_at, (date_trunc('week', g.kickoff_at at time zone 'America/New_York') + case when extract(isodow from g.kickoff_at at time zone 'America/New_York') <= 3 then interval '-1 day 13 hours' else interval '6 days 13 hours' end) at time zone 'America/New_York') from games g where g.id=target_game
$$;

alter table public.profiles enable row level security; alter table public.pools enable row level security; alter table public.pool_members enable row level security; alter table public.seasons enable row level security; alter table public.weeks enable row level security; alter table public.teams enable row level security; alter table public.games enable row level security; alter table public.pool_game_lines enable row level security; alter table public.picks enable row level security; alter table public.invitations enable row level security; alter table public.audit_events enable row level security;
create policy "profiles visible to active pool peers" on profiles for select using (id=auth.uid() or shares_active_pool(id)); create policy "profile self update" on profiles for update using(id=auth.uid()) with check(id=auth.uid());
create policy "active members see pools" on pools for select using(is_active_member(id));
create policy "members see pool roster" on pool_members for select using(is_active_member(pool_id));
create policy "active members see seasons" on seasons for select using(is_active_member(pool_id));
create policy "active members see weeks" on weeks for select using(exists(select 1 from seasons s where s.id=season_id and is_active_member(s.pool_id)));
create policy "teams readable to signed in users" on teams for select to authenticated using(true);
create policy "members see relevant games" on games for select using(exists(select 1 from pool_game_lines l where l.game_id=id and is_active_member(l.pool_id)));
create policy "members see lines" on pool_game_lines for select using(is_active_member(pool_id));
-- Critical privacy policy: an active member may only read their own pick until reveal; all pool picks reveal afterward.
create policy "revealed or own picks only" on picks for select using(is_active_member(pool_id) and (player_id=auth.uid() or pick_is_revealed(game_id)));
create policy "admins see audit" on audit_events for select using(is_pool_admin(pool_id));
create policy "admins see invitations" on invitations for select using(is_pool_admin(pool_id));

create function public.submit_pick(p_pool_id uuid, p_week_id uuid, p_game_id uuid, p_team_id uuid, p_player_id uuid default auth.uid()) returns public.picks language plpgsql security definer set search_path = public as $$
declare v_line public.pool_game_lines; v_game public.games; v_pick public.picks; v_actor uuid := auth.uid();
begin
 if v_actor is null then raise exception 'Authentication required'; end if;
 if p_player_id <> v_actor and not is_pool_admin(p_pool_id) then raise exception 'Not authorized to submit for this player'; end if;
 if not exists(select 1 from pool_members where pool_id=p_pool_id and user_id=p_player_id and status='active') then raise exception 'Player is not active in this pool'; end if;
 select * into v_line from pool_game_lines where pool_id=p_pool_id and game_id=p_game_id;
 select * into v_game from games where id=p_game_id;
 if not found or v_line.underdog_team_id <> p_team_id then raise exception 'Only the designated underdog is eligible'; end if;
 if now() >= least(v_game.kickoff_at, (date_trunc('week',v_game.kickoff_at at time zone 'America/New_York') + case when extract(isodow from v_game.kickoff_at at time zone 'America/New_York') <= 3 then interval '-1 day 13 hours' else interval '6 days 13 hours' end) at time zone 'America/New_York') then raise exception 'This pick is locked'; end if;
 insert into picks(pool_id,week_id,game_id,player_id,team_id,stored_spread,submitted_by) values(p_pool_id,p_week_id,p_game_id,p_player_id,p_team_id,v_line.underdog_spread,v_actor)
 on conflict(pool_id,week_id,player_id) do update set game_id=excluded.game_id,team_id=excluded.team_id,stored_spread=excluded.stored_spread,submitted_by=excluded.submitted_by,updated_at=now() returning * into v_pick;
 insert into audit_events(pool_id,actor_id,action,entity_type,entity_id,after_data) values(p_pool_id,v_actor,case when v_actor=p_player_id then 'pick_submitted' else 'assisted_pick_submitted' end,'pick',v_pick.id::text,jsonb_build_object('game_id',p_game_id,'team_id',p_team_id,'spread',v_line.underdog_spread));
 return v_pick;
end $$;

create function public.score_final_game(p_game_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare g public.games; begin select * into g from games where id=p_game_id; if g.status <> 'final' or g.home_score is null or g.away_score is null then return; end if;
 update picks p set final_points=case when (p.team_id=g.home_team_id and g.home_score>g.away_score) or (p.team_id=g.away_team_id and g.away_score>g.home_score) then p.stored_spread else 0 end, scored_at=now() where p.game_id=p_game_id and (p.final_points is distinct from case when (p.team_id=g.home_team_id and g.home_score>g.away_score) or (p.team_id=g.away_team_id and g.away_score>g.home_score) then p.stored_spread else 0 end); end $$;
revoke all on function public.submit_pick(uuid,uuid,uuid,uuid,uuid) from public; grant execute on function public.submit_pick(uuid,uuid,uuid,uuid,uuid) to authenticated;
