# Release safety tools

Prepared for the 51-file 1.0 packet; rebased onto `integrate/reborn-1.0`
(`864474fe`). Batch 0 (`20261005090000_tenant_leads`) is already applied in
production per the October 7 release record. The manifest retains it so local
baseline proofs and batch 1 history validation include the applied migration.
These tools never authorize a production operation. New migrations from other
streams require a reviewed manifest/rollback update and another rehearsal.

## Local proof

```sh
pnpm check:release-safety
```

Uses installed PostgreSQL binaries (Homebrew PostgreSQL 18 when available), a
fresh private cluster, Unix sockets, and `listen_addresses=''`. Loads the 85
baseline files with the local Supabase shim, then the packet's batches in
**packet order**, not global filename order. For each batch it applies,
reverses in reverse file order, and applies again. It compares function bodies,
owners/ACLs, table owners/ACLs/RLS, columns/defaults, constraints, indexes,
triggers, and policies against the captured public catalog.

Legacy probes check content reads/writes and stable identity, owner membership,
tenant billing fields, verified workspace entry, rejection of an unverified
identity, and browser privilege boundaries. Every probe transaction rolls back.
These are SQL fixture proofs, not observed use of the deployed Sept 30 app.

The script also proves whole-release reversal, populated July account archives,
held-lead and owner-link flag/history archives, fresh dump/restores before and
after reversal, and refusal of wrong order, function drift, premature July
reversal, and archive reuse. A receipt and private database cluster remain in
the printed temporary directory; the cluster is stopped on exit. Archive
deletion inside this disposable proof cluster is test cleanup only.

## Recovery SQL contract

Every pending forward file has `supabase/migrations/rollback-<forward-file>`.
The July companion is `rollback-org-layer-phase0.sql`. Do not put rollback,
verify, or future-stream files in a CLI push directory.

Immediately before batch 4, run the separately approved
`scripts/release-safety/capture-billing-grants.sql` on the reviewed target.
It records the four July billing tables' original ACLs and identities in
`release_rollback_baseline`, inaccessible to browser and service roles.
Existing captures and non-owner grantors stop. Keep this metadata and the
verified dump; do not overwrite it. Billing rollback refuses missing or
drifted captures and restores the original grants, including grant options.
The restored October 7 production copy proved why this is required: hosted
default grants differ from the migration-only fixture. Capturing grants after
the forward revoke cannot recover the prior permissions.

Undo later batches first, then each batch in reverse manifest order. Each
rollback is a transaction with a 3-second lock timeout and 120-second statement
timeout. A failure rolls back that file; earlier successfully reversed files
remain reversed. There is no automatic retry or batch-wide transaction.

Removed tables/columns and incompatible new rows are copied into
`release_rollback_archive`, with schema/table access revoked from `PUBLIC`,
`anon`, `authenticated`, and `service_role`. Keep that schema and the verified
dump. A repeat reversal refuses existing archive table names. Renaming an
archive or recovering records needs its own reviewed plan; do not drop an
archive to make a live retry pass. Reapplying schema does **not** replay data
from those archives.

Function-body hashes fail closed on drift; unknown dependent objects stop
ordinary non-cascading drops. The hashes were checked on local PostgreSQL 18
and the restored production dump on isolated PostgreSQL 17.11; the hosted
target and old deployed app must still be rehearsed. Reverse conversions with
the reviewed per-tenant unlink flow before reversing business billing, which
refuses any retained `tenant_workspace_links` rows. The July rollback refuses
1.0 account/workspace dependencies. Neither path rewrites Supabase migration
history or reverses accepted provider effects. Forward corrective migrations
remain the preferred live recovery path.

## Batch 8: retained evidence and empty-only structural recovery

`pnpm check:release-safety:batch8` applies all pinned batch-8 files, runs their
existing receipt-preserving companions, then proves optional structural
completion on its private local database. The full pre-batch public catalog and
ACL comparison remains exact; the second forward must reproduce the first.
Legacy client content, routing, billing and access probes run throughout.

The companions intentionally retain sessions, send purposes, receipts, native
records and exit history. Disabling a feature does not authorize deleting this
evidence. The separate `rollback-batch8-empty-schema.sql` can complete structural
reversal only when all 20 registered evidence tables are empty, all four added
fields on existing tables are NULL, and added release-flag values have no state
or immutable history. It locks affected tables, checks captured or explicitly
audited object fingerprints, restores predecessor definitions and constraints,
and uses ordinary non-cascading drops. Populated evidence, unknown dependencies,
drift, or rows incompatible with the old constraints stop the whole transaction.
No customer row is deleted, rewritten, archived or replayed.

Prepare this target's privileged metadata with
`capture-batch8-structural-baseline.sql` **before** batch 8, then run the same
capture file with `--set=batch8_capture_forward=true` immediately after forward
and before any recovery companion. The captures contain catalog definitions,
fingerprints and flag names, with no customer rows or credentials. Browser and
service roles cannot access them. Capture reuse and missing metadata refuse;
do not reconstruct a predecessor capture from an already upgraded target.

Live structural recovery requires separate explicit recovery authorization and
all batch-8 callers/gates disabled. A release or deployment authorization does
not grant rollback authority. After the ordinary companions, the reviewed
manual invocation must include both
`--set=batch8_empty_recovery_authorized=true` and
`--set=batch8_callers_disabled=true`. These are explicit operator attestations;
the SQL cannot inspect application environment switches. The local proof sets
them only for its disposable database. Nothing invokes this helper on a hosted
target automatically.

On a populated target, retain the additive schema and use feature disablement
plus a reviewed forward correction. Moving accepted-send evidence away and
reapplying empty tables can reopen consumed send purposes; archive/replay
recovery needs its own plan. The local proof checks atomic refusal for accepted
send evidence, every new field, flag state and immutable history, function
drift, missing authorization, and incompatibility with an old constraint.

## Dump and restore

```sh
pnpm exec tsx scripts/rehearse-database-restore.ts \
  --source-env LOCAL_DATABASE_URL --target-admin-env LOCAL_ADMIN_URL \
  --out /private/tmp/strelva-local-restore-unique
```

The named variables must already hold local database URLs. Both source and
target are refused before connections or filesystem mutation when non-local,
unless the caller provides the explicit Jacob-approval escape hatch. Never use
that escape hatch or production credentials in local development/rehearsals.
Loopback/socket URLs are accepted; libpq routing overrides and ambient `PG*`
settings are rejected/removed. The output must be fresh, outside this checkout
(including symlink paths), and have an existing parent.

The source is read only. Counts and `pg_dump` share one exported repeatable-read
snapshot. Restoration creates a uniquely named database on the admin target;
it never reuses or drops a database. Counts include every non-system ordinary
or partitioned table, with bigint counts kept as strings. Mismatched or missing
tables fail. The dump, receipt and diagnostics remain private (directory 0700,
files 0600). The target database remains for inspection, including on failure.
Missing policy role names are created as `NOLOGIN` on the target; passwords and
role attributes are not copied. Ownership and ACLs are omitted during restore:
this proves schema/data and row counts, not full Supabase Auth/storage, role,
sequence-position, content-hash, or Redis recovery.

## Silent environment and snapshot

```sh
pnpm exec tsx scripts/silent-rollout-preflight.ts --env-file /private/tmp/intended.env
```

Use the **complete intended environment for the new deployment**, merging the
reviewed configuration delta with current settings. The preflight never loads
application credentials, calls a provider, or prints env values. It accepts
literal dotenv assignments only and refuses duplicate keys, expansion and
malformed input. Client/customer mail, booking owner notices/reminders and
Make real owner links must be absent or explicitly off. Existing operator and
prospect policy remains independent. Owner invites remain deferred.

The readiness snapshot additionally reads only the fixed
`reb:client-email:<active-tenant>` policy enum. An active `on` override stops
even with global mail off. Unknown/unavailable policy reads or an incomplete
active inventory also stop. Unsafe reports print their stop conditions and the
CLI exits nonzero. A fresh separately authorized snapshot is still needed;
env preflight alone cannot prove tenant overrides or hosted Auth mail settings.

## Offline staging

```sh
pnpm exec tsx scripts/stage-release-batch.ts --batch 0 \
  --applied-versions /private/tmp/reviewed-applied-versions.json \
  --out /private/tmp/strelva-batch-0-unique
```

The history file is a JSON array of 14-digit versions from a freshly reviewed
snapshot. It must match the 85-file baseline plus the exact preceding packet
entries in order `0, H, 1–7, 7A, 8, 9`; H is mandatory before batch 1.
Unknown, missing, duplicate, or partially applied history stops. Staging
rehashes every required forward file before creating a fresh output directory,
copies only the baseline/earlier/current batch plus `config.toml`, and writes
an exact pending-file receipt. It verifies the complete pinned inventory before any filesystem write and
performs no network calls, subprocesses, Supabase link, dry run, push, or history
repair. Proposed-step receipts retain that status and explicitly grant no
deployment authority. Keep credentials out of it.
The receipt identifies prepared/proposed tails and records
`deploymentAuthorized: false`; creating a stage grants no deployment authority.

For the separately approved CLI step, use the staged directory as `--workdir`
and `db push --include-all`; inspect the linked dry run and require exactly the
receipt's pending files. The local helper does not verify hosted history or the
Supabase CLI's behavior. `--include-all` handles the out-of-order September 28
file; it is not permission to push an unreviewed tail.
