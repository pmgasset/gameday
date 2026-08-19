alter table public.pool_members
  add column pick_blocked_at timestamptz,
  add column pick_blocked_by uuid references public.profiles(id);

create or replace function public.set_member_pick_block(
  p_pool_id uuid,
  p_member_id uuid,
  p_blocked boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not public.is_pool_commissioner(p_pool_id) then
    raise exception 'Only the commissioner can pause a member''s picks';
  end if;
  if p_member_id = v_actor then
    raise exception 'Commissioners cannot pause their own picks';
  end if;

  update public.pool_members
  set pick_blocked_at = case when p_blocked then now() else null end,
      pick_blocked_by = case when p_blocked then v_actor else null end
  where pool_id = p_pool_id and user_id = p_member_id and status = 'active';
  if not found then raise exception 'Active membership not found'; end if;

  insert into public.audit_events(pool_id, actor_id, action, entity_type, entity_id, after_data)
  values (
    p_pool_id,
    v_actor,
    case when p_blocked then 'member_pick_blocked' else 'member_pick_block_cleared' end,
    'pool_member',
    p_member_id::text,
    jsonb_build_object('pick_blocked', p_blocked)
  );
end
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

revoke all on function public.set_member_pick_block(uuid, uuid, boolean) from public;
grant execute on function public.set_member_pick_block(uuid, uuid, boolean) to authenticated;
