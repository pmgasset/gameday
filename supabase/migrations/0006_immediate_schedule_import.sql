-- Imported games are shared NFL reference data. Commissioners may view the
-- schedule for an open week in their own pool before any pool line exists.
-- Players remain limited to games that have a line in their pool.
create policy "pool admins see schedules for open weeks" on public.games for select using (
  exists (
    select 1
    from public.seasons s
    join public.weeks w on w.season_id = s.id
    where s.nfl_season = games.nfl_season
      and w.nfl_week = games.nfl_week
      and w.status = 'open'
      and is_pool_admin(s.pool_id)
  )
);

-- The schedule supplies teams and kickoff time; commissioners only provide the
-- pool-specific underdog and spread. This keeps provider game data separate
-- from GameDay lines and prevents attaching a line to another week's game.
create function public.upsert_scheduled_line(
  p_pool_id uuid,
  p_week_id uuid,
  p_game_id uuid,
  p_underdog_team_id uuid,
  p_spread numeric
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_season integer;
  v_week smallint;
  v_game public.games;
  v_favorite uuid;
  v_actor uuid := auth.uid();
begin
  if not is_pool_admin(p_pool_id) then raise exception 'Not authorized'; end if;
  if p_spread <= 0 then raise exception 'Spread must be positive'; end if;

  select s.nfl_season, w.nfl_week into v_season, v_week
  from weeks w
  join seasons s on s.id = w.season_id
  where w.id = p_week_id and s.pool_id = p_pool_id and w.status = 'open';
  if not found then raise exception 'Week does not belong to pool or is not open'; end if;

  select * into v_game
  from games
  where id = p_game_id and nfl_season = v_season and nfl_week = v_week;
  if not found then raise exception 'Game does not belong to this pool week'; end if;
  if p_underdog_team_id not in (v_game.away_team_id, v_game.home_team_id) then
    raise exception 'Underdog must be a participant in this game';
  end if;

  v_favorite := case when p_underdog_team_id = v_game.away_team_id then v_game.home_team_id else v_game.away_team_id end;
  insert into pool_game_lines(pool_id, game_id, underdog_team_id, favorite_team_id, underdog_spread, source, manual_override, entered_by)
  values(p_pool_id, p_game_id, p_underdog_team_id, v_favorite, p_spread, 'commissioner', true, v_actor)
  on conflict(pool_id, game_id) do update set
    underdog_team_id = excluded.underdog_team_id,
    favorite_team_id = excluded.favorite_team_id,
    underdog_spread = excluded.underdog_spread,
    source = excluded.source,
    manual_override = excluded.manual_override,
    entered_by = excluded.entered_by,
    entered_at = now();

  insert into audit_events(pool_id, actor_id, action, entity_type, entity_id, after_data)
  values(p_pool_id, v_actor, 'scheduled_line_saved', 'game', p_game_id::text,
    jsonb_build_object('week_id', p_week_id, 'underdog_team_id', p_underdog_team_id, 'spread', p_spread));
  return p_game_id;
end $$;

revoke all on function public.upsert_scheduled_line(uuid, uuid, uuid, uuid, numeric) from public;
grant execute on function public.upsert_scheduled_line(uuid, uuid, uuid, uuid, numeric) to authenticated;
