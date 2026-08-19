-- Preseason and regular-season NFL weeks share week numbers.  Keep the phase
-- on both the pool week and provider game so "Preseason Week 1" can never be
-- mistaken for "Week 1" of the regular season.

alter table public.weeks
  add column if not exists season_type text not null default 'regular'
  check (season_type in ('preseason', 'regular', 'postseason'));

alter table public.games
  add column if not exists season_type text not null default 'regular'
  check (season_type in ('preseason', 'regular', 'postseason'));

alter table public.weeks
  drop constraint if exists weeks_season_id_nfl_week_key;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.weeks'::regclass
      and conname = 'weeks_season_id_season_type_nfl_week_key'
  ) then
    alter table public.weeks
      add constraint weeks_season_id_season_type_nfl_week_key
      unique (season_id, season_type, nfl_week);
  end if;
end
$$;

drop index if exists public.games_week_idx;
create index if not exists games_week_phase_idx on public.games(nfl_season, season_type, nfl_week);

create or replace function public.create_pool_week(
  p_pool_id uuid,
  p_week smallint,
  p_season_type text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season uuid;
  v_week uuid;
  v_status text;
  v_type text := lower(coalesce(nullif(trim(p_season_type), ''), 'regular'));
  v_actor uuid := auth.uid();
begin
  if not public.is_pool_admin(p_pool_id) then raise exception 'Not authorized'; end if;
  if v_type not in ('preseason', 'regular', 'postseason') then raise exception 'Invalid season type'; end if;
  if p_week not between 1 and (case when v_type = 'preseason' then 4 when v_type = 'regular' then 18 else 5 end) then
    raise exception 'Invalid NFL week for this season type';
  end if;

  select id into v_season from public.seasons where pool_id = p_pool_id and is_active = true;
  if not found then raise exception 'No active season'; end if;

  select id, status into v_week, v_status
  from public.weeks where season_id = v_season and nfl_week = p_week and season_type = v_type;
  if found then
    if v_status = 'complete' then raise exception 'A completed week cannot be reopened'; end if;
    if v_status = 'draft' then update public.weeks set status = 'open' where id = v_week; end if;
  else
    insert into public.weeks(season_id, nfl_week, season_type, status)
    values(v_season, p_week, v_type, 'open') returning id into v_week;
  end if;

  insert into public.audit_events(pool_id, actor_id, action, entity_type, entity_id, after_data)
  values(p_pool_id, v_actor, 'week_opened', 'week', v_week::text,
    jsonb_build_object('nfl_week', p_week, 'season_type', v_type));
  return v_week;
end
$$;

-- Preserve the existing two-argument RPC for integrations that only support
-- regular-season gameplay.
create or replace function public.create_pool_week(p_pool_id uuid, p_week smallint)
returns uuid
language sql
security definer
set search_path = public
as $$ select public.create_pool_week(p_pool_id, p_week, 'regular') $$;

create or replace function public.nfl_week_sunday(
  p_season integer,
  p_week smallint,
  p_season_type text
) returns date
language sql
stable
security definer
set search_path = public
as $$
  with slate as (
    select (g.kickoff_at at time zone 'America/New_York')::date as game_day
    from public.games g
    where g.nfl_season = p_season
      and g.nfl_week = p_week
      and g.season_type = p_season_type
  ),
  busiest_sunday as (
    select game_day from slate where extract(isodow from game_day) = 7
    group by game_day order by count(*) desc, game_day limit 1
  ),
  earliest as (
    select case when extract(isodow from min(game_day)) <= 2
      then min(game_day) - extract(isodow from min(game_day))::integer
      else min(game_day) + (7 - extract(isodow from min(game_day))::integer)
    end as game_day from slate
  )
  select coalesce((select game_day from busiest_sunday), (select game_day from earliest))
$$;

create or replace function public.nfl_week_picks_open_at(p_season integer, p_week smallint, p_season_type text)
returns timestamptz language sql stable security definer set search_path = public
as $$ select (public.nfl_week_sunday(p_season, p_week, p_season_type) - 5 + interval '9 hours') at time zone 'America/New_York' $$;

create or replace function public.nfl_week_global_deadline(p_season integer, p_week smallint, p_season_type text)
returns timestamptz language sql stable security definer set search_path = public
as $$ select (public.nfl_week_sunday(p_season, p_week, p_season_type) + interval '13 hours') at time zone 'America/New_York' $$;

create or replace function public.weekly_picks_open_at(p_game_id uuid)
returns timestamptz language sql stable security definer set search_path = public
as $$ select public.nfl_week_picks_open_at(g.nfl_season, g.nfl_week, g.season_type) from public.games g where g.id = p_game_id $$;

create or replace function public.effective_pick_deadline(p_game_id uuid)
returns timestamptz language sql stable security definer set search_path = public
as $$ select least(g.kickoff_at, public.nfl_week_global_deadline(g.nfl_season, g.nfl_week, g.season_type)) from public.games g where g.id = p_game_id $$;

create or replace function public.pick_is_revealed(target_game uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select now() >= public.effective_pick_deadline(target_game) $$;

create or replace function public.submit_pick(
  p_pool_id uuid, p_week_id uuid, p_game_id uuid, p_team_id uuid,
  p_player_id uuid default auth.uid()
) returns public.picks
language plpgsql security definer set search_path = public
as $$
declare
  v_line public.pool_game_lines; v_game public.games; v_pick public.picks;
  v_existing public.picks; v_season integer; v_nfl_week smallint;
  v_season_type text; v_week_status text; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_player_id <> v_actor and not public.is_pool_admin(p_pool_id) then raise exception 'Not authorized to submit for this player'; end if;
  if not exists (select 1 from public.pool_members where pool_id=p_pool_id and user_id=p_player_id and status='active') then raise exception 'Player is not active in this pool'; end if;
  if exists (select 1 from public.pool_members where pool_id=p_pool_id and user_id=p_player_id and pick_blocked_at is not null) then raise exception 'Picking is temporarily paused. Contact the commissioner.'; end if;

  select s.nfl_season,w.nfl_week,w.season_type,w.status into v_season,v_nfl_week,v_season_type,v_week_status
  from public.weeks w join public.seasons s on s.id=w.season_id
  where w.id=p_week_id and s.pool_id=p_pool_id;
  if not found or v_week_status <> 'open' then raise exception 'This pool week is not open for picks'; end if;
  select * into v_game from public.games where id=p_game_id and nfl_season=v_season and nfl_week=v_nfl_week and season_type=v_season_type;
  if not found then raise exception 'Game does not belong to this pool week'; end if;
  if v_game.status <> 'scheduled' then raise exception 'This game is no longer available for picking'; end if;
  select * into v_line from public.pool_game_lines where pool_id=p_pool_id and game_id=p_game_id;
  if not found or v_line.underdog_team_id <> p_team_id then raise exception 'Only the designated underdog is eligible'; end if;
  if now() < public.weekly_picks_open_at(p_game_id) then raise exception 'Picks open Tuesday at 9:00 AM Eastern'; end if;
  if now() >= public.effective_pick_deadline(p_game_id) then raise exception 'This pick is locked'; end if;
  select * into v_existing from public.picks where pool_id=p_pool_id and week_id=p_week_id and player_id=p_player_id for update;
  if found and now() >= public.effective_pick_deadline(v_existing.game_id) then raise exception 'Your existing pick is locked and cannot be changed'; end if;
  insert into public.picks(pool_id,week_id,game_id,player_id,team_id,stored_spread,submitted_by)
  values(p_pool_id,p_week_id,p_game_id,p_player_id,p_team_id,v_line.underdog_spread,v_actor)
  on conflict(pool_id,week_id,player_id) do update set game_id=excluded.game_id,team_id=excluded.team_id,stored_spread=excluded.stored_spread,submitted_by=excluded.submitted_by,updated_at=now()
  returning * into v_pick;
  insert into public.audit_events(pool_id,actor_id,action,entity_type,entity_id,after_data)
  values(p_pool_id,v_actor,case when v_actor=p_player_id then 'pick_submitted' else 'assisted_pick_submitted' end,'pick',v_pick.id::text,jsonb_build_object('game_id',p_game_id,'team_id',p_team_id,'spread',v_line.underdog_spread));
  return v_pick;
end
$$;

create or replace function public.prefill_odds_line(p_pool_id uuid, p_game_id uuid, p_underdog_team_id uuid, p_spread numeric, p_source text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_game public.games; v_favorite uuid;
begin
  if p_spread <= 0 then raise exception 'Spread must be positive'; end if;
  select * into v_game from public.games where id=p_game_id;
  if not found or p_underdog_team_id not in (v_game.home_team_id,v_game.away_team_id) then raise exception 'Invalid odds line'; end if;
  if not exists (select 1 from public.weeks w join public.seasons s on s.id=w.season_id where s.pool_id=p_pool_id and s.nfl_season=v_game.nfl_season and w.nfl_week=v_game.nfl_week and w.season_type=v_game.season_type and w.status='open') then raise exception 'Game is not in an open pool week'; end if;
  v_favorite := case when p_underdog_team_id=v_game.away_team_id then v_game.home_team_id else v_game.away_team_id end;
  insert into public.pool_game_lines(pool_id,game_id,underdog_team_id,favorite_team_id,underdog_spread,source,manual_override,entered_by)
  values(p_pool_id,p_game_id,p_underdog_team_id,v_favorite,p_spread,left(p_source,100),false,null)
  on conflict(pool_id,game_id) do update set underdog_team_id=excluded.underdog_team_id,favorite_team_id=excluded.favorite_team_id,underdog_spread=excluded.underdog_spread,source=excluded.source,manual_override=false,entered_by=null,entered_at=now(),provider_odds_updated_at=null
  where pool_game_lines.manual_override=false and pool_game_lines.odds_locked_at is null;
end
$$;

create or replace function public.snapshot_provider_odds_line(p_pool_id uuid, p_game_id uuid, p_underdog_team_id uuid, p_spread numeric, p_source text, p_provider_odds_updated_at timestamptz)
returns boolean language plpgsql security definer set search_path = public
as $$
declare v_game public.games; v_favorite uuid; v_line_id uuid;
begin
  if p_spread <= 0 then raise exception 'Spread must be positive'; end if;
  select * into v_game from public.games where id=p_game_id;
  if not found or p_underdog_team_id not in (v_game.home_team_id,v_game.away_team_id) then raise exception 'Invalid odds line'; end if;
  if not exists (select 1 from public.weeks w join public.seasons s on s.id=w.season_id where s.pool_id=p_pool_id and s.nfl_season=v_game.nfl_season and w.nfl_week=v_game.nfl_week and w.season_type=v_game.season_type and w.status='open') then raise exception 'Game is not in an open pool week'; end if;
  v_favorite := case when p_underdog_team_id=v_game.away_team_id then v_game.home_team_id else v_game.away_team_id end;
  insert into public.pool_game_lines(pool_id,game_id,underdog_team_id,favorite_team_id,underdog_spread,source,manual_override,entered_by,entered_at,provider_odds_updated_at,odds_locked_at)
  values(p_pool_id,p_game_id,p_underdog_team_id,v_favorite,p_spread,left(p_source,100),false,null,now(),p_provider_odds_updated_at,now())
  on conflict(pool_id,game_id) do update set underdog_team_id=excluded.underdog_team_id,favorite_team_id=excluded.favorite_team_id,underdog_spread=excluded.underdog_spread,source=excluded.source,manual_override=false,entered_by=null,entered_at=now(),provider_odds_updated_at=excluded.provider_odds_updated_at,odds_locked_at=now()
  where pool_game_lines.manual_override=false and pool_game_lines.odds_locked_at is null returning id into v_line_id;
  return v_line_id is not null;
end
$$;

create or replace function public.upsert_scheduled_line(p_pool_id uuid,p_week_id uuid,p_game_id uuid,p_underdog_team_id uuid,p_spread numeric)
returns uuid language plpgsql security definer set search_path=public
as $$
declare v_season integer; v_week smallint; v_type text; v_game public.games; v_favorite uuid; v_actor uuid:=auth.uid();
begin
  if not public.is_pool_admin(p_pool_id) then raise exception 'Not authorized'; end if;
  if p_spread <= 0 then raise exception 'Spread must be positive'; end if;
  select s.nfl_season,w.nfl_week,w.season_type into v_season,v_week,v_type from public.weeks w join public.seasons s on s.id=w.season_id where w.id=p_week_id and s.pool_id=p_pool_id and w.status='open';
  if not found then raise exception 'Week does not belong to pool or is not open'; end if;
  select * into v_game from public.games where id=p_game_id and nfl_season=v_season and nfl_week=v_week and season_type=v_type;
  if not found then raise exception 'Game does not belong to this pool week'; end if;
  if p_underdog_team_id not in (v_game.away_team_id,v_game.home_team_id) then raise exception 'Underdog must be a participant in this game'; end if;
  v_favorite:=case when p_underdog_team_id=v_game.away_team_id then v_game.home_team_id else v_game.away_team_id end;
  insert into public.pool_game_lines(pool_id,game_id,underdog_team_id,favorite_team_id,underdog_spread,source,manual_override,entered_by)
  values(p_pool_id,p_game_id,p_underdog_team_id,v_favorite,p_spread,'commissioner',true,v_actor)
  on conflict(pool_id,game_id) do update set underdog_team_id=excluded.underdog_team_id,favorite_team_id=excluded.favorite_team_id,underdog_spread=excluded.underdog_spread,source=excluded.source,manual_override=excluded.manual_override,entered_by=excluded.entered_by,entered_at=now(),provider_odds_updated_at=null,odds_locked_at=null;
  return p_game_id;
end
$$;

create or replace function public.upsert_manual_line(
  p_pool_id uuid, p_week_id uuid, p_away_abbreviation text,
  p_home_abbreviation text, p_kickoff timestamptz,
  p_underdog_abbreviation text, p_spread numeric
) returns uuid
language plpgsql security definer set search_path=public
as $$
declare
  v_season integer; v_week smallint; v_type text; v_away uuid; v_home uuid;
  v_underdog uuid; v_favorite uuid; v_game uuid; v_actor uuid:=auth.uid();
begin
  if not public.is_pool_admin(p_pool_id) then raise exception 'Not authorized'; end if;
  if p_spread <= 0 then raise exception 'Spread must be positive'; end if;
  select s.nfl_season,w.nfl_week,w.season_type into v_season,v_week,v_type
  from public.weeks w join public.seasons s on s.id=w.season_id
  where w.id=p_week_id and s.pool_id=p_pool_id and w.status='open';
  if not found then raise exception 'Week does not belong to pool or is not open'; end if;
  select id into v_away from public.teams where abbreviation=upper(trim(p_away_abbreviation));
  select id into v_home from public.teams where abbreviation=upper(trim(p_home_abbreviation));
  select id into v_underdog from public.teams where abbreviation=upper(trim(p_underdog_abbreviation));
  if v_away is null or v_home is null or v_underdog is null or v_away=v_home or v_underdog not in (v_away,v_home) then raise exception 'Use valid, different NFL team abbreviations and select one game participant as underdog'; end if;
  v_favorite:=case when v_underdog=v_away then v_home else v_away end;
  select id into v_game from public.games where nfl_season=v_season and nfl_week=v_week and season_type=v_type and home_team_id=v_home and away_team_id=v_away order by provider_synced_at desc nulls last limit 1;
  if v_game is null then
    insert into public.games(provider,provider_game_id,nfl_season,nfl_week,season_type,home_team_id,away_team_id,kickoff_at,status,manual_override,override_by,override_at)
    values('manual','manual:'||gen_random_uuid()::text,v_season,v_week,v_type,v_home,v_away,p_kickoff,'scheduled',true,v_actor,now()) returning id into v_game;
  end if;
  insert into public.pool_game_lines(pool_id,game_id,underdog_team_id,favorite_team_id,underdog_spread,source,manual_override,entered_by)
  values(p_pool_id,v_game,v_underdog,v_favorite,p_spread,'commissioner',true,v_actor)
  on conflict(pool_id,game_id) do update set underdog_team_id=excluded.underdog_team_id,favorite_team_id=excluded.favorite_team_id,underdog_spread=excluded.underdog_spread,source=excluded.source,manual_override=true,entered_by=excluded.entered_by,entered_at=now(),provider_odds_updated_at=null,odds_locked_at=null;
  return v_game;
end
$$;

create or replace function public.finalize_pool_week(p_pool_id uuid,p_week_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
declare v_season integer; v_nfl_week smallint; v_type text; v_actor uuid:=auth.uid(); v_game record;
begin
  if not public.is_pool_admin(p_pool_id) then raise exception 'Not authorized'; end if;
  select s.nfl_season,w.nfl_week,w.season_type into v_season,v_nfl_week,v_type from public.weeks w join public.seasons s on s.id=w.season_id where w.id=p_week_id and s.pool_id=p_pool_id;
  if not found then raise exception 'Week does not belong to this pool'; end if;
  if exists(select 1 from public.games g join public.pool_game_lines l on l.game_id=g.id where l.pool_id=p_pool_id and g.nfl_season=v_season and g.nfl_week=v_nfl_week and g.season_type=v_type and g.status not in ('final','cancelled','postponed')) then raise exception 'All lined games must be final, cancelled, or postponed before finalizing'; end if;
  for v_game in select g.id from public.games g join public.pool_game_lines l on l.game_id=g.id where l.pool_id=p_pool_id and g.nfl_season=v_season and g.nfl_week=v_nfl_week and g.season_type=v_type and g.status='final'
  loop perform public.score_final_game(v_game.id); end loop;
  update public.weeks set status='complete' where id=p_week_id;
  insert into public.audit_events(pool_id,actor_id,action,entity_type,entity_id) values(p_pool_id,v_actor,'week_finalized','week',p_week_id::text);
end
$$;

create or replace function public.finalize_ready_pool_weeks()
returns integer language plpgsql security definer set search_path=public
as $$
declare v_week record; v_game record; v_count integer:=0;
begin
  for v_week in select w.id as week_id,s.pool_id,s.nfl_season,w.nfl_week,w.season_type from public.weeks w join public.seasons s on s.id=w.season_id where w.status='open'
    and exists (select 1 from public.pool_game_lines l join public.games g on g.id=l.game_id where l.pool_id=s.pool_id and g.nfl_season=s.nfl_season and g.nfl_week=w.nfl_week and g.season_type=w.season_type)
    and not exists (select 1 from public.games g where g.nfl_season=s.nfl_season and g.nfl_week=w.nfl_week and g.season_type=w.season_type and g.status not in ('final','cancelled','postponed'))
  loop
    for v_game in select g.id from public.games g join public.pool_game_lines l on l.game_id=g.id where l.pool_id=v_week.pool_id and g.nfl_season=v_week.nfl_season and g.nfl_week=v_week.nfl_week and g.season_type=v_week.season_type and g.status='final'
    loop perform public.score_final_game(v_game.id); end loop;
    update public.weeks set status='complete' where id=v_week.week_id;
    insert into public.audit_events(pool_id,action,entity_type,entity_id) values(v_week.pool_id,'week_auto_finalized','week',v_week.week_id::text);
    v_count:=v_count+1;
  end loop;
  return v_count;
end
$$;

-- Commissioners may see an imported preseason schedule before assigning a line.
drop policy if exists "pool admins see schedules for open weeks" on public.games;
create policy "pool admins see schedules for open weeks" on public.games for select using (
  exists (select 1 from public.seasons s join public.weeks w on w.season_id=s.id
    where s.nfl_season=games.nfl_season and w.nfl_week=games.nfl_week
      and w.season_type=games.season_type and w.status='open' and public.is_pool_admin(s.pool_id))
);

revoke all on function public.create_pool_week(uuid,smallint,text) from public;
grant execute on function public.create_pool_week(uuid,smallint,text) to authenticated;
revoke all on function public.nfl_week_sunday(integer,smallint,text) from public;
revoke all on function public.nfl_week_picks_open_at(integer,smallint,text) from public;
revoke all on function public.nfl_week_global_deadline(integer,smallint,text) from public;
grant execute on function public.nfl_week_sunday(integer,smallint,text) to authenticated, service_role;
grant execute on function public.nfl_week_picks_open_at(integer,smallint,text) to authenticated, service_role;
grant execute on function public.nfl_week_global_deadline(integer,smallint,text) to authenticated, service_role;
