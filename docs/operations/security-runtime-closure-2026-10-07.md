# Security/runtime closure — October 7, 2026

The four requested areas are implemented and qualified locally on
`fix/security-runtime-20261007-combined-bk_2dx`, from pinned integration base
`56eef0a3fe32495d06b1f3db32f4d8f720ce3990`. This is an isolated repair branch;
the existing dirty `reborn-1.0-model` checkout was preserved. No production
migration, deployment, provider operation, email or billing change was made.

## What changed

| Area | Closed behavior | Evidence |
| --- | --- | --- |
| Database readers | Read authorization uses snapshot checks; mutations retain their revocation locks. The scanner resolves overloads correctly. | 26 actual READ ONLY cases; 50 PostgREST GET/POST results match SQL; 48 outsider denials; anonymous and signed-in browser helper calls denied. Both writer/revocation orders pass. |
| Owner-link authority | Decisions bind action, recipient, revision, assignment lifetime and current effect authority. Revocation/end-and-regrant cannot revive old links. Unknown actions fail closed. | Actual service-role admission/use, private helper ACLs, source mismatch, decline isolation, retained-session rollback refusal and concurrent revocation/assignment tests. |
| Inquiry retention | Expired detached leads remove their real dependent copies. Orphan visitor payloads receive lifecycle deadlines and minimization, with aggregate receipts. Active/attached business evidence stays. Configured purge failures page and fail heartbeat before mirror work. | Lifecycle, composite/hashed dependency, historical ownership, preservation controls, atomic failure and overlapping bounded worker tests; 17 focused application tests. |
| Rollback | Provider undo has a durable CAS claim and separate outcome. Failed/unknown undo stays attached; ambiguous undo never automatically repeats. Direct RPCs cannot forge undo or close unrestored work. Runtime recovery preserves schema, data and security repairs. | Six real activation RPC tests plus guard tests; two full runtime disable/reactivation rounds preserve all 253 public tables and exact rows/catalog. |

The initial 15 reader findings included one overload false positive. Fourteen
STABLE paths were genuine; the UUID offer overload and earlier VOLATILE reader
workarounds were qualified too. This is not universal GET certification of
every legacy VOLATILE reader/command.

Owner-link approvals for native/custom applications and Versions now require
sign-in. Their ordinary publication RPCs cannot atomically enforce the owner
session at mutation, so signed-link execution is refused until that machinery
exists. Authenticated publication remains supported. Native website owner-link
publication checks authority at reservation and actual use.

Retention preserves the established 365-day detached/deprovisioned lead policy.
It does not invent a cutoff for active business records. Expired orphan payloads
lose arbitrary visitor/contact/body/email/dedupe data while retaining structured
acceptance/status history. Aggregate receipts cannot reconstruct deleted data.

Recovery is **permission recovery with forward-only schema**. Its pinned scope
contains 189 original service RPCs; a later security migration retires one unsafe
newsletter signature, leaving 188 active RPCs to disable. Later APIs retain their
reviewed grants and require application feature switches/configuration. Recovery
does not cancel provider work, revoke direct table access, or downgrade schema.
Role changes must be serialized with the administrative recovery procedure.
See [the recovery contract](../../scripts/release-safety/README.md) and
[compensation recovery](../make-real-compensation-recovery.md).

The complete upgrade gate also exposed a legacy calendar result regression.
The corrective migration restores existing-row `true` / absent-row `false`
without losing disconnect receipts. Its rollback fails closed. Five obsolete
baseline test assertions were reproduced against the pinned base and corrected
to the existing quoted sender, recipient trust and release-gate contracts.
Inquiry SQL fixtures now establish real confirmed-owner and sent-link authority.

## Verification

- Full Vitest: **8,368 passed**, 46 skipped; 884 files passed, two skipped. The
  six activation database cases run separately against actual PostgreSQL RPCs.
- `pnpm check:workspace-sql` and `pnpm check:workspace-upgrade` pass, including
  current trust fixtures, exact catalog reversal/reapplication, preservation
  stops, reader scanner and concurrency checks.
- Fresh final-schema Supabase/PostgREST on PostgreSQL 17 passes the HTTP reader,
  authenticated/anonymous denial and writer-lock proofs. SQL rehearsals use
  disposable PostgreSQL 18 clusters.
- `pnpm typecheck`, `pnpm lint`, production build, boundaries, ontology and all
  **196** available client-repository contract checks pass.
- Twenty analyzer, environment-routing and owned-cluster lifecycle checks pass.
- `pnpm exec tsx scripts/check-release-safety-batch8.ts --current-tail` qualifies
  all **253** forward migrations, including 28 remaining tails. Wrong hashes,
  order, identity/catalog/role drift, inherited/browser privilege bypass and
  actual disabled RPC calls refuse. Both rounds reproduce exact forward ACLs
  and retain committed accepted/ambiguous/bounced fictional provider evidence.

The local proof bundle is `output/security-runtime-2026-10-07/`: `summary.json`
pins the tested implementation commit and log hashes; the runtime receipt pins
every forward migration SHA256. Before-fix failures are retained beside passing
logs. These are fictional local fixtures, not customer adoption or hosted proof.
Independent security and standards reviews found the additional issues repaired
here; the final compensation and recovery changes had no remaining objections.

## Continuation and model delta

Objective: integrate these four repairs without disturbing client operation.
Next action: review this branch against the then-current integration head,
reconcile any overlapping changes, and rerun these same qualified commands.
Production approval remains separate. Before rollout, rehearse the approved
target dump/roles, capture target-specific recovery fingerprints, and prepare
the exact app/migration/configuration sequence. Observe actual cron operation
and provider terminal outcomes only within separately authorized rollout.

`PRODUCT_MODEL.md` remains canonical. Its main-checkout edits were already dirty,
so this report leaves an explicit unapplied delta instead of overwriting them:
attach this implementation/behavior evidence to `ISSUE_REBORN_RELEASE_AUDIT`,
`PRIM_POSSIBILITY` and relevant reader/authority/retention dependencies; preserve
historical failures and keep operation/adoption/economics unproven. Signed-link
application/Version execution has the sign-in prerequisite above.

Capability-overhang review: the reliable read/authority/recovery chain makes the
existing owner/agency workflow locally rehearseable. The reusable complete-tail
recovery harness removes manual migration omission from subsequent checks. No
new offer or measured delivery economics follows from these tests.

Both vault lenses were reevaluated against existing canonical proposed
compositions, including `COMP_AGENCY_UPGRADES`; no separate vault was created.
No future was promoted. Email-only app/Version release requires atomic session
mutation RPCs; provider-backed activation still requires authorized terminal
outcome proof. Reconcile this delta into the canonical ledger after integration.
