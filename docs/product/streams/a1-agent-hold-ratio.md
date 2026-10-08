# Agent hold confirmation observation (#310)

Prepared against `release/security-runtime-20261007` at `e9ac136f`. No production
migration, flag change, limit change, automatic pause or message is authorized
or performed by this change.

## Behavior and provisional policy

`STRELVA_BOOKING_AGENT_RATIO_ALERTS=1` adds a read-only source to the existing
operator queue. Off by default. It does not enable any booking writes. Deploy
migration `20261019112000_agent_hold_ratio.sql` before enabling the source; a
missing function or database failure makes the queue incomplete, never healthy.

The engineering defaults are explicitly provisional, not calibrated abuse or
demand guidance: at least 20 mature native agent holds captured in the past
24 hours, with fewer than 20% customer-confirmed. Exactly 20% does not alert.
The capture interval includes its lower boundary and excludes holds younger
than 15 minutes. A later actual `confirm_until` also has to have elapsed. A
valid confirmation opportunity is never treated as failure. An unusually long
confirmation window can age out of this bounded capture cohort altogether;
this monitor does not claim to cover holds captured more than 24 hours ago.

Each persisted booking identity counts once; retries and status reads are not
new holds. Only `origin=agent` and `recorded_via=native` enter the sample.
`business_booking_access.confirmed_at` proves customer confirmation, including
a request awaiting business acceptance. Subsequent cancellation, decline,
completion or no-show does not erase that proof. A status without confirmation
evidence does not count as confirmation. Expired and cancelled unconfirmed
holds stay in the denominator until they age out. Missing access records are
unconfirmed. Business/workspace cohorts are isolated, including native
businesses without a website; linked calendars share their business cohort. Historical captures without a
workspace resolve through the current unique tenant link so conversion cannot
split the minimum sample. Captured nonnull workspace identity stays authoritative.

## Queue lifecycle and privacy

One stable business-keyed `ops_alert` (P2) is refreshed, not appended per scan.
Taking it and adding notes uses the existing mark controls. A successful healthy
read removes unmarked alerts and parks previously marked alerts as closed
elsewhere. A failed read cannot claim recovery. Closing or dismissing an alert
acknowledges that evidence; newly matured unconfirmed holds can reopen the same
key, keeping assignment and notes. Repeated reads of the same evidence do not
reopen it. Tenant-to-workspace conversion deliberately changes the scope key;
old marked tenant observations recover under the linked business and the newly
combined workspace cohort is reviewed afresh. This is an observation, not a finding that an agent or customer is
malicious. An operator decides whether any action is needed.

Only aggregate counts, maturity timestamps and business routing identifiers
leave the RPC. Customer names, email, agent names, booking IDs and credentials
are not returned. The function is service-role-only and rechecks active,
verified operator identity with the read-only authority helper. It cannot
write. A recent-capture partial index bounds the scan by the 24-hour window;
1001 returned cohorts cause the reader to report unavailable instead of silently
truncating at 1000. The existing 2-second booking-store timeout applies.

## Existing protection retained

PR #547's identity caps, shared business/mailbox admission, disposable-email
checks and email-only placement are unchanged. The existing per-business
booking pause is the kill switch: SQL `hold_agent_booking` refuses new holds
when booking context is paused, and existing receipts remain readable. There
is no automatic pause or customer/operator notification sender in this change.
The observation source never calls a booking, queue mark or receipt writer.

## Verification

- `src/__tests__/agent-hold-ratio.test.ts`: policy boundaries, aggregate parsing,
  timeout/failure privacy, stable keys, independent businesses, mark/recovery
  lifecycle and new-evidence reopening.
- `src/__tests__/agent-hold-ratio-adversarial.test.ts`: tenant recovery/rename,
  unresolved routing, exact acknowledgement boundaries, repeated closure,
  unrelated alert isolation and malformed/private aggregate refusal.
- `tests/agent-hold-ratio-schema.sql`: real PostgreSQL aggregate, capture and
  actual-expiry boundaries, customer-confirmed outcomes, origin/business
  isolation, status-read/retry deduplication, privacy allowlist, authority/ACL
  and paused admission. All fictional rows roll back.
- `check-workspace-sql.sh` includes forward, rollback and reapply, reruns both
  shared admission suites and checks no stable RPC reaches a row lock.

Local execution on October 8, 2026 (Node 24.19.0, pnpm 10.34.5, PostgreSQL 17.11):

- First focused booking/MCP/queue regression pass: 122 tests across 8 files passed.
- Final alarm and independent adversarial pass: 41 tests across 2 files passed.
  These passes overlap; they are not 163 distinct tests.
- Full `pnpm lint`, final `pnpm typecheck`, product boundaries, release migration
  inventory and `git diff --check` passed.
- Full `pnpm check:workspace-sql` passed, including this migration's forward,
  rollback and reapply, operator service-role calls, actual-expiry and conversion
  boundaries, real hold retries, explicit Live-to-Paused denial and the unchanged
  public/agent email-only admission probes. The final read-only closure scanner
  checked 1,211 functions with no row-lock paths.
- The historical upgrade harness was attempted and stopped at
  `operator_action_approval_rollback_wrong_schema_or_drift` in the unchanged
  `rollback-20261016110000_operator_action_approvals.sql` guard (observed fingerprint
  `016a501e0bb6095e6719fa7bbdcaf83e`). No rollback guard was weakened. This is not
  a green full upgrade result.
- Full Vitest was interrupted after an inconclusive run: an existing
  `booking-one-store` test exceeded 5 seconds and three `scrubbed-copy` preflight
  tests failed. This executor exposes a synthetic read-only `/tmp/.git`, so the
  latter's assumed nongit `/tmp` destination is refused. No production safety
  check or test assertion was bypassed. A full-suite pass is not claimed.
- Desktop/mobile fixture tests are prepared in `tests/agent-hold-ratio-ui.spec.ts`.
  Explicit loopback hostname fixed Next startup, but Chromium then aborted at
  process-singleton Unix socket creation (`Operation not permitted`) before any
  page opened. No rendered screenshot or browser-flow pass is claimed. The
  fixture covers alert, unavailable, empty, loading, error and denied states;
  it still needs execution in a browser-capable environment.
- A full production build and hosted behavior were not verified. Local proof
  and a draft PR do not establish green GitHub CI or permission to deploy.
Rollback removes only this reader and index. Turn the observation flag off first;
leaving it on after rollback truthfully produces an unavailable source. No
booking/confirmation history or queue marks are removed.
