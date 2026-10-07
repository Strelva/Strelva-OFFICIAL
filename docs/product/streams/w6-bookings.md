# Wave 6 bookings — round 5 handoff

Branch: `w6/bookings`. Worktree: `REB-w6-bookings`. October 7, 2026. Implementation and verification are local. No production reads/writes, provider calls, live sends, dependencies, pushes, PRs or merges.

## Active final audit closure

The first full verification below passed. A subsequent independent spec audit found
three additional code gaps: tenantless workspace bookings, visitor phone/timezone
handling, and native receipts that still attributed confirmation to the provider.
These are being implemented and will receive a fresh full verification before
completion. Microsoft disconnect is also gaining an explicit manual-consent action.
The next agent should finish these pieces, rerun the seven checks, then replace
this active note with final results. No production step is authorized.

## Objective and result

Finish every adopted launch requirement in the bookings spec, preserve all flag-off visitor contracts, and add a read-only daily booking-parity cron. Agent bookings are required by the adopted 1.0 spec, so they are implemented, including a hand-written bounded MCP protocol with no dependency.

The local implementation now covers one store, record-sourced hours/services, per-service booking rules and intake, owner-approved instant mode, visitor/request/agent flows, signed owner decisions, inquiry proposals, staff-entered requests, reminders and request clocks, customer management, calendar busy reads and mirrors, owner history/no-shows/health, fallback and workspace exit. This is code and fixture evidence. Delivered emails, real provider behavior, production migration safety and the seven-day parity streak remain unproven.

Microsoft provider consent is a specific exception to the literal spec: with the existing calendar permission, disconnect wipes Strelva's stored credentials but cannot invalidate Microsoft's application consent. The owner removes consent in My Apps; administrator-granted consent needs the administrator. We did not add account-wide `User.RevokeSessions.All`. Microsoft's [revokeSignInSessions documentation](https://learn.microsoft.com/en-us/graph/api/user-revokesigninsessions?view=graph-rest-1.0) says that operation invalidates refresh tokens for all applications and is unsupported for personal Microsoft accounts. This provider limitation needs an accepted launch exception or a separately authorized consent design; it is not marked automated or production-proven.

## What moved against launch requirements

| Requirement | Code and local evidence |
| --- | --- |
| One store through both route families | The tenant widget and public booking service use native record context and SQL exclusion. `booking-one-store` runs both real paths against PostgreSQL: 30 tests pass. Public receipt identity, duplicate retries, ghost hold release, status/time synchronization and immutable history are covered. |
| Current record hours/services | Current catalog length, bookability and saved booking buffer are enforced. A changed Friday, removed service and mixed-service buffers change new slots while keeping existing bookings. Public capabilities resolve an explicit service ID/ref or exact name; production mapping must be checked. |
| Booking rules and intake | Request/instant, buffer, availability, eight bounded intake questions per service. Instant needs owner approval for that exact current revision; editing rules invalidates approval. Shared record facts are never copied into booking policy. Required answers are enforced in SQL and UI. Owner views preserve answers even after a question is removed. |
| Visitor flow and contracts | Native public flow is gated by the store flip. Flag-off tests preserve legacy defaults, response bodies and visitor flow. Real starter renderer/runtime reviewed with synthetic receipts at desktop/mobile widths. Fresh conflict responses offer up to three times and preserve entered details. |
| Requests and owner decisions | Urgent Needs You email uses the canonical owner recipient and signed approval POST. The booking's own 24-hour chase and 72-hour lapse replace generic day-3/7/14 reminders. Rescheduling restarts the request clock. Silence never confirms. |
| Inquiry to booking | Immediate three-slot offers plus an owner reply component that selects up to three current slots, sends the signed offer through the existing governed delivery path, and reports accepted/suppressed/unknown honestly. Stale recipient and foreign workspace checks are covered. |
| Staff hand bookings | Direct members can enter a request with origin `owner`; only the owner decision confirms it. Route authorization, CSRF, bounds, stable retry ID, overlap, inactive service and pause/exit are covered. No browser-supplied actor/status. |
| AI assistants | Additive services, slots, reservations, status and OpenAPI; MCP tools share the same limits. Customer email confirmation precedes placement, with a 15-minute hold. Role-specific tokens prevent an agent from confirming/managing for the customer. ReserveAction is gated. |
| Customer management/messages | Native manage tokens for both entry paths; cancellation and reschedule notices; customer confirmations with calendar attachment. Accepted writes are not replayed on failed read-back. Suppressed sends are recorded. Late cancellation remains allowed and is recorded before immutable history. |
| Calendar failures and mirrors | Busy reads with 60-second cache and service buffers. Revoked/error/unreadable calendars downgrade instant to request. Fresh 401/403 errors mark only the matching connection revision; stale failures cannot poison reconnect. Confirmed bookings mirror idempotently; conflicts, deleted events, rate limits and read-back failures retain recovery evidence. |
| Owner workspace/wellness | Authoritative upcoming/request/past/no-show views, expandable history and send outcomes, out-of-current-hours warnings, mirror health, no-show confirmation. Wellness views remain compatible before/after store flip. |
| Calendar reconnect chase | Existing hourly Needs You morning pass (07:00 record timezone) resolves owner recipient and records a durable `health.owner_action`. Daily dedupe, email suppression, CAS provider status and healthy-read resolution tested. No fake grants or owner decisions. |
| Pause and workspace exit | New slots and reservations stop on both routes. Kept bookings, approvals, reminders and cancellation still work. The SQL exit fixture proves rejection of new staff/agent bookings alongside kept request approval, reminder and cancellation. |
| Record unreadable | Flagged, identity-scoped last-good hours/services/phone cache for at most one hour. Fresh route/lifecycle/policy/store evidence is still mandatory; a cached record cannot undo a pause or changed booking policy. Expiry and changed identity fail closed; operator alerted. |
| Daily parity | Authenticated daily cron enumerates authoritative tenants, compares bookings and 60 days of slots, fails closed on partial/deadline/errors, and records parity plus heartbeat/alerts. It does not change bookings, configuration or providers. |

## Switches and defaults

All switches below are off/unset by default; exact `1` opts in. `STRELVA_BOOKING_STORE_READ` defaults to `legacy`; `compare` does not change served data. `postgres` requires writes and seven consecutive passing parity days. `DUAL_WRITE_PG=0` or `false` remains the write kill switch.

- `STRELVA_BOOKING_STORE_WRITE`, `STRELVA_BOOKING_STORE_READ`
- `STRELVA_BOOKING_OWNER_NOTICE`, `STRELVA_BOOKING_REMINDERS`
- `STRELVA_BOOKING_MANAGE_PAGE`, `STRELVA_BOOKING_MESSAGES`
- `STRELVA_BOOKING_CALENDAR_BUSY`, `STRELVA_BOOKING_CALENDAR_MIRROR`
- `STRELVA_BOOKING_CALENDAR_SCOPES`, `STRELVA_BOOKING_CALENDAR_REVOKE`
- `STRELVA_BOOKING_AGENTS`, `STRELVA_BOOKING_INQUIRY_OFFERS`
- `STRELVA_BOOKING_SETTINGS`, `STRELVA_BOOKING_RECORD_FALLBACK`, `STRELVA_BOOKING_MANUAL`

New booking sends retain `EMAIL_SENDING_ENABLED`, `CUSTOMER_EMAIL_ENABLED` and per-tenant `reb:client-email`. Calendar health also requires Needs You release, owner notice, calendar busy, store writes and actual PostgreSQL reads. Staff/setup need workspace release and actual PostgreSQL reads. No health-specific switch or cron is added. Test-only `STRELVA_BOOKING_PROVIDER_PROOF=1` requires explicitly disposable calendars; it stayed off.

## SQL and rollback

All wave-6 migrations are in the assigned timestamp range. Apply in timestamp order only after review/authorization. Each has its corresponding `rollback-w6-booking-*.sql`; roll back in reverse dependency order, retaining legacy reads during rollout. SQL uses bounded lock timeouts, RLS/revoked browser grants and service-role functions with application authorization. Local SQL checks use throwaway PostgreSQL, never production.

| Timestamp suffix | Migration / corresponding rollback suffix |
| --- | --- |
| 130000 | booking_parity / booking-parity |
| 131000 | booking_access / booking-access |
| 132000 | booking_updates / booking-updates |
| 133000 | booking_calendar_mirror / booking-calendar-mirror |
| 134000 | booking_inquiry_offers / booking-inquiry-offers |
| 135000 | booking_setup / booking-setup |
| 135500 | booking_receipt_history / booking-receipt-history |
| 135900 | booking_receipt_lifecycle / booking-receipt-lifecycle |
| 135910 | booking_owner_evidence / booking-owner-evidence |
| 135920 | booking_service_policies / booking-service-policies |
| 135940 | booking_manual / booking-manual |
| 135945 | booking_cancellation_cutoff / booking-cancellation-cutoff |
| 135950 | booking_calendar_health / booking-calendar-health |
| 135955 | booking_exit_admission / booking-exit-admission |

Prefix: `20261010`; files are under `supabase/migrations/`. Predecessors are the wave-2 store and wave-3 lifecycle migrations already in the branch base. Sentinel/readiness coverage includes new tables and preserves the Round-4 missing-table correction.

## Crons

- `/api/cron/booking-parity`: daily `45 5 * * *` UTC; `requireCronRequest`; heartbeat maximum age 26 hours; `maxDuration=120`, sweep deadline 90 seconds. Reads client data; writes only parity/heartbeat/monitoring evidence. Incomplete comparison never advances the streak. No feature flag means no booking store parity work while writes are disabled.
- `/api/cron/booking-reminders`: every 15 minutes, authenticated/registered; holds, 24/72-hour requests, reminders, update/mirror recovery stay behind their existing switches.
- Existing Needs You hourly cron: calendar health morning delivery; no additional cron and no provider polling beyond stored status.

## Verification — local

Final commands and results (October 7):

| Command | Actual result |
| --- | --- |
| `pnpm typecheck` | Exit 0; Next route types and TypeScript pass. |
| `pnpm lint` | Exit 0; Babel prints its existing large generated database-types note. |
| `pnpm check:boundaries` | Exit 0; source/scripts including untracked files pass; baseline 204 workspace-to-lib imports in 93 files, 46 older imports, no new violation. |
| `pnpm test` | Exit 0; 708 files pass, 1 skipped; 6,388 tests pass, 39 skipped. |
| `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql` | Exit 0; all workspace/booking fixtures, authority races, SQL-backed 30-route tests, customer mapping and inquiry clusters pass. |
| `pnpm check:custom-repos` | Exit 0; 196/196. |
| `NODE_ENV=production pnpm build` | Exit 0; compile, TypeScript, prerender and route output pass. Explicit environment corrects the host's inherited `NODE_ENV=development`. |

Focused exit/manual SQL passes; calendar-health SQL plus rollback/reapply passes; policy/manual/cancellation migrations were reapplied locally. Agent, provider contract, flags-off, contact/tenant authorization, mail suppression, lifecycle, concurrency, clocks, DST, service policy, fallback and both real-route tests are in the full suite. Two real-provider proofs are deliberately skipped without disposable credentials/authorization. Skips in other domains are preserved, not presented as bookings proof.

Rendered proof: [UI evidence](../../../output/w6-bookings-ui/README.md), with measured JSON and representative PNGs. Actual visitor starter runtime, manage page, inquiry receipt, owner setup/list/history/no-show/intake, proposal reply and staff form were reviewed at 1280/390px, with 320px reflow checks. Empty/loading/error/permission/paused/conflict and keyboard/focus states covered. Fixture transport blocks external requests. This proves layout and synthetic behavior, not authenticated production sends or calendar grants. The legacy visitor runtime disables submit while saving but lacks a separate live busy announcement; it remains unchanged while flags are off.

Failures preserved in this report: saved rounds were unverified; early authority race checks missed a short lock window (hold timing was hardened without removing assertions); focused fixture/SQL ordering errors were corrected; a loaded-host dynamic import timeout occurred; the first full test found a missing health-table sentinel (fixed); disk exhaustion stopped compilation/SQL output (only this worktree's rebuildable `.next` was cleared); a full SQL retry reached all booking tests then failed with shell exit126 during concurrent runner editing (the stable runner rerun passes); inherited `NODE_ENV=development` broke production prerender (explicit production rerun passes). No failed run is production proof. Node deprecation/localStorage and locale warnings remain environmental output.

## Production steps for coordinator / release packet

Each needs Jacob's explicit yes; none was executed here.

1. Review/apply migrations in order, compare rollback dependencies and full release checklist; preserve all existing client contracts.
2. Read-only inventory of legacy configurations, bookings, site-to-service capability mappings and workspace links. Review backfill dry runs (including imported schedule reservations); explicitly authorize writes. No guess from a single available service.
3. Enable dual writes silently, exercise retry queue, keep legacy reads; authorize the daily parity cron rollout. Collect seven consecutive complete passing days across every tenant and 60-day service slots. Preview/local fixtures cannot replace that clock.
4. Authorize the read flip only after parity. Test both site and public API on tenant zero; verify record-hour changes, manage links, calendarless operation and wellness views. Roll back reads independently if needed.
5. Authorize each remaining switch, instant standing approvals, owner recipient, client/global email gates and real sends individually. Prove tenant-zero inquiry → proposal → request → signed approval → delivered customer confirmation/reminders/reschedule/cancel, and an outside API/MCP client customer-confirmation gate.
6. Google consent redirect/granular scopes and verification; Microsoft Entra registration/publisher verification and credentials. Run opted-in disposable-calendar proofs only after separate authorization, then production book/reschedule/cancel with both providers. Google revoke must succeed before local wipe; Microsoft manual consent removal is the explicit exception.
7. Review cadence/alerts and operator recovery for failed mirror/read-back, stale record, suppressed/bounced owner notice and lost calendar access. No broader provider permission or external commitment is authorized by this handoff.

## Current bet, uncertainty and next action

Bookings owns a durable business commitment; calendars are optional connections. Customers keep using the existing visitor flow while staged switches stay off. The selected model and offer have not changed; no price/adoption/economics claim is made.

Next agent: integrate this branch after reviewing migrations, the Microsoft exception and local evidence; reconcile the canonical main-checkout product model and dependent capability/vault entries with these facts. That propagation is queued for the coordinator because this stream may edit only its own worktree. Then prepare the exact authorized production rollout, without treating this report as authority. Remaining evidence is production-only except the explicitly named Microsoft provider limitation.

## Implementation commit list

Saved checkpoints remain in history to preserve interrupted work. Final documentation/evidence commits follow this implementation list; `git log --reverse --oneline integrate/reborn-1.0..w6/bookings` gives the complete current branch list.

```text
6dcf299d WIP w6/bookings: checkpoint after session interruption (unverified)
2a9fa730 WIP w6/bookings: checkpoint 2 after second interruption (unverified)
f02e7904 WIP w6/bookings: checkpoint 3 after third interruption (unverified)
ae20f733 Complete gated booking notices and inquiry booking handoff
a2800ce7 WIP w6/bookings: checkpoint 4 after fourth interruption (unverified)
c4504790 Fix disposable calendar proof inputs to include reminder policy
e1ccf226 Keep booking email and Needs you fixtures aligned with contracts
80fb9e89 Use business record and one store for public visitor bookings
80f993d6 fix(bookings): give narrow booking controls usable targets
84dfd520 docs(bookings): record owner history and no-show UI proof
a86d60aa Make public booking retries stable and release unsaved claims
40ecc20a Show authoritative owner booking history and calendar health
98bebfc9 Prove booking receipts, request clocks and safe record fallback
35cf8970 Verify daily booking parity cron and report release gates
d8d21877 Use current service offers for reschedules and alternatives
707038b4 Let owners propose current booking times from inquiry replies
c25bd231 test(bookings): render isolated visitor and owner booking flows
9fc269a0 Offer fresh booking conflict times behind the store gate
9a107940 Expose inquiry booking workflow through public product ports
fc2d5036 Apply owner-approved booking rules and intake per service
845c7715 Document booking conflict and intake form behavior
838b4eca Take staff bookings in one store and retain intake and cancellation evidence
f4d91089 test(bookings): record final manual targets and owner intake proof
d812dd00 Chase booking calendar reconnect actions through Needs You
3382fa4b Close new booking admission after completed workspace exit
```
