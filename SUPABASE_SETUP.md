# Supabase setup

Create a Supabase project, enable Email OTP/magic-link sign-in, and set Site URL/redirect URLs for the deployment. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the app; add `SUPABASE_SERVICE_ROLE_KEY` only to Vercel/server environments.

Apply the migration with the Supabase CLI:

```bash
supabase link --project-ref YOUR_REF
supabase db push
```

Create a pool, then add its creator to `pool_members` as an active `commissioner`. Add members as `pending` after validating a hashed invitation token server-side; an admin approves them by changing the state to `active` and auditing the event. Invitations store only a token hash (`sha256` or stronger), never the shareable raw token.

Enable Realtime publication for `games` after testing privacy. Do not publish `picks`: game updates can be subscribed to publicly by authorized members while pick visibility remains enforced by query-time RLS.

For production administration, expose narrowly scoped server actions/RPCs for membership state, roles, lines, and overrides. Each must call `is_pool_admin`, write an `audit_events` record, and preserve explicit override metadata.
