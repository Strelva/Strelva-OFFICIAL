# Completed-month responsibility evidence — private preparation

Original #299 requires a monthly snapshot of accepted standing and installed
responsibilities with outcome evidence. Existing daily previews rejected a
completed month. Migration `20261020090032` adds one immutable business/month
receipt composed exclusively from immutable captures recorded during that month.
It retains the last observed inventory, original payer/provider and source/Version
identities, each original cohort, receipt references and exact payload hashes.

The receipt declares its observation coverage. Missing history is unavailable;
observed history is partial. It does not reconstruct today's responsibilities as
past facts, invent period-end state, sum overlapping daily cohorts, assign an SLA
target, or calculate billable units. Prices and Stripe export remain off.

The existing `responsibility_meter` POST action admits or exactly replays the
receipt. GET `/api/operations?view=responsibility_meter&workspaceId=...&month=YYYY-MM`
reads an existing completed-month receipt without capturing anything. Both use
the verified server actor and current existing business-member/qualified assigned
provider authority. The new stable reader executes in a genuine READ ONLY
transaction. Current-month daily previews and the bounded fair sweep are retained.

New proposed packet 14 contains only migration32 and its pinned guarded inverse.
It does not change any historical or earlier pending SQL. The inverse locks the
new table before checking for retained evidence and refuses to destroy a populated
monthly ledger. An empty inverse restores the original function definition and
ACLs exactly.

Run the focused disposable PostgreSQL rehearsal:

```bash
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash scripts/check-recurring-responsibilities.sh
```

It covers current daily behavior, explicit missing history, synthetic past captures
with original source identities, exact replay, malformed source rejection, current
actor/cross-business denial, native READ ONLY retrieval, ACLs, empty rollback and
reapply, actual populated rollback refusal, and controlled membership/identity
loss races, including qualified-provider capture-first and verification-loss-first
sessions. Monthly observation hashes use PostgreSQL's built-in SHA-256 function,
so they do not depend on the pgcrypto extension's schema. Synthetic fixture history
is test evidence, not observed customer
history. The full native/upgrade and client contracts remain separate checks.

Local source proof and retained failed runs are stored outside the repository in
the workspace `.scratch/launch-completion-2026-10-08/monthly-evidence/` packet.
No migration, public flag, billing term, provider call or production change is
authorized by this preparation.
