# Customers read boundary

This module is the IMP-05 read boundary for explicit enterprise customer
relationships. It is intentionally not a CRM, billing projection, or mapping
loader.

## Read contract

The routes are closed unless both `STRELVA_WORKSPACE_RELEASE=1` and the
independent `STRELVA_CUSTOMERS_RELEASE=1` gate are enabled:

- `GET /api/customers?organizationId=<uuid>&q=<optional>&limit=<1..50>&cursor=<opaque>`
  returns only relationships with an active organization membership and an
  explicit active `customer:read` assignment.
- `GET /api/customers/<customerId>?organizationId=<uuid>` returns that assigned
  relationship and only resources with an explicit active `resource:read`
  assignment. A Home Finder resource additionally requires
  `installation:read`.
- `GET /api/customers/<customerId>/resources/<resourceId>?organizationId=<uuid>&view=summary|readiness|receipts|receipt`
  reads one assigned Home Finder installation view. Receipt lists accept only a
  bounded `cursor`/`limit`; one receipt accepts only an opaque `reference`.
  Mapping and membership are rechecked before any response is returned.

All responses are private, no-store projections. They do not return payer,
service, provider, buyer, receipt, or opaque resource-reference fields. Search
is applied only after scoped assignment resolution; cursors are HMAC-signed and
bound to the actor, organization, and query. `STRELVA_CUSTOMERS_CURSOR_SECRET`
is preferred for cursor signing; the stable server-only Supabase service key is
the documented fallback when a dedicated secret is not configured.

## Mapping boundary

The additive migration stores relationships, resources, assignments, and
append-only scoped audit events. IDs and mapping identity (including opaque
resource references) are immutable. Versions are database-owned. Native
workspace membership removal cascades live assignments while retaining audit
evidence. No browser role receives direct table privileges or a mutation route.

The mapping records are not created from workspace owner/admin titles. A direct
brokerage/customer context is valid only when it is an explicit mapped
workspace/person assignment. Provenance and evidence references stay on the
server-side record; the safe customer projection contains only relationship
provenance.

## Product readers

Website resources keep the existing `requireTenantAccess` boundary. Saved
assessment resources use the workspace `getWork` repository, and discard the
work payload. Home Finder uses the dedicated server adapter with
`HOME_FINDER_MANAGEMENT_BASE_URL` and
`HOME_FINDER_MANAGEMENT_SIGNING_KEY`; the reader and installation endpoint
derive a fixed installation scope and ask only for the exact typed management
operation (`readInstallationSummary`, `readReadiness`, `listDeliveryReceipts`,
or `readDeliveryReceipt`). Missing configuration is
`not_configured`, while a source or native-permission failure is
`unavailable`. The IDX adapter remains the authority for readiness and
content-free delivery reads; REB stores no receipt mirror.

All examples in `fixtures.ts` and `tests/customer-mapping-schema.sql` are
fictional and isolated. They are not a private-record reconciliation or an
installation grant.
