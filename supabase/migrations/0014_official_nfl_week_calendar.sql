-- Pool timing follows the official NFL week, not a calendar week.
--
-- The previous helpers derived a game's Tuesday opening and Sunday cutoff from
-- the weekday of that one kickoff: Monday through Wednesday were assumed to
-- trail the Sunday behind them and everything else to lead the Sunday ahead.
-- A Wednesday season opener therefore joined the previous NFL week, opening a
-- week early and locking on the wrong Sunday, while the Thursday and Sunday
-- games the provider assigned to the same `nfl_week` opened a week later.
--
-- `games.nfl_season`/`games.nfl_week` already carry the provider's official
-- week, so the whole slate now anchors the week on its Sunday, and every game
-- of that week shares one opening time and one Sunday 1:00 PM cutoff.

create or replace function public.nfl_week_sunday(p_season integer, p_week smallint)
returns date
language sql
stable
security definer
set search_path = public
as $$
  with slate as (
    select (g.kickoff_at at time zone 'America/New_York')::date as game_day
    from public.games g
    where g.nfl_season = p_season and g.nfl_week = p_week
  ),
  busiest_sunday as (
    select game_day
    from slate
    where extract(isodow from game_day) = 7
    group by game_day
    order by count(*) desc, game_day
    limit 1
  ),
  -- A partially imported slate with no Sunday game: a Monday or Tuesday
  -- kickoff trails its Sunday, anything from Wednesday on leads the next one.
  earliest as (
    select case
      when extract(isodow from min(game_day)) <= 2
        then min(game_day) - extract(isodow from min(game_day))::integer
      else min(game_day) + (7 - extract(isodow from min(game_day))::integer)
    end as game_day
    from slate
  )
  select coalesce((select game_day from busiest_sunday), (select game_day from earliest))
$$;

create or replace function public.nfl_week_picks_open_at(p_season integer, p_week smallint)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select (public.nfl_week_sunday(p_season, p_week) - 5 + interval '9 hours') at time zone 'America/New_York'
$$;

create or replace function public.nfl_week_global_deadline(p_season integer, p_week smallint)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select (public.nfl_week_sunday(p_season, p_week) + interval '13 hours') at time zone 'America/New_York'
$$;

create or replace function public.weekly_picks_open_at(p_game_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select public.nfl_week_picks_open_at(g.nfl_season, g.nfl_week)
  from public.games g
  where g.id = p_game_id
$$;

create or replace function public.effective_pick_deadline(p_game_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select least(g.kickoff_at, public.nfl_week_global_deadline(g.nfl_season, g.nfl_week))
  from public.games g
  where g.id = p_game_id
$$;

create or replace function public.pick_is_revealed(target_game uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select now() >= public.effective_pick_deadline(target_game)
$$;

create or replace function public.submit_pick(
  p_pool_id uuid,
  p_week_id uuid,
  p_game_id uuid,
  p_team_id uuid,
  p_player_id uuid default auth.uid()
) returns public.picks
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.pool_game_lines;
  v_game public.games;
  v_pick public.picks;
  v_existing public.picks;
  v_season integer;
  v_nfl_week smallint;
  v_week_status text;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if p_player_id <> v_actor and not public.is_pool_admin(p_pool_id) then
    raise exception 'Not authorized to submit for this player';
  end if;
  if not exists (
    select 1 from public.pool_members
    where pool_id = p_pool_id and user_id = p_player_id and status = 'active'
  ) then raise exception 'Player is not active in this pool'; end if;
  if exists (
    select 1 from public.pool_members
    where pool_id = p_pool_id and user_id = p_player_id and pick_blocked_at is not null
  ) then raise exception 'Picking is temporarily paused. Contact the commissioner.'; end if;

  select s.nfl_season, w.nfl_week, w.status
  into v_season, v_nfl_week, v_week_status
  from public.weeks w
  join public.seasons s on s.id = w.season_id
  where w.id = p_week_id and s.pool_id = p_pool_id;
  if not found or v_week_status <> 'open' then
    raise exception 'This pool week is not open for picks';
  end if;

  select * into v_game
  from public.games
  where id = p_game_id and nfl_season = v_season and nfl_week = v_nfl_week;
  if not found then raise exception 'Game does not belong to this pool week'; end if;
  if v_game.status <> 'scheduled' then raise exception 'This game is no longer available for picking'; end if;

  select * into v_line
  from public.pool_game_lines
  where pool_id = p_pool_id and game_id = p_game_id;
  if not found or v_line.underdog_team_id <> p_team_id then
    raise exception 'Only the designated underdog is eligible';
  end if;
  -- The whole NFL week opens together and every game inherits that week's
  -- Sunday cutoff, so both checks resolve the game's NFL week, not its kickoff.
  if now() < public.weekly_picks_open_at(p_game_id) then
    raise exception 'Picks open Tuesday at 9:00 AM Eastern';
  end if;
  if now() >= public.effective_pick_deadline(p_game_id) then
    raise exception 'This pick is locked';
  end if;

  select * into v_existing
  from public.picks
  where pool_id = p_pool_id and week_id = p_week_id and player_id = p_player_id
  for update;
  if found then
    if now() >= public.effective_pick_deadline(v_existing.game_id) then
      raise exception 'Your existing pick is locked and cannot be changed';
    end if;
  end if;

  insert into public.picks(pool_id, week_id, game_id, player_id, team_id, stored_spread, submitted_by)
  values(p_pool_id, p_week_id, p_game_id, p_player_id, p_team_id, v_line.underdog_spread, v_actor)
  on conflict(pool_id, week_id, player_id) do update set
    game_id = excluded.game_id,
    team_id = excluded.team_id,
    stored_spread = excluded.stored_spread,
    submitted_by = excluded.submitted_by,
    updated_at = now()
  returning * into v_pick;

  insert into public.audit_events(pool_id, actor_id, action, entity_type, entity_id, after_data)
  values(
    p_pool_id,
    v_actor,
    case when v_actor = p_player_id then 'pick_submitted' else 'assisted_pick_submitted' end,
    'pick',
    v_pick.id::text,
    jsonb_build_object('game_id', p_game_id, 'team_id', p_team_id, 'spread', v_line.underdog_spread)
  );
  return v_pick;
end
$$;

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

  select p.id, p.game_id into v_existing
  from public.picks p
  where p.pool_id = p_pool_id and p.week_id = p_week_id and p.player_id = v_actor
  for update;
  if found then
    if now() >= public.effective_pick_deadline(v_existing.game_id) then
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

-- The kickoff-shaped helpers cannot express an NFL week and must not survive.
drop function if exists public.weekly_picks_open_at(timestamptz);
drop function if exists public.effective_pick_deadline(timestamptz);

revoke all on function public.nfl_week_sunday(integer, smallint) from public;
revoke all on function public.nfl_week_picks_open_at(integer, smallint) from public;
revoke all on function public.nfl_week_global_deadline(integer, smallint) from public;
revoke all on function public.weekly_picks_open_at(uuid) from public;
revoke all on function public.effective_pick_deadline(uuid) from public;
grant execute on function public.nfl_week_sunday(integer, smallint) to authenticated, service_role;
grant execute on function public.nfl_week_picks_open_at(integer, smallint) to authenticated, service_role;
grant execute on function public.nfl_week_global_deadline(integer, smallint) to authenticated, service_role;
grant execute on function public.weekly_picks_open_at(uuid) to authenticated, service_role;
grant execute on function public.effective_pick_deadline(uuid) to authenticated, service_role;
revoke all on function public.submit_pick(uuid, uuid, uuid, uuid, uuid) from public;
grant execute on function public.submit_pick(uuid, uuid, uuid, uuid, uuid) to authenticated;
revoke all on function public.skip_pool_week(uuid, uuid) from public;
grant execute on function public.skip_pool_week(uuid, uuid) to authenticated;
