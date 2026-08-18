-- Postgres Changes is used only for scores. Picks are never published to the
-- realtime publication, preserving pre-reveal pick privacy.
do $$ begin alter publication supabase_realtime add table public.games; exception when duplicate_object then null; end $$;

create or replace function public.upsert_manual_line(p_pool_id uuid, p_week_id uuid, p_away_abbreviation text, p_home_abbreviation text, p_kickoff timestamptz, p_underdog_abbreviation text, p_spread numeric) returns uuid language plpgsql security definer set search_path=public as $$
declare v_season integer; v_week smallint; v_away uuid; v_home uuid; v_underdog uuid; v_favorite uuid; v_game uuid; v_actor uuid:=auth.uid();
begin
  if not is_pool_admin(p_pool_id) then raise exception 'Not authorized'; end if;
  if p_spread <= 0 then raise exception 'Spread must be positive'; end if;
  select s.nfl_season,w.nfl_week into v_season,v_week from weeks w join seasons s on s.id=w.season_id where w.id=p_week_id and s.pool_id=p_pool_id;
  if not found then raise exception 'Week does not belong to pool'; end if;
  select id into v_away from teams where abbreviation=upper(trim(p_away_abbreviation)); select id into v_home from teams where abbreviation=upper(trim(p_home_abbreviation)); select id into v_underdog from teams where abbreviation=upper(trim(p_underdog_abbreviation));
  if v_away is null or v_home is null or v_underdog is null or v_away=v_home or v_underdog not in (v_away,v_home) then raise exception 'Use valid, different NFL team abbreviations and select one game participant as underdog'; end if;
  v_favorite := case when v_underdog=v_away then v_home else v_away end;
  select id into v_game from games where nfl_season=v_season and nfl_week=v_week and home_team_id=v_home and away_team_id=v_away order by provider_synced_at desc nulls last limit 1;
  if v_game is null then insert into games(provider,provider_game_id,nfl_season,nfl_week,home_team_id,away_team_id,kickoff_at,status,manual_override,override_by,override_at) values('manual','manual:'||gen_random_uuid()::text,v_season,v_week,v_home,v_away,p_kickoff,'scheduled',true,v_actor,now()) returning id into v_game; end if;
  insert into pool_game_lines(pool_id,game_id,underdog_team_id,favorite_team_id,underdog_spread,source,manual_override,entered_by) values(p_pool_id,v_game,v_underdog,v_favorite,p_spread,'commissioner',true,v_actor) on conflict(pool_id,game_id) do update set underdog_team_id=excluded.underdog_team_id,favorite_team_id=excluded.favorite_team_id,underdog_spread=excluded.underdog_spread,entered_by=excluded.entered_by,entered_at=now();
  insert into audit_events(pool_id,actor_id,action,entity_type,entity_id,after_data) values(p_pool_id,v_actor,'manual_line_created','game',v_game::text,jsonb_build_object('away',p_away_abbreviation,'home',p_home_abbreviation,'underdog',p_underdog_abbreviation,'spread',p_spread));
  return v_game;
end $$;
