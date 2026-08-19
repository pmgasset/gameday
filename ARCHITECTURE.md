# Architecture

## Boundaries

The browser renders only GameDay's local data. It never calls BALLDONTLIE and never receives a service-role credential. Supabase Cron → secured Supabase Edge Function → provider → Supabase is the score path. React remains a presentation layer; deadlines, reveal visibility, eligibility, authorization, and scoring belong in shared domain functions and PostgreSQL.

`lib/sports/types.ts` is the provider contract; `BallDontLieSportsProvider` normalizes provider responses there. An alternate provider implements the same contract without affecting pages or the database model.

## Security decisions

- Auth is Supabase Auth. The `handle_new_user` trigger creates a minimal profile.
- Pool membership is scoped by `(pool_id, user_id)`, with `pending` unable to access pool data or submit picks.
- `picks` RLS returns a member's own pick, or a pick whose game is revealed. It does not return hidden picks for client-side filtering.
- `submit_pick` is a `security definer` RPC: it derives actor identity from `auth.uid()`, verifies active membership, verifies the pool-week/game relationship and stored underdog line, calculates Tuesday availability and deadline on the server, and audits the write. It permits another player's pick only for a pool admin. Once a player's existing pick is locked, it cannot be replaced.
- The one-active-pick invariant is the `unique(pool_id, week_id, player_id)` constraint. Changing a valid pick updates that single row; historical spread is copied into `stored_spread`.
- Pool lines are independent of games. The provider may prefill an odds line, but a commissioner edit is marked manual and cannot be overwritten by sync.
- Admin and sync operations must be server-side. The scheduled Edge Function accepts only the secret Supabase API key stored in Vault; service keys must not use a `NEXT_PUBLIC_` name.

## Scoring and corrections

`score_final_game` writes the authoritative result from each pick's `stored_spread`; it does not increment a separate total. This makes repeated final sync idempotent and a corrected final safely recalculable. Season totals are `sum(final_points)`, so duplicate scoring cannot inflate standings. The provider sync automatically finalizes an open week only once every imported game (including Monday night) has resolved; a commissioner can also record a manual result or finalize a ready week.

## Time

Pool business time is `America/New_York`; stored timestamps are `timestamptz` UTC. Picks publish at Tuesday 9 AM ET and the effective deadline is `min(kickoff, Sunday 1 PM ET)` where the Sunday is in that NFL game week. The RLS reveal helper and submission RPC independently enforce reveal and deadline rules, including Monday–Wednesday dates mapping to the prior Sunday. Browser countdowns are informational only.
