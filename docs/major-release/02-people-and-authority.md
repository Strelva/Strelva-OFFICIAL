# 02 — People, customers and authority

Status: existing identities preserved; new Enterprise customer/resource mappings and the proposed least-authority policy require review. This is not a replacement authorization framework.

## Nouns and records

`AUTH-01` Use these distinctions in contracts and tests. Expose them in the interface only where the person needs them to act.

| Object | Meaning and authority | Required relationship |
| --- | --- | --- |
| Person | Verified Supabase identity | Can belong to several contexts and retain a personal workspace |
| Workspace | Existing private result ownership/access context | Persisted kinds remain `personal`, `agency`, `customer`; roles remain `owner`, `admin`, `member` |
| Organization | A group of people acting together | Do not assume it is a Website account or rename a workspace kind into a commercial status |
| Customer | A person/organization receiving work or service in a particular relationship | May have several resources and several separately scoped agency relationships |
| Managed tenant | Stable identity for a managed website | Tenant membership and permissions remain authoritative; slug is a routing key |
| Installation | IDX-owned brokerage search and inquiry configuration | Explicit mapping to a customer and permitted organization; installation ID is not a grant |
| Saved result | Private product artifact in a workspace | Owner is that workspace; public result access is not ownership |
| Delegation | Existing active `work:read` grant on a specific customer copy | Never grants editing, Website access, installation access or billing |
| Payer | Party responsible under an actual billing arrangement | Separate from beneficiary, owner, actor and service provider |
| Service | Explicit accepted scope and responsible provider | Connected, paid, requested and enabled do not mean responsibility accepted |
| Enterprise | Selected relationship category including agencies | Describes the relationship; specific product permissions and commercial terms still required |

Existing source: [workspace types](../../src/platform/workspaces/types.ts), [relationship projection](../../src/platform/relationships/index.ts), [tenant mapping](../../src/lib/tenants.ts), [operator accounts](../../src/lib/accounts.ts). Postgres org-layer tables are not the live operator-account read path. The Redis accounts store remains authoritative for that feature.

## Authorization contract

`AUTH-02` Every private operation resolves a verified actor, the selected context, the resource's authoritative owner and the exact operation. Server authorization occurs before fetching protected provider data or returning a projection. Client-visible capability flags explain server decisions; they never authorize requests. The proposed order is:

1. Enforce route authentication, release gate and request integrity.
2. Validate identifiers and request shape without disclosing whether a private object exists.
3. Resolve active membership in the selected workspace/organization.
4. Resolve the explicit customer/resource relationship and any required person assignment.
5. Apply the product's own permission, consent, billing, governance and provider gates.
6. Read or execute using the authorized resource identity, then return the allowed projection.

This sequence composes current guards; it must not replace `requireTenantAccess`, `requireTenantPermission` or `requireTenantPermissions`. Service-role access bypasses RLS, so application checks remain mandatory. An operator's global enumeration is never reused for a customer's Home or Customers view.

## Proposed Enterprise minimum

`AUTH-03` Add a versioned, server-owned customer/resource relationship store for Enterprise reads. The following are logical contracts, not selected table names or claims of existing rows:

| Record | Required fields/invariants |
| --- | --- |
| Customer relationship | Immutable ID, organization workspace ID, customer display identity, optional explicit customer workspace ID, active/revoked state, evidence reference, recorded-by actor, timestamps and version |
| Resource association | Relationship ID, product/resource kind, immutable external resource reference, provenance, active/revoked state; uniqueness within the relationship; no implicit domain/name merge |
| Person assignment | Organization membership reference, relationship/resource reference, permitted read operations, active/revoked state, grant source and version |
| Installation association | Customer relationship plus exact IDX installation ID and allowed management reads; referential validation by IDX; no receipt destination or worker secret in this record |

A resource association says what belongs in the customer view; it is not permission to write that resource. The release must explicitly choose storage and mapping stewardship in `DEC-02` before implementation. Proposed storage is additive Postgres tables within the current REB boundary, with scoped repository operations, audit and RLS defense in depth. Do not repurpose unused org tables, live Redis account IDs or customer workspace IDs as interchangeable identity.

`AUTH-04` Proposed default: a member sees only explicitly assigned customers/resources. An organization owner/admin sees the relationships they are explicitly permitted to administer; the title alone does not grant every customer resource. Product reads require both relationship scope and native permission where the domain requires it. This conservative default is reviewable under `DEC-03`; the interface can be built against fixtures before selecting broader administrator visibility.

No public self-service operation creates an Enterprise relationship or turns `create_agency` into accepted Enterprise service. Existing agency workspace creation can continue under its current contract; the new commercial presentation must distinguish workspace kind from verified Enterprise relationship. Unknown service status is explicit. Proposed mappings are initially prepared and reviewed by the existing restricted operator path; creation/import requires evidence and a scoped action, not a blanket seed of all tenants.

## Operation matrix

`AUTH-05` The matrix specifies minimum checks, not a universal role enum.

| Operation | Required scope | Explicitly insufficient |
| --- | --- | --- |
| Read personal work | Verified identity plus owned/member workspace access | Signed-in email without membership |
| Read delegated result | Exact active delegation and agency-context access | Being in the same agency or knowing the work ID |
| Save a public result | Allowed target workspace plus retained server-owned source | Browser payload, public URL ownership claim |
| Create handoff | Existing supported AI Visibility source and authorized agency context | Website Audit, arbitrary result shape, payer status |
| Accept handoff | Valid unexpired addressed token, matching verified recipient and explicit consent | Matching unverified email, forwarded URL, prior acceptance by another person |
| Revoke agency read | Existing customer-owner authority on the relevant grant | Agency request alone; billing cancellation |
| List Customers | Active organization membership and authorized relationship scope | Enterprise label or global tenant enumeration |
| Open a Website | Existing tenant access; exact write permission for each action | Customer row, resource association or handoff |
| Read installation overview/receipts | Active installation association and permitted actor assignment | Worker token in browser, receipt/request ID alone |
| Change IDX destination/origin | Separately authorized operator configuration procedure and verification | Read access, agency admin title, submitted request |
| Read billing | Payer/account-specific permission | Resource delivery access, beneficiary or agency membership |
| Act as Strelva operator | Existing super-admin/operator boundary and contextual action authority | Enterprise membership or customer invitation |

`AUTH-06` Revocation takes effect on the next authorized request and prevents stale in-flight responses from repainting the old context. Recheck authorization before each consequential execution and before returning long-running protected results. Clear client caches and selected objects on membership/context changes. Revoking one agency does not delete the customer, source/copy records, another agency's grant, tenant service, or installation. Transfer of ownership, service, billing or installation is a distinct operation, deferred until `DEC-06` defines the policy.

## Copy, delegation and exit

`AUTH-07` AI Visibility acceptance creates or returns the customer-owned copy through the existing transactional handoff path. Show source agency, recipient, exact result and whether optional agency reading will be granted. The customer can accept without the grant. The source agency retains its own source result; revoking read access to the customer's copy does not remove that original. Avoid “take back everything” copy. Duplicate and concurrent acceptance must resolve to one customer copy and one grant for the accepted handoff. Website Audit remains unsupported for handoff.

`AUTH-08` A customer can use a direct Strelva account while authorizing an agency. Removing an agency must leave direct access intact. Organization leave/closure, personal export/deletion, resource transfer and contractual retention require defined domain procedures; do not add apparently complete buttons backed only by local UI. Existing supported account and ownership operations remain reachable. Where closure is not self-service, show the actual support route and what must be handled; a copied email is not a submitted ticket. `DEC-09` resolves retention/closure policy before a new promise is made.

## Payer and accepted service

`AUTH-09` A read projection of service includes covered resource, beneficiary, payer identity when authorized, provider/support responsibility, agreement reference/date, scope, known status and evidence timestamp. Missing terms render “Service details unavailable” or “No service agreement recorded” according to actual store evidence. Do not default to free, active or managed. Do not expose another party's price, invoice, email destination or collection history merely because the resource is visible.

Keep existing Website subscriptions and one-off ledgers in their current authority. No account-level Paid User billing/entitlement path is established by workspace membership. The agency may be payer, service intermediary or collaborator only when an actual agreement says so. Existing Home Finder pilot support allocation and prices are not automatically Enterprise terms. New packaging, direct brokerage sales, agency support responsibility and metering remain `DEC-04`, `DEC-05` and `DEC-07`.

Acceptance: `AC-02`, `AC-03`, `AC-05`, `AC-06`, `AC-10`, `AC-15` in [specification 07](./07-delivery-and-decisions.md).
