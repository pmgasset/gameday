-- Preserve a verifiable Tuesday line for every pool game. Provider refreshes
-- may prefill a line until it is captured; a commissioner override always
-- remains authoritative.

alter table public.pool_game_lines
  add column if not exists provider_odds_updated_at timestamptz,
  add column if not exists odds_locked_at timestamptz;

alter table public.provider_syncs
  add column if not exists warning_message text,
  add column if not exists sync_mode text;

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
    entered_at = now(),
    provider_odds_updated_at = null
  where pool_game_lines.manual_override = false
    and pool_game_lines.odds_locked_at is null;
end
$$;

revoke all on function public.prefill_odds_line(uuid, uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.prefill_odds_line(uuid, uuid, uuid, numeric, text) to service_role;

create or replace function public.snapshot_provider_odds_line(
  p_pool_id uuid,
  p_game_id uuid,
  p_underdog_team_id uuid,
  p_spread numeric,
  p_source text,
  p_provider_odds_updated_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_game public.games;
  v_favorite uuid;
  v_line_id uuid;
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
    source, manual_override, entered_by, entered_at,
    provider_odds_updated_at, odds_locked_at
  ) values (
    p_pool_id, p_game_id, p_underdog_team_id, v_favorite, p_spread,
    left(p_source, 100), false, null, now(),
    p_provider_odds_updated_at, now()
  )
  on conflict(pool_id, game_id) do update set
    underdog_team_id = excluded.underdog_team_id,
    favorite_team_id = excluded.favorite_team_id,
    underdog_spread = excluded.underdog_spread,
    source = excluded.source,
    manual_override = false,
    entered_by = null,
    entered_at = now(),
    provider_odds_updated_at = excluded.provider_odds_updated_at,
    odds_locked_at = now()
  where pool_game_lines.manual_override = false
    and pool_game_lines.odds_locked_at is null
  returning id into v_line_id;

  return v_line_id is not null;
end
$$;

revoke all on function public.snapshot_provider_odds_line(uuid, uuid, uuid, numeric, text, timestamptz) from public, anon, authenticated;
grant execute on function public.snapshot_provider_odds_line(uuid, uuid, uuid, numeric, text, timestamptz) to service_role;

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
    insert into public.games(provider,provider_game_id,nfl_season,nfl_week,home_team_id,away_team_id,kickoff_at,status,manual_override,override_by,override_at)
    values('manual', 'manual:' || gen_random_uuid()::text, v_season, v_week, v_home, v_away, p_kickoff, 'scheduled', true, v_actor, now())
    returning id into v_game;
  end if;
  insert into public.pool_game_lines(pool_id,game_id,underdog_team_id,favorite_team_id,underdog_spread,source,manual_override,entered_by)
  values(p_pool_id,v_game,v_underdog,v_favorite,p_spread,'commissioner',true,v_actor)
  on conflict(pool_id,game_id) do update set
    underdog_team_id = excluded.underdog_team_id,
    favorite_team_id = excluded.favorite_team_id,
    underdog_spread = excluded.underdog_spread,
    source = excluded.source,
    manual_override = true,
    entered_by = excluded.entered_by,
    entered_at = now(),
    provider_odds_updated_at = null,
    odds_locked_at = null;
  insert into public.audit_events(pool_id,actor_id,action,entity_type,entity_id,after_data)
  values(p_pool_id, v_actor, 'manual_line_created', 'game', v_game::text,
    jsonb_build_object('away', p_away_abbreviation, 'home', p_home_abbreviation, 'underdog', p_underdog_abbreviation, 'spread', p_spread));
  return v_game;
end
$$;
