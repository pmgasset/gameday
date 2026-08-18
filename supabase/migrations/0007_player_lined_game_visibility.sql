-- Players may see a game only after their active pool has assigned a line to
-- it. Evaluate the membership join inside a security-definer function so the
-- games policy does not depend on nested RLS evaluation of its supporting
-- tables.
create or replace function public.can_view_lined_game(p_game_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pool_game_lines l
    join public.pool_members m on m.pool_id = l.pool_id
    where l.game_id = p_game_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  )
$$;

revoke all on function public.can_view_lined_game(uuid) from public;
grant execute on function public.can_view_lined_game(uuid) to authenticated;

create policy "active members see lined games" on public.games
for select
to authenticated
using (public.can_view_lined_game(id));
