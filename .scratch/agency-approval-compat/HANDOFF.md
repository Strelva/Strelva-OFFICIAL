# Review approval continuity and atomic admission

Isolated implementation from deployed `954f19057344dbf0cc9c10b04506071750a19c50`, building on local sequential preparation `b315658d6f55f9b4b0e6948d5e5cbf1e1f3ca753`. This agent made no production, provider, email, billing, DNS or client conversion writes. Root owns the live rollout and preservation guards.

## Customer behavior

An existing unexpired review link survives first conversion only while the exact imported recipient remains trusted, no owner has accepted, and sticky ownership epochs prove no intervening identity transition. Future converted review messages retain both action buttons with HMAC claims bound to tenant, event, action, workspace, recipient and epoch. GET remains scanner-safe confirmation; only POST enters the existing review action spine. Unconverted legacy tokens retain their existing semantics. Workspace publishing token authority is unchanged.

## Atomic boundary and recovery

Dispatch admission commits an immutable exact event/action/provider command against its existing durable Google receipt. Owner, identity, trust, accepted-owner and exit transitions share a per-tenant transaction aperture with admission. If the transition commits first, the old command cannot be admitted. If admission commits first, that exact command may finish or reconcile after transition; the new epoch denies every new admission and retry. No database lock survives the admission RPC, and no network-duration owner/exit lock is introduced.

A contending transaction receives `review_authority_busy_retry` and rolls back completely; it must retry the entire operation against fresh state. Admission requires READ COMMITTED and rechecks identity and expiry after the aperture. A lost admission response sends nothing. Pending, accepted and unknown receipts never reopen automatically. Definitive 4xx may open a new attempt only with current authority. Existing provider receipts own reconciliation; grants are authorization evidence, not a second outcome ledger. Historical exact settlement remains possible after transfer, unlink or exit. An operator must use the existing receipt reconciliation/recovery path for an unknown outcome; deleting grants or treating an uncertain request as rejected is unsafe.

Both legacy and listing raw provider paths invoke the admission callback immediately before the actual write, including paced 429 retries. Legacy approval uses the existing operator Google ledger even with its ordinary rollout flag off; this retains the already-existing approval workflow without changing global flags. Reply target, body, receipt, event and action are captured together. Accepted provider writes remain completed even if later settlement/readback fails.

## Migration and deployment order

Only new migration `20261023200000_tenant_review_approval_continuity.sql` is changed; no historical migration or existing database function is replaced. SHA256 `9a6ff9ecc24b735e2d167f6ebf1840bd011e221e8ff747c8bbc9531f7568a5dd`. It adds two private tables, eight functions, eight triggers and one identity sequence. RLS/revocations keep rows inaccessible to client roles; only three scoped RPCs are executable by service_role. Existing linked tenants seed revoked because past identity history is unprovable. Current live links are zero, so initial production epoch/grant rows should be zero. Each first client conversion adds exactly one epoch, legacy_revoked=false; conversion itself adds no dispatch grant or notification.

Install the source-pinned267 DDL with the parent's actual-catalog/old-row preservation guard before the compatibility runtime. Verify its helper under service-role authority, stage the immutable compatibility app with existing environment, and qualify the runtime before converting clients one at a time. Missing helper fails closed for approval actions/buttons. This patch does not independently prove billing/account/domain/import/lead preservation; the parent and conversion guard own those checks.

**Recovery:** deployed954 is a valid app fallback only before any client conversion. After conversion it rejects existing approval links. Retain the qualified immutable compatibility artifact and prefer forward repair. Never blindly alias back to954 after linking clients, and never drop267 epoch/grant history. Any unlink recovery needs a separately qualified owned command and preservation conditions. Local precommit guard rollback rehearsals are not full disaster-recovery proof.

## Evidence

- Targeted approval/provider tests:190 passing across11 files. Includes old/future links, mail continuity, wrong event/action, HMAC/expiry, change-back/accepted-owner denial, lost admission response, flag-off legacy receipt, raw listing refusal,429 authority recheck and accepted/unknown failure behavior.
- Full Vitest:8,533 passing,46 existing skips across902 files;900 passed,2 existing skipped. Final rerun after release-tool corrections passed.
- Full lint, declared typecheck, ontology, product boundaries, version check and declared production build pass. Final post-build typecheck retained separately.
- Strict custom-repo compatibility:214/214 passing, zero skipped, all nine exact manifest refs in owned detached checkouts.
- Ordered agency SQL:267 migrations pass. Full workspace SQL passes. Workspace upgrade proves its existing exact historical rollback/reapply contracts, then installs forward-only267 and proves continuity/concurrency; command exits0 including owned cleanup.
- Actual live266 schema-only replay: fresh protected public dump SHA256 `94da2bf8b2d9f8f410ceba5688d870f2acfebd27a54b5c607a60ecea1a1a6dac`; all1,203 captured existing function definitions match before267.267 SQL fixtures and controlled real-Postgres races pass. Transition-first denies; admission-first allows the exact command's settlement after a retried transition; competing operations fail promptly, revoked replay and stale isolation deny. Fictional rows only, zero network/provider writes.
- Authenticated browser:1/1 passed in30.3s, ordinary signed-in agency client creation, exact owner approval, publish and readback receipt. Local loopback Auth/app, providers/email disabled, fictional source transport. Desktop permission state and mobile published receipt inspected from retained screenshots; hosted delivery/Google behavior not proven. Private artifact directory: `/var/folders/0t/9xnfycn50vd2yv5gb7p4cdsh0000gn/T/strelva-agency-minimum.JplDe3`.
- Final independent security review found no additional concrete authorization blocker in the isolated patch and local evidence. Admission-first permits only the exact admitted command to finish after owner/exit; mutation-first denies new admission. Busy conflict rolls the mutation back and requires explicit retry, never silently completes it. Exact disposition: `security-final.txt`. Deployment and actual provider behavior remain unproven.

All initial failures remain beside final logs: missing release registration; worktree-relative strict client/marketing paths; out-of-root dependency symlink refused by Turbopack; forward-only manifest TypeScript inference; historical trust-table CASCADE removing new trigger in upgrade harness; quiet/nonquiet psql output parsing; OS reaping transient after clean owned shutdown; missing Playwright Chromium and stalled Node26 browser installer. Corrections are narrow and do not relax authority checks. Earlier b315 receipts/logs are preserved with b315 prefixes.

## Exact next action

Root must inspect the final receipt and security/browser disposition, qualify the atomic migration wrapper and ten guarded conversion rollback rehearsals against the final catalog, then perform its authorized silent rollout. No production success is claimed by this handoff. Check the root task's current live state before taking any action.
