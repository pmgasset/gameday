# GameDay

GameDay is a private, season-long NFL underdog pick'em pool. Each active member makes one weekly selection from the eligible underdogs. The selected team must win outright; successful picks receive the stored positive spread as points.

## Start locally

1. Install Node 20+ and run `npm install`.
2. Copy `.env.example` to `.env.local` and add Supabase credentials.
3. Start local Supabase, then run `supabase db push` (or apply `supabase/migrations/0001_gameday.sql`).
4. Run `npm run dev`.

Without credentials, the player interface renders realistic fixture data. Fixtures are deliberately not written to a production database.

## Checks

`npm run typecheck` · `npm run lint` · `npm test` · `npm run build`

## Deployment

Deploy to Vercel, set all environment variables, and configure the Vercel cron authentication header with `CRON_SECRET`. The cron is scheduled every five minutes; it only uses server-side credentials.

Read [ARCHITECTURE.md](ARCHITECTURE.md), [SUPABASE_SETUP.md](SUPABASE_SETUP.md), and [SPORTS_DATA.md](SPORTS_DATA.md) before production setup.
