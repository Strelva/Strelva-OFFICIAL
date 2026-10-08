# #456 — bounded native Ask service setup, prepared October 8

Objective: an owner can ask for a first consultation service, Try its inquiry and
reviewed times without writes, then approve the exact native request setup.
Branch `fix/ask-native-services-456-20261008` starts at `e9ac136f`.

Supported scope is an already created, converted, active tenant explicitly bound
to the business, with a verified direct business owner who is also tenant owner,
one already configured connected calendar, and no native inquiry/service/policy
configuration. This does not provision a tenant or authorize a provider. Duration,
whole-minute intervals, timezone, four-hour notice, sixty-day horizon, confirmed
hours and conservative DST refusal must agree at preparation and native acceptance.
The real version writes owner-confirmed business service, native Inquiry form and
record configuration, request policy, exact date overrides, saved Work, grant and
immutable receipt atomically. Approval history uses acceptance time; draft and
rehearsal history retain preparation time. External provider writes remain absent.

Visitor `/book/<tenant>/<capability>` uses the shared client against an additive
same-origin namespace and native request processors. Reserved setup capabilities
are guarded on ordinary v1 reads/reservations, confirmation, resume, cancellation
and recovery too. Legacy tenant primitives refuse new setup services. Effective
Postgres source and existing release flags are mandatory; read rollback, compare,
parity fallback and flag-off fail before mutations. Existing ordinary paths retain
their processors. Exact projected object provenance protects duplicate displayed
service IDs; ordinary Redis UUID services need no new database. PostgREST missing
successor cache errors preserve ordinary native services only after the existing
stable-tenant grant catalog proves no reserved setup grant exists.

Accepted replay is exact and revoked replay refuses. Stop pauses only the setup's
service/policy/capabilities and retains accepted booking and inquiry history.
Receipt has no lifecycle foreign keys. Existing qualified tenant deprovision is
proved with no visitor history; later independent policy/service edits refuse
cleanup. Existing visitor-history retention restrictions remain in force.
Pre-adoption rollback refuses adoption and function OID/owner/ACL/body drift;
new forward/companion are pinned in proposed batch12, not the immutable 85 scope.

Proof commands: `pnpm exec tsx scripts/check-ask-service-setup.ts` (all267 ordered
migrations, isolated socket SQL, real native slots/admission/status/receipts and
four in-process Request/Response cases); `--without-correction` asserts the absent
writer red; focused Vitest suites, `pnpm typecheck`, `pnpm check:boundaries`, source
ESLint, `pnpm check:agency-workflow`, and
`pnpm check:release-safety:batch8 --current-tail`. Native fixture denial, malformed
nulls, replay, stop, currentness, DST, teardown and catalog drift are checked.
Desktop1440/mobile390 browser Try and `/book` proof are in
`output/ask456/{try,book}-{1440,390}.png`; Try discards local input and performs no
API writes. Browser schedule uses an intercepted fictional response; HTTP handlers
use actual throwaway socket SQL with mocked tenant/rate-limit/email/lead boundaries.
These are not hosted network, PostgREST, Auth, live email or provider acceptance.
Local reports and ENOSPC failures are retained under ignored `output/ask456/`.
Final current-tail receipt: `output/release-safety/batch8-1791470931981/runtime-recovery-receipt.json`.

Remaining: independently review final commit and integrate proposed inventory;
qualify the intended deployed prefix and rollout flags before any production
operation. Fresh-tenant provisioning, provider authority/onboarding, existing
configured tenants, notifications, live delivery, adoption and commercial results
remain outside this bounded candidate. Do not close #456 or claim deployed state.
