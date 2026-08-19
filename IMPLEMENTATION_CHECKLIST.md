# Implementation Checklist

| Area | Status | Evidence |
|---|---|---|
| Next.js TypeScript/Tailwind foundation | IMPLEMENTED | App Router mobile UI and semantic tokens |
| Player home, pick confirmation, sealed picks, standings | IMPLEMENTED | authenticated pool/line/game/pick repository and server-enforced pick mutation |
| Core deadline and scoring domain functions | IMPLEMENTED | `lib/domain`, `tests/*.test.ts` |
| Supabase normalized schema | IMPLEMENTED | `0001_gameday.sql` |
| RLS hidden-pick protection | IMPLEMENTED | pick select policy + DB reveal helper |
| Server enforced pick submission / assisted pick | IMPLEMENTED | immutable server-enforced `submit_pick` RPC + commissioner UI |
| Invitations, member approval, role assignment interfaces | IMPLEMENTED | token-generating RPC, pending approval, and commissioner UI |
| Commissioner dashboard | IMPLEMENTED | live member, pending request, submission, and provider-health views |
| BALLDONTLIE schedule, odds, and protected score sync | IMPLEMENTED | editable odds prefill + adapter + Supabase Edge Function / pg_cron setup |
| Schedule/team import orchestration | IMPLEMENTED | open weeks are imported by the secured provider sync |
| Manual game/spread entry | IMPLEMENTED | commissioner can open a week and add manually overridden game lines |
| Final scoring / correction safety | IMPLEMENTED | idempotent recomputation, manual results, and week finalization SQL |
| Supabase Realtime client presentation | IMPLEMENTED | game updates refresh server-rendered player surfaces; picks are never published |
| Email/password authentication | IMPLEMENTED | `/login`, callback exchange, Supabase Auth profile trigger |
| Session-bound production data repository | IMPLEMENTED | authenticated server data loader with Supabase RLS |
| Season leaderboard and direct invitation join link | IMPLEMENTED | cumulative final-points query + `/join?token=…` flow |
| Production E2E/RLS integration tests | NOT STARTED | requires local Supabase CI environment |
| Documentation and environment template | IMPLEMENTED | required docs + `.env.example` |

# Business Rule Clarifications

- No unresolved business-rule questions currently block the vertical slice.
- Co-commissioner permissions currently match the prompt's minimum assisted-pick capability; granular delegated admin permissions should be decided before broadening write actions.
