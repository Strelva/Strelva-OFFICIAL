# 05 — Home Finder access and integration

Status: selected direction to prepare selected Home Finder capabilities for Enterprise agencies; proposed read-focused integration. Live installations, provider rights, terms and activation are unproven.

## Existing product and gaps

`HF-01` Preserve the separate IDX runtime and its domain authority. Inspected sources are [PRODUCT.md](../../../strelva-idx-ops/PRODUCT.md), [STATE.md](../../../strelva-idx-ops/STATE.md), [AGENTS.md](../../../strelva-idx-ops/AGENTS.md), [installation types](../../../strelva-idx-ops/src/lib/installations/types.ts), [inquiry workflow](../../../strelva-idx-ops/src/lib/inquiries/workflow.ts), and [internal receipt route](../../../strelva-idx-ops/app/api/internal/inquiries/[requestId]/route.ts).

Existing implementation includes brokerage-branded search/detail/inquiry, synthetic preview, server installation configuration, MLS filtering/freshness gates, signed listing identity, idempotent encrypted inquiries, provider events, retries and retention. `HOME_FINDER_INSTALLATIONS_JSON` is server-owned configuration with `demo` or `live` mode; default `agency-preview` is synthetic. “Preparing”, “requirements missing” and readiness evidence are proposed management projections, not existing persisted installation modes.

The internal receipt API checks `INQUIRY_WORKER_SECRET` and returns a raw receipt by request ID. It has no Strelva user/organization/installation-scoped management boundary. The raw record contains destinations, listing identifiers/address, provider message ID and notification internals. Existing store operations do not establish a paginated agency receipt list. These gaps must be implemented before connecting the proposed management UI.

## Minimal Enterprise capability

`HF-02` The proposed initial operations are: open an authorized installation, preview buyer behavior, inspect explicit readiness evidence, and inspect content-free delivery state. Configuration changes use the existing manual operator procedure after separate authority. No agency activation, destination edit, provider enrollment, automatic provisioning, lead inbox, buyer export or manual Resend action is included. The functional interface is “Open Home Finder; see what is ready and whether inquiries were delivered.”

`HF-03` REB maintains the explicit actor → organization membership/assignment → customer relationship → installation association defined in `AUTH-03`. IDX validates the installation. The association is not inferred from brokerage/agency name, domain, receipt email or possession of a request ID. One organization must not enumerate another's installation IDs, record counts or receipt existence. A brokerage's direct Strelva membership is separately mapped; it does not inherit agency access.

## Proposed server-to-server contract

`HF-04` Add a versioned management-read API in IDX with a dedicated server credential or signed audience-bound request. Do not reuse the broad worker secret as the browser or Enterprise authorization model. Proposed logical operations are `readInstallationSummary`, `readReadiness`, `listDeliveryReceipts`, and `readDeliveryReceipt`. Exact route names/auth mechanism are implementation details finalized in `IMP-05`; the following security properties are required:

- REB authenticates the person and authorizes the specific operation/installation before sending a request.
- Requests bind exact installation, operation, audience, expiry and correlation ID; scope cannot be changed by browser parameters or an untrusted downstream response. If signed tokens are used, validate issuer/audience, expiry, signature and replay rules appropriate to the read protocol.
- IDX checks service authority and installation scope before reading; a receipt lookup must include/match installation ID, including when request IDs are globally unique.
- The response is a typed allowlist with a schema version and source observation time. Unknown fields are stripped. REB validates the echoed installation before projecting it.
- Dedicated credentials remain server-only and independently rotatable. Apply TLS, request timeout, bounded response/body size, rate limiting and private no-store response headers. Never put credentials or buyer data in URLs or logs.

A broad internal read followed by browser filtering is unacceptable. Prefer IDX producing the safe projection itself; REB applies a second allowlist. Service authentication is not a replacement for REB's per-person authorization.

`HF-05` Proposed browser-safe minimum:

```ts
type InstallationSummary = {
  id: string;
  brokerageName: string;
  mode: "demo" | "live"; // Existing runtime mode, not proof of operation.
  approvedOrigin?: string; // Only authorized, verified public configuration.
  previewHref?: string; // Server-generated and allowlisted.
  observedAt: string;
  readiness: Array<{
    requirement: string;
    state: "confirmed" | "missing" | "unverified" | "stale";
    observedAt?: string;
    responsibleParty?: string;
  }>;
};
type DeliverySummary = {
  reference: string; // Opaque management reference; not a bearer credential.
  state: "pending" | "delivered" | "bounced" | "failed";
  occurredAt: string;
  expiresAt: string;
};
type DeliveryPage = {
  installationId: string;
  observedAt: string;
  items: DeliverySummary[];
  nextCursor?: string;
};
```

The browser receives no buyer name, email, phone, message, criteria, encrypted payload, destination email, worker/service secret, provider message ID, notification retry state, raw MLS record or signed inquiry token through management APIs. Listing address/metadata is omitted in the minimum; add only after product/provider policy review. Counts are installation-scoped and must not imply conversions or guaranteed receipt by a human.

`HF-06` Add the missing installation-scoped receipt list in IDX over its authoritative store. Use stable pagination ordered by event time and opaque reference, bounded page size, scope-bound cursor and the existing retention window. An empty list means the authorized query succeeded and no retained records matched. Expired history, missing receipt, unavailable store, forbidden scope and provider-pending state remain distinct internally; external responses avoid existence disclosure. No REB mirror becomes delivery authority. Optional cached projections must be private, short-lived, source-versioned and invalidated on revocation; the safe initial implementation is no-store.

## Readiness and live gate

`HF-07` Show separate evidence requirements, source/date and responsible party for: participating brokerage; provider/MLS authorization; approved attribution/display/filter/freshness rules; exact HTTPS embedding origin; verified brokerage inquiry destination; verified agency receipt destination; server credentials/configuration; persistent store/backup/worker readiness; and consented end-to-end delivery proof. Do not expose secrets or private destination values merely to show that verification exists.

A `live` config value alone is insufficient for a “Live” product claim. Confirm current authorized configuration, permitted data and operational evidence; stale/missing checks produce their real state. Management availability can be “Preview available” while live operation remains blocked. Do not show a percentage that hides one blocking requirement. Evidence needs provenance and a responsible actor, not a checkbox set by the viewing agency.

`HF-08` The management read contract may be implemented and reviewed using synthetic data before provider authorization. Any actual installation, origin/DNS/site change, credentials, enrollment, production deploy, worker schedule, buyer-data handling, real email or commercial promise requires explicit authority. Prepare the exact changes and evidence before requesting it. Readiness presentation does not authorize activation.

## Buyer and delivery invariants

`HF-09` Demo mode must neither post nor persist buyer information and must explicitly say the inquiry is a preview. Live listing results must satisfy provider displayability and feed freshness; insufficient feed-level evidence fails the live result closed. Signed listing tokens bind installation, current listing identity and address. Browser input cannot choose recipient, brokerage, origin or MLS policy.

`HF-10` Preserve submission idempotency, bounded validation/rate limits, encrypted original routing snapshot, retry policy and webhook verification. Provider send acceptance means pending. Only the verified `email.delivered` event confirms delivery. Bounce/failure has separate evidence; a failed management read does not change delivery status. A destination configuration change cannot reroute an already accepted job. Do not expose a retry control until the IDX product has a reviewed idempotent operation for it.

`HF-11` Preserve seven-day inquiry-content retention and twelve-month content-free receipt retention, with the existing purge/expiry behavior. REB does not extend these windows by copying raw data, and logs/analytics must not become an accidental content store. A receipt is evidence of provider-confirmed delivery state, not evidence a broker read or acted on the inquiry. Brokerage owns the buyer relationship; the agency receives permitted content-free evidence.

## Operations and commercial boundary

`HF-12` Pilot SQLite requires persistent single-writer Node storage, backups, recovery proof and a scheduled worker. Do not place it on an ephemeral or multi-writer application target, or assume the REB Vercel deployment can host it. A new database/search index is a separately justified product change; no shared-runtime extraction is required for this interface integration.

The [pilot offer](../../../strelva-idx-ops/HOME-FINDER-PILOT.md) contains prior agency-first prices and support allocation; it does not prove accepted payment, renewal or new Enterprise terms. The [provider onboarding handoff](../../../strelva-idx-ops/TRESTLE-ONBOARDING.md) documents items to verify, not current permission. Direct brokerage sales, transferred installations, agency support and payer changes remain decisions. Do not publish unverified provider, compliance, SEO, adoption or revenue claims.

Acceptance: `AC-06`, `AC-09`, `AC-10`, `AC-11`, `AC-15` in [specification 07](./07-delivery-and-decisions.md). Release can close read-integration acceptance while live-inventory acceptance remains explicitly blocked; the public release claim must match the narrower result.
