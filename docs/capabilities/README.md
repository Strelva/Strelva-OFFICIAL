# Capabilities

Updated: 2026-10-05

Every customer capability in this repo, what it does, how live it is, and where
its code, specs, and tests live. Start here before building on a capability.
Specs for a capability sit in its folder under `docs/capabilities/`.

Capabilities are the code inventory. Customers see the Systems built from them
([CONTEXT.md](../../CONTEXT.md#product-model), October 4).

## Status words

| Status | Meaning |
| --- | --- |
| **Live** | Serving real clients in production today. |
| **In production, unproven** | Deployed and reachable since the Sept 30 workspace release (`STRELVA_WORKSPACE_RELEASE=1`), but no authenticated production journey has run yet ([release record](../operations/strelvav2-horizontal-acceptance.md#september-30-workspace-production-release)). |
| **Flag off** | Code is on `main` but its own release flag is unset in production. |
| **Local only** | Uncommitted or unmerged work. Not on `main`. |
| **Not enabled** | Code exists. Nothing turns it on. |
| **Internal** | Operator or super-admin only. |

Two data models run side by side. The **tenant model** (`src/lib`, `/dashboard`,
`/admin`, `/api/v1`) is the live managed-website business. The **workspace
model** (`src/platform`, `src/products`, `src/experience`, `/workspace`,
`/api/workspace*`) is where new capability goes. See
[architecture](../architecture/README.md).

## At a glance

| Capability | What the customer gets | Model | Status | Specs |
| --- | --- | --- | --- | --- |
| [Managed website](#managed-website) | Strelva edits, publishes, and maintains their existing site | Tenant | Live | [visual editor](./website/visual-editor.md) |
| [Website drafts](#website-drafts) | Create a site draft, preview it, approve it for launch | Workspace | In production, unproven | — |
| [Website rebuild](#website-rebuild) | Paste a URL; it crawls, audits, and composes a new hosted site | Workspace | Local only (`STRELVA_WEBSITE_REBUILD_RELEASE`) | [spec](./website/website-rebuild-spec-2026-10-01.md), [benchmark](./website/website-rebuild-benchmark.md) |
| [Website agent](#website-agent) | "Ask Strelva" drafts site, Google, review, and blog changes for approval | Tenant | Live | — |
| [Bookings](#bookings) | Visitors reserve time without conflicts; calendar sync | Both | Tenant widget live for the wellness set; workspace scheduling in production, unproven | [spec (proposed)](./bookings/bookings-spec-2026-10-01.md) |
| [Inquiries](#inquiries) | Form submissions become governed threads with follow-ups | Both | Tenant leads live; workspace inquiries flag off (`STRELVA_INQUIRIES_RELEASE`) | [spec](./inquiries/inquiry-first-product-spec-2026-09-11.md), [acceptance](./inquiries/inquiry-first-acceptance-2026-09-11.md), [security review](./inquiries/inquiry-first-architecture-security-review-2026-09-11.md) |
| [Publishing](#publishing) | Blog/collections, reviews and replies, Google Business, social, newsletter | Tenant | Live (Google and reviews are per-tenant) | [collections CMS](./publishing/collections-cms.md) |
| [Internal apps](#internal-apps) | A private form plus working list for business records | Workspace | In production, unproven | — |
| [Custom applications](#custom-applications) | Build, review, and release a sandboxed HTML/JS app | Workspace | In production, unproven | — |
| [Website audit](#website-audit) | Score a site on SEO, accessibility, security, trust, AI readability | Both | Live (public `/audit`) | [audit engine](./audit/audit-engine.md) |
| [AI visibility](#ai-visibility) | How ready a business is to show up in AI answers | Both | Live (public); private save in production, unproven | — |
| [Documents](#documents) | Procedures, proposals, notes with reviewed changes and history | Workspace | In production, unproven (opens only for saved document work) | — |
| [Tracker](#tracker) | A CSV becomes working data with edits and history | Workspace | In production, labelled Experimental | — |
| [Onboarding](#onboarding) | Collect required documents and see what's missing | Workspace | In production, unproven | — |
| [Ongoing checks](#ongoing-checks) | Compare two records or a public site and flag disagreement | Workspace | In production, unproven | — |
| [Delegated work](#delegated-work) | Approve a bounded result; keep progress and evidence together | Workspace | In production; background runs flag off (`STRELVA_BACKGROUND_WORK_RELEASE`) | — |
| [Work plans](#work-plans) | AI drafts a plan that executes into apps, documents, trackers | Workspace | Flag off (`STRELVA_PLANNING_ENABLED`) | — |
| [Billing](#billing) | Stripe subscriptions, pay links, workspace allowances | Both | Stripe live; workspace allowances in production, unproven | — |
| [Analytics and reports](#analytics-and-reports) | Traffic, Search Console, weekly and monthly reports | Tenant | Live | — |
| [Domain monitor](#domain-monitor) | Flags managed domains that are down, parked, or expiring | Tenant | Internal | — |
| [Product learning](#product-learning) | Collects research evidence from registered sources | Workspace | Internal, flag off in production | — |
| [Home Finder](#home-finder) | Guided home search for brokerages (separate product) | Workspace | Not enabled | — |

Also present but not customer capabilities on their own: enterprise customers
(`src/platform/customers`, double-gated, flag off), rewards and store
(tenant `ecommerce` feature set), workspace exit and export, and public
continuation (carry a public result into a workspace).

## Where capabilities are declared

There is no single registry. Six files each name a slice:

| File | Declares |
| --- | --- |
| `src/server/capabilities.ts` | The 10 executable operations (`create_application`, `website.draft`, `schedule.command`, …) and their qualification tests. `src/platform/capabilities/registry.ts` is the generic factory. |
| `src/platform/products/executables.ts` | The six workspace executables shown in `/workspace`. |
| `src/platform/products/catalog.ts` | Descriptive commercial catalog (`ai_visibility`, `managed_presence`, `domain_monitoring`, `homefinder`, `documents`, `tracker`). Grants nothing. |
| `src/platform/offerings/definitions.ts` | Installable offerings: `private_staff_requests`, `customer_inquiry_intake`, `managed_website_changes`. |
| `src/lib/capabilities.ts` | Tenant agent capabilities (`website`, `blog`, `reviews`, `google_business`, …). |
| `src/lib/features/registry.ts` | Tenant dashboard features and sets (`wellness`, `ecommerce`). Not billing. |

`src/lib/site-capabilities.ts` is separate again: which sections and actions a
tenant site supports, served to client repos at `/api/v1/site-capabilities`.

## Release flags

All are checked with `=== "1"`.

| Flag | Gates | Production |
| --- | --- | --- |
| `STRELVA_WORKSPACE_RELEASE` | `/workspace` and nearly every workspace API | On since 2026-09-30 |
| `STRELVA_INQUIRIES_RELEASE` | Workspace inquiries, `/business` | Off |
| `STRELVA_SYSTEMS_RELEASE` | The Systems customer model: the Systems projection in `GET /api/workspace` (with `releases.systems` telling the browser), Systems on Home, System pages (`view=system`), Possibilities, Make real (`POST /api/workspace/systems/make-real` answers 503 when off), contextual Versions and the agency source/Version list. Off, the workspace renders as it did before transition/systems. A 1.0.0 launch feature, not Reborn ([Reborn in Systems terms](../product/strelva-reborn.md#reborn-in-systems-terms)). Local preview: add `systems=on` or `systems=off` to `/preview/strelva` | Off (code not on `main`) |
| `STRELVA_NEEDS_YOU_RELEASE` | Needs you and Strelva handled from the decision policy ([spec](../product/specs/needs-you.md)): `GET/POST /api/workspace/needs-you`, `POST /api/workspace/needs-you/undo`, workspace-keyed one-tap links at `/api/approve`, the hourly `/api/cron/needs-you` chase, and Home reading the new model (`releases.needsYou`). Off: routes answer 503, workspace links refuse, the cron records a heartbeat only, Home is unchanged. On, every email still goes through `email/send.ts`, so while client email is gated deliveries are recorded as suppressed ("owner not told"). Local preview: add `needsYou=on` to `/preview/strelva` | Off (code not on `main`) |
| `STRELVA_PLANNING_ENABLED` | Work-plan generation | Off |
| `STRELVA_BACKGROUND_WORK_RELEASE` | `/api/cron/workspace-work` | Off |
| `STRELVA_PRODUCT_LEARNING_RELEASE` | Product learning in production | Off |
| `STRELVA_CUSTOMERS_RELEASE` | Enterprise customers | Off |
| `STRELVA_WEBSITE_REBUILD_RELEASE` | Rebuild and hosted website documents | Code not on `main` |
| `STRELVA_CALENDAR_FIXTURE` | Fixture calendar adapter (tests only) | — |

---

## Managed website

Strelva runs a managed client's existing site: content, drafts, versions,
publishing, domains, provisioning.

- **lib:** `src/lib/storage/{content-store,draft-store,version-store,page-config-store,site-snapshot-store}.ts`, `site-capabilities.ts`, `apply-section-update.ts`, `custom-repos.ts`, `content-revalidation.ts`, `verify-live.ts`, `domains.ts`, `provisioning.ts`, `deprovision.ts`
- **workspace projection:** `src/products/managed-presence/` (links tenant sites into a workspace without copying data)
- **pages:** `/dashboard`, `/dashboard/{site,history,assets,brand-kit,ownership,settings,review,store}`, `/admin/{tenants,clients,drafts,websites}`, public render `src/app/(public)/**`
- **API:** `/api/content/*`, `/api/publish`, `/api/page-config`, `/api/edit-preview`, `/api/live-preview`, `/api/site-snapshots`, `/api/media`, `/api/change-requests`, `/api/approve`, `/api/tenant/domains`, `/api/v1/{content,page-config,site-capabilities}/[tenant]`, `/api/admin/tenants/[id]/*`
- **tests:** `content-*`, `site-*`, `managed-presence-*`, `domain-lifecycle`, `tenant-*`; Playwright `dashboard-owner`, `owner-surfaces`, `control-plane-smoke`, `cross-tenant-access`
- **docs:** [visual editor](./website/visual-editor.md), [delivery model](../architecture/custom-repo-delivery-model.md), [client-repo build standard](../architecture/client-repo-build-standard.md), [tenant redesign](../operations/tenant-redesign.md), [domain setup](../operations/domain-setup.md)

## Website drafts

- **products:** `src/products/websites/{server,contracts,artifact,generation,preview,deployment,published-capabilities}.ts`
- **experience:** `src/experience/websites/`, `src/experience/workspace/WorkspaceApp.tsx` (view `websites`)
- **API:** `/api/websites`, `/api/websites/[workId]/{approve,connections,domain,export,handoff,history,launch,patch,preview,share,undo,…}`, `/api/offerings/websites`, crons `website-health`, `website-domain-verification`, `monthly-report`
- **tests:** `website-*`, `websites-routes`, `websites-server`, `offering-websites-route`; Playwright `website-creation-authenticated-local`, `website-history-authenticated-local`, `offering-websites-authenticated-local`
- **note:** launch prepares files. It doesn't deploy or connect a domain.

## Website rebuild

Paste a URL; it crawls the site, audits it, and composes a hosted site document.

- **products:** `src/products/websites/rebuild-*.ts`, `site-document*.ts`, `document-store.ts`, `hosted-public.tsx`, `site-{seo,routing,health,sharing,report,media,render-tree,export}.ts`, `agency-document-*.ts`
- **experience:** `src/experience/websites/{RebuildExperience,OperatorRebuildEntry,WebsiteRebuildReport,WebsiteRebuildSharing}.tsx`, `src/experience/agency-website/`
- **pages/API:** `/admin/websites`, `/agency-websites/[bindingId]`, `/preview/strelva/rebuild`, `/api/websites/rebuild`, `/api/websites/[workId]/rebuild`
- **migrations:** `20261001120000_website_documents.sql`, `20261001140000_agency_website_document_drafts.sql`
- **docs:** [spec](./website/website-rebuild-spec-2026-10-01.md), [benchmark](./website/website-rebuild-benchmark.md)

## Website agent

"Ask Strelva" for tenants. Reads and drafts edits to the site, Google Business,
reviews, blog, and newsletter. Writes go through governance and owner approval.

- **lib:** `src/lib/agent-shared.ts` (the one set of agent tools), `agent-executor.ts`, `agent-prompt-shared.ts`, `agent-risk.ts`, `ai-governance.ts`, `ai-auto-approve.ts`, `ai-review-queue.ts`, `event-actions.ts`, `src/lib/agent/`, `src/lib/governed-work/` (tables not yet applied)
- **pages/API:** `/dashboard/chat`, `/api/agent`, `/api/chat`, `/api/threads`, `/api/admin/agent`, `/api/suggestions`
- **tests:** `agent-*`, `website-agent-tools`, `gbp-agent-tools`, `ai-governance`, `ai-auto-approve`, `governed-work-*`
- **docs:** [governed work](../architecture/ontology-phase2-governed-work.md)

## Bookings

- **tenant:** `src/lib/booking.ts`, `src/lib/storage/booking-store.ts`, `/api/booking/*`, `/dashboard/{schedule,members,roster}` (wellness feature set), Calendly via `/api/connections/calendly`
- **workspace:** `src/products/scheduling/` (incl. `calendar/` adapters and OAuth, `public-booking*.ts`), `src/experience/scheduling/`, `/api/workspace/{calendar-*,public-bookings}`, `/api/v1/bookings/[tenant]/*`
- **migrations:** `20260920070000_workspace_calendar_connections.sql`, `20260920122000_public_website_bookings.sql`
- **tests:** `booking-*`, `bounded-scheduling`, `calendar-*`, `public-booking-*`; Playwright `calendar-*-authenticated-local`, `public-website-bookings-authenticated-local`
- **docs:** [bookings spec](./bookings/bookings-spec-2026-10-01.md) is proposed; nothing in it is built yet

## Inquiries

- **tenant leads:** `src/lib/{leads,lead-workflow,lead-spam,spam-pit,tenant-crm}.ts`, `/dashboard/leads`, `/admin/leads`, `/api/v1/leads/[tenant]`, `/api/access-request/intake`
- **workspace:** `src/products/inquiries/`, `src/experience/inquiries/`, `/business[/[tenant]]`, `/api/inquiry-workspace/*`, `/api/v1/inquiries/[tenant]`, cron `inquiry-follow-ups`
- **migrations:** `20260911100000_inquiry_capability_workspace.sql`, `20260920040000_offering_inquiry_workspace.sql`
- **tests:** `inquiry-*`, `leads`, `lead-*`, `spam-pit`; Playwright `inquiry-*`
- **docs:** [spec](./inquiries/inquiry-first-product-spec-2026-09-11.md), [acceptance](./inquiries/inquiry-first-acceptance-2026-09-11.md), [security review](./inquiries/inquiry-first-architecture-security-review-2026-09-11.md)

## Publishing

- **collections and blog:** `src/lib/cms/`, `/dashboard/collections`, `src/app/(public)/blog`, `/api/collections/[type]`, `/api/v1/collections/[tenant]/[type]`
- **reviews:** `src/lib/reviews.ts`, `src/lib/reviews/`, `review-replies.ts`, `/dashboard/reviews`, `/api/reviews/*`, crons `poll-google-reviews`, `poll-yelp`, `review-auto-post`, `review-nudge`
- **Google Business:** `src/lib/{gbp-management,gbp-replies,google-resources,google-token}.ts`, `/dashboard/google`, `/api/gbp/state`, `/api/oauth/google`
- **social and newsletter:** `src/lib/storage/{social-store,newsletter-store}.ts`, `/api/social`, `/api/newsletter/*`, `/api/oauth/instagram`
- **tests:** `cms-*`, `review-*`, `reviews-*`, `gbp-*`, `testimonials`, `social-store-postgres`, `newsletter-store-postgres`
- **docs:** [collections CMS](./publishing/collections-cms.md), [content spine](../architecture/ontology-phase4-content-spine.md). Google writes need approval except review-reply `auto` mode.

## Internal apps

- **products/experience:** `src/products/applications/`, `src/experience/applications/`
- **pages/API:** `/apps/[workId]`, `/agency-applications/[workId]`, `/api/apps/[workId]`, `/api/bounded-work` (`applications`)
- **tests:** `application-*`, `bounded-applications`, `app-templates`; Playwright `application-*`, `staff-request-offering-authenticated-local`

## Custom applications

- **products/experience:** `src/products/custom-applications/` (Docker build, iframe CSP sandbox), `src/experience/custom-applications/`
- **pages/API:** `/custom-applications/*`, `/api/custom-applications/*`
- **tests:** `custom-application-*`; Playwright `custom-application-*`

## Website audit

- **lib:** `src/lib/audit/`, `scan.ts` and `scan-store.ts` (the one scanner), `audit-report-store.ts`
- **products:** `src/products/website-audit/` (saves as workspace work), `src/products/assessment/` (shared presentation with AI visibility)
- **pages/API:** `/audit`, `/admin/audit`, `/api/audit/*`, `/api/dashboard/site-audit`, `/api/admin/scan`, cron `portfolio-scan`
- **tests:** `audit-*`, `scan`, `scan-store`, `website-audit-work`, `assessment-contracts`
- **docs:** [audit engine](./audit/audit-engine.md)

## AI visibility

- **products:** `src/products/ai-visibility/`; tenant monitoring in `src/lib/visibility/`, `ai-visibility-scorecard.ts`
- **pages/API:** `/ai-visibility[/[id]]`, `/api/ai-visibility/*`, cron `visibility`
- **tests:** `ai-visibility*`, `visibility*`
- **note:** "monitoring" today is sales follow-up, not an activated monitoring product.

## Documents

- `src/products/documents/`, `src/experience/workspace/DocumentExperience.tsx`, `/api/documents`; tests `documents-route`, `workspace-document`

## Tracker

- `src/products/tracker/`, `src/experience/workspace/Tracker*.tsx`, `/api/tracker`; tests `tracker-*`, Playwright `tracker-*`
- The only workspace product whose operations are marked `supported`. The UI still says "Experimental".

## Onboarding

- `src/products/onboarding/`, `/workspace/onboarding`, `/api/onboarding/*`; tests `onboarding-*`
- Not the retired tenant `/onboard` flow, which now redirects to the access request.

## Ongoing checks

- `src/products/investigations/`, `/api/bounded-work` (`investigations`); tests `bounded-investigations`, `investigation-website-source`

## Delegated work

- `src/products/operations/`, `src/experience/operations/`, `/api/operations/*`, `/api/operational-assignments`, cron `workspace-work`
- tests `operational-*`, `standing-*`, `workspace-operations`, `work-execution*`

## Work plans

- `src/products/work-plans/`, `src/experience/workspace/WorkPlan*.tsx`, `/api/work-plans[/execute]`; tests `work-plan*`

## Billing

- **tenant:** `src/lib/{billing,billing-plans,subscription,pricing,pay-links,orders,revenue,accounts}.ts`, `/pay/[slug]`, `/api/billing/*`, `/api/checkout`, `/admin/pay-links`. `billing-plans.ts` is plan truth.
- **workspace:** `src/platform/work-economics/`, `/api/work-economics/*`, `/api/work-allowances/*`
- **tests:** `billing-*`, `subscription*`, `pay-link*`, `allowance-*`, `work-economics-*`

## Analytics and reports

- `src/lib/{analytics,reports,report-cadence,weekly-brief,search-console}.ts`, `/dashboard/{analytics,reports}`, `/api/track`, `/api/v1/track/[tenant]`, crons `weekly-report`, `monthly-report`, `search-console`
- **docs:** [activation runbook](../operations/activation-runbook.md), [tracking rollout](../operations/tracking-rollout.md)

## Domain monitor

- `src/lib/{domain-monitor,domain-monitor-store}.ts`, `src/products/domain-monitor/`, `/admin/uptime`, cron `domain-monitor`

## Product learning

- `src/products/product-learning/`, `src/experience/operations/LearningExperience.tsx`, `/admin/work`, `/api/product-learning`. Super-admin only.

## Home Finder

- `src/products/home-finder/`, `src/platform/customers/home-finder-port.ts`, `/preview/strelva/customers`. Needs `HOME_FINDER_*` env; not sold.
