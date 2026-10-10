# Strelva 1.0.0

> **Changed by ADR 0013 / decisions 1–2.** Actor-named receipts show the agency display
> name and "Runs on Strelva" for agency work, or Strelva for automatic platform work.
> "What changed" is the decided place label (October 9). Operator policy settings, client
> delivery/lead access in `/admin`, conversion and privileged admin agency access in the
> local inventory below need engineering follow-up; they do not establish the selected
> neutral-platform authority. Client service uses the ordinary agency path; the business or
> agency is payer per business.

Created: 2026-10-05
Status: launch scope with local implementation on `integrate/reborn-1.0`.
Reviewed against code and Git history at `1060551c` on 2026-10-07.
Nothing here proves a 1.0.0 production release; production was not inspected.

**1.0.0 is Strelva's launch: a business, or the agency running it, opens one
workspace and finds its real systems working.** Its website, inquiries,
bookings, publishing and internal tools read one business record, Strelva
keeps them running, and the owner only sees the few decisions that are theirs.
[Strelva Reborn](./strelva-reborn.md) is the build that gets there. Since
October 6 it builds straight to `1.0.0`; only the lead fix (`0.2.1`) ships
first. This page is the full list of what the launch contains.
[What Strelva becomes at 1.0.0](./product-model.md) is the product model behind
it, area by area.

## October 7: 1.0.0 contains the whole ladder

Jacob decided on 2026-10-07 that every rung of the
[ADR 0009 ladder](../../../docs/adr/0009-make-strelva-how-businesses-get-found-and-served-in-the-ai-economy.md#the-ladder)
is part of 1.0.0. This reverses the earlier "Out" list for Home Finder,
enterprise businesses and owner self-serve website building, and brings partner
agencies in. Production still moves one step at a time behind flags and
Jacob's yes. No price, payout rate or client agreement is set here.

| Rung | 1.0.0 must do | Today | Outside dependency (long pole) |
| --- | --- | --- | --- |
| 1. Free AI Visibility check | Check, one fix, and a measured path into a workspace | Live and public; conversion not measured | None |
| 2. Fix it in minutes | A new business goes from check to a live site without a hand-built repo; owner self-serve building | Rebuild, publishing and connected sites built locally, flags off; no sites domain | Hosted sites domain (DNS needs Jacob's yes) |
| 3. Keep me found | Explicit Responsibility records per business, weekly proof, the 1.0 Systems live | Parts live for clients; 1.0 Systems local | Google Business Profile API approval |
| 4. Agent-ready business | Verified business profile plus agent-callable availability, inquiry, booking, quote and policies, behind approvals and receipts; a public MCP endpoint | Per-work agent tokens in this branch; public booking MCP, customer-confirmed holds and agent receipts local on unmerged `w6/bookings` (audit D) | Google Actions Center appointments redirect partner approval: Search/Maps redirects to the business's booking page; healthcare and legal are supported. In-Google booking is limited to Local Services Ads and restaurants. MCP hosting needs no partner approval; OpenAI/Claude directory listing needs review (audit D) |
| 5. Agencies as distribution | Partner agencies onboard, run portfolios, publish items; attribution and royalties recorded under the partner charter | Agency surface local; no partner, no rates | Signed partner agreement; rates are Jacob's decision |
| 6. Operating the business | Internal tools, onboarding, trackers and checks as Systems | Local engines | None |
| 7. Enterprise and multi-location | Units, pushed standards, access review, audit; Home Finder for a brokerage | Versions local; Home Finder pilot candidate | Participating brokerage plus MLS IDX three-party data license |
| 8. Transactions | Businesses take payment from their own customers; agent-routed bookings and payments | Connect checkout, payment requests and money reconciliation are implemented privately; the supported shared-token adapter is being qualified in the full-model source. Actual account access, settlement and hosted journeys remain unproved | Stripe Connect platform account and per-business onboarding (KYC); billing needs Jacob's explicit authorization |

Outside applications are long poles; code does not establish approval. The
platform must apply for all agencies equally, including Strelva's own agency.
No application, spend or production step is authorized by this page.

The agency uses a neutral platform; Strelva's agency is agency
#1 with no special advantage. A business can also self-serve. These are the
[October 7 decisions](../../../docs/adr/0012-make-agencies-strelvas-customer-on-a-neutral-platform.md),
not claims that the full agency model is implemented.

Channel correction and unmerged agent capability evidence: [audit D, Oct 7](../../../.scratch/agency-1.0/audit/D-agent-ready.md)
(local workspace evidence), [Google appointments redirect](https://developers.google.com/actions-center/verticals/appointments/redirect/overview),
[merchant eligibility](https://developers.google.com/actions-center/verticals/appointments/redirect/policies/platform-policies),
and [Local Services Ads booking](https://developers.google.com/actions-center/verticals/local-services/e2e/integration-steps/overview).

## Specs

| Area | Spec | State |
| --- | --- | --- |
| The model, every area | [product-model.md](./product-model.md) | Draft, Oct 6 |
| Needs you and What changed | [specs/needs-you.md](./specs/needs-you.md) | Draft, Oct 6 |
| Owners entering, leaving `/dashboard` | [specs/owner-entry.md](./specs/owner-entry.md) | Draft, Oct 6 |
| Ask Strelva in the workspace | [specs/ask-strelva.md](./specs/ask-strelva.md) | Draft, Oct 6 |
| Agency surface and Versions | [specs/agency-and-versions.md](./specs/agency-and-versions.md) | Draft, Oct 6 |
| One operator place | [specs/operator.md](./specs/operator.md) | Draft, Oct 6 |
| Internal tools, store, wellness, reports, documents | [specs/systems-catalog.md](./specs/systems-catalog.md) | Draft, Oct 6 |
| Billing, Redis exit, export, outcome loop | [specs/money-and-data.md](./specs/money-and-data.md) | Draft, Oct 6 |
| Publishing | [publishing spec](../capabilities/publishing/publishing-spec-2026-10-06.md) | Draft, Oct 6 |
| Website System | [website-system spec](../capabilities/website/website-system-spec-2026-10-06.md) | Draft, Oct 6; large parts built locally Oct 8 (`w2/website-system`), see its Status |
| Systems Home, System page, Possibilities, Make real | [specs/systems-experience.md](./specs/systems-experience.md) | Draft, Oct 6 |
| Website rebuild | [rebuild spec](../capabilities/website/website-rebuild-spec-2026-10-01.md) | Built locally, flag off |
| Inquiries | [inquiry spec](../capabilities/inquiries/inquiry-first-product-spec-2026-09-11.md) + [1.0 delta](../capabilities/inquiries/inquiry-1.0-delta-2026-10-06.md) | Sept 11 spec amended Oct 6, incl. Redis read cutover |
| Bookings | [bookings spec](../capabilities/bookings/bookings-spec-2026-10-01.md) | Working default, updated Oct 6 to the model |
| Business record, conversion, structure | [Reborn §1, §3, §7](./strelva-reborn.md) | Line-level plan |

The [GitHub map issue #216](https://github.com/Strelva/Strelva-OFFICIAL/issues/216)
is the live backlog. This page records scope and an implementation snapshot,
not a second task tracker. States below were checked against this branch's
code and merged history, rather than copied from earlier progress docs.
"Local" means implemented in this branch unless another branch is named; it
does not establish applied migrations, enabled flags, live provider effects
or production proof. The October 7 source review did not rerun runtime tests.

<a id="what-a-customer-sees-at-launch"></a>

## What an owner sees at launch

### 1. The workspace

| Feature | Today | Source |
| --- | --- | --- |
| Home shows the business's actual Systems, each with Draft/Live/Paused and a separate health signal | Local, merged Systems Home | ADR 0011, `PRIM_SYSTEM` |
| **Needs you**: only the decisions the owner must make, set by policy, not an approval per change | Local, flag off: one policy evaluator; every lifecycle resolves through Needs you (Ask, Make real, Versions included); policy settings for owners and operators; owners who never sign in get every workspace source by email, opened by the logged "Strelva (system)" service actor that never decides (`w3/decision-gaps`, migration `20261009100000` not applied); decided items listed under What changed with an honest undo state, and an owner with no account approves Make real by email link (`w4/journey-gaps`, migrations `20261009130000` and `20261009131000` not applied) | agency-in-the-loop decision, Oct 2 |
| System page: the real thing first (live site, inbox, calendar, tool), Connections, Possibilities and Versions beside it | Local | `DESIGN.md` Oct 4 |
| Possibilities you can open, compare and **Make real**, with honest partial states and undo where undo exists | Local (branch `w2/systems-live`, Oct 6): Possibilities and activations in Postgres (migrations `20261008130000`, `20261008131000`, not applied anywhere), five live channel adapters behind `make_real_live:<channel>` flags (all off), one plan approval through Needs you, cron resume under the Strelva (system) service actor with the owner as approver of record (`w3/decision-gaps`); one Home item per rebuild. No live effect has run outside tests | `COMP_MULTI_SYSTEM_ACTIVATION` |
| Versions: one System adapted per location or client, with shared improvements offered, never forced | Local: Postgres `system_versions` store, lineage, offered improvements and conflicts; Needs you approval; production not verified | `PRIM_CONTEXT_VERSION` |
| Health from real monitors; pause that keeps existing obligations | Local; website health reads real monitors in preview | `RULE_SYSTEM_PAUSE_HEALTH` |
| Ask Strelva inside the workspace, using the same tools as today's owner agent | Local, flag off: route, tools, chat UI and saved conversations (`w2/owner-surfaces-b`); drafts resolve through the Needs you service (`ce114f78`) | Reborn §4 |
| Owners sign in on their client admin host and land in their workspace; old `/dashboard` links redirect | Local: entry, 307s, 18 of 25 pages ready (Today, approvals, leads, reviews, analytics, reports, unknown from `w2/owner-surfaces-a`; chat and the eight website pages from `w2/owner-surfaces-b`; roster and schedule from `w2/bookings-inquiries`); `/settings` stays; flags off | Reborn §6 |

### 2. The systems a business starts with

Each must reach the [capability bar of 5](#the-bar): live with flags on, real
providers, the full trigger → work → approval → outside write → read-back →
receipt → undo loop, failure tests, a production proof on a Strelva-owned test
business, monitoring, and at least the best competitor's bar.

| System | Must do at launch | Today |
| --- | --- | --- |
| **Website** | Live site in the workspace with domain, health and history; edits and publishing for existing sites; connected sites (bring a site made elsewhere via `connect.js`) | Tenant sites live; System page with domains, Waiting on you, Requests and History built locally (Oct 8); connected sites merged locally onto the business record and lead store, flag off, now with a per-business release row and public gate, a daily purge cron, a Home link and inquiries in the workspace inbox (`w3/decision-gaps`); Ask for a change on a managed site files a Request (local); publish-onto-linked-site built locally; rebuild flag off |
| **Inquiries** | Every lead kept, spam review, reply from the workspace, owner notified | Postgres copy of every lead built locally, not applied; read switch, 7-day parity and Postgres-first capture built locally behind off switches (`w2/bookings-inquiries`); spam review in the workspace, `inquiry_events`, workspace read, contact on capture and commitment replies to the owner built locally behind `STRELVA_INQUIRY_RECORDS` (`w3/inquiries-gaps`); flags off |
| **Bookings** | Weekly hours, services, buffers, confirmations, reminders, one booking store, pause | One booking store, hours and services from the record, pause, owner notice, request mode and day/week views built locally behind off switches (`w2/bookings-inquiries`); reminders, request clocks, hold sweep, manage link page, calendar busy times, booking-only hours and schedule copies built locally behind off switches (`w3/bookings-inquiries-gaps`); the visitor's booking keeps working without Redis once the store serves, and says honestly when nothing was booked (`w4/journey-gaps`, local); no agent bookings or MCP |
| **Publishing** | Review replies, Google Business Profile, blog and newsletter, all through approval and receipts | Local: Google listing and newsletter Systems behind `STRELVA_PUBLISHING_RELEASE`; governed writes, read-back receipts and undo in `src/products/google-listing`; blog remains the website path. GBP live writes still depend on API approval |
| **Internal tools** | Agency/Strelva build from a sentence (work plan → app draft); records link to business contacts; notify on submit | Local: agency/Strelva creation checks and business contact/staff links with submit notices (`src/products/applications/internal-tool-links.ts`); drafting remains gated; adoption unverified |
| **Store, rewards, newsletter, wellness** | Existing client features keep working; frozen store/rewards keep their legacy entry | Store and rewards frozen on `/dashboard`; roster/schedule have workspace booking views; newsletter is a Publishing System (see `src/platform/owner-entry/dispositions.ts`) |
| **Analytics and reports** | Read the converted workspace; report crons keep running | Local: workspace analytics and recaps routes; Postgres-first report cadence and analytics config with Redis fallback (`d25a84ef`); live cron behavior unverified |
| **Documents** | Shared documents with history | Local: unlimited revisions; latest 20 receipts in the payload, durable revision history (`src/products/documents/engine.ts`, `0f3ab077`); adoption unverified |

### 3. One business record

| Feature | Today |
| --- | --- |
| Name, address, hours, services, staff, contacts in one record, read by website, bookings and inquiries | Local: record service, contacts and provenance; website/connected-site facts, booking context and inquiry contact capture read/write the record (`src/platform/business-record`, `src/platform/bookings/legacy-ports.ts`, `src/products/connected-sites/server.ts`) |
| History and undo on every edit | Local: revision/history and undo RPCs in `src/platform/business-record/service.ts`; production not verified |
| One owner-recipient rule for every notification | Local: record contact → tenant owner → first linked-site owner, with fail-soft tenant fallback (`src/lib/owner-recipient.ts`, `33a23723`); live routing unverified |
| Export and exit include the record and every linked System | Local schema 3 export includes business record, Systems, linked sites and paged client data; background delivery; explicitly reports unavailable orders, rewards and assets (`src/platform/workspace-exports/v3.ts`). Full portability remains incomplete |

### 4. The agency

| Feature | Today |
| --- | --- |
| Agency home loads every client, not pages of 8 | Local: one scoped overview RPC per 100-client cursor page, Clients/Queue/Library/Team UI and named unavailable rows (`src/experience/workspace/agency-server.ts`, `agency-clients.ts`); not an unbounded all-client load |
| Build, package and bulk-review on the agency surface; owners never have to build | Local: agency drafting plus Library and per-client bulk improvement review (`src/experience/workspace/agency-server.ts`); open signup, verification and neutral-platform commercial model remain backlog work |
| Client Versions of agency sources, with offered upgrades and conflicts shown | Local: Postgres lineage, compare/improvement service and scoped agency Library (`src/platform/system-versions`, `10737a32`); production not verified |
| Human minutes per client measured | Local: per-business monthly minutes and operator close recording (`98cc53e3`, `2569ea33`); no measured delivery economics established |
| Clients and agencies can switch with full history | Local ownership/exit service and schema 3 export (`src/platform/workspaces/business-ownership.ts`); full export and migration-free agency replacement remain incomplete |

### 5. Running it for them

| Feature | Today |
| --- | --- |
| One operator queue across tenants and workspaces | Local: unified projection, queue sources, receipt store and domain view (`src/platform/operator-queue`, `2569ea33`); live operating coverage unverified |
| Every outside write leaves a receipt with read-back and undo | Local: outside-write receipt helper and Google listing/review read-back receipts; explicit undo rules including unavailable undo (`src/platform/operator-queue/receipts.ts`, `src/products/google-listing/receipts.ts`). Universal live coverage unverified |
| Health and domain checks cover every site, including custom-repo clients | Local: coverage includes custom-repo revalidation and hosted-document checks, with bounded fallback domain probes (`src/platform/operator-queue/site-coverage.ts`, `d8e27590`); unknown/stale evidence remains visible |
| Client leads visible to operators | Local, merged: Postgres lead capture/mirror and operator reads (`2e3721ec`); applied migration and live parity unverified |

### 6. Every client moved

| Feature | Today |
| --- | --- |
| All live clients converted into workspaces, storefront responses unchanged | Conversion, scrubbed local rehearsal and rollback scripts merged (`40aa1f9e`, `9408f9b5`, `9c3d403e`); production conversion not verified here |
| All 9 client repos checked against `/api/v1` | Local contract/parity checks exist, including repeatable storefront comparison (`2c07781c`); nine-repo checks were not rerun for this docs change |
| Billing follows the client (subscription, custom, comped, grandfathered `gldf`/`rohlax`) | Local: business billing state, additive checkout `workspaceId` metadata and webhook mirror behind `STRELVA_BUSINESS_BILLING` (`src/platform/business-billing/index.ts`, `bfedae8e`); no live billing changes verified |
| No client data held only in Redis (leads, bookings, orders, rewards, OAuth, analytics config) | Partial local implementation: lead/booking stores, client-record moves and parity, Google grant copy, report/analytics config and grouping have Postgres paths (`96e47154`, `07ffc449`, `d25a84ef`). Orders and rewards remain Redis-only; cutovers and production parity unverified |

### 7. Commercial

| Feature | Today |
| --- | --- |
| Workspace plan and payer per business | Oct 7 scope adds a payer per business (business direct or agency resale), neutral agency access and transactions; **no price, rate or payout set** (ADR 0012) |
| Outcome data loop: site → inquiry → reply → booking → review, measured per business | Local: `business_outcome_month` and workspace outcome line distinguish plain counts from supported joins (`src/platform/business-outcomes/index.ts`, `73df7fa5`); no live conversion or commercial result measured |

<a id="underneath-customers-dont-see-it-launch-needs-it"></a>

## Underneath (business screens don't show it, launch needs it)

- Shared infrastructure out of `src/lib`. (Local, Oct 6, `w5/structure`: in
  `src/platform/infra`; `src/lib` imports no workspace layer (21 files to 0,
  through ports registered at the app edge); `check:boundaries` refuses any
  new crossing; 93 workspace files still import `src/lib`, listed in a
  shrink-only baseline.)
- One capability registry instead of seven declarations (local, Oct 6:
  `src/capability-registry.ts` over the six files, through adapters; the
  declarations are not folded together yet); one finite-job record instead of
  four (Request sent to an agency, agency delivery, work job, budget).
- One model-call helper (earlier audit: 12 call sites); one email sender
  (newsletter now uses `email/send.ts`, `3a0717f6`); one approval store
  (earlier audit: five stores). These counts were not re-audited here.
- Make real progress in Postgres on `work-execution`, not memory. (Local,
  Oct 6: the live service runs on the Postgres activation store and the
  workspace-work cron resumes in-progress activations. Not applied anywhere.)
- A Preview environment with its own Supabase, so testers can sign in.
- Regenerated database types. (Local, Oct 6: from every migration with
  `pnpm db:types`; not from production.)

## Cut or frozen for 1.0.0

From the audit and the Reborn page, pending Jacob's confirmation where marked:

- **Out:** new pricing tiers and `/api/v2`. Home Finder, enterprise, owner
  self-serve website building and partner agencies are in scope under the
  October 7 whole-ladder decision above.
- **Replacement work:** custom applications remain included behind qualified runtime, reviewer, resource and commercial gates. The prepared Sandbox adapter is not provider qualification. Retire `src/experience/delivery`, old Customers management routing and duplicated learning or creation paths only when their new-model replacements and compatibility journeys pass.
- **Merged (audit, needs yes):** tracker into internal tools, saved checks into
  System health, assessment into the website audit, agency website drafts into
  the website System as Possibilities.

## Open decisions for Jacob

1. **What 1.0.0 means on the outside.** Is it a public launch for new
   businesses, or the release where existing clients move in? The list above
   assumes both.
2. **Partner terms and verification.** Agencies are in 1.0.0 under ADR 0012;
   rates, payouts, agreements and the verification bar are not set here.
3. **Website entry for new businesses.** On Oct 2 the paste-URL rebuild was
   ruled out for new businesses in favor of connected sites, but the rebuild is
   still the strongest Possibility in the code. Which one ships?
4. **Model record reconciliation.** Systems, Connections, Possibilities and Versions are the selected implementation model. ADR 0011 still needs its formal decision record reconciled; that paperwork does not reopen the selected model.
5. **The plan price.**
6. **Owners who never sign in.** This is a requirement, not an open scope
   choice. Notification routing and signed Make real links are implemented
   locally; the complete live journey still needs proof.

## The bar

1.0.0 ships when the whole ladder and every line in sections 1–7 is true in
production, proven on a Strelva-owned test business and on converted clients,
and Jacob says it is
something Strelva would stand behind for any new agency or business.

## October 8 full-model convergence

The active completion source is `codex/full-model-integration-20261008`, composed from candidate `3ecb25f1` and explicitly reconciled cleanup, assistant, money, agency and access-review followups. Runtime, neutral directory, Units/standards, Home Finder and Sandbox additions are parallel preparations. Lane tests prove their bounded local behavior, not the final combined source or production. All eight rungs, owners who never sign in, actual provider paths, every active-tenant conversion, recovery, accepted commercial policies and public release remain required. No pilot or smaller release substitutes for this commitment.

Platform support remains separate from agency serving. The released platform Queue no longer reads a privileged Strelva service-request inbox; ordinary agency workspace grants and queues own that work. Historical row contracts stay until compatibility retirement is proven.
