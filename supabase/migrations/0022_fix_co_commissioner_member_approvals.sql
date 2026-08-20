-- Migration 0021 was accidentally committed as a comment. Reapply its intended
-- authorization changes so co-commissioners can approve or reject applicants.

create or replace function public.moderate_membership(
  p_pool_id uuid,
  p_user_id uuid,
  p_status member_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role member_role;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;

  select role into v_role
  from public.pool_members
  where pool_id = p_pool_id
    and user_id = v_actor
    and status = 'active';

  if not found or v_role not in ('commissioner', 'co_commissioner') then
    raise exception 'Only commissioners can moderate members';
  end if;

  if v_role = 'co_commissioner' then
    if p_status not in ('active', 'rejected') then
      raise exception 'Co-commissioners can only approve or reject pending members';
    end if;

    update public.pool_members
    set status = p_status
    where pool_id = p_pool_id
      and user_id = p_user_id
      and status = 'pending';

    if not found then
      raise exception 'Pending membership not found';
    end if;
  else
    if p_status not in ('active', 'rejected', 'removed') then
      raise exception 'Invalid member status';
    end if;

    update public.pool_members
    set status = p_status
    where pool_id = p_pool_id
      and user_id = p_user_id;

    if not found then
      raise exception 'Membership not found';
    end if;
  end if;

  insert into public.audit_events(pool_id, actor_id, action, entity_type, entity_id, after_data)
  values (p_pool_id, v_actor, 'membership_' || p_status::text, 'pool_member', p_user_id::text, jsonb_build_object('status', p_status));
end;
$$;

create or replace function public.pending_pool_member_details(
  p_pool_id uuid
)
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
      and member.role in ('commissioner', 'co_commissioner')
  ) then
    raise exception 'Not authorized';
  end if;

  return query
  select
    member.user_id,
    profile.display_name,
    account.email::text,
    member.joined_at
  from public.pool_members member
  join public.profiles profile on profile.id = member.user_id
  join auth.users account on account.id = member.user_id
  where member.pool_id = p_pool_id
    and member.status = 'pending'
  order by member.joined_at asc;
end;
$$;

revoke all on function public.moderate_membership(uuid, uuid, member_status) from public;
grant execute on function public.moderate_membership(uuid, uuid, member_status) to authenticated;
revoke all on function public.pending_pool_member_details(uuid) from public;
grant execute on function public.pending_pool_member_details(uuid) to authenticated;
