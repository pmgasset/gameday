# Supabase setup

Create a Supabase project and enable the **Email** auth provider with password sign-in. GameDay uses email-and-password accounts, not magic links, so routine sign-ins do not consume the email-send quota. Set the Site URL to `https://thegameday.app` and add both `https://thegameday.app/auth/callback` and `https://www.thegameday.app/auth/callback` as Redirect URLs if both hostnames resolve to the app. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the app; add `SUPABASE_SERVICE_ROLE_KEY` only to Vercel/server environments.

## Email/password authentication

In **Authentication → Providers → Email**, leave Email enabled and use password sign-in. You can disable magic-link/OTP sign-in there because the GameDay UI no longer requests it.

For a private, invitation-only pool during initial setup, turn off **Confirm email** in the Email provider settings. Accounts will sign in immediately and the app's invitation approval flow remains the access control. This removes authentication email sends entirely. If you keep confirmation enabled, new accounts receive a confirmation email once, so configure a custom SMTP provider before inviting players; the default Supabase sender is intentionally rate-limited.

## Database schema

Apply the migrations with the Supabase CLI:

```bash
supabase link --project-ref YOUR_REF
supabase db push
```

If you do not have terminal access, open **SQL Editor → New query** in the Supabase Dashboard and run these files in order:

1. `supabase/migrations/0001_gameday.sql`
2. `supabase/migrations/0002_live_pool_workflows.sql`
3. `supabase/migrations/0003_manual_week_and_lines.sql`
4. `supabase/migrations/0004_provider_import_and_realtime.sql`
5. `supabase/migrations/0005_repair_invitation_crypto.sql`
6. `supabase/migrations/0006_immediate_schedule_import.sql`
7. `supabase/migrations/0007_player_lined_game_visibility.sql`
8. `supabase/migrations/0008_pool_hardening_and_odds.sql`
9. `supabase/migrations/0009_reset_pool_gameplay.sql`
10. `supabase/migrations/0010_tuesday_odds_snapshots.sql`
11. `supabase/migrations/0011_commissioner_member_notes.sql`
12. `supabase/migrations/0012_temporary_pick_blocks.sql`
13. `supabase/migrations/0013_week_participation_and_member_exit.sql`
14. `supabase/migrations/0014_official_nfl_week_calendar.sql`

Do not run either file against a shared project that already has GameDay-named tables or an unrelated `public.profiles` signup trigger.

After creating an account, the first user can create a pool through the GameDay onboarding screen. That user becomes the active Commissioner automatically; no manual SQL membership update is needed. Commissioners create invitation tokens under **Commissioner**, and invited users become `pending` until approved. Invitations store only a token hash (`sha256` or stronger), never the shareable raw token.

Enable Realtime publication for `games` after testing privacy. Do not publish `picks`: game updates can be subscribed to publicly by authorized members while pick visibility remains enforced by query-time RLS.

## Scheduled NFL sync

The scheduler is hosted by Supabase, not Vercel. BALLDONTLIE supplies the NFL schedule and live scores; TheRundown supplies the pregame spreads. Set both credentials and deploy the Edge Function:

```bash
supabase secrets set BALLDONTLIE_API_KEY=YOUR_KEY THERUNDOWN_API_KEY=YOUR_KEY
supabase functions deploy sports-sync
```

In the Supabase SQL Editor, create the two Vault secrets below. Use your project URL and the **secret** API key from Supabase Settings → API; this key is never placed in Vercel or the source repository.

```sql
select vault.create_secret('https://YOUR_PROJECT_REF.supabase.co', 'gameday_project_url');
select vault.create_secret('YOUR_SUPABASE_SECRET_KEY', 'gameday_function_key');
```

Finally run [`supabase/cron.sql`](supabase/cron.sql) in the SQL Editor. It installs an eight-times-daily schedule refresh and a five-minute live-score job; the live job makes provider calls only around kickoff or while a game is in progress. It is safe to re-run because it removes the existing named jobs first. Inspect runs in Supabase Dashboard → Integrations → Cron. The Edge Function validates the Vault-held key before it performs privileged database work.

With no terminal access, deploy `sports-sync` via **Edge Functions → Deploy a new function → Via Editor**. Use the source at `supabase/functions/sports-sync/index.ts`, turn off **Verify JWT**, then add both `BALLDONTLIE_API_KEY` and `THERUNDOWN_API_KEY` under Edge Function Secrets. The Vault and scheduler statements still run in SQL Editor.

When a Commissioner opens a week, GameDay immediately asks the secured Edge Function to import and save the matching BALLDONTLIE teams and games. The scheduled job later reconciles schedule changes and keeps live scores current without repeatedly re-importing the full schedule. The commissioner reviews each imported matchup and can enter or edit its underdog/spread—no team abbreviations or kickoff times are needed. If the provider is unavailable, the existing manual game-line form remains available as a fallback. Migration `0004` enables Realtime only for `games`; `picks` are intentionally excluded to prevent hidden-pick leakage. Apply migration `0006` as well; it grants schedule visibility only to pool admins before a line is created.

TheRundown pre-fills each eligible underdog/spread using DraftKings first, then FanDuel and BetMGM when DraftKings is unavailable. Its free plan is limited to one request per second, so GameDay requests each NFL game date sequentially and retries a short-lived `429` automatically. After applying migration `0010`, the Tuesday 9:00 AM Eastern snapshot uses DraftKings only, records TheRundown's price timestamp, and prevents later provider refreshes from changing the line. Commissioner edits remain manual overrides. Deploy the updated `sports-sync` function after the database migration, then re-run `supabase/cron.sql`. Odds retrieval failures are retained as warnings in `provider_syncs`.

Verify a Tuesday snapshot with:

```sql
select sync_mode, attempted_at, succeeded_at, affected_games, warning_message, error_message
from public.provider_syncs
where sync_mode = 'snapshot'
order by attempted_at desc;

select source, provider_odds_updated_at, odds_locked_at
from public.pool_game_lines
where odds_locked_at is not null
order by odds_locked_at desc;
```

For production administration, expose narrowly scoped server actions/RPCs for membership state, roles, lines, and overrides. Each must call `is_pool_admin`, write an `audit_events` record, and preserve explicit override metadata.
