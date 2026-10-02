# 04 — Interface, page inventory and states

Status: required user tasks and states; proposed composition. The interface study is review evidence, not an approved layout. Jacob's governing direction is simple functionality with deep modules.

## Simple surface contract

`UI-01` Start with the object and the few actions the person came to perform. Modules are internal responsibilities, not navigation items. Access, Service, Performance, Assessment recovery and delivery evidence do not each require a new top-level page. Use contextual detail, a section, dialog or inspector when that keeps the necessary information together. Preserve a standalone view when the task requires substantial space, repeated comparison, stable deep linking or a distinct security boundary.

The current Home, My work and Explore composition is a reversible baseline, not a mandated three-page taxonomy. Customers is proposed for an authorized Enterprise organization; it is not a second agency application. Website controls stay with the selected site. Personal Account and Help remain reachable. Operator navigation remains restricted and separate. A buyer sees the brokerage's public experience, with no Enterprise management frame.

`UI-02` One explicit selector controls personal/organization scope. Customer selection narrows that context; resource identity stays visible in its detail. A direct link resolves and authorizes its context rather than silently choosing another organization. On context switch cancel or ignore stale responses, clear prior selection, and update the URL. Back/forward, reload and sign-in restore the requested object when still authorized. An inaccessible object produces a bounded unavailable/no-access state with a safe return, not another customer's default object.

## Common pages and contextual views

The “placement” column is intentional: a listed view does not imply a new route. Proposed paths are logical routing examples; implementation must select one canonical encoding and preserve existing URLs.

| ID | Surface and placement | Person's intent; visible content | Principal actions | Necessary exceptions |
| --- | --- | --- | --- | --- |
| S-01 | Home, existing `/workspace` view | Start a supported task or return to a result; recent authorized resources and relevant decisions | Start assessment, open result/site/customer | First use, no work, partial discovery failure, release closed |
| S-02 | My work, existing workspace view/state | Find a specific result or site; name, type, ownership, date and relevant state | Scoped search/filter, open; preserve URL selection | No items versus no matches, expired source, revoked share, unavailable payload |
| S-03 | Explore, existing workspace view/state | Understand supported capabilities and actual availability | Open supported entry, preview or existing help | Managed/release-gated/not enabled clearly different; no assumed entitlement |
| S-04 | Assessment entry, existing `/ai-visibility` and `/audit`; common presentation proposed | Choose intended scope and supply business/URL inputs | Run selected assessment; correct retained inputs | Validation, rate limit, unavailable source, interrupted execution |
| S-05 | Public result, existing `/ai-visibility/:id` and `/audit` result flow; retained report `/audit/report/:id` | Inspect findings, sources, method, limits and date | Existing export, explicit private copy where allowed | Partial/not measured, missing/expired report, release gate closed |
| S-06 | Saved result, existing workspace scoped URL state | Reopen one private artifact and understand owner/access | Export, supported recovery, AI Visibility handoff, permitted access controls | Owned/member/delegated, unavailable payload, checkpoint recovery, deleted result |
| S-07 | Handoff preview/acceptance, existing workspace flow | Inspect addressed copy and understand optional agency access | Accept with explicit grant choice, decline/return | Wrong account, unconfirmed email, revoked/expired token, already accepted, concurrent retry |
| S-08 | Customers, new organization-scoped collection view | Find a permitted customer by name/domain; view authorized resource summary | Search, clear filter, open customer | Assigned only, no relationships, source unavailable, removed membership |
| S-09 | Customer detail, new object view | Understand the customer and open their authorized resources | Open assessment/site/installation; inspect relevant access/service | Multiple sites, multiple agencies, unverified identity association, inaccessible resource |
| S-10 | Resource access, contextual section/dialog | Understand ownership and supported grants | Existing handoff/revoke/member controls only | Read-only, pending, rejected, wrong recipient; unsupported transfer clearly unavailable |
| S-11 | Organization people, contextual read section | Know current membership and assignment scope | Inspect known membership/access; use real support path for changes | No management permission, unknown assignment, removed member; no fake invite controls |
| S-12 | Service and billing, contextual summary linking existing settings | Understand actual agreement, payer and support for this object | Open payer-authorized existing billing; contact responsible provider | No agreement, unknown terms, billing inaccessible, existing past-due state |
| S-13 | Help & service, existing workspace view | Ask for assistance with the current context | Open email or copy request | Copy failure, unsent text, no known service; never “Request submitted” without submission |
| S-14 | Account, existing `/workspace/account` and `/account` entry routing | Identify signed-in person and available contexts/sites | Sign out, existing identity/recovery/tenant chooser actions | Signed out, unconfirmed identity, storage unavailable, no tenant, pending invite |
| S-15 | Entry/recovery, existing `/sign-in`, `/sign-up`, `/auth/callback`, `/no-access`, `/access-request` | Authenticate or recover while retaining destination | Current verified authentication and access-request path | Expired link, invalid callback, wrong account, unavailable storage, safe return URL |

`UI-03` Customers needs a collection view because agency members repeatedly compare and select distinct customers. Customer detail needs an addressable object because a customer can have several resources. Access and Service should initially be contextual sections. Do not add an organization-management destination solely to expose unimplemented mutations. Use short direct labels: Customers, Website, Home Finder, Access, Service. Do not display internal module names, installation secrets, schema names, governance internals or product architecture as customer navigation.

## Managed Website route continuity

`UI-04` All existing routes below remain reachable with the same tenant identity and native authorization. They may compose into contextual Website modes after a reviewed replacement proves parity. A direct deep link must continue to open the intended view. The same requirement applies under `/client/:tenant/dashboard/*` and custom-domain routing.

| ID | Existing routes | Intent and minimum content/actions | Required states and consolidation rule |
| --- | --- | --- | --- |
| W-01 | `/dashboard` | See current site evidence and next relevant action | No data, stale source, pending decision, actual completed work; may become Website overview |
| W-02 | `/dashboard/site`, `/dashboard/content` | Inspect site and edit supported content | Selected object, dirty draft, validation, save/publish progress/failure, read-only; retain structured editor |
| W-03 | `/dashboard/assets`, `/dashboard/brand-kit` | Select/reuse real media and brand information | Upload/selection failure, long names, no assets, permitted controls; contextual to site/object |
| W-04 | `/dashboard/collections` | Inspect and edit structured records efficiently | Empty, many records, bulk controls, schema errors, permission denial; retain specialist list/table when useful |
| W-05 | `/dashboard/chat` | Ask Strelva to perform a supported site task | Thread history, stream/error, proposed action, stop/retry when supported; sole full conversation route |
| W-06 | `/dashboard/review`, `/dashboard/history` | Inspect exact proposed change, resolve permitted decision, find prior evidence | Pending/approved/dismissed, accepted/unverified, failure, history unavailable; preserve governance |
| W-07 | `/dashboard/analytics`, `/dashboard/reports`; `/dashboard/health` redirects to `/dashboard/analytics#site-health` | Inspect dated/current performance and site condition | Explicit period and source, no measurements, stale/failing connection, immutable recap; preserve health alias and no merged score |
| W-08 | `/dashboard/google`, `/dashboard/reviews` | Inspect business listing/reputation and prepare allowed action | Disconnected, permission missing, approval pending, reply auto policy, provider acceptance/verification; no new write path |
| W-09 | `/dashboard/integrations`, `/dashboard/sources`, `/dashboard/sources/:id` | Understand connected systems and source evidence | Unconfigured, expired/revoked connection, scope error, sync failure; contextual configuration |
| W-10 | `/dashboard/ownership` redirects to `/dashboard/settings#ownership` | Inspect existing ownership/business settings | Preserve alias, tenant permission and actual supported controls; route name is not evidence of a team/transfer UI |
| W-11 | `/dashboard/settings` | Existing business/account/domain/plan settings | Verified/unverified domain, actual subscription and permission, save failure; retain current authority |
| W-12 | `/dashboard/leads`, `/dashboard/members` | Read tenant inquiries and the separately gated, read-only loyalty/rewards member list | No records, retention window, denied scope, unconfigured/unavailable program; Members is not organization/team access |
| W-13 | `/dashboard/store`, `/dashboard/schedule`, `/dashboard/roster` | Existing conditional commerce/scheduling; Roster shows today's bookings in the tenant time zone | Preserve feature gates/current not-found behavior and local-date semantics; client/provider retains checkout responsibility |
| W-14 | Dashboard loading/error/not-found and catch-all | Retain site context and recover safely | Shared frame, retry where safe, no stale tenant data; no fabricated fallback site |

`UI-05` Ask Strelva is one supported Website assistance capability. It can appear contextually beside site work, but `/dashboard/chat` must not mount a duplicate discussion rail. Open/close returns focus, keyboard users can reach it, and a narrow screen presents one useful working view. An assessment or installation must not display a nonfunctional conversation panel.

## Home Finder and buyers

| ID | Surface and placement | Intent; content and actions | Necessary states |
| --- | --- | --- | --- |
| H-01 | Installation detail, new customer resource view | Brokerage identity, exact authorized origin, preview, readiness, latest delivery evidence, accessible service/access | Sample, requirements missing, configured but unverified, live only with proof, unavailable/revoked |
| H-02 | Readiness/setup, contextual section | State each required piece of evidence and who must supply it | Known/missing/unverified/stale; no decorative percent and no direct activation button |
| H-03 | Deliveries, contextual list with optional inspector | Receipt reference, state, event time; inspect bounded evidence | No retained receipts, pending/delivered/bounced/failed, source unavailable, expired retention; no buyer data |
| H-04 | Buyer preview, existing IDX `/embed/agency-preview` | Inspect synthetic brokerage search and inquiry behavior | Explicit sample label; no sending or storage of buyer input |
| H-05 | Buyer live embed, existing IDX `/embed/:installationId` | Search homes, open detail, knowingly inquire to the brokerage | Loading/no matches, stale/forbidden feed, listing unavailable, consent validation, duplicate submit, pending/delivered/error |

`UI-06` Buyers see brokerage branding and relevant approved attribution, not Strelva/agency management chrome. Search, detail and inquiry can remain states of the embed; do not make three new applications or impose Strelva sign-in on the existing consented inquiry. Installation management does not contain a buyer-contact inbox. Listing metadata in management requires explicit permission; the minimum receipt list needs none. Details are in [specification 05](./05-home-finder.md).

## Operator inventory

`UI-07` Keep the internal operator console distinct. Consolidation may join evidence around the customer, but must preserve the following routes and capabilities until a tested canonical replacement and redirect exist.

| ID | Existing routes | Intent and retained boundary |
| --- | --- | --- |
| O-01 | `/admin` | Portfolio attention and next operator action; freshness and unavailable sources explicit |
| O-02 | `/admin/clients`, `/admin/clients/:id` | Customer/site inspection, contacts, scope, billing, access, integrations and domain operations; correct actor/tenant visible |
| O-03 | `/admin/accounts` | Existing multi-site account/payer grouping; Redis authority and missing joins preserved |
| O-04 | `/admin/tenants`, `/admin/tenants/:id` | Existing compatibility entry/redirect behavior; no new identity inferred from route naming |
| O-05 | `/admin/leads`, `/admin/onboard`, `/admin/pay-links` | Prospect/delivery/intake/payment actions; a prospect need not have a tenant, a pay link is not a subscription |
| O-06 | `/admin/actions`, `/admin/drafts`, `/admin/digests` | Typed proposed work, decisions and maintenance; existing per-item execution/recovery rules |
| O-07 | `/admin/ops`, `/admin/uptime`, `/admin/audit`, `/admin/analytics` | Operational health, freshness, scan/audit and portfolio evidence; retain domain detail and history |
| O-08 | Operator customer installation section, new contextual view | Inspect mapping, provider/operational readiness, content-free evidence and responsible person; configuration changes use separately authorized procedure |
| O-09 | Operator loading/error/not-found | Preserve restricted frame, explain bounded read failure and recover without changing tenant |

## Public, compatibility and unaffected estate

`UI-08` The sibling marketing site remains the public company surface. Inventory the home page; Websites, features and pricing; get-started/contact/login; proof/about; guides/blog; Labs; Operations and legacy redirects; privacy/terms; locality and campaign pages. Update only claims/navigation necessary for the selected release. The existing Operations-as-peer presentation conflicts with selected direction, but deleting old routes is not the remedy. Preserve links and choose a truthful destination under `DEC-10`. Do not redefine the unresolved Custom Software division through REB.

Existing marketing diagnostic/tool/sign-in redirects use `NEXT_PUBLIC_PRODUCT_URL`, defaulting to `https://app.strelva.com`, and must preserve query context. REB's retained `(marketing)` guide/home/legal routes are separate compatibility surfaces. REB `(public)` tenant pages (`/`, about, blog/detail, contact, events, FAQ, links, providers, services, shop) and client-site counterparts retain trusted tenant routing and client branding. Public delivery `/delivery/:token`, `/onboard`, `/pay/:slug` and `/pay/rohlax` retain current acceptance/payment semantics. None become a workspace entitlement or onboarding shortcut.

Development-only `/preview/strelva` and its website/workspace/account fixtures retain both development mode and `STRELVA_UI_PREVIEW=1` requirements. They are not a production feature or an authentication bypass. IDX `/ops` remains a separate public-page checker experiment. These surfaces need regression coverage when routing changes, not redesign by association.

## UI and state requirements

`UI-09` Apply the global and local design contracts: existing shadcn/components/tokens first; 8px grid with 4px subgrid; contextual density; quiet dark Strelva surfaces, sage action semantics, readable sans and selected display serif. Use `font-display`, never the cold-Turbopack-breaking arbitrary family form. Use shared spacing/type/control tokens and purposeful containment. A customer/resource list should read as objects, not repeated promotional cards. Long names, dates and realistic record counts must fit without hiding the main action.

`UI-10` Every changed surface implements applicable loading, empty, no matches, unconfigured, unavailable, forbidden/revoked, pending, success, partial and error states. Distinguish “nothing exists” from “could not read”; “prepared” from “applied”; “provider accepted” from “delivered/verified”; “unknown agreement” from “free”; “preview” from “live”. Errors preserve entered text and useful context. Success copy states exactly what was confirmed.

`UI-11` Target WCAG 2.2 AA through actual rendered checks: semantic headings/landmarks, labeled controls, meaningful link/button names, correct keyboard order, visible focus, accessible validation and status announcements, contrast and no color-only state. Modal navigation/dialogs trap focus appropriately, close with Escape, restore focus and remain scrollable. Ordinary content reflows at 320 CSS px; genuine tables/maps may have contained horizontal scrolling. Touch targets should be at least 44px, with the WCAG minimum/exceptions verified. Respect reduced motion and keep controls available without hover.

`UI-12` Audit the actual changed experience in the T3 Code collaborative browser at 360, 768, 1280 and 1600px plus layout transitions; separately inspect 320px reflow, enlarged text, long names and populated/error states. Exercise the relevant direct-user, managed-owner, agency-member, customer/brokerage, operator and buyer journeys. Fixture screenshots alone do not prove authentication or domain action. Fix reversible in-scope defects and record subjective tradeoffs for Jacob. Finish with the relevant changed page open in T3 for review.

Acceptance mapping: S/W/H/O inventory plus `AC-01` through `AC-15` in [specification 07](./07-delivery-and-decisions.md). There is no requirement to build a distinct route for every row.
