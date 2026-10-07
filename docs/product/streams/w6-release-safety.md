# Wave 6 release safety

Branch: `w6/release-safety`; rebased onto `integrate/reborn-1.0` at `864474fe`.
Scope: local release preparation only. No production/provider calls, pushes,
PRs, merges, deployment, or client notices are authorized or performed.

## Current objective and continuation

Round 5 completed the restored-production proof on local PostgreSQL 17.11.
`864474fe` is an ancestor of HEAD; its missing-table fix and this stream's
unknown-204 count refusal remain covered. This branch stays isolated and unmerged.
The checks below own the exact completed evidence. The stream is complete
locally; integration and every production action remain separately gated.

### Launch requirements this stream owns

- Preserve existing client/storefront behavior: `check:custom-repos` is 196/196;
  public catalog comparisons include bodies, owners, grants, RLS, columns,
  constraints, indexes, triggers and policies. Legacy fixture reads/writes,
  routing identity, memberships, verified/unverified workspace entry and
  billing pass around each batch. The actual restored copy retains baseline
  row counts and unchanged content, memberships, page-config and draft digests.
  This does not run the deployed Sept 30 app or observe live storefronts.
- Prepare every reversal: 51 forward-file companions plus the July org-layer
  reversal; batches 0–7, complete reversal, archive privacy/data, refusal paths
  and dump/restores are locally exercised. Production batch 0 stays applied.
- Recover from a verified dump: all three supplied dump digests checked;
  **146/146** supplied table counts match after restore. Roles/schema/data
  restore times are **0.130 / 1.910 / 0.290 seconds** (6,373,075 source bytes).
  Hosted Auth/storage structures use local provider schema scaffolding because
  the supplied schema dump contains only public application objects. This is
  a database-data rehearsal, not full hosted Auth/storage service recovery.
- Silent rollout: offline intended-environment preflight, active-tenant mail
  override checks and stop conditions, unknown inventory/count refusals;
  no notices or invites. Owner invites remain deferred.
- Stage exact reviewed batches: digest/history/order checks and offline staged
  pending-file receipts; no Supabase link, push, history repair or provider call.

### Restored production rehearsal

The October 7 dump was restored into this stream's own Docker PostgreSQL 17.11
container, `strelva-w6-release-safety-r5`, with **network none**, no mounts, no
host ports, and a private Unix socket on internal port **57832**. `docker ps`
was checked first; other containers were untouched. Batch `20261005090000`
was applied first (0.122s locally), representing the supplied already-live
batch-0 baseline. Each batch 1–7 passed forward → reverse → forward. Then all
pending batches were reversed 7→1 and applied again 1→7, keeping batch 0.
Both the baseline and final public catalogs matched, and baseline row counts
and checked legacy digests survived. Archives from the full-tail reversal
remain private. Disposable per-batch archives were removed only in this local
copy to enable the separately tested full-tail reversal.

Per-batch isolated cycle, seconds (forward / rollback / forward):

| Batch | Files | Forward | Rollback | Forward again |
| --- | ---: | ---: | ---: | ---: |
| 1 | 6 | 1.310 | 0.848 | 0.954 |
| 2 | 6 | 0.954 | 0.895 | 0.929 |
| 3 | 13 | 2.161 | 1.978 | 2.029 |
| 4 | 8 | 1.426 | 1.398 | 1.334 |
| 5 | 7 | 1.569 | 1.504 | 1.375 |
| 6 | 7 | 1.568 | 1.488 | 1.882 |
| 7 | 3 | 0.701 | 0.663 | 0.536 |

Complete-tail rollback / reapply, seconds:
1: 1.500 / 2.310; 2: 1.673 / 2.500; 3: 4.372 / 4.465;
4: 2.706 / 2.171; 5: 1.950 / 2.033; 6: 2.150 / 2.071;
7: 0.617 / 0.718. Execution order is reverse for rollback.

`pg_locks` receipts capture held locks immediately before each file commits.
Forward files are wrapped in a transaction to match per-file push execution;
rollback files retain their own transaction. Timing includes Docker/psql
startup and receipt-query overhead. The sampler observed **0 lock waits**;
it samples every 30ms plus query/startup time and can miss shorter waits.
No competing application workload ran. These are not production lock times.

Existing-table AccessExclusiveLock was observed in forward batches:
2 (`domain_claims`), 3 (`tenants`, `workspace_invitations`, `tenant_leads`),
4 (`accounts`, `subscription_items`, `tenants`, `business_contacts`,
`business_record_revisions`, `workspace_export_receipts`), and 6
(`public_website_bookings`, `tenant_leads`, `owner_decisions`,
`tenant_client_records`). Batch 7 locks `strelva_service_actions` exclusively.
New tables also take exclusive locks. Rollback can be stronger: even batch 1
locks existing `tenants`, `users` and `workspaces` exclusively while removing
foreign keys. The [sanitized receipt](./w6-release-safety-rehearsal.json)
records every batch phase's public table lock modes and all durations; the
private receipt retains per-file relation/non-relation lock details.

Private source/diagnostics/harness/receipt:
`/var/folders/0t/9xnfycn50vd2yv5gb7p4cdsh0000gn/T/strelva-w6-release-r5-z36l4b_f`.
The original source dump remains untouched at the user-supplied path.
Raw customer rows, credentials, function bodies and full count receipts are
not committed. The committed receipt contains aggregate evidence only.

### Gap found and repaired

Production's four July billing tables have grants absent from the migration-only
fixture. The first restored-copy run failed batch-4 catalog comparison after
rollback because the reversal assumed fixture permissions. The repaired
billing rollback requires `scripts/release-safety/capture-billing-grants.sql`
immediately before batch 4; it restores captured privileges and grant options.
The capture refuses overwrite/non-owner grantors, and rollback refuses absent,
incomplete or changed identities/owners. App/browser roles cannot access the
metadata. The final real-copy run restores the production grants exactly.
A separate synthetic clone covers PUBLIC grants and grant options so the July
migration-only proof keeps its own original permission baseline.

The fourth checkpoint also had a comment between a shell environment assignment
and its command. Fixed; real Version SQL contracts receive their Postgres URL.
Authority concurrency checks now hold transactions behind an explicit barrier,
observe the competing lock wait, then release them. Host scheduling cannot
silently bypass the tested removal/downgrade race.

### Verification receipts

- `pnpm test --maxWorkers=2`: **687 passed files / 1 skipped; 6,242 passed tests /
  37 skipped; 264.97s**. Completed round 4; preserved pass, application source
  unchanged afterward. `.scratch/release-safety/round4-test.log`.
- `pnpm build`: **exit 0**, compiled in 99s, 235/235 static pages generated.
  Completed round 4; application/build source unchanged afterward.
  `.scratch/release-safety/round4-build.log`.
- `pnpm check:custom-repos`: **196/196**, round 4, app/contract source unchanged.
  `.scratch/release-safety/round4-custom-repos.log`.
- `pnpm check:workspace-sql`: **exit 0**, local PostgreSQL 18; real Version,
  Possibility, Make real, booking, customer mapping and inquiry contracts.
  `.scratch/release-safety/round5-workspace-sql.log`.
- `pnpm check:workspace-upgrade`: **exit 0**, isolated full-schema upgrade.
  `.scratch/release-safety/round5-workspace-upgrade.log`.
- `pnpm typecheck`: **exit 0** after grant-fixture changes.
  `.scratch/release-safety/round5-typecheck-verified.log`.
- `pnpm lint` and `pnpm check:boundaries`: round-5 passes; final rerun receipts
  `.scratch/release-safety/round5-lint-verified.log` and
  `.scratch/release-safety/round5-boundaries-verified.log`.
- Final `pnpm check:release-safety`: 3 files / **40 tests** pass; the SQL portion
  also covers every batch, grant capture refusals/options, archives, full
  reversal, July baseline and two dump/restores. **Exit 0**.
  `.scratch/release-safety/round5-release-safety-verified.log`.
  Private fixture cluster: `strelva-release-safety-HXHoV0` under the same
  OS temporary parent as the real-copy receipt. Upgraded backup: **192 tables,
  2,699,358 bytes**, 0.828s dump / 2.276s restore. Rolled-back backup: **205
  tables, 1,583,984 bytes**, 0.846s dump / 2.393s restore.
- Restored production-copy harness: **exit 0**, 146/146 restored counts,
  seven batch cycles, whole-tail reversal/reapply, matching catalogs and
  retained legacy data. `.scratch/release-safety/round5-production-copy-final.log`.

### Failures retained

Round 4's first real-copy attempt stopped on batch-1 rollback. Round 5 initially
needed the provider-schema scaffold and local realtime publication because the
supplied schema omits them. Its first complete restore then found the genuine
billing ACL mismatch above. A broader synthetic grant fixture initially broke
the July reapply catalog check because that migration recreates tables without
hosted defaults; coverage is now isolated in a cloned billing fixture. Logs and
failed private receipts are retained. These failures are not counted as passes.

## Packet edits for the integration owner

**Batch 0 is done in production.** Round 4's supplied production record says
`20261005090000_tenant_leads` is applied, the lead backfill is 43/43, and 0.2.1
(PR #213) is live at `main` `2dd3453a`, deployment
`dpl_9ViM5iWeCepPiio8k3AZ5NFwKFPx`. This stream did not inspect production.
Start pending execution at batch 1 after a fresh authorized history snapshot;
do not push or reverse batch 0 as part of the pending release rehearsal.
The local manifest deliberately retains batch 0 for baseline/history checks.
Shared release-packet and launch-spec files remain untouched per the brief.

**New required pre-batch-4 action:** separately approve and run
`scripts/release-safety/capture-billing-grants.sql` immediately before batch 4.
The capture took 0.070s on the isolated copy; use the receipt for its exact time.
Retain its private metadata and the verified dump; do not capture after revoke.
The billing reversal now refuses absent/drifted metadata and restores prior
grants instead of assuming local defaults. Add this to the packet's existing
pre-batch-4 grants/constraints checkpoint before executing it.

No new runtime flag, forward migration, cron, provider integration, dependency
or sending path was added by this stream. Existing off defaults remain. The
51 recovery companions and July companion are prepared SQL, not CLI push files.
Offline staging and silent checks remain owned by the tool contract.

The earlier round-3 populated proof is
`.scratch/release-safety/round3-release-safety-final-2.log`. Its private cluster,
dumps and full row-count receipts are at
`/var/folders/0t/9xnfycn50vd2yv5gb7p4cdsh0000gn/T/strelva-release-safety-xbYIYa`.
Upgraded dump: 191 tables, 2,697,710 bytes, 1.099s dump / 4.739s restore.
Rolled-back dump: 204 tables (includes archives), 1,582,246 bytes,
0.359s dump / 0.945s restore. These small synthetic fixtures do not estimate
production recovery time.

Round 3 failures remain in the ignored local investigation directory. Fixed
and rerun: nonexistent fixture billing/lead columns; trigger functions
misclassified as callable RPCs; generated-column dependency on a dropped
function; missing constraint parenthesis; archive work after an early commit;
wrong history column (`flag` instead of `subject`); temporary function creation
in a read-only transaction; strict indexed-access errors in checkpoint scripts.
The original checkpoint commits are retained; verified follow-through starts
at `443eaaf2` after the rebase.

## Authority and limits

These tools prepare recovery; they grant no production authority. Recovery
archives preserve removed records privately; schema rollback does not replay
them, reverse external effects, or reconcile Supabase migration history.
Hosted Postgres/Auth/storage/Redis recovery, deployed old-app compatibility,
live lock behavior, fresh target/environment facts, and separately approved
production execution remain unproven. Owner invites remain deferred.

Exact next move for the integration owner: review this branch and the sanitized
lock/timing receipt; carry the pre-batch-4 capture requirement into the shared
packet; reconcile this evidence into the canonical model in the main checkout
(left untouched by this stream's worktree-only brief). Rehearse the currently
deployed old app against the pending schema on the separately approved hosted
preview. Then obtain a fresh authorized history/environment/parity snapshot and
Jacob's yes for the reviewed batch-1 rollout. No hosted test or production
action is implicitly authorized by this report.
