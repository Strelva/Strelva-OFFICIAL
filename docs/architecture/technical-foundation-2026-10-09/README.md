# Strelva technical foundation: PR program

Prepared October 9, 2026 for Jacob's request to assess and complete the technical foundation across Strelva. This is an execution plan, not implementation, a deployment authorization or a claim of production qualification.

The move is to make Strelva reliable enough to own a business's Systems: consistent authority, durable effects, recoverable data, measurable outcomes and a delivery process that works across every customer. Keep the existing stack and deepen its contracts before buying another infrastructure layer.

## Inventory and scope

- **59 proposed core PR scopes**: 37 new contracts/checks and 22 hardening or qualification scopes over existing code.
- **10 already-open PRs to reconcile**: #616, #618–#621 and security/operations inputs #606–#608, #614–#615. Five are independent records below; five are consumed by F01 rather than recreated.
- **9 client-repo PR slots**, each conditional on a verified missing baseline. Already-compliant repos receive a no-patch evidence disposition.
- **4 conditional adapter scopes** for unique hosted publishing work, Home Finder, extensions and a hosted application builder. They are outside the core completion requirement unless that capability is promoted.

The machine-readable inventory contains 77 work records plus the five prepared security inputs. These are bounded review scopes, not an assertion that 77 PRs must be opened. Source comparison may remove duplicate work; owner-sized repository conversions may need a documented split. Every such change updates this inventory and its dependencies before work starts. Do not add new product features just to satisfy a foundation count.

Scope: REB/control plane, marketing, nine managed client sites, ordinary agency and owner actors, operator console, agent/MCP, native System kinds, data, billing, providers and engineering operations. Home Finder and extensions are included as isolated candidates. The complete product backlog and external marketplace launches are not foundation requirements.

## Evidence that changes the plan

The source baseline is [canonical reborn-1.0 at a1306213f](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545), not the dirty main checkout. The selected lifetime-kind contract is recorded there; code still permits mutable kind. This task read source, PR metadata and retained reports. It ran no application test, build, provider call or production read.

Canonical already contains durable Version stores, Make real, refund/dispute code, money reconciliation, provider seats, cleanup receipts and an app-edge capability registry. Rebuilding them would duplicate accepted work. Next 16.3.8 and the sharp 0.35.5 override are already pinned: F08 verifies the installed candidate rather than proposing another patch.

The canonical candidate has **354 timestamped forward migrations**, matching the consolidation inventory; the latest is `20261022182000_booking_settings_atomic_patch.sql`. A further SQL file, `verify-identity-spine-expand.sql`, is a verification script and must not be counted or applied as a migration. It declares **38 crons**, rather than older main's 27. Counts from older main/private candidates are historical, not this release's inventory. The retained October 8 production record reports 266 applied migrations; a fresh ledger is still needed before a real SQL rollout.

Source confirms a legacy owner-demotion path using a 15-second Redis lock, separate owner count/upsert and unconditional unlock. S01 replaces that race surface with a database invariant; no production incident was reproduced. The watchdog currently pages stale runs but misses fresh failed runs and includes changing age in alert dedupe. O01 addresses both.

The prepared release and security line have diverged. F01 is an explicit targeted reconciliation using the existing version/hash inventory, staging and current-tail guards. It does not blanket-merge the security branch or a private future-runtime packet. #614's exact security-versus-runtime split and whether #204/#206 contain missing behavior remain open source-comparison tasks.

Existing large unit and historical SQL receipts prove their exact older trees/profile only. Browser fixtures prove rendered behavior with fixture authority. No amount of fixture passing substitutes for real local Auth, managed-target privileges, actual provider effects or a complete production recovery drill. The latest main hosted failures also do not establish that canonical remains broken.

## Target architecture and infrastructure

| Layer | Keep and strengthen | Completion evidence |
| --- | --- | --- |
| Product | Next.js, React, TypeScript, Tailwind; product-owned experiences over platform contracts | Typed commands, stable System identity/kind, typed Connections, Version lineage, partial Possibility activation; actor journeys |
| Identity/data | Supabase Auth and Postgres; generated RPC contracts and runtime response validation | Atomic ownership, route/SQL authority, managed-role/native HTTP qualification and fresh/upgrade parity |
| Redis | Upstash for cache and the explicitly listed operational authorities | Key-family authority/loss manifest, recovery drill and bounded outage admission |
| Work/effects | Existing Postgres-backed work execution, Make real, receipts and Vercel crons | Concurrency/crash/revoke/deadline conformance, accepted-versus-readback outcomes, safe recovery |
| Provider adapters | Existing Google/calendar, Resend, Stripe, Vercel integration owners | Authorizer/scopes/rights/revoke matrix and qualified effects on owned test accounts |
| Client delivery | Frozen additive v1, starter adapters and repo-owned workflows | All nine pinned consumers exercised without missing-check skips; separate deployed-source evidence |
| Agent delivery | Existing AI SDK, Zod, model-call ledger, Ask and product-owned MCP tools | Derived schemas, deterministic attack gate, retained live outcome/grounding/cost eval |
| Observability | Existing Sentry/structured monitoring, heartbeat and Needs You/operator projections | Fresh failure paging, stable dedupe, delivered-alert proof, privacy tests, accountable recipients |
| Recovery | Existing export/exit and restore scripts plus object/key backup inventory | Measured RPO/RTO, Auth/content/assets/key recovery, export completeness and resumable exit |
| Factory | pnpm/Vitest/Playwright, local SQL, Python proof tooling and Actions | Exact-source receipts, enforced resource/toolchain profile and three repeatable rehearsals |

**Keep the modular application.** Nothing inspected demonstrates that microservices, Kubernetes, a new ORM or a shared UI package would remove the current constraint. Deep modules and consistent contracts buy safer change without expanding the operating burden.

**Queue/workflow decision:** first measure O04/O05. [Vercel Queues](https://vercel.com/docs/queues) is currently public beta and delivers at least once; it does not solve provider idempotency or action-time authorization. [Vercel Workflows](https://vercel.com/docs/workflows) offers durable multi-step execution. Consider a transport adapter only if measured deadline/backlog/retry needs exceed the existing executor. Compare Vercel, current-provider options and Postgres-native options on retention, delivery, commercial access, cost and recovery before selecting one. A queue dependency is not authorized by this plan.

**Recovery decision:** [Supabase database backups](https://supabase.com/docs/guides/platform/backups) exclude Storage object bytes, so database restore alone cannot recover every customer's assets. Inventory actual backup coverage and independent object/key recovery before choosing PITR or another paid service. No unverified dollar amount or recovery-time promise is used here.

**Runtime budgets:** [Vercel function limits](https://vercel.com/docs/functions/limitations) vary with runtime and plan. O05 must use the actual project's limits and measured cron duration; an old universal 300-second ceiling or “queue at 20 clients” is not a design fact.

## Landing strategy

1. **Make the candidate safe and reproducible:** F01/F02 first. In parallel prepare E08 and source-only inventories. F03/F04/F05/F06/F08 then establish a reusable qualification base. F01 runs migration staging/version/hash safeguards before carrying SQL; F04 closes only remaining catalog/type/classification gaps. Integrate D01 → D02 → D03 → D04 with combined checks; D03/D04 include save-refresh/remount recovery.
2. **Close authority and contract gaps:** S01/S02, A01 → A02 → A03/A07; A04 → T01/T02/T03; A05/A06; S04 → A10 → A11; A12/A13. Keep SQL inventory/types and source convergence under one integration owner.
3. **Harden effects, privacy and operations:** A08 → A09; C06/C07 and S08; S05 → S06, S07/S09; S10 → S11/C08; O01/O02/O03/O04 → O05, O06/O07/O08/O09. Privacy policy and paid provider proof remain visible gates.
4. **Prove the whole experience and delivery:** E08 → E03 → E04 → E05/E06, E02/E07; C01 → C02/C03, C04; E01 qualifies in-app Auth independently; C04 and C08 own later marketing/export cells in the same matrix. C05 and U01–U09 in the conservative waves below. R00/F07 qualify the release before any approved rollout, without holding urgent repairs for every later improvement.
5. **Promote only demonstrated candidates:** Q01–Q04 remain isolated until selected product need, provider rights and acceptance warrant them.

The dependency list on each record is authoritative for code prerequisites. Other gates (policy, budget, actual Auth/provider/production proof) are in its gate field and the acceptance matrix below. The order above is not permission to deploy. Prioritize an urgent security release independently if broad release qualification takes longer.

| Integration input | Disposition |
| --- | --- |
| [#614: Security authority and retained-scope repairs](https://github.com/Strelva/Strelva-OFFICIAL/pull/614) | F01 targeted carry; inspect exact diff/SQL, not wholesale security-line merge |
| [#615: Request-scoped admin digests build](https://github.com/Strelva/Strelva-OFFICIAL/pull/615) | F01; carry only if current canonical still needs it |
| [#606: Bounded lead admission during Redis outage](https://github.com/Strelva/Strelva-OFFICIAL/pull/606) | F01; broader endpoint policy S07 |
| [#607: Guarded catalog backfill](https://github.com/Strelva/Strelva-OFFICIAL/pull/607) | F01; verify actual source and dry-run targets |
| [#608: Provider health routing](https://github.com/Strelva/Strelva-OFFICIAL/pull/608) | F01 integration; O06 accountable recipient and actual delivery proof |

#201/#202/#102 remain design alternatives. Mentioning them does not authorize merging them. #204/#206 are compared in Q01/Q02; unique source is preserved until accepted disposition. Held neutral-creator, Google, retention, managed-installer and other private runtime packets stay under their existing owners and holds.

## PR records

Each record states the intended behavior, source owner, prerequisites, proof and reserved rollout action. Anchors below link to the pinned canonical source, except sibling-repo paths. Re-read them against the actual implementation base before opening a PR. Existing PRs' past test counts are not reused as a combined pass.

### Release

#### F01 — Converge the missing security repairs

**Disposition:** new; **repo:** REB; **requires:** no code prerequisite.

Compare #614, #615, #606, #607 and #608 against the canonical candidate; carry only missing fixes and their tests. Reconcile batch manifests and append-only migrations before runtime callers. Preserve held private packets and current v1 bytes. Reuse existing version/hash inventory and stage-release-batch safeguards; do not invent a second migration checker.

**Accept:** Each carried migration has a reviewed 14-digit version and new batches.json entry; stage against a reviewed applied-versions snapshot, retain a launch-integration601-style rename receipt and run --current-tail rehearsal. Then run combined fresh/retained-row SQL, negative role tests, limiter harness, types and a complete build.

**Source:** [docs/operations/reborn-consolidation-2026-10-09.md](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/docs/operations/reborn-consolidation-2026-10-09.md), [scripts/release-safety/batches.json](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/release-safety/batches.json), [scripts/stage-release-batch.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/stage-release-batch.ts), [scripts/check-release-safety-batch8.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/check-release-safety-batch8.ts), [docs/operations/launch-integration601-migrations.json](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/docs/operations/launch-integration601-migrations.json).

**Gate:** Migration application and production rollout require separate approval. Security repairs cannot be undone by restoring insecure privileges. Fresh applied-migration ledger must establish whether each carried migration has already been deployed before assigning a new canonical filename; immutable applied bytes cannot be re-timestamped.

#### F02 — Pin the qualification toolchain

**Disposition:** new; **repo:** REB; **requires:** no code prerequisite.

Declare Node/pnpm, Postgres major and managed-role profile, browser versions and runner resources. Qualify Postgres 17 because configured Supabase targets 17; retain 18 historical receipts under their own profile rather than treating them as equivalent.

**Accept:** CI and local preflight print and enforce the same profile; a wrong major or unavailable server binaries fails before work starts.

**Source:** [package.json](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/package.json), [supabase/config.toml](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/supabase/config.toml), [.github/workflows/ci.yml](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/.github/workflows/ci.yml).

#### F03 — Make verification repeatable under disk and runtime limits

**Disposition:** harden; **repo:** REB; **requires:** F02.

Promote the existing exact-source proof runner with isolated dependencies, disk admission, owned-output retention, serialized heavy jobs and Docker/Auth health preflight. Diagnose retained failures; do not graft arbitrary private source onto the release.

**Accept:** Three consecutive qualification rehearsals emit source/dependency/profile hashes, executed/skipped suites, failures and cleanup. Measure human interventions and elapsed time; zero silent skipped mandatory steps.

**Source:** [scripts/check-ci.sh](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/check-ci.sh), [docs/operations/testing-and-ci.md](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/docs/operations/testing-and-ci.md).

**Gate:** Deleting unowned caches or another task's outputs remains outside this PR.

#### F04 — Close catalog parity and generated-type gaps

**Disposition:** harden; **repo:** REB; **requires:** F01, F02.

Reuse existing migration version/hash/order guards. Add catalog parity between fresh filename-order installation and packet-order retained-row upgrade, db:types --check for the exact schema, and explicit classification of non-migration SQL such as verify-identity-spine-expand.sql. Preserve generated-code exemption from handwritten hotspots.

**Accept:** Fresh and retained-row catalogs/ACLs agree; all timestamped migrations remain in the existing manifest and non-migration files cannot be applied as migrations; generated types and typecheck match the exact qualified schema.

**Source:** [scripts/release-safety/batches.json](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/release-safety/batches.json), [scripts/check-workspace-upgrade.sh](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/check-workspace-upgrade.sh), [scripts/generate-database-types.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/generate-database-types.ts).

**Gate:** No migration is applied to production by this PR.

#### F05 — Prove managed Postgres and native HTTP compatibility

**Disposition:** harden; **repo:** REB; **requires:** F04.

Test managed-role privileges rather than superuser-only shims, supported extensions/default ACLs, transaction/read-only semantics and all security-definer readers through supabase-js/PostgREST. Reuse reader-volatility tooling; do not fix STABLE functions by blanket mutation.

**Accept:** Role/catalog differences are retained; native reads and writes execute on the declared local Auth stack, including permission denial and revoked membership.

**Source:** [scripts/check-readonly-rpcs.mjs](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/check-readonly-rpcs.mjs), [scripts/check-workspace-sql.sh](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/check-workspace-sql.sh), [supabase/config.toml](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/supabase/config.toml).

**Gate:** A fresh live catalog or production Auth journey requires approval; local managed-role simulation is labeled simulation.

#### F07 — Bind promotion to the tested artifact

**Disposition:** harden; **repo:** REB; **requires:** F03, F04, F05, F06.

Replace manual green assertions with a retained receipt for exact source, dependencies, SQL inventory and built artifact. Separate unit, browser-fixture, Auth, provider, preview and production qualification. Record rollout batches and safe recovery pointers.

**Accept:** Non-production dry run rejects stale SHA, missing required proof and asset mismatch; accepted provider writes cannot be relabeled undone by code rollback.

**Source:** [.github/workflows/release.yml](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/.github/workflows/release.yml), [.github/workflows/preview-nightly.yml](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/.github/workflows/preview-nightly.yml), [scripts/check-release-safety.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/check-release-safety.ts).

**Gate:** Production deployment, env changes and SQL application still require Jacob's approval.

#### F08 — Make supply-chain checks current and reproducible

**Disposition:** harden; **repo:** REB; **requires:** F02.

Verify existing Next 16.3.8 and sharp 0.35.5 pins rather than duplicating their patch PR. Pin Actions/scanners to reviewed immutable revisions, verify lockfile install, inventory licenses and bound advisory exceptions with owners and review dates.

**Accept:** Frozen install, current high-risk audit and secret scan pass on exact candidate. Seeded forbidden credential and expired audit exception are detected without printing secrets.

**Source:** [package.json](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/package.json), [pnpm-lock.yaml](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/pnpm-lock.yaml), [.github/workflows/security.yml](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/.github/workflows/security.yml).

**Gate:** New dependencies need approval; commercial license exceptions are explicit decisions.

#### R00 — Qualify the consolidated release #616

**Disposition:** existing; **repo:** REB; **requires:** F01, F03, F05, F06, F07, F08, D04.

Resolve against current main while preserving the reviewed source union and missing security fixes. Re-run mandatory combined checks; route nightly to canonical branch and retain compatibility until main changes.

**Accept:** One exact-source release packet covers build, units, SQL, Auth, client contracts, browser and preview. Any provider or production checks not run remain explicit rollout gates.

**Source:** [docs/operations/reborn-consolidation-2026-10-09.md](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/docs/operations/reborn-consolidation-2026-10-09.md).

**Gate:** https://github.com/Strelva/Strelva-OFFICIAL/pull/616 — approval before production; current PR is open/non-draft, despite older body wording.

### Architecture

#### D01 — Integrate Version release determination #618

**Disposition:** existing; **repo:** REB; **requires:** no code prerequisite.

Land the already-prepared central release/no-op determination after reviewing current source. Preserve native authority and distinguish Version lineage from release history.

**Accept:** Run its targeted tests and SQL cases on combined candidate; retained skips stay unqualified.

**Source:** [src/platform/system-versions/service.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/system-versions/service.ts).

**Gate:** https://github.com/Strelva/Strelva-OFFICIAL/pull/618

#### D04 — Integrate website attempt settlement #620

**Disposition:** existing; **repo:** REB; **requires:** D03.

Land captured-body/request-id replay and accepted-result settlement. Verify prop compatibility with opened-work dispatcher and retain notices across same-work refresh; browser reload remains a separately specified recovery case.

**Accept:** Replay sends the identical captured request; accepted acknowledgement survives malformed optional history; refresh/remount and uncertain response cases pass.

**Source:** [src/experience/websites](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/experience/websites).

**Gate:** https://github.com/Strelva/Strelva-OFFICIAL/pull/620

#### A01 — Enforce lifelong System kind

**Disposition:** new; **repo:** REB; **requires:** D01, F04.

Implement the already-selected lifelong-kind rule in TypeScript, SQL and commands for every kind. Preserve identity, record ownership and accepted proposal terms as implementation grows; inventory existing mutations locally before choosing a compatibility repair. Correct the existing contract comment that treats kind as a mutable descriptor; extension changes implementation while lifetime kind persists.

**Accept:** Direct SQL and app attempts to mutate kind are refused; replay, proposal growth and preexisting rows retain correct identity and terms.

**Source:** [GLOSSARY.md](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/GLOSSARY.md), [src/platform/systems/contracts.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/systems/contracts.ts), [src/platform/systems/invariants.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/systems/invariants.ts).

**Gate:** Production inventory/repair and forward migration require approval; no new product-model decision is needed.

#### A02 — Unify System-kind behavior contracts

**Disposition:** new; **repo:** REB; **requires:** A01.

One typed contract per kind defines owning writer, record shapes, origin mapping, health, pause behavior and native eligibility. Reconcile hidden offering kind and application/tracker origins; project SQL parity without flattening commercial catalogs.

**Accept:** Every supported kind has TS/SQL parity and pause/isolation cases; unknown kinds are explicit and never silently granted executable authority.

**Source:** [src/platform/systems/contracts.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/systems/contracts.ts), [src/experience/systems/from-workspace.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/experience/systems/from-workspace.ts), [src/platform/system-health/business.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/system-health/business.ts).

#### A03 — Expose named System commands

**Disposition:** new; **repo:** REB; **requires:** A01, A02.

Replace generic arbitrary updates at application boundaries with rename, describe, pause/resume, publish and revision commands. Preserve command id/digest conflict semantics and compatibility RPC behavior.

**Accept:** Each command covers duplicate, conflicting replay, stale revision, wrong owner and paused-state behavior.

**Source:** [src/platform/systems](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/systems), [supabase/migrations](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/supabase/migrations).

**Gate:** Forward SQL remains additive; no breaking v1 changes.

#### A04 — Type the RPC boundary and ratchet untyped access

**Disposition:** new; **repo:** REB; **requires:** F04, F06.

Introduce generated function names/arguments with runtime schemas for jsonb responses. Convert Systems, workspace ownership and Make real first; T01–T03 finish the remaining owner batches under a shrinking repository-wide inventory.

**Accept:** Argument/name drift fails typecheck; malformed return and unavailable RPC fail closed. Inventory records converted and remaining consumers.

**Source:** [src/platform/infra/db/database.types.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/infra/db/database.types.ts), [src/platform/systems/supabase-store.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/systems/supabase-store.ts), [scripts/generate-database-types.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/generate-database-types.ts).

#### A05 — Resolve tenant-to-workspace identity once

**Disposition:** new; **repo:** REB; **requires:** F01.

Reuse tenant_workspace_links and stable_id as the canonical bridge. Consolidate TS/SQL resolution, retaining trusted routing slugs and frozen Redis contracts; apply #614 immutable inquiry scope pattern to remaining retained stores.

**Accept:** Rename, deletion/reuse, linked/unlinked tenant and foreign-business fixtures cannot disclose retained work to a new slug owner.

**Source:** [src/platform/systems/from-existing.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/systems/from-existing.ts), [src/lib/tenants.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/lib/tenants.ts), [src/lib/tenant-rename.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/lib/tenant-rename.ts).

**Gate:** No bulk Redis key rename or new slug reuse policy is implied.

#### A06 — Make rename, conversion and teardown resumable

**Disposition:** harden; **repo:** REB; **requires:** A05, F04.

Audit existing cleanup receipts before extending missing steps. Persist post-commit Redis/domain/Vercel work, tokenized claim ownership and explicit partial completion; use the atomic deprovision RPC and fail closed if absent.

**Accept:** Fault after each external step can resume without repeating accepted actions; dry run remains no-write; workspace-owned guards and force:false admin behavior remain.

**Source:** [src/lib/tenant-rename.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/lib/tenant-rename.ts), [src/lib/deprovision.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/lib/deprovision.ts), [scripts/deprovision-tenant.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/deprovision-tenant.ts).

**Gate:** Deprovisioning and production reconciliation require approval.

#### A07 — Enforce record ownership at write boundaries

**Disposition:** new; **repo:** REB; **requires:** A02.

Owning kind alone may create/change its workspace records. Connect saveWork and native stores to owner contracts while other kinds retain explicitly permitted reads. Connection existence grants no permission.

**Accept:** Wrong-writer, cross-business, stale-revision and forged connection saves fail at application and SQL boundaries; valid owner writes remain.

**Source:** [src/platform/workspaces/repository.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/workspaces/repository.ts), [src/platform/systems/contracts.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/systems/contracts.ts).

#### A08 — Standardize effect outcomes without a new engine

**Disposition:** new; **repo:** REB; **requires:** D04.

Define accepted/rejected/unknown/readback/settled/compensated semantics as adapter conformance. Adopt in Make real first; retain product-owned receipts and honest partial activation rather than migrating every operation table.

**Accept:** Injected timeout before/after acceptance, failed readback and compensation conflict prove unknown is never blindly retried and approval finishes once accepted. Multi-System Make real reports each part as accepted/refused/unknown/compensated without turning partial success into an all-or-nothing claim; preserve existing Partly live view.

**Source:** [src/platform/make-real/runner.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/make-real/runner.ts), [src/platform/work-execution/engine.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/work-execution/engine.ts), [src/products/scheduling/calendar/service.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/products/scheduling/calendar/service.ts).

#### A09 — Align executor lease and recovery contracts

**Disposition:** harden; **repo:** REB; **requires:** A08.

Compare Make real, work execution and provider reconciliations. Share only proven claim/deadline/retry semantics; preserve native authority, version preconditions and per-product state. Surface stale/unknown attempts for Needs You or operator recovery.

**Accept:** Concurrent workers, expired lease, crash after acceptance and paused/revoked actors cannot duplicate effects; recovery receipts are visible.

**Source:** [src/platform/work-execution/engine.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/work-execution/engine.ts), [src/platform/make-real/runner.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/make-real/runner.ts).

**Gate:** No queue, Temporal or workflow dependency is selected by this PR.

#### A10 — Complete connection ownership and revocation contracts

**Disposition:** harden; **repo:** REB; **requires:** A05, S04.

Consume existing provider seats and account bindings. Record authorizer, account/scopes, acting provider, secret reference, expiry, revoker and reauth state; reconcile legacy Redis/provider connections. Never copy client-held merchant credentials into Strelva.

**Accept:** Scrubbed census and fixtures cover disconnected, expired, revoked, foreign-provider and provider-change state; revocation blocks every effect path.

**Source:** [src/platform/provider-connections/receipt-store.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/provider-connections/receipt-store.ts), [src/platform/agent-channel/connections.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/agent-channel/connections.ts), [src/lib/connections.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/lib/connections.ts).

**Gate:** Fresh production census, token migration and OAuth/provider changes require approval.

#### A11 — Enforce typed Connection contracts at grant and use

**Disposition:** harden; **repo:** REB; **requires:** A02, A10.

Extend existing Connection kinds read/act/appear/share/depend/trigger, typed target union, states, contractVersion and propagation schema. Validate allowed source/target/action/data scopes at creation and recheck current actor/grant at use. Connection existence never grants authority; do not introduce a second wire vocabulary.

**Accept:** Wrong-kind target, forged scope, cross-business link, revoked grant and paused endpoints fail safely. pin_on_issue preserves issued/accepted output revision; manual_review marks changed targets stale until reviewed; follow_current only affects eligible new work.

**Source:** [src/platform/systems/contracts.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/systems/contracts.ts), [src/platform/systems/supabase-store.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/systems/supabase-store.ts).

#### A12 — Prove Version lineage and accepted-term invariants

**Disposition:** harden; **repo:** REB; **requires:** D01, A01, A07.

Extend existing durable Version tests with immutable source lineage, agency/client isolation, source updates and accepted proposal terms. A release changes implementation; a Version adapts a System for another business/segment while preserving source relationship. Reuse Connection pin_on_issue propagation for issued/accepted terms rather than create a competing mechanism.

**Accept:** Source edit cannot mutate accepted terms or historical revisions; foreign actor and stale preparation cannot publish or rewrite lineage.

**Source:** [src/platform/system-versions](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/system-versions), [src/platform/systems](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/systems), [src/platform/systems/contracts.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/systems/contracts.ts).

#### A13 — Map architectural invariants to executable proof

**Disposition:** new; **repo:** REB; **requires:** A01, A07, A08, A11, A12.

Extend ontology and boundary checks with one explicit catalog linking enduring identity, kind/record ownership, typed connections, accepted terms, partial Make real, isolation and pause rules to their actual tests and proof modes. Catalog records unsupported rules as gaps.

**Accept:** Every selected critical rule has a behavioral/SQL test or a visible unresolved gate; deleting the test or weakening the rule cannot silently leave a green completeness report.

**Source:** [scripts/check-ontology.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/check-ontology.ts), [docs/architecture/product-ontology.md](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/docs/architecture/product-ontology.md).

#### T01 — Type System, work and workspace repository calls

**Disposition:** new; **repo:** REB; **requires:** A04.

Apply the typed RPC boundary to remaining System/Version, work/Needs You, workspace/grant, export/exit and operation repositories. Convert in owner-sized commits; preserve response validation and authority.

**Accept:** Compiler rejects argument drift; existing native SQL and failure-path tests pass; no untyped client declarations remain in these owners.

**Source:** [src/platform/systems](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/systems), [src/platform/system-versions](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/system-versions), [src/platform/workspaces](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/workspaces), [src/platform/work-execution](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/work-execution).

#### T02 — Type bookings, inquiries and provider repository calls

**Disposition:** new; **repo:** REB; **requires:** A04, A10.

Apply generated RPC contracts to scheduling/booking, inquiry, provider/account-binding and agent repositories; keep effect settlement and jsonb validation explicit.

**Accept:** Owner inventory is zero untyped RPC declarations; revoked actor, malformed response and missing RPC tests remain.

**Source:** [src/platform/bookings](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/bookings), [src/products/inquiries](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/products/inquiries), [src/platform/provider-connections](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/provider-connections), [src/platform/agent-channel](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/agent-channel).

#### T03 — Finish typed billing, admin and legacy bridge repositories

**Disposition:** new; **repo:** REB; **requires:** A04, C06, T01, T02.

Convert remaining billing/connect, content/legacy bridge, operator and server repositories. Compiler-generated inventory defines exact remaining files before the PR; split only by owner when review size demands, never leave undocumented leftovers.

**Accept:** Repository-wide untyped RPC declaration/call inventory reaches zero approved handwritten exceptions, or each remaining unavoidable dynamic call has one reviewed narrow schema gate.

**Source:** [src/platform/connect](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/connect), [src/platform/infra/db](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/infra/db), [src/lib/db](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/lib/db), [src/server](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/server).

### Security

#### F06 — Gate SQL execution authority

**Disposition:** new; **repo:** REB; **requires:** F04.

Extend existing ACL checks with a generated function inventory: PUBLIC/anon/authenticated execute, security-definer search_path, actor arguments, role transitions and mutation grants. Require explicit reviewed exceptions.

**Accept:** Unexpected execute grant, unsafe search_path and forged actor fixture each fail the gate; #528/#251 repairs remain covered on combined SQL.

**Source:** [scripts/check-workspace-sql.sh](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/check-workspace-sql.sh), [supabase/migrations](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/supabase/migrations).

**Gate:** Production grants and migrations remain separately approved.

#### S01 — Make legacy last-owner protection atomic

**Disposition:** new; **repo:** REB; **requires:** F01, F04.

Move membership demotion and last-owner invariant into a single Postgres command/locking boundary. Remove dependence on the 15-second Redis lock and unconditional release; preserve actor authorization and workspace-owned membership safeguards.

**Accept:** Concurrent demotions, slow transaction, Redis outage, direct SQL and revoked operator cases retain an owner or fail closed.

**Source:** [src/platform/infra/auth.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/infra/auth.ts), [src/platform/workspaces/permissions.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/workspaces/permissions.ts).

**Gate:** Observed race surface, not a reproduced production incident. Forward migration application needs approval.

#### S02 — Classify and test route authority

**Disposition:** new; **repo:** REB; **requires:** F01, F06.

Extend existing isolation guards with an explicit public/cron/webhook/member/operator/workspace-actor manifest. AST-aware checks identify missing admission, including direct service-role calls, without treating unmatched text as a confirmed vulnerability.

**Accept:** Every route is classified; seeded unguarded route fails; wrong business/viewer/revoked actor tests cover each protected class.

**Source:** [src/proxy.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/proxy.ts), [src/__tests__/tenant-isolation-guard.test.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/__tests__/tenant-isolation-guard.test.ts), [src/app/api](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/app/api).

#### S04 — Version secret envelopes and rehearse rotation

**Disposition:** new; **repo:** REB; **requires:** F02.

Extend the sole secrets path with key ids and a keyring; retain v1/plaintext read compatibility, isolate corrupt-record failures and add counts-only rotation dry run. Stage fail-closed production writes after key readiness is verified.

**Accept:** Two-key rotation, mixed rows, missing key, tamper and per-record isolation tests pass on local scrubbed fixtures.

**Source:** [src/platform/infra/crypto/secrets.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/infra/crypto/secrets.ts), [scripts/backfill-secret-encryption.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/backfill-secret-encryption.ts), [docs/operations/secret-rotation.md](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/docs/operations/secret-rotation.md).

**Gate:** Key generation, env deployment and production backfill require approval. No KMS dependency is added.

#### S05 — Converge guarded outbound fetches

**Disposition:** new; **repo:** REB; **requires:** F01.

Review ongoing source changes first. Move credential-bearing and preview fetches onto DNS/IP-pinned public egress with redirect revalidation, body/deadline limits and preserved HMAC contracts. Inventory remaining config-derived raw fetches.

**Accept:** Public-name-to-private-IP, mixed answers, IPv6, redirects and rebinding probes are refused at every protected caller; legitimate sites remain usable.

**Source:** [src/platform/infra/safe-fetch.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/infra/safe-fetch.ts), [src/platform/infra/public-url-safety.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/infra/public-url-safety.ts), [src/lib/pinned-public-text.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/lib/pinned-public-text.ts).

**Gate:** No findings claim exploitability before reproduction; preserve another task's working edits.

#### S06 — Isolate legacy live/edit previews

**Disposition:** new; **repo:** REB; **requires:** S05.

Reproduce hostile HTML on current preview paths; sandbox the iframe/response and constrain the edit bridge with explicit message origin/capability. Reuse existing generated-preview policy rather than regex-only sanitization.

**Accept:** Hostile handler/javascript fixture cannot read app cookies or invoke privileged APIs; editing and desktop/mobile focus still work.

**Source:** [src/lib/preview-html.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/lib/preview-html.ts), [src/proxy.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/proxy.ts), [src/app/api/live-preview/route.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/app/api/live-preview/route.ts).

**Gate:** Separate preview domain would require DNS approval; prefer existing isolation facilities.

#### S07 — Declare outage admission for all public writes

**Disposition:** new; **repo:** REB; **requires:** F01.

Extend #606 beyond v1/leads: booking reservations, tracking, newsletter, audit intake and other public effects declare bounded fallback or deliberate no-effect/fail-closed behavior. Separate per-instance limits from distributed guarantees.

**Accept:** Limiter-throws harness measures accepted counts and side effects per endpoint; restart/concurrency cases expose aggregate bounds.

**Source:** [src/lib/rate-limit.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/lib/rate-limit.ts), [src/app/api/v1](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/app/api/v1), [src/app/api/booking](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/app/api/booking).

**Gate:** Turnstile adoption/account/env/client changes are a separate decision.

#### S08 — Give active webhooks durable replay semantics

**Disposition:** harden; **repo:** REB; **requires:** F04, A08.

Inventory actual provider use; retire inactive Calendly ingress only after confirming consumers. For active paths, validate signatures independent of header ordering, dedupe event identity, retain processing failures and distinguish permanent unknown targets. Stripe event state belongs to C06.

**Accept:** Duplicate, reordered signature fields, stale signature, crash after acceptance and temporary store outage preserve exactly one domain outcome or honest recoverable failure.

**Source:** [src/app/api/webhooks/calendly/route.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/app/api/webhooks/calendly/route.ts), [src/app/api/webhooks/resend/route.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/app/api/webhooks/resend/route.ts).

**Gate:** Provider webhook configuration and production migration changes require approval.

#### S09 — Prove generated-app and build isolation

**Disposition:** new; **repo:** REB; **requires:** D03.

Test current opaque-origin app runtime and digest-pinned no-network Docker build: beacons, fetch/WebSocket, forms, navigation, popup, postMessage and forbidden external assets. Inspect desktop/mobile and Chromium/Firefox/WebKit.

**Accept:** Adversarial fixtures cannot escape declared storage/network/authority limits. Unsupported browser behavior and missing production builder remain visible.

**Source:** [src/products/custom-applications/sandbox.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/products/custom-applications/sandbox.ts), [src/products/custom-applications/build.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/products/custom-applications/build.ts).

**Gate:** Vercel Sandbox remains an approved-budget/dependency candidate, not an assumed production path.

#### S10 — Inventory privacy, retention and erase ownership

**Disposition:** new; **repo:** REB; **requires:** A05.

Create a machine-readable PII-store inventory spanning Postgres, authoritative Redis, email receipts, exports, logs, assets and providers. Each declares owner, retention, export, erase and legal/operational exception; unknown policy is explicit.

**Accept:** New PII stores fail classification gate; export completeness and telemetry redaction probes cover current stores.

**Source:** [docs/architecture/persistence-boundaries.md](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/docs/architecture/persistence-boundaries.md), [src/platform/workspace-exports](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/workspace-exports), [src/platform/workspace-exit](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/workspace-exit).

**Gate:** Retention and legal policy choices remain Jacob's decisions; no invented deletion schedules.

#### S11 — Implement approved lifecycle and visitor erasure

**Disposition:** new; **repo:** REB; **requires:** S10, A06.

After policy selection, add missing visitor erasure and retention executors alongside existing workspace exit/export. Preserve immutable minimal security/effect evidence where required; reconcile cross-store partial deletion with receipts.

**Accept:** Local end-to-end erasure/export verifies authorized scope, provider failure, audit receipt, retained exception and no disclosure to reused identities.

**Source:** [src/platform/workspace-exit](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/workspace-exit), [src/platform/workspace-exports](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/workspace-exports), [docs/architecture/persistence-boundaries.md](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/docs/architecture/persistence-boundaries.md).

**Gate:** Blocked on actual retention decisions; production deletion/retention rollout requires approval.

### Operations

#### O01 — Page fresh failures and dedupe continuing incidents

**Disposition:** new; **repo:** REB; **requires:** F01.

Fix watchdog to recognize fresh failed heartbeats as well as stale runs; dedupe by incident identity rather than ageSeconds. Preserve private-workspace Sentry filters while emitting safe request/actor-role/operation outcome metadata.

**Accept:** Failed fresh cron pages once; repeated stale scan respects dedupe; recovery clears incident; redaction tests reject content/secrets.

**Source:** [src/app/api/cron/heartbeat/route.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/app/api/cron/heartbeat/route.ts), [src/platform/infra/heartbeat.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/infra/heartbeat.ts), [src/platform/infra/monitoring.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/infra/monitoring.ts).

**Gate:** A real delivered alert test and destination/env changes require approval.

#### O02 — Restore database, Auth, assets and keys together

**Disposition:** harden; **repo:** REB; **requires:** F05, S04.

Extend existing restore rehearsal beyond public-row counts: Auth/membership, storage/blob object manifest, referential invariants, secret decrypt and a customer journey on the restored environment. Record actual off-device backup inventory, RPO/RTO and dependencies.

**Accept:** Isolated recovery receipt proves selected identity, content, assets and secret recovery with measured timings; exclusions and missing backup coverage stay explicit.

**Source:** [scripts/rehearse-database-restore.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/rehearse-database-restore.ts), [docs/architecture/persistence-boundaries.md](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/docs/architecture/persistence-boundaries.md).

**Gate:** Fresh production dump/read, PITR/backup purchase and restore into any live environment require approval.

#### O03 — Classify Redis authority and rehearse loss

**Disposition:** new; **repo:** REB; **requires:** F01.

Make current persistence boundaries machine-readable by key family: rebuildable cache, mirror or authority with explicit recovery/loss window. Test local loss/restore, token/approval recovery and bounded degradation; remove dangerous unbounded key scans where active.

**Accept:** Unknown key families fail inventory; real local Redis drill shows which workflows recover and which require operator action.

**Source:** [docs/architecture/persistence-boundaries.md](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/docs/architecture/persistence-boundaries.md), [src/lib/redis.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/lib/redis.ts), [src/lib/revenue.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/lib/revenue.ts).

**Gate:** Backup plan changes and production restore remain separate approvals; Redis is not universally disposable.

#### O04 — Measure query plans and workload capacity

**Disposition:** new; **repo:** REB; **requires:** F05.

Use synthetic business/record volume profiles for v1 content/intake, workspace reads, Needs You and hot executor queries. Capture EXPLAIN ANALYZE/BUFFERS and endpoint concurrency/latency, then propose only measured index or query fixes.

**Accept:** Versioned plans, p50/p95/error rates, DB pool saturation and capacity limits on declared hardware. Regression targets follow measurements, not guessed SLOs.

**Source:** [src/platform/infra/db](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/infra/db), [src/platform/work-execution](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/work-execution), [src/app/api/v1](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/app/api/v1).

**Gate:** Production query statistics or load runs require approval; optional load dependency requires approval.

#### O05 — Budget cron deadlines and resumable batches

**Disposition:** harden; **repo:** REB; **requires:** O04, A09.

Enumerate actual canonical crons and require auth/heartbeat/max-age entries. Bound batch size by deadline and per-provider timeouts; preserve resumable cursor/lease state and record missed/exhausted work.

**Accept:** Every declared cron conforms; large synthetic workload finishes or resumes without duplicating effects. Function limits match the actual deployed plan.

**Source:** [vercel.json](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/vercel.json), [src/platform/infra/heartbeat.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/infra/heartbeat.ts), [src/app/api/cron/workspace-work/route.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/app/api/cron/workspace-work/route.ts).

**Gate:** Background flag and schedule/env changes need separate rollout approval.

#### O06 — Route provider health to an accountable recipient

**Disposition:** harden; **repo:** REB; **requires:** F01, A10, O01.

Extend #608 coverage with explicit recipient and unstaffed-business fallback. Tie publication revision/hash and readback to health; real synthetic form delivery and revoked-provider routing have separate qualification.

**Accept:** Owner/ordinary agency/operator fixtures each receive only their scoped incident; unavailable recipient cannot silently suppress the only alert.

**Source:** [src/platform/system-health](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/system-health), [src/platform/needs-you](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/needs-you).

**Gate:** Actual synthetic provider/email tests, live sends and recipient policy require approval.

#### O07 — Measure cost and operator work per resolved outcome

**Disposition:** harden; **repo:** REB; **requires:** A08, E06.

Consume existing model-call/cost and work-economics ledgers. Track resolved outcomes, unknown effects, provider spend, operator minutes and intervention causes per business/provider, with reconciliation and export.

**Accept:** Known fixture outcome reconciles model/provider cost once; unresolved work remains outside resolved denominator; no private content in metrics.

**Source:** [src/platform/work-economics](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/work-economics), [src/platform/infra/model-call-log.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/infra/model-call-log.ts).

**Gate:** Live evaluation budget, pricing and production metrics activation are separate decisions.

#### O08 — Make incident recovery usable and auditable

**Disposition:** harden; **repo:** REB; **requires:** A06, A09, O01, O06.

Give the operator/ordinary provider one scoped recovery projection over existing queues and receipts. Expose accepted/unknown/partial states, next safe action, runbook and verification; keep privileged actions separate. Run the established parity period before retiring old queues.

**Accept:** Role-scoped browser tests and fictional partial-failure drills prove no blind resend; each superseded queue has a parity receipt before retirement.

**Source:** [docs/architecture/operator-command-center.md](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/docs/architecture/operator-command-center.md), [src/platform/needs-you](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/needs-you), [src/platform/work-execution](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/work-execution).

**Gate:** Actual parity/pilot observation is an operational gate, not satisfied by a merged PR.

#### O09 — Rehearse emergency stops and safe resumption

**Disposition:** harden; **repo:** REB; **requires:** A08, A09, O01.

Inventory existing email/background/release controls. Fill only gaps for scoped/global outside-write stops with action-time enforcement, visible reason and accountable recovery; reconcile in-flight accepted operations rather than retrying them.

**Accept:** Fictional incident stops new email/provider/background effects, preserves completed acceptance, blocks stale workers, then resumes safely under current authority.

**Source:** [src/platform/infra/email/enabled.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/infra/email/enabled.ts), [src/platform/work-execution](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/work-execution), [src/lib/ai-governance.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/lib/ai-governance.ts).

**Gate:** Live stop drills and production control/env changes require approval.

### Clients

#### C01 — Complete additive v1 contracts

**Disposition:** new; **repo:** REB; **requires:** F01.

Extend current six-route contract table to inquiries, bookings/reservations/readback and collections. Snapshot consumer-used fields/status/auth/replay semantics and runtime fixtures; preserve deployed names and old request behavior.

**Accept:** Contract suite, deliberately breaking fixture and check:custom-repos pass; additive changes remain compatible with old consumers.

**Source:** [scripts/custom-repo-v1-contracts.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/custom-repo-v1-contracts.ts), [src/__tests__/custom-repo-v1-contracts.test.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/__tests__/custom-repo-v1-contracts.test.ts), [custom-repo-starter](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/custom-repo-starter).

#### C02 — Make pinned client compatibility hermetic

**Disposition:** new; **repo:** REB; **requires:** C01.

Materialize each client repository at an explicit reviewed SHA in isolated CI rather than relying on mutable sibling checkouts. Record local/origin/pinned/deployed as different facts. Reconcile manifests only against evidence.

**Accept:** All nine compatibility checks run with zero missing-sibling skips; exact SHAs and per-consumer results retained.

**Source:** [release-manifest.json](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/release-manifest.json), [scripts/custom-repo-workspace-run.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/custom-repo-workspace-run.ts).

**Gate:** Fresh deployed-SHA metadata read requires approval; compatible source is never labeled deployed without evidence. Cross-repository CI checkout requires confirmed repository visibility and approved scoped GitHub App/token access; new repository secrets need approval. Local pinned clones can prove compatibility while hosted checkout is blocked.

#### C03 — Version starter adapters and delivery workflow

**Disposition:** new; **repo:** REB; **requires:** C01, F02.

Create a hash/version manifest for shared adapters and starter-first workflow variants keyed to current client profiles: static-site assets/contact functions without a JS build; next-beacon-site with existing scripts plus justified missing checks; GLDF/Rohlax baseline and their custom checks. Preserve consumer differences and scripted copies before adding a package.

**Accept:** Each declared profile runs only supported checks and verifies intended adapter hashes; altered copies fail conformance. Representative clean static, beacon and GLDF/Rohlax profiles pass before rollout.

**Source:** [custom-repo-starter](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/custom-repo-starter), [scripts/custom-repo-conformance.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/custom-repo-conformance.ts).

**Gate:** New package/dependency needs approval. Consumer PRs stay separate.

#### C04 — Give marketing a verified engineering baseline

**Disposition:** new; **repo:** strelva-marketing; **requires:** C01, F02.

Unify the marketing lockfile/toolchain and add type/build/security plus origin/continuation/version contracts. Keep marketing and app components separate; verify public promise matches available release-qualified capabilities.

**Accept:** Marketing workflow and built-app continuation tests pass against explicit REB candidate origin, desktop/mobile and error state. Own the marketing/public-result → real local Auth continuation cells in the E01 coverage matrix; in-app cells can qualify earlier.

**Source:** `../strelva-marketing/package.json`.

**Gate:** Public marketing deployment/publication requires approval.

#### C05 — Rehearse all nine workspace conversions

**Disposition:** harden; **repo:** REB; **requires:** A05, A06, A10, D01, C02, C06.

Use existing conversion tooling on local scrubbed fixtures. Preserve website stable identity, domains, leads, accepted records, content/assets, grandfathered billing, provider attribution and Version lineage; do not choose new rates/groupings. Resolve every repo-to-tenant/business mapping first, including the currently unconfirmed Smokin Buddha entry; do not treat nine repo fixtures as nine verified live customers.

**Accept:** Nine before/after and rollback/compensation reports; native tests prove site and data access with ordinary owner/agency actors.

**Source:** [scripts/convert-tenant-to-workspace.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/convert-tenant-to-workspace.ts), [src/platform/system-versions/supabase-store.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/system-versions/supabase-store.ts).

**Gate:** Fresh scrubbed production copy and actual client conversion/rollout require approval.

#### C06 — Prove durable billing reconciliation and payer separation

**Disposition:** harden; **repo:** REB; **requires:** F04, A08, S04.

Extend already-consolidated money/refund/Connect code with a durable Stripe event/processing inventory, duplicate/rollover/refund/dispute fixtures and recovery. Preserve gldf/rohlax grandfathering, one-off pay links and separate business/provider/customer merchants.

**Accept:** Replay and crash-after-effect tests reconcile once, period boundaries remain correct and refunds/disputes are recorded without moving real money.

**Source:** [src/platform/connect/refunds.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/connect/refunds.ts), [src/app/api/billing/webhook/route.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/app/api/billing/webhook/route.ts), [docs/product/specs/money-and-data.md](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/docs/product/specs/money-and-data.md).

**Gate:** Stripe webhook/account/event changes, refunds and commercial policy require approval.

#### C07 — Qualify provider contracts and revocation

**Disposition:** harden; **repo:** REB; **requires:** A08, A10, C06.

Maintain adapter-specific acceptance matrix for Google Business, calendar Google/Microsoft, Resend, Stripe and Vercel publication/domains. Contract fixtures cover acceptance/readback/revoke/reauth and native agency actor. Actual provider receipts are separate from mocks.

**Accept:** Every adapter declares ordinary-user authorization, scopes, commercial eligibility, durable operation, disconnect and failure recovery. Block unsupported adapter claims.

**Source:** [src/platform/provider-connections](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/provider-connections), [src/products/scheduling/calendar](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/products/scheduling/calendar), [src/platform/connect](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/connect).

**Gate:** Owned test accounts, paid calls, outside writes, OAuth/store verification and commercial rights remain explicit operational gates.

#### U01 — vermont-unlimited delivery baseline

**Disposition:** consumer; **repo:** vermont-unlimited; **requires:** C02, C03.

Profile: static-site. Work in a clean repo-owned branch. Compare current manifest/workflow/adapter first; add only missing pinned CI, shared-adapter conformance and environment contract. Preserve static content, contact email/function behavior, forms and redirects. This is a static HTML site: use static asset/link/contact-function checks rather than adding an unnecessary React/pnpm build.

**Accept:** Static link/asset and contact API checks plus unchanged form, redirect and critical content behavior. Record no-patch disposition if already compliant.

**Source:** `../vermont-unlimited/README.md`.

**Gate:** Separate production deployment approval; source proof does not establish deployed compatibility.

#### U02 — cocard-anderson delivery baseline

**Disposition:** consumer; **repo:** cocard-anderson; **requires:** C02, C03.

Profile: static-site. Work in a clean repo-owned branch. Compare current manifest/workflow/adapter first; add only missing pinned CI, shared-adapter conformance and environment contract. Preserve static content, contact email/function behavior, forms and redirects. This is a static HTML site: use static asset/link/contact-function checks rather than adding an unnecessary React/pnpm build.

**Accept:** Static link/asset and contact API checks plus unchanged form, redirect and critical content behavior. Record no-patch disposition if already compliant.

**Source:** `../cocard-anderson/README.md`.

**Gate:** Separate production deployment approval; source proof does not establish deployed compatibility.

#### U03 — leslie-bookkeeping delivery baseline

**Disposition:** consumer; **repo:** leslie-bookkeeping; **requires:** C02, C03.

Profile: next-beacon-site. Work in a clean repo-owned branch. Compare current manifest/workflow/adapter first; add only missing pinned CI, shared-adapter conformance and environment contract. Preserve custom integrations, content, forms and own merchant credentials.

**Accept:** Repo's relevant checks plus content/assets/forms/redirects/critical integration fixture. If already compliant, retain evidence and mark no patch needed rather than opening an empty PR.

**Source:** `../leslie-bookkeeping/package.json`.

**Gate:** Separate production deployment approval; source proof does not establish deployed compatibility.

#### U04 — smokin-buddha delivery baseline

**Disposition:** consumer; **repo:** smokin-buddha; **requires:** C02, C03.

Profile: next-beacon-site. Work in a clean repo-owned branch. Compare current manifest/workflow/adapter first; add only missing pinned CI, shared-adapter conformance and environment contract. Preserve custom integrations, content, forms and own merchant credentials.

**Accept:** Repo's relevant checks plus content/assets/forms/redirects/critical integration fixture. If already compliant, retain evidence and mark no patch needed rather than opening an empty PR.

**Source:** `../smokin-buddha/package.json`.

**Gate:** Separate production deployment approval; source proof does not establish deployed compatibility. Canonical manifest marks tenantConfirmed:false; confirm the repo-to-customer/deployed-site mapping before any migration or production coverage claim.

#### U05 — orange-crate-brewing delivery baseline

**Disposition:** consumer; **repo:** orange-crate-brewing; **requires:** C02, C03.

Profile: next-beacon-site. Work in a clean repo-owned branch. Compare current manifest/workflow/adapter first; add only missing pinned CI, shared-adapter conformance and environment contract. Preserve custom integrations, content, forms and own merchant credentials.

**Accept:** Repo's relevant checks plus content/assets/forms/redirects/critical integration fixture. If already compliant, retain evidence and mark no patch needed rather than opening an empty PR.

**Source:** `../orange-crate-brewing/package.json`.

**Gate:** Separate production deployment approval; source proof does not establish deployed compatibility.

#### U06 — mclears-cottage delivery baseline

**Disposition:** consumer; **repo:** mclears-cottage; **requires:** C02, C03.

Profile: next-beacon-site. Work in a clean repo-owned branch. Compare current manifest/workflow/adapter first; add only missing pinned CI, shared-adapter conformance and environment contract. Preserve custom integrations, content, forms and own merchant credentials.

**Accept:** Repo's relevant checks plus content/assets/forms/redirects/critical integration fixture. If already compliant, retain evidence and mark no patch needed rather than opening an empty PR.

**Source:** `../mclears-cottage/package.json`.

**Gate:** Separate production deployment approval; source proof does not establish deployed compatibility.

#### U07 — rhm-innovations delivery baseline

**Disposition:** consumer; **repo:** rhm-innovations; **requires:** C02, C03.

Profile: next-beacon-site. Work in a clean repo-owned branch. Compare current manifest/workflow/adapter first; add only missing pinned CI, shared-adapter conformance and environment contract. Preserve custom integrations, content, forms and own merchant credentials.

**Accept:** Repo's relevant checks plus content/assets/forms/redirects/critical integration fixture. If already compliant, retain evidence and mark no patch needed rather than opening an empty PR.

**Source:** `../rhm-innovations/package.json`.

**Gate:** Separate production deployment approval; source proof does not establish deployed compatibility.

#### U08 — rohlax-wellness delivery baseline

**Disposition:** consumer; **repo:** rohlax-wellness; **requires:** C02, C03.

Profile: custom baseline with check:scaffold. Work in a clean repo-owned branch. Compare current manifest/workflow/adapter first; add only missing pinned CI, shared-adapter conformance and environment contract. Preserve custom integrations, content, forms and own merchant credentials.

**Accept:** Repo's relevant checks plus content/assets/forms/redirects/critical integration fixture. If already compliant, retain evidence and mark no patch needed rather than opening an empty PR.

**Source:** `../rohlax-wellness/package.json`.

**Gate:** Separate production deployment approval; source proof does not establish deployed compatibility.

#### U09 — greatlakesdriedfruits delivery baseline

**Disposition:** consumer; **repo:** greatlakesdriedfruits; **requires:** C02, C03.

Profile: custom baseline with check:prod. Work in a clean repo-owned branch. Compare current manifest/workflow/adapter first; add only missing pinned CI, shared-adapter conformance and environment contract. Preserve custom integrations, content, forms and own merchant credentials.

**Accept:** Repo's relevant checks plus content/assets/forms/redirects/critical integration fixture. If already compliant, retain evidence and mark no patch needed rather than opening an empty PR.

**Source:** `../greatlakesdriedfruits/package.json`.

**Gate:** Separate production deployment approval; source proof does not establish deployed compatibility.

#### C08 — Prove complete exports and resumable exit

**Disposition:** harden; **repo:** REB; **requires:** S10, A06, A12.

Inventory existing exports/exit for every current kind and current client integration. Include retained content/records, assets, lineage, connection metadata without secret disclosure, accepted terms and customer-owned handoff. Fill missing adapter export/exit steps with receipts.

**Accept:** Round-trip or independently-readable fixture verifies completeness; interrupted exit resumes, retained exclusions are disclosed and grandfathered customers keep promised access. Own real-local-Auth owner/agency/operator export/exit cells in the E01 coverage matrix after the relevant export implementation is qualified.

**Source:** [src/platform/workspace-exports](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/workspace-exports), [src/platform/workspace-exit](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/workspace-exit).

**Gate:** Actual client handoff, shutdown and production data export require approval.

### Experience

#### D02 — Integrate workspace location #619

**Disposition:** existing; **repo:** REB; **requires:** D01.

Land location owner with business-switch clearing, URL reload, back, sign-in and Needs You navigation. Resolve WorkspaceApp overlap with #621.

**Accept:** Combined 320/390/1440px journey covers cross-business switch, deep link, back and permission change.

**Source:** [src/platform/workspaces/location.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/workspaces/location.ts).

**Gate:** https://github.com/Strelva/Strelva-OFFICIAL/pull/619

#### D03 — Integrate opened-work composition #621

**Disposition:** existing; **repo:** REB; **requires:** D02.

Land one native opened-work dispatcher. Keep product-owned experiences and address refresh remount clearing work selection/save notices.

**Accept:** Existing render/conformance suites plus same-work save-refresh and workspace/System dispatch on combined tree.

**Source:** [src/experience/workspace/WorkspaceApp.tsx](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/experience/workspace/WorkspaceApp.tsx).

**Gate:** https://github.com/Strelva/Strelva-OFFICIAL/pull/621

#### E01 — Prove in-app actor and System journeys

**Disposition:** new; **repo:** REB; **requires:** D04, A01, A07, E03, F05, A11, A12.

Extend the existing real-local-Auth harness for in-app business/agency/operator journeys: request/approval/effect/readback/history across the current kind inventory. Keep one overall coverage matrix, but marketing entry is owned by C04 and export/exit cells by C08; these later cells do not block in-app qualification.

**Accept:** Supported in-app actor×kind cells run on built apps with real local Auth. Wrong workspace, revoked access, paused kind and ordinary-provider paths pass; fixtures cannot satisfy Auth cells. Matrix identifies C04/C08-owned cells and their later prerequisites.

**Source:** [scripts/check-journeys.sh](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/scripts/check-journeys.sh), [tests](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/tests), [src/experience/workspace](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/experience/workspace).

**Gate:** Preview/production journeys and real provider effects require approval.

#### E02 — Share surface-state and acting-context verification

**Disposition:** new; **repo:** REB; **requires:** D04.

Reuse browser helpers for empty/loading/error/read-only/permission, keyboard/focus, context switch and 320/390/1440px reflow. Inspect existing acting-context components before changing them; update component-system owner when changed.

**Accept:** Native experiences consistently announce business/actor/role and preserve safe focus; error and uncertainty states remain actionable with realistic fixtures.

**Source:** [docs/design/component-system.md](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/docs/design/component-system.md), [src/experience/workspace](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/experience/workspace), [tests](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/tests).

**Gate:** No axe/Storybook/visual service dependency is assumed.

#### E03 — Resolve availability from existing registries

**Disposition:** new; **repo:** REB; **requires:** E08.

Consume the existing src/capability-registry.ts rather than rebuild it. One surface resolver combines scoped release flags, qualification and prerequisites into available/unavailable/unknown with reasons; permissions remain separate authoritative checks.

**Accept:** Workspace, Ask, MCP and operator show consistent unavailable reasons; new inline flag drift is caught without importing server registry into client bundles.

**Source:** [src/capability-registry.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/capability-registry.ts), [src/platform/release-flags](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/release-flags), [docs/capabilities/README.md](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/docs/capabilities/README.md).

**Gate:** Production flag/env changes need approval.

#### E04 — Project one governed tool descriptor

**Disposition:** new; **repo:** REB; **requires:** E03, A07.

Reuse existing Ask-to-tenant adapters and product-owned tools. Declare id/input schema/authority/effect/approval metadata once; derive AI SDK/MCP schema with current Zod, preserving native admission and v1 compatibility.

**Accept:** Schema conformance and wrong actor/unguarded-write tests cover every exposed tool; metadata listing grants no authority.

**Source:** [src/platform/ask/tools.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/ask/tools.ts), [src/platform/agent-channel/protected-tools.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/agent-channel/protected-tools.ts), [src/lib/agent-shared.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/lib/agent-shared.ts).

#### E05 — Gate deterministic agent attacks

**Disposition:** new; **repo:** REB; **requires:** E04, S05.

Extend scripted model tests with untrusted website/tool content, credential demands, cross-business refs, destructive patches, approval spoofing and malicious system instructions. Use existing mocks; no model spend.

**Accept:** Seeded unsafe tool adapter fails CI; no injected instruction reaches an ungoverned outside write.

**Source:** [benchmarks/cases.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/benchmarks/cases.ts), [src/platform/ask](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/ask), [src/platform/agent-channel](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/agent-channel).

#### E06 — Evaluate agent outcomes, grounding and cost

**Disposition:** new; **repo:** REB; **requires:** E04, E05.

Extend existing benchmark and website rebuild evaluation to Ask/MCP/rebuild. Make case/provider selection reproducible, use claim-to-source evidence and human-reviewed outcomes, and record cost/unknowns. Set promotion thresholds from a retained baseline.

**Accept:** Same-case baseline and challenger report source grounding, outcome completion, latency/cost and human intervention; model judge is never sole evidence.

**Source:** [benchmarks](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/benchmarks), [docs/capabilities/website/website-rebuild-benchmark.md](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/docs/capabilities/website/website-rebuild-benchmark.md).

**Gate:** Paid model/provider budget needs approval; deterministic scaffolding can land first.

#### E07 — Ratchet risky modules and seeded failures

**Disposition:** new; **repo:** REB; **requires:** D04, S02, C06.

Risk-ranked tests cover proxy, billing, ownership, Version release and website settlement. Seed realistic mutants/failures with existing tooling; deepen remaining hot modules by responsibility only where it improves safe change. Exempt generated types and track shrinking handwritten exceptions.

**Accept:** Seeded authority/replay/settlement faults are caught; retained hotspot budget cannot grow without explanation. Follow-up extraction PRs are named from survivors, not line-count aesthetics.

**Source:** [src/proxy.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/proxy.ts), [src/app/api/billing/webhook/route.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/app/api/billing/webhook/route.ts), [src/platform/system-versions/service.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/system-versions/service.ts).

**Gate:** Stryker or other new test dependencies require approval.

#### E08 — Attach ownership and qualification to capability inventory

**Disposition:** harden; **repo:** REB; **requires:** no code prerequisite.

Extend existing app-edge capability-registry adapters with owner, declared contract, qualification receipt and evidence mode. Generate the capability status view without merging distinct owner catalogs or pretending declaration means enabled.

**Accept:** Registry covers every declared capability once and validates evidence references; source/local/Auth/provider/production statuses cannot be promoted by a label alone.

**Source:** [src/capability-registry.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/capability-registry.ts), [docs/capabilities/README.md](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/docs/capabilities/README.md).

### Candidates

#### Q01 — Reconcile hosted publication #204

**Disposition:** conditional; **repo:** REB; **requires:** F01, C01, A08.

Compare unique #204 source with current hosted website publisher; carry only missing adapter/domain/asset/exit behavior after rebuilding old checks. Keep sites-domain unset and preserve native governance.

**Accept:** Publication/take-offline/republish/readback and export fixtures; explicit source disposition retires only byte-equivalent or accepted superseded work.

**Source:** [src/products/websites](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/products/websites).

**Gate:** https://github.com/Strelva/Strelva-OFFICIAL/pull/204 — enable only with DNS/domain/production approval.

#### Q02 — Reconcile Home Finder #206 and adapter proof

**Disposition:** conditional; **repo:** REB; **requires:** E03, C01, A10.

Compare current declared offering before carrying #206; keep it uninstallable until named brokerage, inventory rights, verified inquiry and customer-owned handoff. Compare IDX runtimes rather than selecting both by default.

**Accept:** Local synthetic adapter and fail-closed availability tests; exact unique-source disposition recorded.

**Source:** [src/platform/products/catalog.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/platform/products/catalog.ts).

**Gate:** https://github.com/Strelva/Strelva-OFFICIAL/pull/206 — MLS/Trestle rights, pilot, runtime promotion and pricing need decisions.

#### Q03 — Verify extension release and collection permission

**Disposition:** conditional; **repo:** strelva-tools; **requires:** C04, S10.

Reconcile existing extension version/listing with source; verify candidate collector schema and minimum browser permissions. Keep it separate from app/marketing imports and do not make availability depend on store acceptance.

**Accept:** Existing browser regressions and schema fixture pass; any host permission increase has consent/store-review plan.

**Source:** `../strelva-tools`.

**Gate:** Store submission, account/commercial rights and new dependencies require approval.

#### Q04 — Qualify a hosted isolated application builder

**Disposition:** conditional; **repo:** REB; **requires:** S09, O04, A08.

Use the existing build contract to compare local Docker with Vercel Sandbox under measured app workload. Prepare one selected remote adapter only if production custom-app builds are in the commitment; retain no-network/digest/asset/expiry constraints.

**Accept:** Adversarial build and timeout/cleanup tests, measured cost and ordinary-actor acceptance on owned test environment.

**Source:** [src/products/custom-applications/build.ts](https://github.com/Strelva/Strelva-OFFICIAL/tree/a1306213f42b211d0560af54124770bd49a76545/src/products/custom-applications/build.ts).

**Gate:** Sandbox account/budget and @vercel/sandbox dependency need approval before dependent implementation.

## Consumer rollout waves

- **Wave 1:** U01 Vermont Unlimited and U02 Cocard Anderson: static-site/contact behavior. Do not add a JS build to a static site merely for consistency.
- **Wave 2:** U03 Leslie Bookkeeping, U04 Smokin Buddha, U05 Orange Crate Brewing: next-beacon-site tracker/forms and critical pages. Smokin Buddha's manifest tenant mapping is unconfirmed; resolve it before claiming production coverage.
- **Wave 3:** U06 McLear's Cottage, U07 RHM Innovations, U08 Rohlax Wellness, U09 Great Lakes Dried Fruits: stateful content/leads, grandfathering and customer-owned merchant/database integrations.

Source compatibility, default-branch merges and production deployment are different events. Check each repo's deployment settings before merge: if merge triggers a production release, get that release approved first. Use clean worktrees; all existing dirty client files remain owned by their current tasks. The unchanged critical read/form journey is required per client, and blanket compatibility never overrides a client-specific exception.

## Completion matrix

| Promise | Required proof | Relevant records | Still requires operational evidence |
| --- | --- | --- | --- |
| Customer cannot cross business/role boundaries | SQL and route negative tests; real Auth journeys; revoked actor at effect time | F05/F06/S01/S02/A07/A11/E01 | Preview and authorized production identity journeys |
| Systems keep identity, kind, records and accepted terms | Native commands/replay/ownership and source lineage tests | A01–A03/A07/A12/A13 | Existing-client inventory and authorized migration |
| Make real reports honestly and never blindly repeats a write | Per-part success/refusal/unknown/compensation and crash/replay conformance | D04/A08/A09/C07 | Actual owned-account effects/readback and safe recovery |
| Business can operate through an ordinary agency | Same authority path and visible acting context; provider change/revocation | A10/A11/E01/E02/O06/O08 | Ordinary agency pilot and established queue parity period |
| Every client retains its working service | Exact source contracts, zero missing-consumer skips, per-client fixtures | C01–C03/C05/U01–U09 | Approved deployed-source checks and individual rollout receipt |
| Every kind can be exported and exited | Inventory, readable output, assets/accepted terms and resumable cleanup | S10/S11/C08/A06 | Authorized actual client handoff; selected retention policy |
| Whole service can recover | Postgres/Auth/objects/keys and authoritative Redis drill | O02/O03/F07 | Actual backup/off-device coverage, approval and observed restore |
| Failures reach someone accountable | Fresh-failed/stale/recovery state, stable dedupe, scoped recipient tests | O01/O06/O08/O09 | Delivered alert and unstaffed-business recipient policy |
| Runtime scales within known budgets | Query plans, workload/pool/load and resumable deadline tests | O04/O05/A09 | Live metrics and actual service-plan limits |
| Agents produce grounded outcomes economically | Deterministic attack guard; comparable retained outcome/cost/human review | E04–E06/O07 | Approved paid baseline and observed operator minutes |
| Engineers can change safely without recurring rescue | Same-profile CI, exact-source receipts, seeded faults and scope-specific tests | F02–F08/E07/T01–T03 | Three repeatable rehearsals and funded hosted checks |

Core completion is the acceptance evidence above, not PR count or an invented engineering grade. Local, preview and production evidence stay separate. A missing provider approval can block activation while all independent code/proof work continues.

## Approval and external gates

No permission is requested by this planning document. Before dependent live work, prepare the exact reviewable action, then request only the necessary decision:

Every production rollout must also pass the existing [horizontal release checklist](https://github.com/Strelva/Strelva-OFFICIAL/blob/a1306213f42b211d0560af54124770bd49a76545/docs/operations/horizontal-release-checklist-2026-09-11.md#september-21-production-preparation); this program does not replace or weaken that gate.

- Production deploy, migration, env, data/credential backfill, live email/provider write, domain/DNS and Stripe changes.
- Fresh production ledger/catalog/deployed-source/credential/backup inventory and scrubbed production copy, where existing session authorization does not already cover the exact read.
- Backup/service spend, live model budget and any new dependency. This plan adds none.
- Retention/erasure obligations, provider recipient policy, refund/dispute liability and partner/payer terms. Preserve current commitments and grandfathering.
- OAuth/marketplace/account verification and commercial use/distribution rights; candidate directories, MLS feeds, SMS/voice or Sandbox are not activated by source availability.

These are operational/decision gates, not missing PRs. Existing issues #474/#473/#468/#469/#461/#460/#479/#478/#476/#477/#411/#395/#394/#389/#390/#420 and #400–#408 already track many of them; update existing owners instead of filing duplicates. The broader external-access issue series #371–#386 stays under its provider/pilot owners.

## Verification and handoff

Files: [machine-readable PR plan](./pr-plan.json), [retained independent reviews and corrections](./research-findings.md), [interactive index](./index.html), and [documentation validation receipt](./validation.json). The independent reviews are historical input: several inspected older main/private trees and are explicitly superseded by the canonical corrections above.

The final review confirmed the existing migration and Connection machinery and corrected sequencing before completion. It read before the index was generated; the index now exists and its links/interactions pass validation. All five files are task-owned untracked documentation artifacts in this checkout, not published canonical source.

This task's checks are documentation checks only: unique IDs, dependency existence and acyclicity, source-anchor existence, local artifact links, generated index counts and `git diff --check`. No app proof was produced. Prior local failures and skipped/provider/production limits remain visible in the evidence owners.

**Current objective:** complete this foundation program without rebuilding prepared code or widening production authority. **Active bet:** deepen one modular product on the current stack; verify infrastructure bottlenecks before selecting a new service. **Pending reviews:** exact security carry disposition, migration ledger reconciliation, current #204/#206 source delta and provider/policy gates.

**Exact next action:** create an isolated branch from the pinned canonical candidate for F01's source/SQL disposition manifest; record each missing fix, preserved hold and required forward migration against the approved ledger. Prepare F02 in parallel. Do not apply SQL or deploy. Once the disposition is reviewable, qualify the combined candidate with the resource-admitted runner and integrate the four existing depth PRs.
