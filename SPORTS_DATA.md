# Sports data

GameDay currently targets BALLDONTLIE NFL via `BallDontLieSportsProvider`. Required environment variable: `BALLDONTLIE_API_KEY`. Its adapter is server-only and normalizes teams/games into `ProviderTeam` and `ProviderGame`; provider-specific status names do not leave the adapter.

The secured `sports-sync` Supabase Edge Function retrieves locally relevant scheduled/in-progress games, updates local game status/score metadata, and invokes idempotent final scoring. A provider failure preserves local data and records the error in `provider_syncs`; ordinary pages continue to render last-known data. The function intentionally skips `manual_override` games. Spreads never come from this provider and are never updated during sync.

Opening a GameDay week requests an immediate schedule import from the secured Edge Function; the five-minute sync remains the retry and score-update path. The function accepts that request only from an authenticated commissioner or co-commissioner for the requested pool. It imports normalized BALLDONTLIE teams and that week’s schedule before scoring begins. Commissioners select an imported matchup and enter only the GameDay underdog line and spread. This preserves the strict separation between provider schedule/score data and GameDay spreads.

`supabase/cron.sql` schedules the Edge Function every five minutes using `pg_cron` and `pg_net`; the target URL and a Supabase secret API key live in Vault. This works independently of Vercel's plan. Production code should add bounded retry/backoff around transient provider failures and log health from `provider_syncs` in the commissioner dashboard.

Development fixtures in `lib/fixtures/week.ts` cover Thursday, Sunday, Sunday afternoon/night, and Monday games. They are demo data, not a provider substitute.
