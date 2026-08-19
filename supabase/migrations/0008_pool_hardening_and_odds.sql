-- Close the remaining business-rule gaps: all pick mutations are tied to a
-- real pool week, locked selections are immutable, and provider odds may
-- populate (but never overwrite) commissioner-edited lines.

create or replace function public.weekly_picks_open_at(target_kickoff timestamptz)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select (
    date_trunc('week', target_kickoff at time zone 'America/New_York')
    + case
        -- Monday through Wednesday belong to the NFL week whose Sunday was
        -- yesterday/earlier this week, so use that week's preceding Tuesday.
        when extract(isodow from target_kickoff at time zone 'America/New_York') <= 3
          then interval '-6 days'
        else interval '1 day'
      end
    + interval '9 hours'
  ) at time zone 'America/New_York'
$$;

create or replace function public.effective_pick_deadline(target_kickoff timestamptz)
returns timestamptz
language sql
stable
set search_path = public
as $$
  select least(
    target_kickoff,
    (
      date_trunc('week', target_kickoff at time zone 'America/New_York')
      + case
          when extract(isodow from target_kickoff at time zone 'America/New_York') <= 3
            then interval '-1 day 13 hours'
          else interval '6 days 13 hours'
        end
    ) at time zone 'America/New_York'
  )
$$;

create or replace function public.pick_is_revealed(target_game uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select now() >= public.effective_pick_deadline(g.kickoff_at)
  from public.games g
  where g.id = target_game
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
  v_existing_game public.games;
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
  if now() < public.weekly_picks_open_at(v_game.kickoff_at) then
    raise exception 'Picks open Tuesday at 9:00 AM Eastern';
  end if;
  if now() >= public.effective_pick_deadline(v_game.kickoff_at) then
    raise exception 'This pick is locked';
  end if;

  select * into v_existing
  from public.picks
  where pool_id = p_pool_id and week_id = p_week_id and player_id = p_player_id
  for update;
  if found then
    select * into v_existing_game from public.games where id = v_existing.game_id;
    if now() >= public.effective_pick_deadline(v_existing_game.kickoff_at) then
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

create or replace function public.prefill_odds_line(
  p_pool_id uuid,
  p_game_id uuid,
  p_underdog_team_id uuid,
  p_spread numeric,
  p_source text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games;
  v_favorite uuid;
begin
  if p_spread <= 0 then raise exception 'Spread must be positive'; end if;
  select * into v_game from public.games where id = p_game_id;
  if not found or p_underdog_team_id not in (v_game.home_team_id, v_game.away_team_id) then
    raise exception 'Invalid odds line';
  end if;
  if not exists (
    select 1
    from public.weeks w
    join public.seasons s on s.id = w.season_id
    where s.pool_id = p_pool_id
      and s.nfl_season = v_game.nfl_season
      and w.nfl_week = v_game.nfl_week
      and w.status = 'open'
  ) then raise exception 'Game is not in an open pool week'; end if;

  v_favorite := case when p_underdog_team_id = v_game.away_team_id then v_game.home_team_id else v_game.away_team_id end;
  insert into public.pool_game_lines(
    pool_id, game_id, underdog_team_id, favorite_team_id, underdog_spread,
    source, manual_override, entered_by
  ) values (
    p_pool_id, p_game_id, p_underdog_team_id, v_favorite, p_spread,
    left(p_source, 100), false, null
  )
  on conflict(pool_id, game_id) do update set
    underdog_team_id = excluded.underdog_team_id,
    favorite_team_id = excluded.favorite_team_id,
    underdog_spread = excluded.underdog_spread,
    source = excluded.source,
    manual_override = false,
    entered_by = null,
    entered_at = now()
  where pool_game_lines.manual_override = false;
end
$$;

create or replace function public.upsert_manual_line(
  p_pool_id uuid,
  p_week_id uuid,
  p_away_abbreviation text,
  p_home_abbreviation text,
  p_kickoff timestamptz,
  p_underdog_abbreviation text,
  p_spread numeric
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season integer;
  v_week smallint;
  v_away uuid;
  v_home uuid;
  v_underdog uuid;
  v_favorite uuid;
  v_game uuid;
  v_actor uuid := auth.uid();
begin
  if not public.is_pool_admin(p_pool_id) then raise exception 'Not authorized'; end if;
  if p_spread <= 0 then raise exception 'Spread must be positive'; end if;
  select s.nfl_season, w.nfl_week into v_season, v_week
  from public.weeks w join public.seasons s on s.id = w.season_id
  where w.id = p_week_id and s.pool_id = p_pool_id and w.status = 'open';
  if not found then raise exception 'Week does not belong to pool or is not open'; end if;
  select id into v_away from public.teams where abbreviation = upper(trim(p_away_abbreviation));
  select id into v_home from public.teams where abbreviation = upper(trim(p_home_abbreviation));
  select id into v_underdog from public.teams where abbreviation = upper(trim(p_underdog_abbreviation));
  if v_away is null or v_home is null or v_underdog is null or v_away = v_home or v_underdog not in (v_away, v_home) then
    raise exception 'Use valid, different NFL team abbreviations and select one game participant as underdog';
  end if;
  v_favorite := case when v_underdog = v_away then v_home else v_away end;
  select id into v_game from public.games
  where nfl_season = v_season and nfl_week = v_week and home_team_id = v_home and away_team_id = v_away
  order by provider_synced_at desc nulls last limit 1;
  if v_game is null then
    insert into public.games(provider, provider_game_id, nfl_season, nfl_week, home_team_id, away_team_id, kickoff_at, status, manual_override, override_by, override_at)
    values('manual', 'manual:' || gen_random_uuid()::text, v_season, v_week, v_home, v_away, p_kickoff, 'scheduled', true, v_actor, now())
    returning id into v_game;
  end if;
  insert into public.pool_game_lines(pool_id, game_id, underdog_team_id, favorite_team_id, underdog_spread, source, manual_override, entered_by)
  values(p_pool_id, v_game, v_underdog, v_favorite, p_spread, 'commissioner', true, v_actor)
  on conflict(pool_id, game_id) do update set
    underdog_team_id = excluded.underdog_team_id,
    favorite_team_id = excluded.favorite_team_id,
    underdog_spread = excluded.underdog_spread,
    source = excluded.source,
    manual_override = true,
    entered_by = excluded.entered_by,
    entered_at = now();
  insert into public.audit_events(pool_id, actor_id, action, entity_type, entity_id, after_data)
  values(p_pool_id, v_actor, 'manual_line_created', 'game', v_game::text,
    jsonb_build_object('away', p_away_abbreviation, 'home', p_home_abbreviation, 'underdog', p_underdog_abbreviation, 'spread', p_spread));
  return v_game;
end
$$;

create or replace function public.record_manual_game_result(
  p_pool_id uuid,
  p_game_id uuid,
  p_home_score smallint,
  p_away_score smallint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games;
  v_actor uuid := auth.uid();
begin
  if not public.is_pool_admin(p_pool_id) then raise exception 'Not authorized'; end if;
  if p_home_score is null or p_away_score is null or p_home_score < 0 or p_away_score < 0 then raise exception 'Scores cannot be negative'; end if;
  select g.* into v_game
  from public.games g
  join public.pool_game_lines l on l.game_id = g.id
  where g.id = p_game_id and l.pool_id = p_pool_id;
  if not found then raise exception 'Game does not belong to this pool'; end if;

  update public.games
  set status = 'final',
      home_score = p_home_score,
      away_score = p_away_score,
      winning_team_id = case
        when p_home_score > p_away_score then v_game.home_team_id
        when p_away_score > p_home_score then v_game.away_team_id
        else null
      end,
      manual_override = true,
      override_by = v_actor,
      override_at = now(),
      updated_at = now()
  where id = p_game_id;
  perform public.score_final_game(p_game_id);
  insert into public.audit_events(pool_id, actor_id, action, entity_type, entity_id, after_data)
  values(p_pool_id, v_actor, 'manual_result_recorded', 'game', p_game_id::text,
    jsonb_build_object('home_score', p_home_score, 'away_score', p_away_score));
end
$$;

create or replace function public.finalize_pool_week(
  p_pool_id uuid,
  p_week_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_season integer;
  v_nfl_week smallint;
  v_actor uuid := auth.uid();
  v_game record;
begin
  if not public.is_pool_admin(p_pool_id) then raise exception 'Not authorized'; end if;
  select s.nfl_season, w.nfl_week into v_season, v_nfl_week
  from public.weeks w join public.seasons s on s.id = w.season_id
  where w.id = p_week_id and s.pool_id = p_pool_id;
  if not found then raise exception 'Week does not belong to this pool'; end if;
  if exists (
    select 1 from public.games g
    join public.pool_game_lines l on l.game_id = g.id
    where l.pool_id = p_pool_id
      and g.nfl_season = v_season
      and g.nfl_week = v_nfl_week
      and g.status not in ('final', 'cancelled', 'postponed')
  ) then raise exception 'All lined games must be final, cancelled, or postponed before finalizing'; end if;

  for v_game in
    select g.id from public.games g
    join public.pool_game_lines l on l.game_id = g.id
    where l.pool_id = p_pool_id
      and g.nfl_season = v_season
      and g.nfl_week = v_nfl_week
      and g.status = 'final'
  loop
    perform public.score_final_game(v_game.id);
  end loop;
  update public.weeks set status = 'complete' where id = p_week_id;
  insert into public.audit_events(pool_id, actor_id, action, entity_type, entity_id)
  values(p_pool_id, v_actor, 'week_finalized', 'week', p_week_id::text);
end
$$;

-- The provider sync invokes this with the service role after it records the
-- final Monday game. It never completes a week while any imported game still
-- has an unresolved status, and it only acts on weeks that actually have pool
-- lines.
create or replace function public.finalize_ready_pool_weeks()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week record;
  v_game record;
  v_count integer := 0;
begin
  for v_week in
    select w.id as week_id, s.pool_id, s.nfl_season, w.nfl_week
    from public.weeks w
    join public.seasons s on s.id = w.season_id
    where w.status = 'open'
      and exists (
        select 1 from public.pool_game_lines l
        join public.games g on g.id = l.game_id
        where l.pool_id = s.pool_id
          and g.nfl_season = s.nfl_season
          and g.nfl_week = w.nfl_week
      )
      and not exists (
        select 1 from public.games g
        where g.nfl_season = s.nfl_season
          and g.nfl_week = w.nfl_week
          and g.status not in ('final', 'cancelled', 'postponed')
      )
  loop
    for v_game in
      select g.id from public.games g
      join public.pool_game_lines l on l.game_id = g.id
      where l.pool_id = v_week.pool_id
        and g.nfl_season = v_week.nfl_season
        and g.nfl_week = v_week.nfl_week
        and g.status = 'final'
    loop
      perform public.score_final_game(v_game.id);
    end loop;
    update public.weeks set status = 'complete' where id = v_week.week_id;
    insert into public.audit_events(pool_id, action, entity_type, entity_id)
    values(v_week.pool_id, 'week_auto_finalized', 'week', v_week.week_id::text);
    v_count := v_count + 1;
  end loop;
  return v_count;
end
$$;

revoke all on function public.prefill_odds_line(uuid, uuid, uuid, numeric, text) from public;
grant execute on function public.prefill_odds_line(uuid, uuid, uuid, numeric, text) to service_role;
revoke all on function public.record_manual_game_result(uuid, uuid, smallint, smallint) from public;
grant execute on function public.record_manual_game_result(uuid, uuid, smallint, smallint) to authenticated;
revoke all on function public.finalize_pool_week(uuid, uuid) from public;
grant execute on function public.finalize_pool_week(uuid, uuid) to authenticated;
revoke all on function public.finalize_ready_pool_weeks() from public;
grant execute on function public.finalize_ready_pool_weeks() to service_role;
revoke all on function public.submit_pick(uuid, uuid, uuid, uuid, uuid) from public;
grant execute on function public.submit_pick(uuid, uuid, uuid, uuid, uuid) to authenticated;
