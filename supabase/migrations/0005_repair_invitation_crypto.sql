-- Repairs projects where pgcrypto is installed in Supabase's `extensions`
-- schema and the original invitation functions referenced it without a schema.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.create_invitation(p_pool_id uuid, p_expires_at timestamptz default null) returns table(id uuid, token text, expires_at timestamptz) language plpgsql security definer set search_path = public as $$
declare v_token text := encode(extensions.gen_random_bytes(32),'hex'); v_id uuid; v_actor uuid := auth.uid();
begin
  if not is_pool_commissioner(p_pool_id) then raise exception 'Only commissioners can create invitations'; end if;
  insert into invitations(pool_id,token_hash,created_by,expires_at) values(p_pool_id,encode(extensions.digest(v_token,'sha256'),'hex'),v_actor,p_expires_at) returning invitations.id into v_id;
  insert into audit_events(pool_id,actor_id,action,entity_type,entity_id,after_data) values(p_pool_id,v_actor,'invitation_created','invitation',v_id::text,jsonb_build_object('expires_at',p_expires_at));
  return query select v_id,v_token,p_expires_at;
end $$;

create or replace function public.request_pool_membership(p_token text) returns uuid language plpgsql security definer set search_path = public as $$
declare v_invitation invitations; v_actor uuid := auth.uid();
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  select * into v_invitation from invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and revoked_at is null and (expires_at is null or expires_at > now());
  if not found then raise exception 'Invitation is invalid or expired'; end if;
  insert into pool_members(pool_id,user_id,role,status) values(v_invitation.pool_id,v_actor,'player','pending') on conflict(pool_id,user_id) do nothing;
  insert into audit_events(pool_id,actor_id,action,entity_type,entity_id) values(v_invitation.pool_id,v_actor,'membership_requested','pool_member',v_actor::text);
  return v_invitation.pool_id;
end $$;

revoke all on function public.create_invitation(uuid,timestamptz) from public;
revoke all on function public.request_pool_membership(text) from public;
grant execute on function public.create_invitation(uuid,timestamptz) to authenticated;
grant execute on function public.request_pool_membership(text) to authenticated;
notify pgrst, 'reload schema';
