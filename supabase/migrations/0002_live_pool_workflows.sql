-- User-facing pool lifecycle functions. Each mutation derives identity from
-- auth.uid(), never from a browser-supplied user id.
create function public.is_pool_commissioner(target_pool uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from pool_members where pool_id=target_pool and user_id=auth.uid() and status='active' and role='commissioner')
$$;

create function public.has_active_pool_membership() returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from pool_members where user_id=auth.uid() and status='active')
$$;

-- Pending members may inspect only their own status; active members retain the
-- roster view from the initial migration.
create policy "members see own membership status" on public.pool_members for select using(user_id=auth.uid());
alter table public.provider_syncs enable row level security;
create policy "active members see provider health" on public.provider_syncs for select using(has_active_pool_membership());

create function public.create_pool(p_name text, p_season integer default extract(year from now())::integer) returns uuid language plpgsql security definer set search_path = public as $$
declare v_pool uuid; v_season uuid; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if char_length(trim(p_name)) not between 1 and 100 then raise exception 'Pool name must be between 1 and 100 characters'; end if;
  insert into pools(name) values(trim(p_name)) returning id into v_pool;
  insert into pool_members(pool_id,user_id,role,status) values(v_pool,v_actor,'commissioner','active');
  insert into seasons(pool_id,nfl_season,is_active) values(v_pool,p_season,true) returning id into v_season;
  insert into audit_events(pool_id,actor_id,action,entity_type,entity_id,after_data) values(v_pool,v_actor,'pool_created','pool',v_pool::text,jsonb_build_object('season_id',v_season,'season',p_season));
  return v_pool;
end $$;

create function public.create_invitation(p_pool_id uuid, p_expires_at timestamptz default null) returns table(id uuid, token text, expires_at timestamptz) language plpgsql security definer set search_path = public as $$
declare v_token text := encode(extensions.gen_random_bytes(32),'hex'); v_id uuid; v_actor uuid := auth.uid();
begin
  if not is_pool_commissioner(p_pool_id) then raise exception 'Only commissioners can create invitations'; end if;
  insert into invitations(pool_id,token_hash,created_by,expires_at) values(p_pool_id,encode(extensions.digest(v_token,'sha256'),'hex'),v_actor,p_expires_at) returning invitations.id into v_id;
  insert into audit_events(pool_id,actor_id,action,entity_type,entity_id,after_data) values(p_pool_id,v_actor,'invitation_created','invitation',v_id::text,jsonb_build_object('expires_at',p_expires_at));
  return query select v_id,v_token,p_expires_at;
end $$;

create function public.request_pool_membership(p_token text) returns uuid language plpgsql security definer set search_path = public as $$
declare v_invitation invitations; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select * into v_invitation from invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and revoked_at is null and (expires_at is null or expires_at > now());
  if not found then raise exception 'Invitation is invalid or expired'; end if;
  insert into pool_members(pool_id,user_id,role,status) values(v_invitation.pool_id,v_actor,'player','pending') on conflict(pool_id,user_id) do nothing;
  insert into audit_events(pool_id,actor_id,action,entity_type,entity_id) values(v_invitation.pool_id,v_actor,'membership_requested','pool_member',v_actor::text);
  return v_invitation.pool_id;
end $$;

create function public.moderate_membership(p_pool_id uuid, p_user_id uuid, p_status member_status) returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid();
begin
  if not is_pool_commissioner(p_pool_id) then raise exception 'Only commissioners can moderate members'; end if;
  if p_status not in ('active','rejected','removed') then raise exception 'Invalid member status'; end if;
  update pool_members set status=p_status where pool_id=p_pool_id and user_id=p_user_id;
  if not found then raise exception 'Membership not found'; end if;
  insert into audit_events(pool_id,actor_id,action,entity_type,entity_id,after_data) values(p_pool_id,v_actor,'membership_' || p_status::text,'pool_member',p_user_id::text,jsonb_build_object('status',p_status));
end $$;

create function public.set_pool_member_role(p_pool_id uuid, p_user_id uuid, p_role member_role) returns void language plpgsql security definer set search_path = public as $$
declare v_actor uuid := auth.uid();
begin
  if not is_pool_commissioner(p_pool_id) then raise exception 'Only commissioners can assign roles'; end if;
  if p_user_id=v_actor then raise exception 'Commissioners cannot change their own role'; end if;
  update pool_members set role=p_role where pool_id=p_pool_id and user_id=p_user_id and status='active';
  if not found then raise exception 'Active membership not found'; end if;
  insert into audit_events(pool_id,actor_id,action,entity_type,entity_id,after_data) values(p_pool_id,v_actor,'role_changed','pool_member',p_user_id::text,jsonb_build_object('role',p_role));
end $$;

create function public.revoke_invitation(p_invitation_id uuid) returns void language plpgsql security definer set search_path = public as $$
declare v_pool uuid; v_actor uuid := auth.uid();
begin
  select pool_id into v_pool from invitations where id=p_invitation_id;
  if not found or not is_pool_commissioner(v_pool) then raise exception 'Not authorized'; end if;
  update invitations set revoked_at=now() where id=p_invitation_id and revoked_at is null;
  insert into audit_events(pool_id,actor_id,action,entity_type,entity_id) values(v_pool,v_actor,'invitation_revoked','invitation',p_invitation_id::text);
end $$;

revoke all on function public.create_pool(text,integer) from public;
revoke all on function public.create_invitation(uuid,timestamptz) from public;
revoke all on function public.request_pool_membership(text) from public;
revoke all on function public.moderate_membership(uuid,uuid,member_status) from public;
revoke all on function public.set_pool_member_role(uuid,uuid,member_role) from public;
revoke all on function public.revoke_invitation(uuid) from public;
grant execute on function public.create_pool(text,integer) to authenticated;
grant execute on function public.create_invitation(uuid,timestamptz) to authenticated;
grant execute on function public.request_pool_membership(text) to authenticated;
grant execute on function public.moderate_membership(uuid,uuid,member_status) to authenticated;
grant execute on function public.set_pool_member_role(uuid,uuid,member_role) to authenticated;
grant execute on function public.revoke_invitation(uuid) to authenticated;
