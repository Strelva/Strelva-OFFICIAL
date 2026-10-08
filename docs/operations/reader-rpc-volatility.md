# Reader RPC transaction correction (#252)

Agency 1.0 batch 7A follow-up: `20261009150000_reader_rpc_volatility.sql`.
This runs after batches 0–7; none of their checksum-pinned files changes.
No production execution is authorized by this record.

The ten readers do not insert, update or delete business data. They acquire
row locks through the paths below. Row locking requires a read-write
transaction, even when the returned data is only read. Declaring these entry
points `VOLATILE` preserves their existing authorization and locking rules.
PostgREST selects READ WRITE for a POST to a VOLATILE RPC, but READ ONLY for
a POST to a STABLE/IMMUTABLE RPC. GET/HEAD remain read-only and are not the
supported call path for these readers. The app's Supabase `.rpc()` calls use
POST. See [PostgREST's transaction contract](https://postgrest.org/en/stable/references/transactions.html).

## Inspected call paths

| Reader | Lock reached |
| --- | --- |
| `read_operator_queue_context` | `operator_queue_assert_operator`: users FOR KEY SHARE, super_admins FOR SHARE |
| `read_outside_write_receipts` | Same operator check |
| `read_google_listing_readback_failures` | Same operator check |
| `read_business_effort` | `business_effort_assert_operator`: users FOR KEY SHARE, super_admins FOR SHARE |
| `read_effort_businesses` | Same effort check; inspect the replacement in `20261007160100` |
| `read_make_real_activation` | `make_real_activation_actor(false)`: users FOR KEY SHARE, membership FOR SHARE |
| `export_workspace_v3_category` | `business_record` → `read_business_record` → `business_record_assert_actor(false)`; `systems` → `read_business_systems` → `system_actor_scope(false)` → same business-record check: users FOR KEY SHARE, membership FOR SHARE |
| `read_website_current_tenant` | `website_document_assert_actor(false,false)`: membership FOR SHARE |
| `read_website_linked_publications` | Same website check |
| `read_website_domain_approvals` | Same website check; also evaluates expiry with `clock_timestamp()` |

The export role/category/tenant-row helpers remain STABLE/IMMUTABLE: they do
ordinary reads or deterministic computation. `read_google_listing_receipt`
also remains STABLE. This is a correction to ten entry points, not a blanket
change to readers or their shared actor helpers. Function signatures, bodies,
SECURITY DEFINER, search paths and grants are preserved by ALTER FUNCTION.
Both directions send `NOTIFY pgrst, 'reload schema'` at commit so PostgREST
can refresh its cached volatility. See the
[schema-cache contract](https://docs.postgrest.org/en/v16/references/schema_cache.html).

## Regression and reversal

`tests/reader-rpc-volatility-schema.sql` runs in both existing disposable
PostgreSQL checks. Each invocation gets the transaction mode selected from
the function's live `pg_proc.provolatile`, READ COMMITTED isolation, and
`SET LOCAL ROLE service_role`, matching the database portion of a PostgREST
POST. The test executes all ten real functions, including both export branches
that reach locks, with a verified operator/owner and a real website work row.

The test applies `rollback-20261009150000_reader_rpc_volatility.sql`, asserts the original
STABLE declarations, and reproduces SQLSTATE 25006 on all eleven locking
paths. It reapplies the migration and requires successful calls with the
expected response shapes. Verified outsiders must still receive the original
authorization errors. A STABLE reader is exercised in READ ONLY. Catalog
snapshots verify that rollback changes only targeted volatility, and that
reapply/retry preserve every public function's body and other metadata.

The rollback uses the repo's non-timestamp `rollback-*.sql` convention, so it
is excluded from automatic migration application. It restores the known defect;
it is a reversal artifact, not a working fallback. Hosted execution and ledger
repair remain separately authorized actions.

Run:

```bash
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade
```

This test proves local database execution under PostgREST's documented role and
transaction behavior. It does not exercise HTTP, JWT validation or schema-cache
refresh, and is not evidence of deployed or production behavior. The original
HTTP failure evidence is in the W6 journey stream's
`docs/product/streams/w6-journeys.md` and `scripts/journeys-proposed-fixes.sql`.
Integration should rerun W6 journeys without the proposed-fix overlay.

## Local verification, October 7, 2026

- `pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0.
- `pnpm exec vitest run src/__tests__/operator-queue-listing-readback.test.ts src/__tests__/operator-queue-receipts.test.ts src/__tests__/business-effort-service.test.ts src/__tests__/make-real-activation-repository.test.ts src/__tests__/export-v3-and-outcomes.test.ts src/__tests__/website-document-store-linked.test.ts --maxWorkers=1`: six files passed, 65 tests passed, two skipped.
- Both PostgreSQL commands above: exit 0, including the new regression.
- `git diff --check` and `bash -n` for both modified check scripts: exit 0.
- `pnpm check:boundaries`: exit 1 on eight existing imports under
  `src/experience/workspace/outcomes/` (seven `@/lib/motion`, one
  `@/lib/ai-visibility-scorecard`). Those files and the boundary checker/baseline
  are unchanged from the starting commit `0479cdab`. This PR does not fix them.

The first upgrade rehearsal ran out of disk before reaching this regression;
the concurrent focused SQL run stopped during an existing authority-race check.
Both commands passed on retry after disk space became available. The requested
`pnpm test -- <paths>` invocation launched the full suite with this Vitest
version, showing unrelated failures before interruption. The direct targeted
command above passed. No complete full-suite pass is claimed.

Next action: review this batch 7A follow-up against `integrate/reborn-1.0`,
then rerun W6 journeys without `--with-proposed-fixes` after integration.
HTTP/JWT/schema-cache consumption and all production behavior remain unproven
by the local database test. Deployment is outside this task's authority.
