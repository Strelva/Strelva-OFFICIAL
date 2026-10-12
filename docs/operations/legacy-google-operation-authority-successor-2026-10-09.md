# Prepared Google operation successor

This is a complete replacement of the still-unintegrated migration1751 packet
from frozen `8ccaafab73bc5cb558fa5be0e0ff4b27b200f36b`. Root explicitly authorized
replacing only that new migration and its fixtures. The frozen commit and every
pre-8cca migration remain unchanged. Apply this replacement once in a fresh
composition; applying exposed8cca1751 first and correcting it later would leave
an authority window and is not the accepted composition.

Both the actor-bound operation and trusted-service reconnect now admit the
original operation snapshot/time before persisting credentials, metadata and
canonical binding/location in one SQL transaction. Current actor permission
locks and NOWAIT row contention rules are retained. The public RPC signatures
remain unchanged. Producer source/tests are separately owned by the HTTP agent.

Creation checks inherited table/function ACLs before named REVOKEs can hide
unexpected defaults. The final guard, before first COMMIT, pins six literal
function body hashes, owners, signatures, argument names/defaults, language,
execution properties, search paths and exact owner/service nongrantable ACLs.
The watermark guard checks owner, RLS, table/column ACLs, exact shape, constraints,
index, absence of policies, rules and inheritance. PostgreSQL18 NOTNULL catalog
rows are explicit. Standard `protrftypes` is NULL, and PostgreSQL17/18 use NULL
for the default statistics target. See the official [pg_proc](https://www.postgresql.org/docs/18/catalog-pg-proc.html)
and [pg_attribute](https://www.postgresql.org/docs/17/catalog-pg-attribute.html) catalogs.

Source-only verification:

```sh
node --test scripts/tests/legacy-google-operation-creation.node-test.mjs
python3 tests/support/legacy-google-operation-creation-variants.py ABSOLUTE_REPO ABSENT_ABSOLUTE_OUTPUT_DIRECTORY
```

Five Node source checks passed. The generator prepares exact normal source and
31 hostile fresh-creation refusal variants, with metadata-only snapshot SQL.
The updated schema fixture covers actual trusted record writers, newer
credentials/tombstone refusal and omitted-refresh preservation. The inverse
remains explicitly forward-only and refuses before mutation.

All SQL creation, hostile-default, role, atomicity and concurrency fixtures are
**prepared and UNRUN**. The qualification owner must use a fresh, independently
owned disposable cluster with the exact complete forward composition; compare
snapshots before/after each refusal, run normal creation last, then retain
source/catalog/settings/PID/teardown evidence. The separate race helper covers
row contention, not executed unlink/delete semantics. Root owns final migration
registration, inventory, exposure and catalog reconciliation. No provider,
production, Auth, DNS, browser or deployment permission is supplied by this packet.
