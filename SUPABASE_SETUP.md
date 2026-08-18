# Supabase setup

Create a Supabase project, enable Email OTP/magic-link sign-in, and set Site URL/redirect URLs for the deployment. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the app; add `SUPABASE_SERVICE_ROLE_KEY` only to Vercel/server environments.

Apply the migration with the Supabase CLI:

```bash
supabase link --project-ref YOUR_REF
supabase db push
```

Create a pool, then add its creator to `pool_members` as an active `commissioner`. Add members as `pending` after validating a hashed invitation token server-side; an admin approves them by changing the state to `active` and auditing the event. Invitations store only a token hash (`sha256` or stronger), never the shareable raw token.

Enable Realtime publication for `games` after testing privacy. Do not publish `picks`: game updates can be subscribed to publicly by authorized members while pick visibility remains enforced by query-time RLS.

## Scheduled NFL sync

The scheduler is hosted by Supabase, not Vercel. First set the BALLDONTLIE credential and deploy the Edge Function:

```bash
supabase secrets set BALLDONTLIE_API_KEY=YOUR_KEY
supabase functions deploy sports-sync
```

In the Supabase SQL Editor, create the two Vault secrets below. Use your project URL and the **secret** API key from Supabase Settings → API; this key is never placed in Vercel or the source repository.

```sql
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'gameday_project_url');
select vault.create_secret('YOUR_SUPABASE_SECRET_KEY', 'gameday_function_key');
```

Finally run [`supabase/cron.sql`](supabase/cron.sql) in the SQL Editor. It installs a five-minute job and is safe to re-run because it removes the existing named job first. Inspect runs in Supabase Dashboard → Integrations → Cron. The Edge Function validates the Vault-held key before it performs privileged database work.

For production administration, expose narrowly scoped server actions/RPCs for membership state, roles, lines, and overrides. Each must call `is_pool_admin`, write an `audit_events` record, and preserve explicit override metadata.
