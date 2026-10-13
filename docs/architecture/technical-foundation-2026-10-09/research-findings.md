# Independent reviews — source reconciliation required

These are retained research findings, not current architectural truth or execution authorization. Several reviews inspected older main/private trees. The README and PR inventory explicitly correct those findings against canonical `origin/reborn-1.0` at `a1306213f`. Local receipts quoted by reviewers were not rerun in this task.

Platform architecture
# Stable domain identity, authority and contract PRs: recommended inventory

I read source and PR text only; I ran no tests and made no edits. I checked the prepared parent `c4c28d5`, not `0de15774`. The `0de15774` successor is out of scope as stated: native, Auth, build and full-unit runs are still unrun. I read PRs #614–621 from their descriptions. I read #618's handoff doc in full, since it carries the System-kind finding.

**Bottom line:** the prepared candidate already has the durable pieces: Systems, Version stores, live Make real, client-record durability, guarded teardown and cleanup receipts. What is missing is the contracts that keep those pieces from drifting apart. The weak points are the System-kind semantics, a typed boundary for 305 RPC call sites, one vocabulary for 47 receipt and attempt tables, and a gate for migration order. This is eleven small PRs. None is a platform, and none rebuilds prepared work.

## Inventory

All of it is owned by `REB`. Client repos change only in the compatibility proof (`pnpm check:custom-repos`), and `/api/v1` stays additive.

| ID | Title | Exists? | Depends on |
|---|---|---|---|
| **DOM-00** | Integrate #618 as written | Review and integrate | — |
| **DOM-01** | Decide System kind and enforce it | New, **decision-gated** | Jacob's choice |
| **DOM-02** | Closed System-kind registry (TS and SQL parity) | New | DOM-01 |
| **CMD-01** | Named System commands replace generic `update_business_system` | New | DOM-01 |
| **BRG-01** | One tenant↔business bridge resolver | New, over prepared code | — |
| **BRG-02** | Extend cleanup receipts to rename and conversion | Harden prepared | BRG-01 |
| **AUTH-01** | `check:rpc-authority` SQL catalog gate | New | — |
| **TYP-01** | Typed RPC boundary with a ratchet | New | AUTH-01 (soft) |
| **REC-01** | Owning-writer gate on `saveWork` | New | DOM-02 |
| **EXE-01** | Effect-outcome contract and conformance suite, first adopter Make real | New | #620 settles first |
| **CUT-01** | Migration batch and cutover manifest gate | Extend prepared scripts | — |

## What each PR does

**DOM-00 (#618).** Merge it as is. It makes Version release determination one function, `determineVersionRelease`. It changes no kind semantics or migration. Its own numbers are 15 suites, 113 passed and 12 PostgreSQL tests skipped, with no SQL runner and no production proof. #619–621 are experience-layer deepening in other lanes. They only need to land first so my PRs rebase cleanly.

**DOM-01: System kind.**
- *Anchors:*
  - `GLOSSARY.md` (Oct 9): kind is lifelong.
  - `src/platform/systems/contracts.ts:42-49` and `invariants.ts:74-84`: kind is mutable, and proposal → portal is explicitly allowed.
  - `20261004120000_systems.sql` `update_business_system` accepts `kind`.
  - `systems-invariants.test.ts`, `systems-store-contract.test.ts` and `tests/systems-schema.sql` all affirm mutation.
- *Scope:* my recommendation is to enforce immutability now for kinds that decide authority or native eligibility: website, inquiry, booking and the hidden offering source. That means a forward migration with a trigger, plus flipping the mutation tests to refusal tests. First run a read-only inventory of any Systems whose kind has already changed.
- *Evidence:* the inventory result, refusal tests, the local SQL runner (`check:workspace-sql`) and `check:workspace-upgrade`.
- *Decision for Jacob:* #618 offers two alternatives. (1) Kind is lifelong everywhere. (2) A separate mutable descriptor sits beside an explicit lifetime kind. Mine is a narrower first step than either: lock only the kinds that gate authority. I'm unsure it satisfies the glossary's "for life", so it needs your yes.

**DOM-02: kind registry.** Today kind decides behavior in at least seven places, none of them central:
- `system-health/business.ts` (proposal, document and report count as static, portal as ongoing)
- `experience/systems/from-workspace.ts`
- `experience/systems/server.ts`
- `stored-possibilities.ts`
- `ask-follow-up-server.ts`
- the SQL pause filter in `20261020090016_agent_inquiries.sql:41`
- `from-existing.ts`, which maps both application and tracker records to `internal_app`

The registry would hold, per kind: allowed origin kinds, writer product and resource kind, native eligibility, health class, and what "paused" blocks. A parity test would compare it with a SQL function in the style of the existing `system_origin_kinds()`. Evidence of the gap is that `KNOWN_SYSTEM_KINDS` omits `offering`, yet `20261020090023_offering_source_versions.sql:93` inserts `kind='offering'` Systems.

**CMD-01.** Split the generic update into named commands (rename, describe, pause/resume, go live, record revision). Keep the old RPC as a thin wrapper for one release. The existing `command_id`/`command_digest` idempotency stays. Acceptance is a replay test per command plus the unchanged `system_command_conflict` behavior.

**BRG-01: tenant bridge.**
- *Today:*
  - `tenant_workspace_links` is canonical.
  - `offering_website_bindings` is read only for unlinked tenants (`from-existing.ts:36-38`).
  - `systems.sql:886-941` repeats the link join.
  - `20261005090000_tenant_leads.sql` finds the link with `to_regclass` dynamic SQL.
  - 114 files import `lib/tenants`.
  - About 203 `reb:` Redis key sites are slug-keyed.
- *Scope:* one read module and one SQL function that map `stable_id` to business and System. Cross-store retained records key on `stable_id`; the slug stays for routing and Redis only. Add a test that enumerates the retained stores still keyed by slug.
- *Overlap:* #614 already moves inquiry scope to immutable source identity and refuses deleted or reused slugs. Review that first and extend the pattern. Don't redo it.

**BRG-02.** Prepared `tenant_cleanup_receipts` and `tenant-cleanup-recovery.md` cover teardown. `src/lib/tenant-rename.ts` appears to touch the same receipt, but I did not confirm how. Extend the receipts to rename and conversion so post-commit Redis, domain-claim and Vercel steps are resumable rather than "verify manually". Confirm the rename gap before opening this.

**AUTH-01.** Systems and ownership code rely on service-role security-definer RPCs that recheck the actor. AGENTS.md states "the app check is the real boundary". Add a catalog gate on the throwaway cluster. It would list every function with `anon`, `authenticated` or `PUBLIC` execute, any security-definer function without a pinned `search_path`, and any function taking an actor id as a client argument. Anything outside an allowlist fails. `20260930120000_revoke_public_execute_internal_functions.sql` is the earlier fix for the same class, and `reader-rpc-volatility.md` and `check-readonly-rpcs.mjs` are adjacent. This extends them and replaces neither.

**TYP-01.**
- *Anchor:* `scripts/generate-database-types.ts` already generates types, has a `--check` flag, and writes `Functions` entries (about 1,241 `Args:` in the prepared types file). My grep found 305 non-test `.rpc(` calls across 168 files, and 104 files declare their own untyped `rpc(name: string, args: Record<string, unknown>)` client (e.g. `systems/supabase-store.ts:30`).
- *Scope:* a typed `rpc()` wrapper keyed on the generated names and arguments. Migrate Systems, business ownership and Make real first. Add a ratchet so the untyped-declaration count can only fall, and run `db:types --check` inside the upgrade rehearsal. Zod stays at the boundary because jsonb returns come back as `Json`. No new dependency.
- *Evidence:* a deliberate argument-name drift fails typecheck.

**REC-01.** `saveWork` accepts caller-supplied product and resource kind (`workspaces/repository.ts:450-463`). Each owning module (websites, documents, tracker, applications) already validates its own kind, but nothing central enforces who may write a record shape. Route writes through the DOM-02 registry. Prove it with a refusal test for a wrong-writer save.

**EXE-01: effect outcomes.**
- *Observation (inferred, not measured):* there are 47 tables named like receipt, attempt or operation, with divergent status sets such as `reserved|running|finished`, `pending|sent|suppressed|failed|skipped` and `pending|consumed|revoked`.
- *Scope:* this is a contract, not an engine. It defines the states reserved → attempted → accepted | rejected | unknown → read-back → settled | compensated, plus the rule "unknown never retries blindly". A conformance suite runs against fictional adapters. The first adopter is `make-real/runner.ts`, which has existing compensation recovery docs. The second would be website cutover after #620 and #204.
- *Don't:* migrate all 47 tables.

**CUT-01.** The Oct 6–7 release packet records that `supabase db push` applies every pending file, that one migration is out of order and needs `--include-all`, and that 86 migrations were applied in production as of Oct 7. The prepared tree has about 360 non-rollback migrations, and applied migrations are immutable. The gate would check batch manifest against file list, sentinels, rollback pairing and dependency order. It would also diff a fresh-install catalog against an upgraded one, because `to_regclass`-conditional objects can make them differ. Local only; applying any batch stays a separate yes.

## Larger alternatives to defer or evaluate
- A unified outbox or workflow engine (Vercel Workflow or Temporal) as the effect substrate. Evaluate after EXE-01's conformance suite shows what actually repeats.
- A generated typed query layer (Kysely or Drizzle). This adds a dependency, so ask first.
- Moving off service-role RPCs to RLS-first access.
- Retiring the `src/lib` shims, with about 205 files still in `lib` in the prepared tree. This is mechanical, so do it after #616 lands.
- Folding the nine live tenants fully into the workspace model.

## Disagreements and unknowns
- **Kind:** the glossary (lifelong) conflicts with contracts, SQL and tests (mutable). ADR 0011's example, a proposal that grows onboarding, supports either reading. #618 shows no application code path that changes kind, but the service-role command exists, so hosted behavior is unproven.
- **Branch drift:** local HEAD `789a3859c` is 1,317 commits behind `origin/reborn-1.0`. The prepared parent branches from `847d55abf`. Line anchors from the prepared tree and #618's branch need re-verifying against the tip before each PR opens.
- **Counts:** the RPC, receipt-table and Redis-key counts come from text search. The compiler hasn't confirmed them.
- **Generated types:** I don't know whether the prepared `database.types.ts` is current. I did not run `--check`.
- **BRG-02:** whether rename already uses the cleanup receipts is unverified.
- **Proof level:** none of this is proven operation. Prepared capabilities are source plus local tests only. Hosted Auth, providers and production are unrun.
- **Needs Jacob's yes:** the DOM-01 choice, any slug-reuse policy for former clients, and every migration apply.

Infrastructure and operations
# Infrastructure and delivery lane: recommended PR inventory (provisional)

Nothing was edited, built, or run, and I touched no production or remote service. "Inspected" means I read the source or doc in this session. Nothing below was run.

## What exists (inspected)

- **Hosting and crons:**
  - `vercel.json` declares 27 Vercel crons and has `git.deploymentEnabled:false`.
  - `workspace-work` runs every 5 minutes with `maxDuration=60` and is gated by `STRELVA_BACKGROUND_WORK_RELEASE`.
  - `website-domain-verification` runs every minute.
  - Cron freshness is tracked through `CRON_MAX_AGE_SECONDS` in `src/lib/heartbeat.ts`.
  - Vercel's docs now say 100 crons per project and per-minute scheduling on Pro. An older limits page said 40. The current figure comes from search snippets and is unconfirmed: [usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing).
- **CI:**
  - Five workflows: `ci`, `security`, `launch-verification`, `preview-nightly`, and `release`.
  - Node 22 and pnpm 10.34.5 are pinned in the workflows only. There is no `.nvmrc` and no `engines` field.
  - The dev machine runs Node v26.8.2, and the prepared-parent doc records an observed Node 24.19.0.
  - `ci.yml` hardcodes a Homebrew Postgres 18 path and falls back to the runner's `pg_config`. The Supabase config pins major version 17.
  - Local SQL proof therefore runs against Postgres 18 and hosted CI against whatever the runner ships. Managed Supabase is on 17. I did not read the runner's Postgres version.
  - `security.yml` scans with `zricethezav/gitleaks:latest`, which is unpinned.
  - `testing-and-ci.md` records the Actions budget block of 2026-08-01 as historical only.
- **Verification factory** (prepared parent `c4c28d5`, plus `.scratch/full-model-completion-2026-10-09`):
  - `check:ci` strips provider env variables.
  - `rehearse-database-restore.ts` takes a snapshot-consistent dump, restores it into a fresh database, and compares row counts. It is local-only unless Jacob gives a yes.
  - `release-safety/*` runs forward, reverse, forward migrations on a private Postgres 18 cluster.
  - `local_proof_runner.py` has source-equality and Git-admission rules.
  - A 10 GiB disk floor refused the native run (`native346-7bd-disk-refusal.json`).
  - ENOSPC (disk-full) errors recurred on mobile traces.
  - The local Docker, Auth, and Postgres stack stalled with an unknown cause (`runtime-stack-health-406`).
  - The successor `0de15774` unit run recorded 11,367 passed, 43 failed, and 1 unhandled error. The next run was refused before any test dispatched ("Alternate/grafted Git object view").
  - Native, Auth, build, and full units remain unrun.
- **Backup and restore, observed vs. proposed:**
  - Observed: a dump and local restore on 2026-10-07 matched 146/146 tables and 2,603 rows.
  - Observed: production PITR (point-in-time recovery) was off with no listed backups on Sept 21 (`release-1.0-packet.md`). I found no later evidence that PITR was turned on.
  - Observed: Redis recovery is described only by key family. The runbook never says "restore" for Redis.
  - Proposed: the quarterly restore drill, which covers content snapshots only.
- **Monitoring:**
  - Sentry is wired with private-workspace URL filters.
  - `/api/health` returns degraded as HTTP 200.
  - `incident-and-status.md` says the watchdog's six-hour dedupe hashes `ageSeconds`, so a continuing stale cron can alert on every scan.
  - Alert destinations were never verified. The status page is not purchased. The doc recommends Instatus Pro, with limits for Jacob to confirm.
- **Performance and capacity:** I found no query-plan, `EXPLAIN`, `pg_stat_statements`, or load-test tooling. `benchmarks/` is for audit and judge quality, not for the database. The known scaling note is "queue-later at ~20+ clients" with Upstash QStash. It is not built.
- **Client repos:** Of the 9 customer repos, only `greatlakesdriedfruits` has workflows. The others have no CI, and package managers diverge (pnpm 9.15.4 appears in two repos).

## Recommended PRs

All IDs are provisional. "Local prep" can land without Jacob. "Reserved" means a live action that needs Jacob's yes.

| ID | Title | Owner repo | Exists? | Source anchors | Behavior / scope | Depends on | Acceptance evidence | Reserved live action |
|---|---|---|---|---|---|---|---|---|
| INF-1 | Toolchain pin and qualification profile | REB (clients later) | New. Also fixes `ci.yml`, `launch-verification.yml`, `check-ci.sh`. | `ci.yml:36-50`, `package.json`, `scripts/release-safety/postgres.ts:9`, `supabase/config.toml` | Add `.node-version`/`engines` and a `qualification-profile.json` that records Node, pnpm, Postgres major version and role shim, and Playwright/Chromium versions. CI and local scripts read it instead of hardcoding paths. Fail loud when the local or runner Postgres differs from the declared qualification major. Pin gitleaks by digest. | none | `pnpm check:ci` passes on the declared profile; CI log prints the profile. | Decision: qualify on Postgres 17 (matches Supabase), 18, or both. |
| INF-2 | Reusable resource-limited verification runner | REB (consumes the prepared runner) | Integrate/harden. The prepared `local_proof_runner.py` and `full-model-disk-headroom.mjs` stay as they are. | prepared parent scripts and `.scratch/…/reusable-local-verification-runner-git-admission-successor` | Productize disk-floor and free-space admission, retention of owned outputs (never of unowned generated trees), serialized heavy runs, a self-contained exact-source clone (fixes the `0de15774` graft refusal), and Docker/DB/Auth stack health preflight. Emit one receipt schema. | INF-1 | Re-run the refused `0de15774` full-units step to a pass or a named failure list. The 43 failures in `google-governed-producer-atomic` are triaged, not hidden. | Cache or output removal needs the owner's separate human approval (already recorded as a hold). |
| INF-3 | Managed Postgres compatibility gate | REB | Harden. Builds on #614 role fixes and `release-safety`. | `check-workspace-sql.sh` shim roles, `release-safety/postgres.ts`, #614 role-path logs | The local clusters use shim roles (`service_role`, `authenticated`, `anon`), not the real managed role graph. Add a read-only catalog diff (roles, memberships, default ACLs, extensions, version) between a restored production dump and the local cluster. Make the test fail when migration SQL needs a privilege the managed `postgres` role lacks, such as `SET ROLE` or `CREATE EXTENSION`. | INF-1 | Catalog diff artifact for a restored dump; one migration run through the diff. | Reading the live catalog needs Jacob's yes. A local restored dump does not. |
| INF-4 | Restore drill v2: Postgres, assets, identity | REB | Extend `rehearse-database-restore.ts`. | rehearsal script, `where-things-live.md` drill, `persistence-boundaries.md` | Extend beyond row counts to: referential checks, `auth.users`/membership parity, secret decrypt with `SECRETS_ENC_KEY` (the data contract), and an asset manifest (Blob/media URL reachability and hash on a sample). Record measured RTO from a real restore, not a stated "minutes". | INF-3 | Receipt with timings and a verified decrypt on the restored copy. | Production PITR decision (below). A fresh production dump needs a yes. |
| INF-5 | Redis authority classification and recovery drill | REB | New. Builds on the "cache vs. authority" table. | `persistence-boundaries.md`, `rollback.md:67-71`, `redis.ts`, `count-client-redis-keys.ts` | Make the table machine-readable: for each key family, one of rebuildable, mirrored to Postgres, or authoritative with a stated loss window. Add a check that fails on a new `reb:` or `getRedis` key family missing from the manifest. Include the `KEYS` fallback in `revenue.ts` as a tracked item. Add a local Redis loss/restore drill against the real-Redis harness #606 uses. | none | Manifest check in CI; drill receipt showing which features degrade. | Upstash backup setting and any restore into production: reserved. |
| INF-6 | Private telemetry and alert hygiene | REB | Harden. Integrate with #608. | `heartbeat.ts`/`platform/infra/monitoring.ts`, `incident-and-status.md` | Fix watchdog dedupe so a continuing stale cron does not re-alert on every scan. Make `/api/health` distinguish degraded in the body and in a status field that monitors can key on. Add structured log fields with a redaction test (tenant, request, cron). Add a synthetic "alert delivered" test hook. | #608 | Unit and integration tests; a staged alert received (reserved). | Alert destinations, Sentry/Slack credentials, Log Drain choice, and the status page purchase (Instatus Pro ≈ $20/month list per the prepared doc, unconfirmed). |
| INF-7 | Query-plan and capacity baseline | REB | New | `src/lib/db/repositories.ts`, migrations (97 files), hot read paths `/api/v1/content`, lead intake, `workspace-work` | Seed a synthetic dataset at 10x and 100x the current 14 tenants / 2,603 rows, run `EXPLAIN (ANALYZE, BUFFERS)` against the top ~15 queries on a local cluster, and capture index use and p95 latency. Reuse #606's real-Redis harness for concurrency (8,078 requests at 24 concurrency is a measured precedent). | INF-1, INF-3 | Versioned plan artifacts and a threshold table. Missing indexes become separate migrations, not this PR. | None, as long as it is local. A production `pg_stat_statements` read is reserved. |
| INF-8 | Cron/executor reliability contract | REB | Harden the existing executor. A queue is not introduced here. | `vercel.json` (27), `workspace-work/route.ts`, `work-execution/*`, `CRON_MAX_AGE_SECONDS` | Test that every `vercel.json` cron has a heartbeat entry and a `requireCronRequest`. Add a lease/idempotency/timeout contract test for `sweepDueWork` (maxDuration 60 vs. batch size). Measure how long the longest cron takes at 100x data from INF-7. | INF-7 | Contract test; measured duration per cron. | None. Enabling `STRELVA_BACKGROUND_WORK_RELEASE` is Jacob's. |
| INF-9 | Client-site CI baseline | Each client repo (see decision) | New for 8 of 9 repos | `greatlakesdriedfruits/.github`, `custom-repo-starter/`, `check:custom-repos` | Template workflow (lint/type/build + contract conformance against `/api/v1`), plus pinned pnpm and Node. Roll out through the starter first, per the "starter first" rule. | INF-1 | `check:custom-repos` passes with the template against GLDF and Rohlax. | Writing to a live client repo or its Vercel project settings: reserved. |
| INF-10 | Release/promotion pipeline hardening | REB | Harden `release.yml`, `preview-nightly.yml`, and #616. | `release.yml` (manual gate string), `launch-verification.yml` | `release.yml` today trusts a typed choice (`check-release-passed`). Require a matching signed receipt from the INF-2 runner for the exact SHA. Add a "deployed artifact == tested artifact" assertion step and a rollback pointer. | INF-2, INF-4 | Dry-run workflow against a non-production tag. | Every production deploy, env change, and migration. |

I count 10 PRs. INF-4 and INF-5 could each be split if review size demands.

## Technology comparisons: evaluate, don't adopt

- **Durable queue or workflow:**
  - Vercel Queues is the lower-level layer and Vercel Workflow sits on it. Delivery is at-least-once. Docs list 7-day maximum retention and a 60-minute visibility timeout. The sources are [Queues](https://vercel.com/docs/queues), [pricing](https://vercel.com/docs/queues/pricing) and [Workflow pricing](https://vercel.com/docs/workflows/pricing). I could not confirm the included tier, GA status, or the SDK default timeout.
  - Upstash QStash is already named in `where-things-live.md`.
  - Postgres-native alternatives (Supabase Queues, pg-boss) would keep state in the system of record, but I did not research them.
  - The existing evidence supports none of these yet. The current executor already has leases and idempotency, and the real ceiling (Vercel's 300s function timeout and about 20 clients) has not been measured. Revisit after INF-7 and INF-8 produce numbers. Adding a dependency needs Jacob's yes in any case.
- **PITR:** Supabase's add-on is $100/month for 7 days and $200 for 14. Automatic backups: none on Free, 7 days on Pro. It covers Postgres only, not Storage files or secrets. [Pricing](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery), [backups](https://supabase.com/docs/guides/platform/backups). Whether the production plan includes PITR now is unknown.
- **Redis backups:** Upstash daily backup keeps 1 or 3 days, and a restore wipes the target first. [Docs](https://upstash.com/docs/redis/features/backup). Time of day and the plan that applies are unconfirmed.
- **Defer:** a self-hosted worker fleet, a dedicated observability platform, and moving off Vercel crons.

## Decisions that are Jacob's

1. Turn on production PITR (≈ $100/month at 7 days) and Upstash daily backup, or accept a 24h RPO from the content snapshots only.
2. Qualification Postgres: 17 only, or 17 and 18.
3. Status page and paging destination.
4. A log drain or private log store. Raw logs may contain tenant data.
5. Adding any queue dependency, and Vercel Sandbox ($1 authorization for up to 100 builds, already proposed in #334).
6. Whether client-repo CI lands through the starter (no live write) or directly.

## Disagreements and unknowns

- **Cron count** is 27 on `vercel.json` at HEAD. The prepared parent adds `client-records-parity`, so it has more. The two trees also keep `heartbeat.ts` in different places (`src/lib` vs. `src/platform/infra`). INF-6 and INF-8 must be written against whichever tree #616 becomes. Check this before implementing.
- **Current production state** (PITR, backups, Redis plan, alert destinations, Postgres minor version) is unknown. I did not read it.
- **CI minutes:** whether the hosted Actions budget currently funds runs is unverified. Local proof cannot stand in for a hosted run.
- **Local Docker/Auth instability** has an unknown cause. I won't link it to ENOSPC.
- **Vercel numbers** (100 crons, queue retention) come from search snippets. Verify on the live pages before a plan depends on them.
- **Overlap:** #606 (rate-limit fallback and the real-Redis harness), #608 (domain-health storage moves to platform infra), and #614/#615 (roles, build prerender) touch the same files as INF-3, INF-5, and INF-6. Land or rebase those first.

**Next move:** INF-1 then INF-2. A pinned profile and a runner that survives the disk floor unlock everything else, and the refused `0de15774` full-units run needs both before its native result can count.

Sources: [Vercel cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing), [Vercel Queues](https://vercel.com/docs/queues), [Queues pricing](https://vercel.com/docs/queues/pricing), [Workflow pricing](https://vercel.com/docs/workflows/pricing), [Supabase PITR](https://supabase.com/docs/guides/platform/manage-your-usage/point-in-time-recovery), [Supabase backups](https://supabase.com/docs/guides/platform/backups), [Upstash backup](https://upstash.com/docs/redis/features/backup)

Security and assurance
# Security lane: recommended PR inventory (REB)

Everything below is static reading of source and PR descriptions. I ran no tests, builds, installs or production reads, and edited nothing. PR evidence (9,093 tests, native SQL, etc.) is the authors' claim, not re-verified. Your dirty tree changes `safe-fetch.ts`, `pinned-public-text.ts`, `public-website-source.ts` and `leads/[tenant]/route.ts`. I treated those as another task's work.

## Reconciliation of the existing security PRs

| PR | State | Verdict |
|---|---|---|
| #614 | Draft, one-way migrations 38/39, 4.5k lines | Review and integrate. Covers #251 and #528. Don't reimplement. |
| #615 | `/admin/digests` set to `force-dynamic` | Integrate. It depends on #614 and is a build-only fix. |
| #606 | Lead limiter outage fallback, plus a local abuse harness | Integrate. Fixes only `v1/leads`. |
| #607 | Backfill CLI store guard | Integrate. Tooling only. |
| #608 | Provider health alerts, migration `20261020143000` | Review. It's monitoring, not hardening. Keep it out of the security gate. |
| #609 | Closed | The fix is already in `reborn-1.0` (`4afd7c28` is an ancestor; #614 still says "stays in PR609"). |

**Structural finding (observed).** The security line (`release/security-runtime-20261007`) and `reborn-1.0` have diverged. The merge-base is `e9ac136f9`. The security line has 54 commits that `reborn-1.0` lacks, and `reborn-1.0` has 562 that it lacks. Both touch `release-safety/batches.json`, `check-workspace-sql.sh`, `readiness-snapshot.ts`, `route-handlers.test.ts` and `AGENTS.md`. #616 ships `reborn-1.0` to main, and none of the five security PRs target it. So the consolidated release as it stands doesn't contain the security repairs.

## Proposed PRs

**SEC-0. Carry the security line into `reborn-1.0`** — REB, new (integration of #614, #615, #606, #607 and, if wanted, #608)
- **Scope:** a merge or rebase onto `reborn-1.0`. Resolve the shared-file conflicts. Re-pin `batches.json` and order migration 38/39 ahead of their runtime callers.
- **Dependencies:** needs your decision on the release train. Blocks every other SEC PR that touches shared files.
- **Acceptance:** the combined ordered-migration fresh-schema and retained-row-upgrade checks. `check:boundaries`, the full suite and typecheck. The #615 build record rerun with its no-upload variant. The test-first PRs below depend on the unit suite staying green here.
- **Needs you:** which branch ships (see Unknowns). #614 is a one-way door.

**SEC-1. Versioned secret envelope and real rotation** — REB, new
- **Anchors:** `src/lib/crypto/secrets.ts`. A single SHA-256 of the env string is the key, with no key id in the `enc:v1:` envelope. Writes are plaintext when the key is unset. `scripts/backfill-secret-encryption.ts` has no old-key support (grep for old/rotate/prev returns nothing).
- **Mismatch (observed):** `docs/operations/secret-rotation.md` says to run the backfill "with both the old and new key set". The code can't do that.
- **Scope:** an additive `enc:v2:<kid>:` envelope with a keyring. `enc:v1` stays readable and the `SECRETS_ENC_KEY` name stays frozen. Production writes fail closed when no key is set. Per-row decrypt isolation, so one bad row can't take down `loadTenants`. A backfill with a counts-only dry run.
- **Dependencies:** none, uses Node `crypto` and adds no dependency.
- **Acceptance:** tests for two-key rollover, tamper, missing key and mixed-state tables. Rehearse the rotation on a scrubbed copy per `scrubbed-production-copy.md`, not production.
- **Needs you:** minting a key, any env change, and the production backfill.
- **Defer:** KMS or Supabase Vault envelopes.

**SEC-2. One guarded outbound fetcher** — REB, new
- **Anchors:** two guards exist. `safe-fetch.ts` is literal-host only and says DNS rebinding is not mitigated. It guards `revalidate-client.ts`, `custom-request-client.ts` and `site-capabilities.ts`, which attach HMAC or bearer secrets. `public-url-safety.ts` plus `pinned-public-text.ts` resolve and pin the IP. Unguarded: `domain-monitor.ts:143,214`, `live-preview/route.ts:35` and `edit-preview/route.ts:82`.
- **Hypothesis:** an admin- or owner-set hostname that resolves to a private address at fetch time bypasses the literal check.
- **Scope:** move the credential-bearing and preview fetches onto the pinned path, keep `redirect: "manual"`, and add an inventory test that fails on a new raw `fetch(` of a config-derived URL.
- **Acceptance:** a stubbed DNS answer (public name → private IP, mixed answers, redirect to metadata, IPv6 forms) refused on every site. Sequence it after your in-flight changes to the same files.
- **Defer:** an egress proxy or static egress IP.

**SEC-3. Live and edit preview isolation** — REB, new
- **Anchors:** `src/lib/preview-html.ts:13-16` strips `<script>` with a regex. `src/proxy.ts:298-306` gives live preview `script-src 'self' 'unsafe-inline' 'unsafe-eval' https:`. `SitePreview.tsx:218` loads it in an iframe with no `sandbox` attribute (grep found none). The route serves the fetched HTML from the app origin.
- **Hypothesis, unreproduced:** a hostile or compromised client site using `<img onerror>` or `javascript:` runs script on the app origin when an owner or operator opens the preview. Write the failing test before claiming it.
- **Scope:** serve the preview under a sandbox policy. `website-preview-policy.ts` is the local model. Allow only the edit bridge, by hash or nonce, and sandbox the iframe.
- **Acceptance:** a Playwright probe with a hostile fixture shows no cookie or API access, and the edit bridge still works.
- **Needs you:** a separate preview origin would need DNS, so prefer the sandbox route. DNS and domain changes need your yes.

**SEC-4. Public-abuse policy consistency** — REB, new, built on #606
- **Anchors:** `v1/bookings/[tenant]/reservations/route.ts:19` and `v1/track/[tenant]/route.ts:116` fail open when the limiter throws. In production, `rate-limit.ts` throws on a Redis failure. #606 bounds only `v1/leads`.
- **Scope:** one declared outage policy per public endpoint (bounded fallback vs. deliberate fail-open). Audit `/api/booking`, `newsletter/subscribe`, `audit/lead`, `access-request/intake` and `pay/*`.
- **Acceptance:** a limiter-throws test per route with an admitted-count bound, reusing the #606 harness.
- **Needs you:** Turnstile (#384) is an external account, a new env var and a change to client-site forms. Defer it.

**SEC-5. Webhook replay and idempotency** — REB, new
- **Inspected and fine:** Resend (svix verification before parsing, bounded body, reconciler). Stripe (signature, plus a Redis claim that fails closed in production).
- **Calendly gaps (observed):** `webhooks/calendly/route.ts` has only a 5-minute timestamp window and no event-id dedupe. `t=` is read as the first signature part. A failed `addEvent` is acknowledged with 200, so the booking event is lost. An unknown tenant returns 400, which invites retries. The tenant lookup falls back to a Redis `SCAN`.
- **Stripe gap (inferred):** idempotency lives only in Redis. `markEventProcessed` swallows errors, so a 5-minute stale claim could reprocess an event.
- **Scope:** Calendly dedupe and a durable failure path. Stripe handler idempotency tests. A Postgres event ledger is optional and gated.
- **Needs you:** first confirm whether Calendly is still used. Retiring it might beat hardening it. A Postgres ledger needs a migration yes.

**SEC-6. Generated-app isolation conformance suite** — REB, new, mostly test-only
- **Anchors (observed):** `custom-applications/sandbox.ts` uses an opaque-origin iframe, `connect-src 'none'`, and `navigate-to 'none'`, which the file's own comment says Chromium doesn't enforce. `build.ts` uses Docker with `--network=none`, a read-only filesystem and a digest-pinned image. Docker can't run in a Vercel function, so a production build path doesn't exist yet (#385).
- **Scope:** probes for fetch, WebSocket, form submit, `window.open`, top and self navigation, postMessage and CSS/link beacons. Cover Chromium, Firefox and WebKit. Add a CSP-string snapshot test.
- **Defer:** the Vercel Sandbox build path. That needs `@vercel/sandbox` (a new dependency, so it needs your approval) plus an account and billing decision.

**SEC-7. Data lifecycle registry** — REB, new, in two parts
- **Part 7a (no policy needed):** a PII-store registry, with a test that every PII-bearing table or Redis key family in `persistence-boundaries.md` declares retention, export and erase. Unknowns are recorded as `unspecified`, not guessed. Cover leads, bookings, inquiries, newsletter contacts, audit reports (60-day Redis bearer records) and mail logs.
- **Inspected:** workspace exit and export exist (`src/platform/workspace-exit`, `workspace-exports`). I found no end-visitor erasure path. #477 notes receipts are kept forever.
- **Part 7b:** the erase executors, which wait on retention policy (#477, #411).
- **Unverified:** whether logs or Sentry carry PII. `logger.ts` and `sentry-context.ts` show no redaction.

**SEC-8. Route authority manifest** — REB, new, extends `tenant-isolation-guard.test.ts`
- **Anchors:** the existing guard keys only on `getTenantFromHeaders` and `requireTenantFromHeaders`, and is textual. About 30 of the 254 routes match none of my authorization patterns, for example `workspace-exit`, `documents`, `operations` and `bounded-work`. I did not read them, so this is not a defect finding.
- **Scope:** classify every route (public, cron, webhook, member, operator, workspace-actor) in a manifest. Fail the build on an unclassified route. This closes the audit-by-reading gap that #614's 17-power inventory only partly covers.
- **Acceptance:** per-class negative tests for a viewer, a wrong workspace and a revoked actor.

## Unknowns and disagreements

- **Release train:** is the shipping branch `reborn-1.0` (#616) or the security release line? The second option leaves SEC-0 as the only path.
- **`SECRETS_ENC_KEY` in production:** `secret-rotation.md` says active since 2026-07-15. The 2026-10-06 publishing spec lists it as unchecked. Reading env var names needs your yes.
- **Docs vs. code:** the rotation runbook describes an old-plus-new-key backfill that the script can't do.
- **Build:** #614 couldn't complete a production build. #615's passing build used a no-upload variant. Treat the build as unproven until SEC-0.
- **Not examined:** Supabase hosted RLS state, PostgREST exposure, Vercel Firewall, and client-site repos for `x-reb-*` replay. Only the starter's timestamp window was checked.

## Order

SEC-0 first. Then SEC-2 and SEC-3 together, since both touch the preview routes. SEC-1, SEC-4 and SEC-8 are independent of those. SEC-5, SEC-6 and SEC-7a follow. SEC-7b waits on policy.

Client delivery, integrations and commerce
# Strelva client, contract and money infrastructure: recommended PR inventory (11 PRs)

I ran no tests, builds, fetches or production reads, and edited nothing. Everything below is from reading source, PR descriptions and `gh pr` metadata at HEAD 789a3859.

## Observed facts that shape the plan

**Contract coverage**
- **Missing table entries.** `V1_ROUTE_CONTRACTS` (`scripts/custom-repo-v1-contracts.ts:41`) has six entries: leads, track, spam-pit, content, page-config, site-capabilities. The `inquiries`, `bookings` (+`reservations`, `readback`) and `collections` routes exist under `src/app/api/v1/` but are absent from the table.
- **No real consumers.** A grep of the nine client repos found no client calling inquiries, bookings or collections. Only the starter does.

**Client repos**
- **Local HEADs vs pins.** The manifest pins differ from the local HEADs. gldf is at 86be10a against pin fd088c5 (the manifest says 10 ahead plus 1 local-only). rohlax is at 9ed876b against pin 00e4323 (16 ahead). Seven repos are at their cached `origin` plus one agent-context commit. The cached remote refs are unfetched, so I can't tell what is deployed.
- **Dirty trees.** All nine working trees are dirty (2–14 files) with another task's changes.
- **Missing manifests.** Seven of the nine have no `release-manifest.json`.
- **Tracker copies.** `ScaffoldTracker.tsx` is byte-identical (211 lines) in five client repos and the starter, so hash-verified copying is cheap.
- **Client-owned credentials.** gldf and rhm hold their own Stripe keys, and gldf has its own Supabase (17 files). Strelva does not hold these credentials.

**Credentials and effects**
- **Redis connections.** Tenant Google, Calendly and Instagram tokens live in Redis at `connections:{tenant}:{provider}` (`src/lib/connections.ts`, `docs/architecture/persistence-boundaries.md:48`). Encryption is inert until `SECRETS_ENC_KEY` is set.
- **Workspace calendar.** The workspace calendar connection is in Postgres (`persistence-boundaries.md:27`).
- **Readback.** Calendar accepted-but-readback-failed recovery is coded (`src/products/scheduling/calendar/service.ts:306-511`). GBP writes carry readback evidence strings (`src/lib/gbp-management.ts:367-391`).

**Billing and Versions**
- **Stripe webhook.** `src/app/api/billing/webhook/route.ts` handles five event types. A search of `src` outside tests found no `charge.refunded` or dispute handling.
- **Version store.** The Version store on this branch is in-memory only (`src/platform/system-versions/store.ts:32`).
- **Prepared parent.** `c4c28d5` has `src/platform/connect/refunds.ts`, `supabase/migrations/20261020090010_money_reconciliation.sql`, durable Version stores and 611 migrations. This branch has 97.

**PR state**
- **#616.** It is CONFLICTING/DIRTY against `main`, and its check rollup came back empty.
- **#204 and #206.** Both target `main`, are DIRTY, and have failing `build` and `review` checks.
- **Two integration bases.** #614, #615, #608, #607 and #606 target `release/security-runtime-20261007`. #618–#621 target `reborn-1.0`.

## Inventory

IDs are provisional. "New" means no PR yet. I don't rebuild prepared capabilities.

**CL-01 · REB · New · Complete the `/api/v1` contract table, add an additive-only guard**
- **Scope:** Add inquiries, bookings (+reservations, readback) and collections to `V1_ROUTE_CONTRACTS`, with request/response fixtures from `custom-repo-starter/{inquiry-client,booking-client}.ts` and the existing `src/__tests__/custom-repo-v1-contracts.test.ts` runtime half. Add a golden snapshot of route field and status shapes that fails on removal or rename.
- **Check first:** `custom-repo-conformance.ts` may already cover part of the additive-only guard. I didn't read it fully.
- **Depends on:** none.
- **Evidence:** `pnpm test` on the contract suite, `pnpm check:custom-repos`, and a deliberately breaking diff that the guard fails.
- **Gate:** merge only. No production effect.

**CL-02 · REB · New · Make the client census hermetic and reconcile pins**
- **Scope:** `check:custom-repos` reads sibling checkouts. #616 reports 4 checks skipped for missing manifest siblings. Fetch each repo at its pinned SHA in CI so nothing skips, and refresh `release-manifest.json` pins.
- **Depends on:** a deployed-SHA census (Vercel project source metadata). That read needs your OK.
- **Evidence:** a CI run with 0 skips, plus a table of pinned, origin and deployed SHAs for all nine.
- **Gate:** merge is safe. Writing "compatible" pins that aren't deployed is not.

**CL-03 · REB `custom-repo-starter/` · New · Hash-pinned adapter set**
- **Scope:** A `starter-adapters.json` listing each shared file's content hash and version. Conformance checks client copies against it. Add a sync script that opens per-repo PRs.
- **Depends on:** CL-01.
- **Evidence:** the tracker hash matches in 5 repos today; the test fails when one is edited.
- **Gate:** merge only.
- **Defer:** an npm package. Adding a dependency needs your call.

**CL-04 · Nine client repos · New · Baseline adoption train (nine repo-owned PRs in three waves)**
- **Wave 1, direct mail only:** vermont-unlimited, cocard-anderson (spam-pit only).
- **Wave 2, tracker only:** leslie-bookkeeping, smokin-buddha, orange-crate-brewing.
- **Wave 3, stateful:** mclears-cottage (leads), rhm-innovations (content + own Stripe), rohlax-wellness, gldf (own Stripe + Supabase).
- **Scope per repo:** add `release-manifest.json`, `.env.example` entries and fixtures; replace the copied tracker with the hash-verified one. No behavior change.
- **Depends on:** CL-02 and CL-03.
- **Evidence per repo:** the repo's own check, plus an unchanged critical read journey (content, assets, forms, redirects) per the horizontal release checklist.
- **Gate:** each repo PR can merge to its default branch. A production deploy of any of them is yours to approve. Work from clean worktrees so the dirty files stay untouched.

**CL-05 · REB · Existing #204 · Integrate hosted publishing, domains and assets**
- **Scope:** Retarget #204 from `main` to `reborn-1.0` and rebase. The `build` and `review` failures need diagnosis. Re-check migration `20261003…` numbering against the 611-migration parent.
- **Anchors:** `website_publications`, `publish_website` and `read_live_website`; `src/proxy.ts` sites-host rewrite; the hosted-site route's own CSP and no-cookie behavior.
- **Add:** hosted pages must use the CL-01 contract through `website-generation/capability-runtime.mjs`.
- **Evidence:** CI green, a take-offline and republish journey, a workspace-exit check.
- **Gate:** merge with `STRELVA_SITES_DOMAIN` unset. Setting it needs wildcard DNS, which is your decision.

**CL-06 · REB · New · Connection and credential ownership ledger**
- **Scope:** A typed record of who authorized each Google, calendar, email and Stripe connection, which account and scopes, who can revoke, and where the secret lives. This covers tenant Redis connections, workspace Postgres calendar connections, and the client-held Stripe/Supabase of gldf and rhm. Include a read-only census script and map `needs_reauth` (ontology-phase5).
- **Depends on:** check the prepared parent first. It has `provider_seats` and a Postgres-backed connection design.
- **Evidence:** census output on a scrubbed copy.
- **Gate:** the census touches production Redis and needs your OK. Whether `SECRETS_ENC_KEY` is set in production is unknown, and moving tokens is a production data fix.

**CL-07 · REB · Existing work · Provider-effect settlement conformance and reconciliation**
- **Scope:** One failure-path matrix, run against the calendar service, GBP writes, Resend email and Vercel domain operations. It asserts that accepted writes are never retryable, a failed readback stays separate, and a reconcile cron is registered in `CRON_MAX_AGE_SECONDS`. Extract shared code only where the matrix shows real duplication.
- **Depends on:** #608 (provider alerts) and #620 (website attempt settlement).
- **Evidence:** the matrix, and a cron registered in the heartbeat.
- **Gate:** merge only. Proving it with a real provider is a separate authorization.

**CL-08 · REB · Integrate prepared lane · Stripe event ledger, rollover, refunds, payer separation**
- **Scope:** Promote the prepared money reconciliation and refund code in dependency order rather than rewriting it. Add replay-fixture tests for period rollover, duplicate events, grandfathered gldf/rohlax, and agency-paid versus business-paid. Add a refund/dispute event path that records and moves no money.
- **Depends on:** #614 base ordering and the prepared parent.
- **Evidence:** `check:workspace-sql`, `check:workspace-upgrade`, webhook replay tests.
- **Gate:** adding Stripe webhook event types is a Stripe change and needs your yes. Refund policy, liability, fees and prices are yours and stay unselected.

**CL-09 · REB · New proof · Nine-client conversion dry run with lineage and attribution**
- **Scope:** Run `scripts/convert-tenant-to-workspace.ts` on a scrubbed copy (`scrubbed-production-copy.md`) for all nine. Show each site becoming a System with leads, domains, history, billing state, agency attribution and Version lineage intact.
- **Depends on:** the prepared durable Version stores, #618, and CL-06.
- **Evidence:** per-client before/after counts.
- **Gate:** a production read for the copy needs your yes. The conversion itself isn't authorized. Attribution rates and the partner agreement are yours.

**CL-10 · REB #206 plus IDX repos · Existing + new · Home Finder as a gated candidate adapter**
- **Scope:** Rebase and integrate #206, which refuses install until four gates are met: authorized brokerage pilot, inventory rights, verified inquiry delivery, customer-owned handoff. Add contract fixtures to the chosen IDX runtime shaped like the inquiries route. No activation.
- **Gate:** merge keeps it uninstallable. MLS/Trestle rights, the brokerage agreement and pricing remain outside code.

**CL-11 · strelva-tools · New · Extension release hygiene as a candidate collector**
- **Scope:** Reconcile docs against the published 2.1.0 listings, ship the local Schema 2.1.1 fix, and run the Playwright regression. Write a permissions contract: today they use `activeTab` and `scripting` only. Any Strelva collector needing host permissions triggers store re-review and user re-consent.
- **Gate:** store submission is yours. Install and use evidence is unproven.

## Sequence and gates

1. **Merge-only, `reborn-1.0`:** CL-01, then CL-02 and CL-03 in parallel.
2. **Needs the security base to land first:** CL-07 and CL-08 wait on #614 and #608, which target `release/security-runtime-20261007`. Decide whether that base merges into `reborn-1.0` or the reverse.
3. **Needs your yes before the work, not just before deploy:** CL-02's deployed-SHA read, CL-06's census, CL-09's scrubbed copy.
4. **Rollout gates (production deploy):** CL-04 per client, CL-05 DNS, CL-08 Stripe events, CL-11 store submission.

## Disagreements and unknowns

- **Base branch.** #616 is `reborn-1.0` into `main` and conflicting. Three bases are live. I recommend targeting `reborn-1.0` and flagging #204 and #206 as stale-based, but another lane may own this call.
- **Prepared parent gap.** `c4c28d5` is about 500 migrations ahead of this branch. CL-08 and CL-09 depend on whoever sequences that promotion, and exact-source `0de15774` still has native, Auth, build and full-unit runs outstanding.
- **Deployed vs pinned.** Unknown without a Vercel read.
- **Which 4 checks #616 skipped.** Unknown.
- **Two Home Finder runtimes.** `strelva-idx-ops` (SQLite, single-writer, pilot) and `strelva-idx-dashboard-demo` (Trestle/Supabase/Resend, synthetic) overlap. Its CONTEXT.md says neither is a chosen replacement, so CL-10 can't pick a runtime for you.
- **Client dirty trees.** The working changes belong to another task. I recommend not touching them.

## Larger alternatives to defer or evaluate

- A shared `@strelva/site-kit` package, after two clients need inquiry or booking adapters (the AGENTS.md threshold).
- Consumer-driven contract testing or generated clients in place of the hand-written table.
- A `/api/v2` family, only if v1 can't stay additive.
- Supabase Vault or KMS for connection secrets.
- Stripe Connect for gldf and rhm's own merchant accounts, which the prepared lane already scopes.
- Vercel multi-tenant platform routing for hosted sites, versus one project per site.
Experience:
**Recommended inventory: 9 PRs, 1 integration plus 8 new.**
- **Inspected:** I read PR bodies and changed-file lists for #616 and #618–#621, and `origin/reborn-1.0` source and docs.
- **Not run:** no tests, builds or remote reads. I only listed the prepared parent `c4c28d5` and did not open successor `0de15774`.
- **Source base:** the dirty local checkout is behind `origin/reborn-1.0` and lacks the MCP and Ask code. For example, `src/app/api/agent/route.ts` is 1,624 lines locally and 311 on `reborn-1.0`. All anchors below are `reborn-1.0` paths.

## Inventory

**SP-00. Land #618, #619, #620, #621 into `reborn-1.0` (REB, integrate and review)**
- **Order:** #618, then #619, then #621, then #620. #619 and #621 both touch `WorkspaceApp.tsx` (#621 says only imports and render regions overlap). #620 changes the `websites/` rebuild files, whose public props #621 also depends on.
- **Anchors:** `docs/architecture/deepening-2026-10-09/` (PRDs and failure logs), `src/platform/workspaces/location.ts`, `src/experience/workspace/OpenedWork.tsx`, `src/experience/websites/website-attempt.ts`, `src/platform/system-versions/service.ts`.
- **Evidence:** all four heads merged in sequence, then one combined run of their targeted suites and their 1440/390/320px browser specs on the merged tree. Each PR currently proves only its own head.
- **Decision:** none new. These stay local-fixture proof, with no Auth or production claim.

**SP-01. One journey matrix: marketing, public result, Auth, then owner, agency or operator (REB plus strelva-marketing, new)**
- **Anchors:**
  - `strelva-marketing/src/components/session/SessionLanding.tsx:62` POSTs cross-origin to REB `src/app/api/public-continuation/route.ts`.
  - Existing specs: `tests/marketing-*-authenticated-local.spec.ts`, `public-continuation-*.spec.ts`.
  - Harness: `pnpm check:journeys` from the w6/journeys stream.
- **Behavior:** a written actor × System-kind matrix (owner, agency, operator × website, inquiry, booking, proposal, tracker). Each cell is a spec or an explicit "not supported", and a count checker enforces it. The run uses a built marketing app, a real local Supabase Auth sign-in, and the `reborn-1.0` flags on and off.
- **Depends on:** SP-00.
- **Evidence:** the matrix run with counts, plus retained failures.
- **Decision:** a production Auth journey needs your yes.
- **Unknown:** the Oct 7 finding that ten STABLE readers fail through supabase-js. I did not verify it was fixed.

**SP-02. Shared surface-state harness and visible acting context (REB, new)**
- **Anchors:** the bespoke 1440/390/320 harnesses in #619, #620 and #621 (`tests/release-workspace-navigation.spec.ts`, `tests/opened-work-composition.spec.ts`), `docs/design/component-system.md`, `src/experience/workspace/agency/AgencyClientAvailability.tsx`.
- **Behavior:**
  - Extract one Playwright helper that runs the empty/loading/error/read-only/permission matrix, focus order, reflow and foreign-traffic checks.
  - Specify one acting-context contract: business, actor and role always visible, announced on business or client switch (ADR 0013).
  - Inspect existing components first; I have not checked whether this already exists.
- **Decision:** adding axe-core is a new dependency, so I need your yes. Without it, use Playwright aria snapshots.
- **Evidence:** the helper reproduces the failing System→switch-business case from #619, and the component doc is updated.

**SP-03. Single availability and capability resolver (REB, new)**
- **Anchors:**
  - Six declarations of what exists. The capabilities README lists them as "no single registry"; that text is from the working tree and unchecked on `reborn-1.0`.
  - Release flags read inline as `process.env.STRELVA_*` (the counts are `git grep` lines, not unique files).
  - A separate `src/platform/release-flags/` store.
  - Drift already shown by `docs/operations/native-agent-booking-availability-2026-10-09.md`.
- **Behavior:** one `resolveAvailability(subject, scope)` that returns available, unavailable or unknown with a reason. It reads the env flag, the release-flag store and the qualification record. Ask, the MCP directory, the workspace projection and the operator console all consume it. A ratchet baseline, like the existing boundary baseline, blocks new inline flag reads. The README capability table is generated from the registry.
- **Evidence:** a contract test over every flag and the baseline check.
- **Decision:** none for code. Any flag value change stays a production env yes.
- **Do not rebuild:** w6-catalog and the prepared Systems catalog. Consume them.

**SP-04. One tool descriptor across Ask, MCP and agent-access (REB, new)**
- **Anchors:**
  - `src/lib/agent-shared.ts` and `src/lib/agent/chat-tools*.ts`.
  - `src/platform/ask/tools.ts` and `tenant-tools-adapter.ts`, which wrap the tenant tools and are already one-implementation.
  - `src/platform/agent-channel/protected-tools.ts` hand-writes JSON Schema beside Zod.
  - `src/platform/agent-access/types.ts`.
- **Behavior:** a descriptor of id, Zod input, authority, effect class (read, draft, outside-write) and approval route. It is projected to an AI SDK tool, an MCP schema (via Zod 4 `z.toJSONSchema`, no dependency) and a docs table.
- **Depends on:** SP-03 for the availability read.
- **Evidence:** a conformance test that each MCP schema equals the Zod-derived one, and that no write tool reaches a provider without governance and approval.
- **Unproven:** native-client use of the MCP at `app.strelva.com/api/mcp/public`. The doc says it is not qualified.

**SP-05. Deterministic prompt-attack suite (REB, new)**
- **Anchors:** `read_website` content marked untrusted, the patch path allow-list in `propose_website_change`, Ask credential refusal, `benchmarks/cases.ts` category H.
- **Behavior:** scripted-model tests (the AI SDK's mock language model, no spend) that push injected text through every tool-result path and assert no ungoverned write.
- **Evidence:** the CI suite fails on a seeded unsafe tool.
- **Decision:** none.

**SP-06. Live eval: source-grounding, cost per resolved, multi-provider (REB, new, gated)**
- **Anchors:** `benchmarks/` is Google-only (the `@ai-sdk/google` judge defaults to `gemini-2.5-pro`) and covers six tools. The only committed report is from 2026-05-20, and categories B, C, E and I are pending. Ask, the MCP and the rebuild have no live eval. The rebuild benchmark in `docs/capabilities/website/` should be integrated, not duplicated.
- **Behavior:** add Ask, MCP-proposal and rebuild suites with a claim-to-evidence grounding check, cost from existing model-call logging, and a provider-agnostic judge.
- **Depends on:** SP-04 and SP-05.
- **Decision (yours):** model budget and provider choice.

**SP-07. Mutation gate and hotspot ratchet (REB, new)**
- **Anchors:**
  - Biggest files on `reborn-1.0`: `dashboard/settings/page.tsx` 1,673; `ChatPanel.tsx` 1,001; seven `products/inquiries/*` files at 900–990; `proxy.ts` 902; `billing/webhook/route.ts` 879; `make-real/runner.ts` 786.
  - The coverage floor is only 52/44/50/54.
  - No mutation tooling exists.
- **Behavior:**
  - On-demand mutation runs on risk-ranked modules: `proxy.ts`, the billing webhook, `system-versions`, and website settlement.
  - Survivors become tests.
  - A shrink-only `check:hotspots` baseline modeled on `scripts/boundary-baseline.json`.
  - Do not re-split `WorkspaceApp` until SP-00 lands.
- **Decision:** Stryker is a new dependency, so I need your yes. Without it, run a seeded-mutant script.

**SP-08. Delivery floor for marketing and client repos (strelva-marketing and client repos, new)**
- **Observed in local clones:**
  - Marketing has one workflow (`launch-entry.yml`), no typecheck or unit script, and two lockfiles.
  - Only `greatlakesdriedfruits` showed CI workflows.
  - `.github/CODEOWNERS` assigns everything to `@rhinehart514`.
- **Behavior:** a typecheck, build and `check:custom-repos` pin check as a reusable workflow, plus marketing's `version:check` and product-origin spec.
- **Evidence:** a green run per repo.
- **Decision:** your yes before any PR is merged into a client repo. Remote CI state is not verified.

## Disagreements and unknowns
- **Security stack base:** #606, #607, #608, #614 and #615 target `release/security-runtime-20261007`, not `reborn-1.0`. #614 is +4,514 lines across 176 files. #616 says they are not superseded, so a landing order is owed and sits outside my lane.
- **Older PRs:** #204 and #206 target `main` from Oct 1. #206's declared offerings overlap SP-03. Rebase and re-scope them before either lands.
- **Lifetime System kind:** you chose it Oct 9, and a separate implementation stream is planned. I did not touch it.
- **Unchecked:** whether the acting-context contract in SP-02 already exists, and whether the supabase-js reader finding was fixed.

## Larger alternatives to defer
- Storybook or Chromatic visual regression.
- The official MCP SDK in place of the custom protocol.
- A flag vendor in place of the release-flags store.
- A shared marketing/app package.

Each of these adds a dependency or breaks the no-cross-repo-import rule.

**Next move:** start SP-00 and SP-03 in parallel. SP-03 doesn't touch the files the depth PRs change, and SP-00 unlocks SP-01, SP-02 and SP-07.

# Synthesis and corrections

# Review: the infrastructure PR inventory for Strelva, reconciled against `origin/reborn-1.0` at `a1306213f`

**Bottom line:** across the five lanes there are about 55 new base PRs to write. On top of that, 9 PRs already exist and need landing, 2 candidate adapters stay conditional, and 10 consumer rollout PRs go to the client repos and marketing. Most of the lanes are sound. Three of the five researchers worked partly from stale trees, though, and two of their recommendations would cause harm if followed as written:

- **Blanket merge of the security line.** It would import non-security future runtime code, and its migrations would be out of order.
- **Rebuilding money and Version durability.** Both already exist on canonical.

I checked the claims below directly against canonical. I changed no files and ran no tests, builds or production reads.

## What I verified on canonical

| Claim | Canonical fact |
|---|---|
| Base | `a1306213f` is the tip. Its commit is "Record selected lifetime System kind contract". |
| Migrations | 355 forward migrations (601 files including rollbacks). The latest is `20261022182000_booking_settings_atomic_patch.sql`. |
| Next and sharp | `next` is `16.3.8` and the `sharp@<0.35.5` override is present. No patch PR is needed. |
| System kind | Jacob selected lifetime kind on Oct 9 (`docs/architecture/deepening-2026-10-09/README.md:72-97`). Code still accepts any slug: `systemKindSchema` is a regex, and `KNOWN_SYSTEM_KINDS` is only labels (`contracts.ts:42-49`). |
| Money and durability | Canonical has `connect/refunds.ts`, `charge.refunded` and dispute handling (`connect/index.ts:111-124`), `money_reconciliation`, four `provider_seat*` migrations, `system-versions/supabase-store.ts` and `tenant_cleanup_receipts`. |
| Last owner | `platform/infra/auth.ts:255` takes a Redis `set nx ex:15` lock. The `finally` block calls `redis.del` unconditionally, so after the 15 seconds expire it can delete a lock another request now holds. The owner count runs outside any database transaction. Without Redis, production fails closed. |
| Watchdog | `cron/heartbeat/route.ts:23-28` alerts only on `stale`, and puts `ageSeconds` in the `alertOnce` context. A cron that ran recently but failed (`lastOk:false`) never pages. Per `incident-and-status.md`, a continuing stale cron can also re-alert on every scan. I did not read `alertOnce` myself. |
| Secrets | `platform/infra/crypto/secrets.ts` has one SHA-256 key and an `enc:v1:` envelope with no key id. The rotation runbook doesn't match the code. |
| Calendly | Confirmed: a 300-second window, no event-id dedupe, an unknown tenant returns 400, and tenant lookup falls back to a Redis `SCAN`. |
| v1 table | Confirmed: six entries. Inquiries, bookings and collections are missing. |

## Corrections to the researchers

1. **The security line is not a "carry everything" PR.** `security/combined-reviewed-fixes-20261008` has 63 commits that canonical lacks, from merge-base `e9ac136f9`.
   - It adds 9 forward migrations. Several are future runtime, not security: `package_declarations`, `agent_hold_ratio`, `native_website_fact_mappings`, `payer_transition_actions` and `ask_native_service_setup`.
   - Their timestamps (`20261019*`/`20261020*`) sort before 89 migrations already on canonical. Copying them verbatim breaks append-only order.
   - Carry only the security and proof subset, given new timestamps after `20261022182000`. Candidates: `content_publication_authority`, `version_live_owner_authority`, `public_business_verification`, and #608's `provider_health_alerts`.
   - Re-timestamping first requires proof that none of these are in the production ledger. That read needs Jacob's yes.
2. **The infra and client researchers worked from main `789a3859`** (97 migrations and in-memory Versions). Discard these items:
   - CL-08 "promote refunds": already there. Reframe it as replay and conformance proof only.
   - The "Version store in-memory" claim.
   - INF-7's "97 files".
   - The cron count of 27: recount on canonical.
   - The "`src/lib` vs `platform/infra`" heartbeat question: canonical uses `platform/infra`, and `src/lib` holds shims.
3. **DOM-01 is not a decision.** Kind is selected as lifetime. Enforce it for every kind (no partial lock), and grandfather existing rows after a local data inventory. The production inventory is a separate approval.
4. **"`KNOWN_SYSTEM_KINDS` omits `offering`" is a symptom, not the defect.** The defect is the open-slug schema. The closed registry has to enumerate every kind that any SQL writer emits, including `offering`.
5. **CUT-01's "86 migrations applied" is stale.** Production had 266 applied migrations on Oct 8, and the gate has to diff against that ledger.
6. **INF-10's "signed receipt."** Don't build our own crypto signing. Bind the receipt to the SHA and its digest, and use GitHub artifact attestation if provenance is needed.
7. **SP-03 merges two different things.** "What Strelva owns and has qualified" (the capability registry) differs from "what is on for this actor now" (availability). They need separate PRs.
8. **#201, #202 and #102 are design alternatives, not permission to merge.** #204 and #206 need a commit-by-commit comparison against canonical before any targeted carry.

## Omissions the researchers missed

- The Connection contract: typed permission per Connection type, checked at grant time.
- The Version lineage invariant: accepted terms survive.
- Possibility partial activation: Make real reports per part what landed.
- One invariant catalog that maps each rule to its test.
- Journeys for every current System kind with real local Auth. Fixture-auth passes don't count as Auth proof.
- Data export completeness and resumable exit.
- Operating metrics: cost per resolved job, model spend, operator attention.
- Emergency controls: a global stop on outside writes, email and background work.
- Cron deadlines measured against `maxDuration`.

## Inventory

All IDs are provisional. Every new PR targets `reborn-1.0`. "Local proof" means local or disposable runs only, never production.

### 0. Land what exists (9 existing PRs)
- **X1–X4: #618, then #619, then #621, then #620.** Acceptance: a combined targeted-suite run on the merged tree, plus the 1440/390/320 browser specs.
- **X5: security subset carry.** Rebuild from #614, keeping only security and proof commits. New migration timestamps go after `20261022182000`, and `batches.json` is re-pinned. Acceptance: `check:workspace-sql`, `check:workspace-upgrade`, `check:boundaries` and the full suite.
- **X6–X9: #606, #607, #615 and #608 retargeted onto X5.** For #615, first check whether canonical still needs it.

### A. Domain contracts (9)
- **A1: lifetime System kind enforcement.** Remove the mutable contract and add a forward trigger that refuses kind changes. Grandfather existing rows after a local inventory. Acceptance: a changed-kind refusal test, and ordinary updates still pass.
- **A2: closed kind registry with TS/SQL parity.** It records origin kinds, the writer product and resource, native eligibility, health class and what pause blocks, and it replaces seven scattered switches. Depends on A1.
- **A3: named System commands** replacing `update_business_system`, with the old RPC kept as a wrapper. Acceptance: replay tests. Depends on A1.
- **A4: Connection contract.** A typed permission per Connection type, enforced at the grant check. Its first step is a credential-ownership census that builds on `provider_seats` and doesn't rebuild it. The census of production Redis tokens needs Jacob's yes.
- **A5: Version lineage invariants.** Source lineage is immutable, accepted terms survive, and a Version is not a release. Depends on X1.
- **A6: Possibility partial-activation conformance.** Make real reports, per part, what landed, what was refused and what is unknown.
- **A7: owning-writer gate on `saveWork`.** Depends on A2.
- **A8: one `stable_id` → business → System bridge resolver.** It extends the #614 pattern. A second phase extends cleanup receipts to rename and conversion, if the gap is confirmed.
- **A9: invariant catalog.** Each product rule maps to its test, and an unmapped rule fails CI.

### B. Authority and security (10)
- **B1: atomic last-owner command in Postgres.** One SQL function locks the owner rows (`FOR UPDATE`), counts owners and demotes in one transaction, replacing the Redis lock. Cover the workspace membership path too. Acceptance: a concurrent-demotion test on the disposable cluster.
- **B2: RPC authority catalog gate.** Fails on any execute grant to `anon`, `authenticated` or `PUBLIC`, on an unpinned `search_path`, or on a function that takes the actor id as an argument.
- **B3: typed RPC boundary with a shrink-only ratchet.** Depends on B2.
- **B4: route authority manifest.** An unclassified route fails, with negative tests per actor class.
- **B5: `enc:v2:<kid>` keyring.** Production fails closed without a key, one bad row is isolated, and the backfill and runbook get fixed. Minting a key and changing env need Jacob's yes.
- **B6: one guarded outbound fetcher.** Sequence it after the dirty-tree work in `safe-fetch.ts`.
- **B7: preview isolation** via a sandboxed iframe and CSP. Start with a failing test using a hostile fixture.
- **B8: an outage policy per public endpoint**, built on #606.
- **B9: webhook durability.** Calendly gets dedupe and a durable failure path, unless Jacob retires Calendly. Stripe idempotency gets failure-path tests.
- **B10: generated-app isolation probes** in all three browser engines.

### C. Capabilities, tools and agents (5)
- **C1: owned capability registry.** Records what Strelva owns, the owning module, qualification state and evidence. The README table is generated from it.
- **C2: availability resolver.** Combines flags, the release-flag store and qualification, and returns available, unavailable or unknown with a reason. A ratchet blocks new inline flag reads. Depends on C1.
- **C3: one tool descriptor across Ask, MCP and agent-access.** MCP schemas are derived through Zod `toJSONSchema`. Depends on C2.
- **C4: deterministic prompt-attack suite** using a mock model, so it costs nothing to run. Depends on C3.
- **C5: live eval for grounding, cost per resolved job and multiple providers.** Gated on Jacob's budget.

### D. Execution and effects (3)
- **D1: minimal effect-outcome conformance** (reserved → … → settled, compensated or unknown, and unknown never retries blindly). Make real and `sweepDueWork` are the two adopters. It is a contract only, with no engine and no table migration.
- **D2: provider settlement matrix** for calendar, GBP, Resend and Vercel domains. Depends on D1 and X9.
- **D3: money replay conformance** for rollover, duplicates, grandfathered gldf/rohlax and payer separation. It tests the existing `connect/` code only. New Stripe event types need Jacob's yes.

### E. Contracts and client delivery (5)
- **E1: complete the v1 contract table** (inquiries, bookings and collections) and add an additive-only golden guard.
- **E2: hermetic client census.** Fetch each repo at its pin, target 0 skips. Reading the deployed SHAs needs Jacob's yes.
- **E3: hash-pinned adapters in the starter.** Depends on E1.
- **E4: client CI template in the starter.**
- **E5: hosted publishing as a targeted carry from #204.** Compare it first, then carry only the commits canonical lacks. It merges with `STRELVA_SITES_DOMAIN` unset.

### F. Data lifecycle (6)
- **F1: PII store registry.** Every store declares retention, export and erasure; unknown values are recorded as `unspecified`.
- **F2: export completeness and resumable exit.** Covers every System kind, and an interrupted exit resumes from its receipt.
- **F3: visitor erasure executors.** Gated on retention policy (#477, #411).
- **F4: Redis authority manifest and loss drill.**
- **F5: restore drill v2.** Adds referential checks, Auth parity, secret decryption, an asset sample and measured RTO.
- **F6: nine-client conversion dry run** on a scrubbed copy. Taking the copy needs Jacob's yes. Depends on A8.

### G. Infrastructure and operations (10)
- **G1: toolchain and qualification profile.** Node, pnpm and Postgres. Qualifying on Postgres 17, 18 or both is Jacob's call. Pin gitleaks by digest.
- **G2: productized verification runner** with disk admission, exact-source clones and stack preflight.
- **G3: migration release gate.** Covers batch manifest, order, rollback pairing, fresh vs. upgraded catalog, and the managed-role privilege diff, checked against the 266-migration ledger.
- **G4: CI receipt provenance.** The receipt is bound to the SHA, `release.yml` requires it, and an attestation is added rather than our own signing.
- **G5: query-plan and capacity baseline** at 10x and 100x on a local cluster.
- **G6: cron deadline contract.** Every cron has a heartbeat, auth and a measured duration against `maxDuration`. Depends on G5.
- **G7: watchdog and telemetry.**
  - Page on a fresh run that failed.
  - Drop `ageSeconds` from the dedupe key.
  - Give `/api/health` a status field.
  - Add log and Sentry redaction tests.
- **G8: operating metrics in the operator console.** Cost per resolved job, model spend, provider calls, queue age and operator attention minutes.
- **G9: emergency controls.** Global and per-tenant stops on outside writes, email and background work, plus a runbook drill. Check the existing release flags first.
- **G10: hotspot ratchet.** The mutation half needs a dependency yes (Stryker), or it uses a seeded-mutant script instead.

### H. Experience proof (2)
- **H1: actor × System-kind journey matrix** with real local Supabase Auth. It covers every kind on canonical, including offering, document, report, tracker, internal_app and portal. Fixture-auth passes are labeled and count as no Auth proof. Production Auth needs Jacob's yes.
- **H2: shared surface-state harness and acting-context contract.** axe-core needs a dependency yes.

### J. Conditional candidates (2), never core
- **J1: Home Finder.** A targeted carry from #206, kept uninstallable until its four gates are met.
- **J2: extension release hygiene and permissions contract** (strelva-tools). Store submission is Jacob's.

### R. Consumer rollout (10 PRs, each repo merge needs Jacob's yes)
- **R1–R2:** vermont-unlimited and cocard-anderson.
- **R3–R5:** leslie-bookkeeping, smokin-buddha and orange-crate-brewing.
- **R6–R9:** mclears-cottage, rhm-innovations, rohlax-wellness and gldf.
- **R10:** a marketing delivery floor.

All work happens in clean worktrees; the dirty client trees belong to another task. Every rollout PR depends on E2, E3 and E4.

## Sequence

1. **Land:** X1–X4, then X5, then X6–X9.
2. **Gates before behavior:** G1, then G2. G3, G4, B2, B4, A9, E1 and E2 run in parallel.
3. **Domain:** A1, then A2, then A3 and A7. A4, A5, A6, A8, B1 and B3 run alongside.
4. **Effects and security:** D1, then D2 and D3. B5–B10 run in parallel. C1, then C2, then C3, then C4.
5. **Data and ops:** F1, F2, F4 and F5, then G5, then G6. G7, G8 and G9 run alongside.
6. **Experience and clients:** H1, H2, E3, E4 and E5, then R1–R10 in waves.
7. **Gated:** C5, F3, F6, G10, J1 and J2.

**The first move is X5 scoped against the production migration ledger.** Every security, migration and auth PR rebases on it, and it's the one place where a wrong carry is a one-way door.

## Jacob's yes, collected
- Read the production migration ledger before re-timestamping the security carry.
- Production System-kind inventory.
- Production census of Redis credentials.
- Key minting and env changes.
- PITR and Upstash backups.
- Postgres qualification version.
- Dependencies: axe-core, Stryker, any queue.
- New Stripe event types.
- Calendly: retire or harden.
- Live eval budget.
- Reading the deployed client SHAs.
- Each client repo merge.
- The scrubbed copy for F6.
- DNS for hosted sites.

## Still unverified
- The exact security-versus-runtime split of #614's 63 commits. I classified its migrations by name only.
- Whether #204 and #206 carry anything canonical lacks.
- The cron count and the receipt-table count on canonical.
- Whether the four checks #616 skipped are fixed.
- Researcher grep counts (305 RPC calls, 47 receipt tables, 203 Redis key sites). These are text-search figures that the compiler hasn't confirmed.

None of this is proven operation. Everything above is source reading at `a1306213f`.


# Final concrete review and dispositions

**Review of the technical-foundation plan at canonical `a1306213f`: 8 corrections, 2 of them blocking**

I checked the plan's claims against canonical source. All plan anchors resolve, and the 38-cron count, the Redis last-owner race and the watchdog dedupe defect are confirmed in source. I edited nothing and ran no tests, builds or production reads.

## Blocking

**1. The migration guard arrives after the step it guards (F01 and F04).**
- **Already on canonical:**
  - `scripts/release-safety/batches.json` pins a sha256 for all 354 timestamped migrations.
  - `inventory.ts` refuses duplicate versions.
  - `stage-release-batch.ts --applied-versions` stops on unknown, missing, duplicate or partially applied history.
  - `check-release-safety-batch8.ts --current-tail` handles backdated corrections.
  - `docs/operations/launch-integration601-migrations.json` already re-timestamped an unapplied tail after 266 applied versions without touching deployed bytes.
- **The gap:** F04 proposes building filename checks, byte immutability and ordering checks that already exist. Meanwhile F01 carries migrations before F04 lands, so the one-way step runs without a named guard.
- **Correction for F01:** its acceptance should require four things:
  - new `batches.json` entries for each carried migration;
  - a `--current-tail` rehearsal;
  - staging against a reviewed applied-versions snapshot (the snapshot read needs Jacob's yes);
  - a rename receipt in the launch-integration601 format.
- **Version, not filename:** the guard should check the 14-digit version, because that is what Supabase's applied-migration ledger records. The filename is secondary.
- **Correction for F04:** cut it down to the real gaps:
  - catalog parity between a fresh install in filename order and an upgrade in packet order;
  - `db:types --check`;
  - explicit classification of any non-migration file in the migrations directory.

**2. T03 can claim zero untyped RPC calls before the other batches finish.** T03 accepts "repository-wide inventory reaches zero", but its dependencies are only A04 and C06. Add T01 and T02 as dependencies.

## Factual corrections

**3. Canonical still has 354 migrations, not 355.** The 355th file is `supabase/migrations/verify-identity-spine-expand.sql` (from `ab57a8d42`). It is a verification script without a timestamp, not a migration. The timestamped count is 354, the same as the consolidation checkpoint, and every one is in `batches.json`. README line 24 is wrong, and so was my earlier synthesis.

**4. A04 points at the wrong types file.** `src/lib/db/database.types.ts` is a 3-line shim. The generated file is `src/platform/infra/db/database.types.ts`, which is the `DEFAULT_OUT` in `generate-database-types.ts`. For reference, a grep finds 112 files at canonical declaring their own `rpc(name: string`.

**5. A11 risks duplicating a Connection contract that already exists.**
- **What's there:** `src/platform/systems/contracts.ts:128-180` already defines:
  - six kinds: read, act, appear, share, depend, trigger;
  - a typed target union;
  - three states: connected, disconnected, stale;
  - a `contractVersion`;
  - three `propagation` policies: `follow_current`, `pin_on_issue` and `manual_review`.
- **Correction:** A11 should extend that schema, not introduce its own "reads/acts/appears-in" vocabulary. Its acceptance should add the propagation cases:
  - `pin_on_issue` keeps an issued or accepted output on the revision it was issued against;
  - `manual_review` marks the Connection stale until reviewed.
- **A12 anchor:** `pin_on_issue` is the existing mechanism for keeping accepted terms, so A12 should anchor there as well as on `system-versions`.
- **A01:** line 9 of the same file says "`kind` is a descriptor, not identity", which contradicts the selected lifetime-kind rule. A01 should correct it.

## Scope and permission corrections

**6. C02's "zero skips in CI" needs a permission the plan doesn't list.** All nine client repos live in the `Strelva/` GitHub org. If they are private (I did not check), the default Actions token can't check them out from REB. Fetching them in CI then needs a new GitHub App or a fine-grained token stored as a repository secret, and that is a secret change that needs Jacob's yes. Add it to C02's gate, or make C02 local-only, cloning each repo at its pinned SHA.

**7. The client CI template has to match the client profiles.** The "static HTML, no JS build" decision is correct: the canonical manifest already has a `static-site` profile (no `package.json`; requires `index.html`, `vercel.json` and `api/contact.js`). The other repos also differ:
- Five use the `next-beacon-site` profile and have only dev, build, start and lint scripts, with no typecheck or test.
- gldf and rohlax each have their own baseline profile.

C03 offers one type/build/security template, and U01–U09 all depend on it. C03 needs a variant for each profile, and U01–U09 should name their profile instead of the shared boilerplate. "Own merchant credentials" does not apply to the static sites.

**8. Make real's per-part outcomes are tested in the wrong PR, and the real-Auth journeys wait too long.**
- **Per-part Make real:** that conformance currently sits inside A13, which is a catalog PR. Canonical `make-real/view.ts:181-189` already shows a "Partly live" state. Move the per-part test across multiple Systems (refused, accepted, unknown, compensated) into A08's acceptance, and keep A13 as the map from rules to tests.
- **Real-Auth journeys (E01):** they depend on C04 (the marketing toolchain) and C08 (exports). That puts every actor × kind cell at depth 8, even though the real-local-Auth harness already exists (`check-journeys.sh` and about 14 `*-authenticated-local` specs). Split E01 so in-app cells depend only on the authority records. The marketing-entry cell depends on C04 and the export cell on C08.

## Documentation

**9. The README links a file that doesn't exist and says its links were checked.** Line 1025 links `./index.html`, which isn't there, while the README claims "local artifact links" passed. Either generate the file or remove the link and the claim. The whole plan directory is also untracked in the dirty `reborn-1.0-model` main checkout, so it isn't on a branch from canonical yet.

## No change needed
- **Queue:** correctly left conditional, with no record and no dependency.
- **Real-Auth labeling:** F05, E01 and the completion matrix keep fixture-auth passes from counting as Auth proof.
- **Possibility, Version and Connection invariants:** present apart from items 5 and 8.
- **Dirty trees:** the plan respects other owners' dirty changes.
- **Lifetime kind:** treated as already decided.

Still unverified: whether the client repos are private, and the Vercel Queues beta status the README cites.

## Coordinator response

All material findings were resolved in the task-owned plan before delivery:

1. F01 now uses existing version/hash inventory and staging guards before carrying SQL, requires applied-version snapshot, current-tail rehearsal and rename receipt. F04 contains only catalog/type/non-migration classification gaps. Live snapshot authorization remains explicit.
2. T03 now depends on T01 and T02 before repository-wide completion.
3. Count corrected to 354 timestamped forward migrations; verify-identity-spine-expand.sql is separately classified. Earlier counts of 355 are historical review errors.
4. A04 now anchors generated platform/infra database types rather than the shim.
5. A11 extends existing Connection vocabulary and propagation schema; A12 anchors pin_on_issue, and A01 corrects mutable-descriptor wording.
6. C02 explicitly gates cross-repository CI secrets/access while allowing local pinned proof.
7. C03 and U01–U09 use their actual static/beacon/custom baseline profiles. Smokin Buddha's unconfirmed tenant mapping is also a named gate.
8. Per-part Make real proof moved to A08; A13 only maps invariants. E01 qualifies in-app Auth independently, while C04/C08 own later entry/export cells in the same matrix.
9. index.html was generated after the reviewer read began. It now exists, local links resolve and desktop/mobile DOM probes pass. The documents remain untracked local deliverables, not published canonical source.

No application runtime test or production proof was introduced by these corrections.
