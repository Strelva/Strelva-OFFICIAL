# Tenant teardown evidence ownership

Tenant teardown classifies records by their SQL owner, not the presence of a
`tenant_id` column. These classifications do not grant a new deletion authority.

| Record | Owner and teardown behavior | Lifecycle |
| --- | --- | --- |
| `connected_inquiry_owner_notices` | Workspace/lead delivery evidence; historical routing slug has no tenant FK. Retained, never directly counted or slug-swept. | `purge_expired_tenant_leads` removes notices child-first only for expired orphan leads. Business-attached leads and their notices survive. |
| `operator_google_write_attempts` | Durable command reservation and accepted/uncertain outcome. Historical tenant scope has no FK; outside-write receipt FK restricts deletion. Retained through closed native RPC ownership. | Accepted, unknown and pending attempts must not be erased to permit replay. **Attempt request expiry is not implemented by the listing payload purge.** |
| `workspace_newsletter_issues` | Immutable workspace publication history. Linked tenant FK still refuses tenant deletion; native nullable targets belong to the workspace. Never slug-swept. | Issue and batch history survives. An attempted linked tenant deletion rolls back atomically. There is no authorized detach/delete history operation. |

The dry-run native website blocker reader currently covers publications,
reservations and bookings; it does not enumerate newsletter issue holds. A dry
run is discovery, not a guarantee that an atomic delete can complete. The final
SQL FK refusal must leave Systems, records and external cleanup untouched.

Closed evidence tables appear in teardown summaries with unknown counts and
`deleted: false`; this does not manufacture a privileged read or claim an export.
The receipt-retention flag retains the existing outside-write receipts, while
its disabled path may be refused by the attempt FK. Neither path weakens it.

The current Google listing payload lifecycle expires API-observed listing
payloads after 29 days independently of durable action receipts. That operation
is unchanged. It does not cover `operator_google_write_attempts.request`; a
separate provenance-aware request minimization policy remains necessary before
claiming all Google content follows the same deadline.

Prepared native check: `scripts/sql/tenant-teardown-evidence-owners.sql`, run only
inside the coordinator's owned local PostgreSQL window. It reads actual catalog
FKs, privileges, immutable trigger and orphan-purge owner. It is not a populated
teardown proof. No applied migration is changed by this patch.
