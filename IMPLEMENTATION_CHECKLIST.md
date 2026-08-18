# Implementation Checklist

| Area | Status | Evidence |
|---|---|---|
| Next.js TypeScript/Tailwind foundation | IMPLEMENTED | App Router mobile UI and semantic tokens |
| Player home, pick confirmation, sealed picks, standings | IMPLEMENTED | `app/*/page.tsx`, fixture-mode interaction |
| Core deadline and scoring domain functions | IMPLEMENTED | `lib/domain`, `tests/*.test.ts` |
| Supabase normalized schema | IMPLEMENTED | `0001_gameday.sql` |
| RLS hidden-pick protection | IMPLEMENTED | pick select policy + DB reveal helper |
| Server enforced pick submission / assisted pick | IMPLEMENTED | `submit_pick` RPC |
| Invitations, member approval, role assignment interfaces | IN PROGRESS | schema/security foundation; server admin actions and UI remain |
| Commissioner dashboard | IN PROGRESS | responsive operational overview; CRUD remains |
| BALLDONTLIE adapter and protected score sync | IMPLEMENTED | adapter + Supabase Edge Function / pg_cron setup |
| Schedule/team import orchestration | IN PROGRESS | adapter exists; import job remains |
| Manual game/spread overrides | IN PROGRESS | schema and sync precedence exist; admin controls remain |
| Final scoring / correction safety | IMPLEMENTED | idempotent recomputation SQL |
| Supabase Realtime client presentation | NOT STARTED | database is source of truth without it |
| Magic-link authentication | IMPLEMENTED | `/login`, callback exchange, Supabase Auth profile trigger |
| Session-bound production data repository | IN PROGRESS | player UI intentionally uses development fixtures pending deployed Supabase data |
| Production E2E/RLS integration tests | NOT STARTED | requires local Supabase CI environment |
| Documentation and environment template | IMPLEMENTED | required docs + `.env.example` |

# Business Rule Clarifications

- A pool needs a defined season/week selection source (for example commissioner-selected active week) before production data loading replaces fixtures.
- Co-commissioner permissions currently match the prompt's minimum assisted-pick capability; granular delegated admin permissions should be decided before broadening write actions.
