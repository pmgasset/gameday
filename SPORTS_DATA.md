# Sports data

GameDay currently targets BALLDONTLIE NFL via `BallDontLieSportsProvider`. Required environment variable: `BALLDONTLIE_API_KEY`. Its adapter is server-only and normalizes teams/games into `ProviderTeam` and `ProviderGame`; provider-specific status names do not leave the adapter.

The secured `sports-sync` Supabase Edge Function keeps the locally stored schedule authoritative for the app. Its schedule mode imports and reconciles each open week in bulk every three hours (eight times daily). Its live mode runs every five minutes, but calls the provider only for games within 15 minutes of kickoff, games that started within the last 12 hours, or games already in progress. Each mode fetches a weekly game list rather than making one provider request per game, updates local status/score metadata, and invokes idempotent final scoring. A provider failure preserves local data and records the error in `provider_syncs`; ordinary pages continue to render last-known data. The function intentionally skips `manual_override` games.

Opening a GameDay week requests an immediate schedule import from the secured Edge Function. The function accepts that request only from an authenticated commissioner or co-commissioner for the requested pool. The three-hourly schedule sync retries imports and the five-minute live sync updates games only near kickoff or in progress.

During each schedule import GameDay also requests `GET /nfl/v1/odds?season=…&week=…` from BALLDONTLIE. It prefers DraftKings, then FanDuel, then BetMGM, and creates an editable underdog line for every unambiguous positive spread. BALLDONTLIE documents NFL odds coverage starting in 2025 Week 8 and the account needs odds access; no odds response leaves the schedule available for manual entry. A commissioner edit marks the line as manual, and future syncs deliberately never overwrite it.

`supabase/cron.sql` uses `pg_cron` and `pg_net` to schedule the three-hourly schedule import and five-minute live-score check; the target URL and a Supabase secret API key live in Vault. This works independently of Vercel's plan. Production code should add bounded retry/backoff around transient provider failures and log health from `provider_syncs` in the commissioner dashboard.

Development fixtures in `lib/fixtures/week.ts` cover Thursday, Sunday, Sunday afternoon/night, and Monday games. They are demo data, not a provider substitute.
