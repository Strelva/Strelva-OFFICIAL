# Agency flag and native billing lock order

Private correction based on the composed `de5b87aa` graph. No production
migration, flag, provider action or commercial policy is authorized here.

The agency flag setter originally locked the customer workspace row before
`system_actor_scope` acquired the business-record advisory lock (seed 7415).
The native billing backfill helper acquired 7415 before its workspace row.
Concurrent operations on an existing customer with a missing billing home could
therefore deadlock. The native RED proof invokes both actual functions behind
an advisory gate, queues billing first, and confirms the agency call already
holds the row before releasing the gate. PostgreSQL reports the actual cycle.

Pending `20261021096000` acquires the existing 7415 lock immediately before
the agency setter's workspace lock. The guarded migration replaces one body
line through `CREATE OR REPLACE`, preserving every other body byte and the
function's OID, ACL, argument, return, security and configuration metadata.
The inverse accepts only the exact successor body, restores the original body,
and retains all flag, ceiling, audit and billing data. Neither direction
overwrites an unexpected predecessor or later body. Earlier migration bytes
remain unchanged. The inverse restores the known deadlock risk while native
billing provisioning remains present. Inverse/catalog proof establishes undo
and data preservation; it does not establish that independently rolling this
correction back in the composed graph is operationally safe.

Run only against a disposable local PostgreSQL cluster:

```sh
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash scripts/check-composition-lockorder-sql.sh --red
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash scripts/check-composition-lockorder-sql.sh
```

The first command deliberately omits this successor and asserts the native
deadlock. The second checks the full ordered predecessor graph, exact catalog
and ACL preservation, guarded atomic failure, inverse/reapply, the original
agency permission contracts and seven authority races, READ ONLY reads, the
same gated schedule, both committed billing operation orders, both actual
owner-business-record/agency operation orders, dual revision conflicts,
cross-agency refusal, private billing-helper denial, retained data through the
inverse, and actual ordinary business/client billing-home creation. Local proof
does not establish hosted migration, customer operation or provider delivery.
