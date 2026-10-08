# A1 payer-party proposal and response (#278)

Prepared October 8, 2026 against `release/security-runtime-20261007` at
`e9ac136f9a0eecf362421c4046a333f0c20496fd`. Draft code only. #278 remains open.
This is separate from the display-only billing payer copy in PR #585.

## What changes

A business owner can propose a named verified person, an agency workspace, or
the business itself as payer for future jobs. An agency is identified by its
workspace ID, with the resolved agency name shown on the pending proposal.
Only the addressed verified person, a current owner/admin of the addressed
agency, or a current business owner for a business successor can respond.

The existing mutation RPC remains authoritative and unchanged. Proposal/revoke
remain business-owner-only. An acceptance rechecks the proposer is still an
owner; otherwise it durably marks the proposal stale. Current identity and
membership are rechecked at mutation time, including agency removal/demotion.
Payer signatures never create workspace membership, provider rights or access
to content. A payer change never accepts a job limit or allowance cap, activates
commercial billing, or authorizes a Stripe charge. Allowance entitlement,
pricing, #279 and all production flags are untouched.

The additive v2 read projections supply `can_respond`, `can_revoke` and
`is_current`. Eligibility is read-time information, not a substitute for the
command checks. `can_respond` remains true for an authorized addressee after
proposer departure so rejection is still possible and acceptance can resolve
stale. Current-party status is calculated across the workspace's full history
without revealing hidden party rows. Former payers' visible historical rows
cannot masquerade as the current payer. The account inbox now includes business
successors for current business owners.

## Receipt and refresh contract

POST `/api/work-economics/payer-transition` returns only a narrow durable
`receipt` for payer transitions and job-limit acceptance. It performs no
post-write read. The app separately refreshes the exact business snapshot or
account inbox; one can never replace the other. GET includes `workspaceId`
(string for a scoped view, null for the account inbox). An inbox has no single
`current` or `pending` item; consumers use its transitions collection.

Malformed/mismatched receipts fail closed, including action/status, party kind,
UUIDs and addressed record identity. Accepted, reserved and settled job receipts
preserve the existing idempotent job acceptance contract. A successful write
followed by failed refresh retains the confirmed notice and requires a read
before any further write. An ambiguous/failed POST also requires a read before
retrying. A ref guard prevents duplicate or cross-row clicks; keyed workspace
mounts and read versions prevent old responses from changing a newer view.

Existing jobs, limits, reservations, recorded costs and unresolved holds keep
the original payer. Only jobs created after acceptance resolve the new party.
Past accepted parties are labeled as historical; their commitments are retained.

## Files and release dependency

- UI: `WorkspacePayerTransition`, `AccountPayerInbox`, shared
  `usePayerTransitions` and `payer-transition-ui`.
- Service: `payer-transitions` and shared strict `payer-receipts` validation.
- Proposed migration: `20261019114000_payer_transition_actions.sql`, batch 16.
  Historical migrations, original read RPCs and all mutation SQL stay intact.
- Rollback removes only the v2 readers, after exact definition/owner/ACL checks.
  It preserves all commitments and financial rows. Roll back app consumers
  before the readers; the new app fails closed when v2 is missing.
- `batches.json` adds an independent proposed batch. Reconcile concurrent draft
  manifest additions additively rather than replacing the manifest.

No migration or flag was applied to production. Commercial approval for agency
commitments, loss/liability and rates remains outside this draft.

## Verification

Local-only evidence:

- All 57 focused service/route/React tests pass. They cover the three proposal shapes, current
  eligibility, strict receipt metadata, multiworkspace scope, old accepted-party
  visibility, repeated clicks, delayed reads/writes after navigation, stale
  proposer resolution and confirmed-write/read-failure recovery.
- Disposable PostgreSQL 17 loaded all 267 ordered migrations. Core and
  independently authored adversarial SQL tests cover current agency membership,
  business-owner authority, verified person/email changes, stale/replaced/revoked
  proposals, exact current-party flags, old reservations/unknown costs and new
  jobs. Real READ ONLY transactions pass for both v2 projections.
- SQL rollback/reapply restores exact public function catalog and ACLs, refuses
  definition/ACL drift, and retains populated transition/account/job/execution/
  allowance/reservation fingerprints. SQL checks are wired into workspace SQL,
  ordered upgrade and agency-workflow runners.
- Existing preview and authenticated person-journey fixtures were updated to
  the receipt/scoped-read contract. No real browser run is claimed: the cloud
  Chromium launch fails at process-singleton `socket(): Operation not permitted`.
  Desktop/mobile rendered layout, keyboard/focus and authenticated browser
  journeys must run in an environment that supports Chromium before promotion.

Lint, typecheck, hosted-domain configuration, product boundaries, ontology,
release-inventory hashes/coverage and diff checks pass locally. The literal
`pnpm check` entry point is blocked by the tsx CLI's Unix IPC socket restriction;
the equivalent script checks ran through the supported `node --import tsx`
loader without changing repository commands. A broader unit sweep encountered
an unrelated booking timeout and three scrubbed-copy path refusals in this
executor, then was stopped so it would not block the scoped draft. The broad
suite is incomplete; production build was not reached. The legacy release-safety
rehearsal also could not connect to its local cluster; the new migration's
independent ordered/rollback proofs above passed. The full workspace SQL runner passes on the final candidate, including actual
accept/reject races in both orders with observed lock waiting. Full upgrade and
agency-workflow runners were not rerun in this slice. No all-checks-green claim is made.

A passing SQL or jsdom run is not visual, authenticated, hosted or production proof.
