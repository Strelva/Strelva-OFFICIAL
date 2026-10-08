# Enterprise / IDX implementation receipt — 2026-10-08

Objective: native Units, source standards, access review and Home Finder installation / System / buyer runtime integration across the full product model. Source base 3ecb25f15eeab4b637d14561d7747a47e03a4947; isolated branch codex/full-model-enterprise-idx-20261008. Reused access-review source 7d1c482 as lane commit 81200f92. No production, provider, customer repository, dependency, push or PR writes.

Implemented: explicit organization/business Unit hierarchy and Version assignment, current direct membership and immutable business identity; per-source-revision locked paths enforced in local Versions and deferred native transactions; dedicated authenticated Units and Home Finder pages; licensed Home Finder binding to native System/Connection/lifecycle with current provider grant, live readiness and license gates; exact public route and approved-frame CSP; encrypted entry capabilities; consented intake with durable content-free UUID/digest receipts, uncertainty preserved, signed authoritative provider receipts available after revocation. Existing IDX operations runtime remains external and reference-read-only.

Verification: TypeScript noEmit incremental false exit 0; scoped lint exit 0; eight focused test files / 56 tests pass (enterprise standards, Units, native Home Finder, exact proxy matcher, access review, existing management adapter, Version overlap and twin trees). Diff whitespace check passes. Logs local /private/tmp/enterprise-idx-tests.log and enterprise-idx-tsc-initial.log. Original test failures preserved: incorrect test expectation for WorkspaceAccessError corrected; provider-response passthrough exposed privateMailbox and was fixed by stripping unknown provider fields. ENOSPC prevented two initial writes entirely; coordinator recovered disk, complete files subsequently written.

Unproven: three new forward/inverse migrations have not run against native Postgres/Auth. Rollbacks refuse retained data and restore preceding replaced function definitions. Native membership/revocation/concurrency/read-only/upgrade proof and rendered desktop/mobile journeys remain required. No actual licensed brokerage, MLS/Trestle feed, verified sender/destination/webhook or consented delivery is claimed. External IDX persistence/worker/mail configuration and commercial permissions must be qualified. A remote provider effect and native grant revocation cannot form one atomic transaction; this race requires explicit operating evidence.

Integration seams: readHomeFinderSystemObservations(actor, workspaceId) exported from src/products/home-finder/runtime-server.ts for health owner. Actual management routes /workspace/units and /workspace/home-finder need shared directory entry links. New binding/receipt/Unit export and exit coverage is subsequent owned work, must compose runtime investigation export wrapper. License renewal/configuration update currently remains coding work; installation/check/publish/pause/revoke are implemented.

Next exact action: compose commit into coordinator source; run scheduled native migrations and inverse/upgrade checks. Lane continues business-owned export/exit/revocation coverage without editing runtime investigation ownership. Coordinator owns canonical model/state; these are proposed implementation deltas, no adoption/commercial proof.


## Owned follow-through

Added 211121 portability wrapper after investigation history, preserving preceding
categories and read authority; six enterprise/Home Finder categories are explicitly
business scoped and allowlisted. Unit parents in another business are masked.
Exit handoff schema/UI now shows native accepted/unresolved outcomes and explicitly
requires the separately held licensed-provider content export. Current completed
exit already denies public Home Finder probe/admission; accepted receipts remain
readable. This does not stop an outside provider or prove its export.

Added 211122 configuration renewal with current business and agency authority,
Version/System CAS, exact command replay, fixed business/agency/provider identity,
new immutable native System revision and append-only audit/command history. A live
System is paused, qualification cleared and generation incremented before the
change is returned; current provider requalification and explicit publication are
required again. Revoked installation grants cannot be renewed.

Followup evidence: five focused files / 39 tests pass, covering renewal receipt
scope/generation/current actor, unsupported identity edits, exact provider protocol,
capability tamper/future/expiry, existing export paging/secret detection and exit
completion/UI contracts. Scoped lint passes; diffcheck passes. Prior TypeScript
proof predates these followup edits; coordinator owns the composed typecheck.
Native fixture tests/enterprise-home-finder-schema.sql is authored but unexecuted.
It rolls back by default; keep_fixture=true retains fictional274 data and runs
readers in BEGIN READ ONLY. This fixture is no licensed-provider proof. Forward,
unused inverse/catalog equivalence, retained-history rollback refusal and actual
native race proof remain pending coordinator qualification.
