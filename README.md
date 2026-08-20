# GameDay

GameDay is a private, season-long NFL underdog pick'em pool. Each active member makes one weekly selection from the eligible underdogs. The selected team must win outright; successful picks receive the stored positive spread as points.

## Start locally

1. Install Node 20+ and run `npm install`.
2. Copy `.env.example` to `.env.local` and add the public Supabase credentials.
3. Start local Supabase, then run `supabase db push` (or apply `supabase/migrations/0001_gameday.sql`).
4. Run `npm run dev`.

Without credentials, the player interface renders realistic fixture data. Fixtures are deliberately not written to a production database.

## Checks

`npm run typecheck` · `npm run lint` · `npm test` · `npm run build`

## Deployment

Deploy the web app to Vercel with its standard Next.js defaults. NFL synchronization is a Supabase Edge Function scheduled from Supabase Postgres, so no Vercel Cron configuration or Vercel server secrets are required.

## Membership email

When a commissioner approves a join request, GameDay sends the new member a welcome email containing the pool rules and a direct link to their first pick. Set `RESEND_API_KEY`, `GAMEDAY_EMAIL_FROM`, and `NEXT_PUBLIC_APP_URL` in the server environment, and verify the sending domain in Resend. The sender is best effort by design: approval is already committed when the message is attempted, so a failed or unconfigured send never blocks the approval — the commissioner simply sees a warning telling them to pass the link along themselves.

GameDay is installable as a PWA. Android browsers offer an in-app **Install GameDay** prompt when eligible; on iPhone, Safari users receive the native **Share → Add to Home Screen** instructions.

Read [ARCHITECTURE.md](ARCHITECTURE.md), [SUPABASE_SETUP.md](SUPABASE_SETUP.md), and [SPORTS_DATA.md](SPORTS_DATA.md) before production setup.
