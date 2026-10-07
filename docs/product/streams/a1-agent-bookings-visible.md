# #304 — agent-made bookings are visible

Objective: let an owner or authorized agency recognize agent-made appointments,
approve request-mode bookings through existing Needs you, and see attributable
request counts. Local implementation on `a1/agent-bookings-visible`; no production
migration, deploy, provider write, real email, dependency addition or flag change.

## Behavior and authority

`STRELVA_BOOKING_AGENT_VISIBILITY=1` enables attribution and the source filter;
unset/anything else is off. Owner and agency UI requires the existing workspace
release and Postgres booking-read gates. Agent booking creation still requires
its existing booking agent gates. Visibility does not arm notification switches.

The recorded `origin=agent` plus `business_booking_access.agent_name` supplies
`Booked through <agent>`. Names normalize whitespace, cap at 120 characters and
render as escaped text. Missing names read `an unnamed agent`; no source is
inferred from a customer or fingerprint. Agent names are self-reported, not
verified platform identities.

Owners retain the existing day/week booking actions and history. Source filtering
preserves dates and view. Agencies get a client-list link and read-only booking
details only within the existing active work scope of Bookings Systems. Provider
markers grant nothing. Invalid identity, another business, an unrelated System
and revoked delegation fail closed. The RPC returns at most 500 bookings and
reports truncation; the projection excludes access-token hashes/ciphertext.

Requested bookings reuse `booking_request`, its owner-only resolver, expiry,
recipient binding, revision check and idempotency. The adapter requires no member
actor, so an owner with no account can use the existing `/api/approve` signed
link: GET displays the choice; POST decides. Held bookings await customer
confirmation and create no owner approval. No Needs-you server/contracts or MCP
route was changed. Turning visibility on changes item revisions to include source;
old signed revisions must reconcile through the existing stale-item path.

Needs-you decision receipts, existing gated update receipts, and `/b` native
customer receipts name the source. No new email or notification path was added.
The rollout keeps owner/customer notice switches off; delivery when those gates
are eventually armed uses existing recipient resolution and signed links.

The existing weekly brief receives `N agent requests`, counting native agent
records **created in that reporting period**, including unconfirmed holds. It
never labels that count confirmed bookings. The booking week also shows agent
requests **scheduled for that week**; unavailable/truncated reads omit its count.
These are different periods by design. Unavailable reporting reads omit proof.
There is no new weekly sender or message. Tenantless businesses have the booking
week proof; this does not invent a new tenantless weekly-report delivery system.

## Migration and integration

`20261011140000_agent_booking_visibility.sql` is after the pinned batches/w6
migrations. It adds source to internal `booking_json` and adds two service-only
read functions. Rollback restores the original function and removes these reads;
no stored booking/access rows are removed. Forward/rollback/reapply checks are
wired into `scripts/check-workspace-sql.sh`. Version uniqueness was checked
against integrate and the open w6 PRs.

Shared files: booking store/flags/adapter/updates/manage/server; workspace port
interfaces/loaders; agency reader/schema/views; SQL check runner; component
inventory. Coordinate with platform MCP on additive `StoreBooking.agentName`,
with integration round 2 on the adapter (server/contracts remain untouched),
and with other migration streams on the check runner. Merge target is
`integrate/reborn-1.0`; orchestrator integrates, leaves visibility off and reviews
any later activation separately. No rollout permission is implied by this file.

## Local evidence — October 7, 2026

- `pnpm typecheck`: passed (Next route generation and TypeScript).
- `pnpm lint`: passed.
- `pnpm check:boundaries`: passed, existing baseline 204 workspace/lib imports.
- `pnpm exec vitest run` over agent visibility, updates, signed approval,
  workspace ports/bookings/native/manage, Needs-you source/service, agency
  home/UI, weekly highlights, one-store, owner evidence and agent booking:
  **15 files passed, 204 tests passed, 1 skipped**. Used `--maxWorkers=2
  --testTimeout=30000` on the shared machine. Agency source navigation is tested
  outside the client button. Customer source receipts escape supplied text and
  preserve waiting-for-business status.
- `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql`:
  passed, including the new scope/source/proof fixture and rollback/reapply.
- `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade`:
  full-schema upgrade rehearsal passed in an isolated local cluster.
- The final SQL fixture (including unrelated-System denial) was rerun on that
  isolated upgraded schema, before and after this migration's rollback/reapply:
  passed. No production connection.
- Collaborative browser at 1280×800 and 390×844: owner badges/history/filter,
  provider badges/read-only details and customer receipt source checked.
  Source/date links preserve their values; phone source links are 44px targets.
  Open provider detail shows source and has zero booking-action buttons.
  Flag-off, empty, permission, error and loading fixtures checked at 390px.
  `document.documentElement.scrollWidth` remained 390 at that viewport.

Browser evidence uses the actual components with fictional local fixture data,
not an authenticated live customer. Screenshots:
[owner desktop](evidence/a1-agent-bookings-visible/owner-desktop.png),
[owner phone](evidence/a1-agent-bookings-visible/owner-mobile.png),
[provider desktop](evidence/a1-agent-bookings-visible/provider-desktop.png),
[provider phone detail](evidence/a1-agent-bookings-visible/provider-mobile.png),
[customer phone receipt](evidence/a1-agent-bookings-visible/receipt-mobile.png).

Earlier failures are preserved: the first SQL fixture used a noncanonical System
id and failed its origin contract; fixed to `system_origin_id`. Typecheck first
caught the new port missing from the expected test map; fixed. Concurrent port
imports exceeded the default 5-second test timeout; the bounded final run passed.
`pnpm test -- <paths>` accidentally launched the whole suite, was stopped, and
reported the existing production-readiness sentinel-table assertion failure.
This change creates no tables. No claim is made that the entire suite is green.

Remaining proof: actual owner/provider use, authenticated browser end-to-end,
production schema/readiness, live signed-link email delivery and commercial
adoption. No such evidence is implied by code or local tests.

Next action: integrate the PR, reconcile shared files, rerun integration checks
and keep the rollout flag off. State delta for the orchestrator: native agent
records can now be read as source evidence under current agency scope; no new
external capability, commercial claim or authority has been accepted.
