# Sports data

GameDay currently targets BALLDONTLIE NFL via `BallDontLieSportsProvider`. Required environment variable: `BALLDONTLIE_API_KEY`. Its adapter is server-only and normalizes teams/games into `ProviderTeam` and `ProviderGame`; provider-specific status names do not leave the adapter.

The protected `/api/cron/sports-sync` route retrieves locally relevant scheduled/in-progress games, updates local game status/score metadata, and invokes idempotent final scoring. A provider failure preserves local data and records the error in `provider_syncs`; ordinary pages continue to render last-known data. The route intentionally skips `manual_override` games. Spreads never come from this provider and are never updated during sync.

`vercel.json` schedules the route every five minutes. Vercel must send `Authorization: Bearer $CRON_SECRET` (or invoke via a secure equivalent). Production code should add bounded retry/backoff around transient provider failures and log health from `provider_syncs` in the commissioner dashboard.

Development fixtures in `lib/fixtures/week.ts` cover Thursday, Sunday, Sunday afternoon/night, and Monday games. They are demo data, not a provider substitute.
