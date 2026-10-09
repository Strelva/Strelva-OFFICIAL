# Agency 1.0 agent channel: prepared implementation

October 7, 2026; private branch preparation for #301–303, #306–310, and #311.
Local implementation and fictional proof do not establish deployment, native
assistant-client compatibility, legal approval, provider verification or demand.

October 8 client preparation: [The Mooney Firm with Claude](../../operations/client-mcp-mooney-2026-10-08.md)
adds safe no-selector profile bootstrap and an unauthenticated readiness probe on
an isolated child branch. Website edits, renewable grants, owner connection
management and real Claude use remain explicit gates.

## Native chain

One `/api/mcp/public` server offers public discovery, confirmed policies, booking,
inquiry, quote request and opaque status tools. `/api/mcp/bookings/{tenant}` remains
a thin business-bound public alias. The current 2026-07-28 request metadata and
headers coexist with accepted 2025 protocol versions. Catalogs are deterministic.
Owner context/inquiry/quote approval tools require OAuth on the same server;
public tools need no OAuth. Booking writes retain customer email confirmation.
Inquiries and scoped owner work are available independently of booking rollout.

Inquiry requests append `tenant_leads`, with explicit `origin: agent` and the
assistant's name, never an invented free-text source. The existing spam scorer
and `held_as_spam` state remain the native truth. Whole-request idempotency returns
the original encrypted opaque capability. Status expires after 30 days, binds to
one business and returns no contact details. A quote adds an active native
service, scope and service area. The reply-by time exists only for an
owner-confirmed published response policy. Pending provider edits preserve the
last confirmed policy; an unconfirmed policy creates no response promise.
Public evidence counts and dates read the confirmed fact copy, including
provider-origin facts approved by the owner, and exclude private recipients.
An owner approval creates one immutable
`agent_quote_receipts` record; there is no computed price or automatic email.
Ordinary receipt/lead deletion is refused; canonical retention and business
cascades own removal. Tests prove no quote/token orphan after business deletion.

Money uses that exact receipt as `business_payment_requests.source_record_id`.
The payment request must copy its amount, currency and terms and join its
`lead_id` to the native visitor record. Agent quote arguments and public status
metadata cannot independently authorize a charge. Payment-tool activation is
outside this lane and remains unavailable without the real approved seller
preview adapter.

## Authorization and confirmation

October 8 prepared owner-assistant update: rotating one-hour access within a
30-day connection family, owner list/disconnect, business context and native
website read/proposals are documented in
[owner assistant MCP](../../operations/owner-assistant-mcp-2026-10-08.md).
Claude and Croki/Codex native sign-in remain unproved. The original baseline
below predates this renewable preparation.

The independently implemented OAuth path accepts public CIMD clients, exact
registered redirects, S256 PKCE and RFC8707 resource indicators on code issuance
and exchange. Codes expire in five minutes and can be consumed once. Tokens
expire in one hour with no refresh. Only hashes are stored. Metadata fetches use
validated, pinned public IPv4 sockets, no redirects, a 16KB body bound and an
entire-operation deadline that destroys the request. IPv6-only metadata hosts
are currently unsupported and refused. No legacy broad tokens migrate.

Every agency token names one agency, one business, one user and the exact current
provider-seat row. The user must remain an agency member and active staffed
client assignee. Replacement seats cannot revive old tokens. Protected native
operations lock current token and grant rows inside their transaction. Agency
access supports `business:read`; customer inquiry/contact access and price
approval are owner-only. Minimal protected-resource discovery advertises
`business:read`; each tool challenges its exact required scope. Consent POSTs
require a verified session, same-origin JSON and explicit business selection.
Session and client-bound RFC7009 token revocation are supported.

Per-business customer-confirmation consent and `agent_channel` workspace release
are both required. This path does not enable owner notices or reminders and still
requires the customer-delivery, booking messages and manage-page switches.
#235 must select the live messaging scope before any activation. No email was
sent in this work. An explicit per-business off stops new holds/inquiries while
existing status capabilities and customer confirmation remain usable.

## Public evidence and abuse

A shared verification profile powers MCP and `/biz/{handle}`. `/b/{token}` keeps
its established customer booking job. Domain control uses confirmed connection
records, owner fact counts exclude scraped/agent facts, and agency names use
current seats. GBP linkage is shown separately from provider verification;
provider verification remains unknown because native connection rows do not
prove it. `sameAs` adds verified domain/GBP links only. Issued hosted websites
can expose `/llms.txt` and confirmed Service/Offer/OpeningHours/ReserveAction
JSON-LD; preview and flags-off sites do not. Hosted robots and the explicitly released app host allow the contract
and MCP discovery paths; flags-off legacy robots remain identical.

Existing identity-aware egress limits and disposable-email refusal remain gated
by `STRELVA_AGENT_IDENTITY_LIMITS`. Native admission additionally enforces 20
holds/hour per normalized assistant name and 5/hour per canonical mailbox per
business, independently of IP, alongside the existing ten-live-hold business cap
and shared anonymous booking budget. Inquiries have analogous durable caps.
An operator-only 24-hour confirmation ratio below 20% with at least ten holds
creates a scoped queue alarm. These thresholds are starting policy, not measured
customer demand.

## Gates and local proof

All new surfaces are off by default. Relevant switches are
`STRELVA_AGENT_INQUIRIES`, `STRELVA_MCP_OAUTH`, `STRELVA_AGENT_READABLE`,
`STRELVA_AGENT_ABUSE_MONITOR`, `STRELVA_AGENT_CHANNEL_RELEASE`, and
`STRELVA_WORKSPACE_RELEASE`. Confirmation also needs an owner consent receipt and
operator-selected workspace release. No production flags or provider state changed.

```sh
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash scripts/check-agent-channel-sql.sh
pnpm exec vitest run src/__tests__/agent-channel-*.test.ts src/__tests__/agent-readable-profile.test.ts src/__tests__/agent-identity-limits.test.ts src/__tests__/platform-mcp.test.ts src/__tests__/platform-mcp-directory.test.ts src/__tests__/booking-mcp.test.ts src/__tests__/booking-updates.test.ts src/__tests__/business-pages-routes.test.ts src/__tests__/website-tenant-metadata-routes.test.ts src/__tests__/release-flags.test.ts
pnpm typecheck
pnpm check:custom-repos
```

The focused SQL runner applies the complete ordered schema in throwaway Postgres
and probes real native transactions. It does not replace historical upgrade or
rollback proof. Consent uses the owned Card, Button and SelectInput primitives;
its fictional local specimen is doubly gated under
`/preview/strelva/agent-oauth`. Desktop/mobile, empty, pending, error and missing
permission states were inspected. The shared public evidence component was also inspected with fictional
populated/unknown evidence on desktop and mobile; a real published native fixture
still needs combined release preview proof. The private
[directory package](./agent-directory-package/README.md) records prompts, seed
rehearsal, client metadata, video script and external submission stop points.

Primary authorization contract:
[MCP 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).
Resource binding: [RFC8707](https://www.rfc-editor.org/rfc/rfc8707).

Next: integrate the money receipt seam, run combined upgrade/rollback and native
client proof, then resolve #235 and the separate legal/directory publication
facts. Company/product models should record this as prepared local capability,
not a live distribution channel or verified business connection.
