-- Co-commissioners share weekly reminder responsibilities. They receive only
-- submission status, never the confidential team or game selection.

create or replace function public.commissioner_weekly_pick_status(
  p_pool_id uuid,
  p_week_id uuid
)
returns table(user_id uuid, display_name text, email text, picked boolean)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.pool_members member
    where member.pool_id = p_pool_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.role in ('commissioner', 'co_commissioner')
  ) then
    raise exception 'Only commissioners can view weekly pick status';
  end if;

  if not exists (
    select 1
    from public.weeks week
    join public.seasons season on season.id = week.season_id
    where week.id = p_week_id
      and season.pool_id = p_pool_id
  ) then
    raise exception 'Week does not belong to this pool';
  end if;

  return query
  select
    member.user_id,
    profile.display_name,
    account.email::text,
    exists (
      select 1
      from public.picks pick
      where pick.pool_id = p_pool_id
        and pick.week_id = p_week_id
        and pick.player_id = member.user_id
    ) as picked
  from public.pool_members member
  join public.profiles profile on profile.id = member.user_id
  join auth.users account on account.id = member.user_id
  where member.pool_id = p_pool_id
    and member.status = 'active'
  order by profile.display_name asc;
end;
$$;

revoke all on function public.commissioner_weekly_pick_status(uuid, uuid) from public;
grant execute on function public.commissioner_weekly_pick_status(uuid, uuid) to authenticated;
