# Native customer billing homes — October 8, 2026

This isolated successor starts from issue317 source
`75581583136f1000a0e15093f4694adf6e61e290`. That frozen source proves actual
accepted agency payer/job authority and retains a `read_business_billing = null`
new-customer gap. Its original proof is not rewritten.

Pending migration `20261021095000_native_business_billing_home.sql` provisions
an unresolved business billing home when either ordinary creation transaction
records its durable completion: `agency_client_additions` or
`workspace_creation_receipts`. The two actual routes are `agency_add_client`
and `enter_customer_business`. Raw customer workspace insertion alone is not a
completed customer creation path. Existing missing customer homes are backfilled;
existing accounts are never rewritten by the provisioner.

The private helper holds the same workspace advisory boundary (7415) as payer
acceptance, before taking the workspace row lock, matching ordinary business
writes. Existing `accounts_payer_party_stamp` derives the current accepted
party; existing account triggers create the current agency's unpriced client line.
The new helper grants no browser/service RPC execution. The billing reader stays
read-only. No commercial plan, monthly price, Stripe customer, payment intent or
business subscription is selected. An existing agency foundation's wholesale
container and nullable client line are existing protocol behavior, not a new
subscription policy. Native amount and plan remain null; the existing business
serializer's zero amount is not evidence of a free commercial plan. The billing
page's none state renders "Price not recorded" and omits the old monthly/plan
and legacy-agreement claims; priced states retain their existing display.

Completion triggers deliberately avoid bare workspace insertion. Legacy
conversion inserts its workspace before linking the tenant; provisioning there
would alter its initialization and unlink provenance. Its conversion/link
functions and historical migration bytes remain unchanged.

The forward and inverse set a three-second DDL lock timeout and notify PostgREST
of schema changes. Catalog SHA256 comments bind the installed two function and
two trigger definitions. The inverse refuses later successors, removes only
these effects, and retains all billing data, accepted payer/history and lines.
The widened `created_via` constraint remains for retained business provenance.
This is a data-preserving inverse, not erasure of new financial records.

Run focused native proof with:

```bash
bash scripts/check-native-business-billing-home.sh
```

It owns two databases in a unique local socket-only PostgreSQL cluster: all
migrations fresh; exact previous graph with fictional legacy missing/converted
fixtures followed by the new migration. Both run the actual ordinary creation
RPCs, no-privilege/unpriced account assertions, accepted agency party/line,
private helper ACLs, and current conversion compatibility. Upgrade verifies
complete existing account/subscription and accepted transition JSON equality.
Both actual read RPCs run under a service-role read-only transaction. Each graph
passes the read-only function traversal. Two concurrent sessions are explicitly
observed waiting at 7415, exercising provision-first and acceptance-first. A
separate disposable database runs the exact `b40827cd` provisioner body as a
negative control: actual payer acceptance holds 7415, provisioning is observed
waiting, and an actual `patch_business_record` call exposes SQLSTATE `40P01`.
The repaired helper commits the same business write and unpriced home in both
orders, with the second session observed waiting at 7415. No synthetic lock
function or weakened authority replaces the native RPCs. A
future function successor rejects the inverse; rollback/reapply preserve complete
account/line JSON equality. The script stops only its own cluster.

The successor's real local Auth/browser neutral journey also checks native
account provenance/nullable price, the agency's actual unpriced billing read,
and the owner's ordinary business-entry HTTP route. With scoped
`STRELVA_BUSINESS_BILLING=1` it checks the actual signed-in owner billing page at
desktop/390px, unresolved price, actual agency payer and absence of a zero-dollar
monthly-plan claim. The flags-off phase explicitly uses that flag as zero. No accounts are manually
inserted by that browser fixture. The deterministic 21st review CLI was unavailable; no tool or dependency was
installed. Source inspection and actual rendered assertions own this correction.
Its source-specific packet must pin the final
commit and actual results before promotion.

## Preserved failures and limits

The first lock-order qualification reproduced the original deadlock and passed
both corrected interleavings, then failed its later inverse snapshot assertion:
an intentionally aborted negative-control transaction left a missing fixture
home for reapply to backfill. The regression now runs in a disposable clone,
keeping fault fixtures apart from the inverse's retained-account set. The failed
log remains `lockorder-native-attempt-1.log` in the private packet. UI bytes are
unchanged by this repair; the `b40827cd` real Auth/UI proof stays bound to those
bytes, without claiming a fresh full journey at the repaired source.

The first native run stopped in the unchanged legacy test at its stale assertion
that super-admin operator status grants billing read. Current e28 accepts a
business owner/admin or current paying agency owner/admin, and denied that read.
A diagnostic second run reached the existing last-unlink foreign-key failure
against `agency_handoff_receipts_business_workspace_id_fkey`. Both failures are
retained. The original test source was restored. The new scoped conversion
fixture reuses its actual conversion cases, verifies active payment state and
`tenant_conversion` provenance, and records the exact existing last-unlink
refusal with atomic account/link preservation. It does not claim successful
unlink, broader conversion completion or a new authorization policy.

Fixtures are fictional and disposable. Native fresh/upgrade compatibility is
not a scrubbed production copy, production billing, selected commercial price,
real provider transport, real charge, full browser baseline or full1.0 release.
No production, provider, mail, DNS, spend or external mutation was authorized.
