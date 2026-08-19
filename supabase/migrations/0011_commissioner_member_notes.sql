create table public.pool_member_notes (
  pool_id uuid not null references public.pools(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  note text not null check (char_length(note) between 1 and 2000),
  updated_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (pool_id, member_id)
);

alter table public.pool_member_notes enable row level security;

create policy "commissioner sees private member notes"
on public.pool_member_notes for select
using (
  exists (
    select 1 from public.pool_members
    where pool_id = pool_member_notes.pool_id
      and user_id = auth.uid()
      and role = 'commissioner'
      and status = 'active'
  )
);

create or replace function public.save_pool_member_note(
  p_pool_id uuid,
  p_member_id uuid,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_note text := nullif(trim(p_note), '');
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from public.pool_members
    where pool_id = p_pool_id
      and user_id = v_actor
      and role = 'commissioner'
      and status = 'active'
  ) then raise exception 'Only the commissioner can manage member notes'; end if;
  if not exists (
    select 1 from public.pool_members
    where pool_id = p_pool_id and user_id = p_member_id
  ) then raise exception 'Member does not belong to this pool'; end if;
  if v_note is not null and char_length(v_note) > 2000 then raise exception 'Notes must be 2,000 characters or fewer'; end if;

  if v_note is null then
    delete from public.pool_member_notes where pool_id = p_pool_id and member_id = p_member_id;
    insert into public.audit_events(pool_id, actor_id, action, entity_type, entity_id, after_data)
    values (p_pool_id, v_actor, 'member_note_deleted', 'pool_member', p_member_id::text, jsonb_build_object('has_note', false));
    return;
  end if;

  insert into public.pool_member_notes(pool_id, member_id, note, updated_by)
  values (p_pool_id, p_member_id, v_note, v_actor)
  on conflict (pool_id, member_id) do update set
    note = excluded.note,
    updated_by = excluded.updated_by,
    updated_at = now();

  insert into public.audit_events(pool_id, actor_id, action, entity_type, entity_id, after_data)
  values (p_pool_id, v_actor, 'member_note_saved', 'pool_member', p_member_id::text, jsonb_build_object('has_note', true));
end
$$;

revoke all on function public.save_pool_member_note(uuid, uuid, text) from public;
grant execute on function public.save_pool_member_note(uuid, uuid, text) to authenticated;
