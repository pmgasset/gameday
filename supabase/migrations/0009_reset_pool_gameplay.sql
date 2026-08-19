-- A reset preserves the pool and membership roster while removing all
-- pool-specific gameplay state. Provider games and teams are shared reference
-- data, so they are deliberately retained for later schedule imports.
create or replace function public.reset_pool(p_pool_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_season uuid;
  v_year integer := extract(year from now())::integer;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not is_pool_commissioner(p_pool_id) then raise exception 'Only the commissioner can reset this pool'; end if;

  perform 1 from public.pools where id = p_pool_id for update;
  if not found then raise exception 'Pool not found'; end if;

  delete from public.picks where pool_id = p_pool_id;
  delete from public.pool_game_lines where pool_id = p_pool_id;
  delete from public.weeks where season_id in (select id from public.seasons where pool_id = p_pool_id);
  delete from public.seasons where pool_id = p_pool_id;
  update public.invitations set revoked_at = now() where pool_id = p_pool_id and revoked_at is null;

  insert into public.seasons(pool_id, nfl_season, is_active)
  values (p_pool_id, v_year, true)
  returning id into v_season;

  insert into public.audit_events(pool_id, actor_id, action, entity_type, entity_id, after_data)
  values (p_pool_id, v_actor, 'pool_reset', 'pool', p_pool_id::text, jsonb_build_object('season_id', v_season, 'nfl_season', v_year));
end
$$;

revoke all on function public.reset_pool(uuid) from public;
grant execute on function public.reset_pool(uuid) to authenticated;
