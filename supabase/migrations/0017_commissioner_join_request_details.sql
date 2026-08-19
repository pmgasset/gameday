-- A pending applicant is not yet an active pool peer, so their profile is
-- deliberately hidden by the normal RLS policy. Let the pool commissioner
-- review the name and email attached to a join request without exposing that
-- information to players or co-commissioners.

create or replace function public.pending_pool_member_details(p_pool_id uuid)
returns table(user_id uuid, display_name text, email text, requested_at timestamptz)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not exists (
    select 1
    from public.pool_members member
    where member.pool_id = p_pool_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and member.role = 'commissioner'
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select member.user_id, profile.display_name, account.email::text, member.joined_at
  from public.pool_members member
  join public.profiles profile on profile.id = member.user_id
  join auth.users account on account.id = member.user_id
  where member.pool_id = p_pool_id
    and member.status = 'pending'
  order by member.joined_at asc;
end;
$$;

revoke all on function public.pending_pool_member_details(uuid) from public;
grant execute on function public.pending_pool_member_details(uuid) to authenticated;
