# Release safety tools

Prepared for the 51-file 1.0 packet at `integrate/reborn-1.0` (`7b7b4d3f`).
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
ordinary non-cascading drops. The hashes were checked on local PostgreSQL 18;
hosted-version compatibility must still be rehearsed. Reverse conversions with
the reviewed per-tenant unlink flow before reversing business billing, which
refuses any retained `tenant_workspace_links` rows. The July rollback refuses
1.0 account/workspace dependencies. Neither path rewrites Supabase migration
history or reverses accepted provider effects. Forward corrective migrations
remain the preferred live recovery path.

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
snapshot. It must match the 85-file baseline plus every earlier batch exactly.
Unknown, missing, duplicate, or partially applied history stops. Staging
rehashes every required forward file before creating a fresh output directory,
copies only the baseline/earlier/current batch plus `config.toml`, and writes
an exact pending-file receipt. It performs no network calls, subprocesses,
Supabase link, dry run, push, or history repair. Keep credentials out of it.

For the separately approved CLI step, use the staged directory as `--workdir`
and `db push --include-all`; inspect the linked dry run and require exactly the
receipt's pending files. The local helper does not verify hosted history or the
Supabase CLI's behavior. `--include-all` handles the out-of-order September 28
file; it is not permission to push an unreviewed tail.
