# #529 / security M3: booking admission

Current objective: cap anonymous requests, preserve the 15-minute email gate, and bound public provider reads. Branch `a1/booking-abuse-caps`, PR base `integrate/reborn-1.0`. Production remains untouched.

## Implemented and locally observed

- Existing distributed limiter remains the shared owner; no MCP files edited. Website, management, status refresh and legacy booking routes refuse Redis errors before calendar effects.
- SQL admission uses one business lock across grants and native inquiry handoffs: 20 outstanding public holds/requests per business, one per normalized customer email, one overlapping slot. Holds expire after 15 minutes. Expiry releases native exclusions before new admission; parity copies retain hold/expiry state.
- Website calendar placement happens only after a private emailed token is consumed atomically by POST. GET is read-only. Management, retry and readback cannot bypass verification. Unknown outside-write outcomes cannot replay a create; manual recovery remains necessary after an uncertain confirmation.
- Existing inquiry offers use private email access and the existing `/b` confirmation surface, even when agent bookings are off. SQL rejects unverified held-to-requested/confirmed transitions.
- Public reads: maximum 60 days, IP 30/minute and tenant 120/minute; legacy provider results cached for 60 seconds, shared business miss budget 10/minute, distributed fill lock. Existing native calendar day cache retains 60 seconds with a provider miss budget 120/business/minute. Errors never turn into uncapped provider traffic.
- Urgent booking owner messages limited to five/business/hour; overflow remains durable for digest delivery.
- Migration `20261011150000_public_booking_admission.sql`, matching rollback, SQL script coverage and readiness sentinel. Rollback refuses adopted public authorization rows or inquiry holds.
- Confirmation form inspected in the local browser at 320×740 and 1280×800. Native POST redirected to an honest invalid-link error; same-origin Origin:null from referrer suppression is accepted only with same-origin Fetch Metadata. Cross-site forms are rejected. Focus outline observed at 2px, no horizontal overflow.

## Evidence

- `pnpm install --frozen-lockfile`: successful, lockfile unchanged.
- `pnpm exec vitest run --maxWorkers=2 src/__tests__/public-booking*.test.ts src/__tests__/public-inquiry-confirmation.test.ts src/__tests__/booking-*.test.ts src/__tests__/needs-you-service.test.ts src/__tests__/needs-you-approve-link.test.ts src/__tests__/agent-booking-visibility.test.tsx src/__tests__/production-readiness-snapshot.test.ts custom-repo-starter/__tests__/booking-form.test.ts`: 50 files, 397 passed, 3 skipped. The skipped tests are pre-existing real-database tests; the SQL command runs the database-backed booking behavior separately.
- `pnpm typecheck`: successful after recovery gate and rebase.
- `pnpm lint`: successful. `pnpm check:boundaries`: successful. `pnpm check:custom-repos`: 196/196 passed.
- `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql`: successful after rebase (workspace, customer mapping and inquiry checks). New schema exercises each cap, immutable retry/fingerprint bypass, expiry release, cross-entry shared caps, private customer-only confirmation with agents off, and verified/idempotent placement.
- Populated rollback rehearsal on an owned throwaway cluster: expected refusal `public_booking_admission_rollback_requires_data_preservation` (exit 3); empty rollback/reapply succeeds in full SQL script.
- Initial SQL fixture failures (required link and record fields) repaired before passing. Old fail-open legacy tests repaired to require 503. Browser initially exposed legitimate opaque Origin:null rejection, repaired with regression tests. Provider/email production delivery remains untested.

## Integration stop point / exact next action

`w6/inquiries` has a separate, unmerged `choose_inquiry_booking_slot` route. SQL forces its choices into expiring holds and refuses unverified placement, but its adapter must send the private confirmation to preserve legitimate handoff completion. Apply `.scratch/a1-booking-abuse-caps/w6-inquiry-confirmation.patch` to that branch when integrating #489, then run its handoff/route/SQL tests with this migration. The bridge is implemented and unit-tested here; the patch itself has not been applied or tested on w6. Orchestrator notified. Do not enable that handoff before the adapter and verification land.

No new production access, deployment, provider write or real email is authorized. Merge/enable sequencing is the remaining decision; no new dependency is required.
