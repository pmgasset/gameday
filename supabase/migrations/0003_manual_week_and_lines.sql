-- Minimal commissioner tools for a playable week when provider schedule import
-- is not configured. Team data is normalized and replaceable.
insert into public.teams(abbreviation,city,name,conference,division) values
('ARI','Arizona','Cardinals','NFC','West'),('ATL','Atlanta','Falcons','NFC','South'),('BAL','Baltimore','Ravens','AFC','North'),('BUF','Buffalo','Bills','AFC','East'),('CAR','Carolina','Panthers','NFC','South'),('CHI','Chicago','Bears','NFC','North'),('CIN','Cincinnati','Bengals','AFC','North'),('CLE','Cleveland','Browns','AFC','North'),('DAL','Dallas','Cowboys','NFC','East'),('DEN','Denver','Broncos','AFC','West'),('DET','Detroit','Lions','NFC','North'),('GB','Green Bay','Packers','NFC','North'),('HOU','Houston','Texans','AFC','South'),('IND','Indianapolis','Colts','AFC','South'),('JAX','Jacksonville','Jaguars','AFC','South'),('KC','Kansas City','Chiefs','AFC','West'),('LV','Las Vegas','Raiders','AFC','West'),('LAC','Los Angeles','Chargers','AFC','West'),('LAR','Los Angeles','Rams','NFC','West'),('MIA','Miami','Dolphins','AFC','East'),('MIN','Minnesota','Vikings','NFC','North'),('NE','New England','Patriots','AFC','East'),('NO','New Orleans','Saints','NFC','South'),('NYG','New York','Giants','NFC','East'),('NYJ','New York','Jets','AFC','East'),('PHI','Philadelphia','Eagles','NFC','East'),('PIT','Pittsburgh','Steelers','AFC','North'),('SEA','Seattle','Seahawks','NFC','West'),('SF','San Francisco','49ers','NFC','West'),('TB','Tampa Bay','Buccaneers','NFC','South'),('TEN','Tennessee','Titans','AFC','South'),('WAS','Washington','Commanders','NFC','East') on conflict(abbreviation) do nothing;

create function public.create_pool_week(p_pool_id uuid, p_week smallint) returns uuid language plpgsql security definer set search_path=public as $$
declare v_season uuid; v_week uuid; v_actor uuid:=auth.uid();
begin
  if not is_pool_admin(p_pool_id) then raise exception 'Not authorized'; end if;
  if p_week not between 1 and 25 then raise exception 'Invalid NFL week'; end if;
  select id into v_season from seasons where pool_id=p_pool_id and is_active=true;
  if not found then raise exception 'No active season'; end if;
  insert into weeks(season_id,nfl_week,status) values(v_season,p_week,'open') on conflict(season_id,nfl_week) do update set status='open' returning id into v_week;
  insert into audit_events(pool_id,actor_id,action,entity_type,entity_id,after_data) values(p_pool_id,v_actor,'week_opened','week',v_week::text,jsonb_build_object('nfl_week',p_week));
  return v_week;
end $$;

create function public.upsert_manual_line(p_pool_id uuid, p_week_id uuid, p_away_abbreviation text, p_home_abbreviation text, p_kickoff timestamptz, p_underdog_abbreviation text, p_spread numeric) returns uuid language plpgsql security definer set search_path=public as $$
declare v_season integer; v_away uuid; v_home uuid; v_underdog uuid; v_favorite uuid; v_game uuid; v_actor uuid:=auth.uid();
begin
  if not is_pool_admin(p_pool_id) then raise exception 'Not authorized'; end if;
  if p_spread <= 0 then raise exception 'Spread must be positive'; end if;
  select s.nfl_season into v_season from weeks w join seasons s on s.id=w.season_id where w.id=p_week_id and s.pool_id=p_pool_id;
  if not found then raise exception 'Week does not belong to pool'; end if;
  select id into v_away from teams where abbreviation=upper(trim(p_away_abbreviation)); select id into v_home from teams where abbreviation=upper(trim(p_home_abbreviation)); select id into v_underdog from teams where abbreviation=upper(trim(p_underdog_abbreviation));
  if v_away is null or v_home is null or v_underdog is null or v_away=v_home or v_underdog not in (v_away,v_home) then raise exception 'Use valid, different NFL team abbreviations and select one game participant as underdog'; end if;
  v_favorite := case when v_underdog=v_away then v_home else v_away end;
  insert into games(provider,provider_game_id,nfl_season,nfl_week,home_team_id,away_team_id,kickoff_at,status,manual_override,override_by,override_at) values('manual','manual:'||gen_random_uuid()::text,v_season,(select nfl_week from weeks where id=p_week_id),v_home,v_away,p_kickoff,'scheduled',true,v_actor,now()) returning id into v_game;
  insert into pool_game_lines(pool_id,game_id,underdog_team_id,favorite_team_id,underdog_spread,source,manual_override,entered_by) values(p_pool_id,v_game,v_underdog,v_favorite,p_spread,'commissioner',true,v_actor);
  insert into audit_events(pool_id,actor_id,action,entity_type,entity_id,after_data) values(p_pool_id,v_actor,'manual_line_created','game',v_game::text,jsonb_build_object('away',p_away_abbreviation,'home',p_home_abbreviation,'underdog',p_underdog_abbreviation,'spread',p_spread));
  return v_game;
end $$;

revoke all on function public.create_pool_week(uuid,smallint) from public;
revoke all on function public.upsert_manual_line(uuid,uuid,text,text,timestamptz,text,numeric) from public;
grant execute on function public.create_pool_week(uuid,smallint) to authenticated;
grant execute on function public.upsert_manual_line(uuid,uuid,text,text,timestamptz,text,numeric) to authenticated;
