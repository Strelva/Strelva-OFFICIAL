# Systems transition map

Created: 2026-10-04
Kind: transition inventory. It maps today's code onto the selected customer
model. It is not an ADR, a release plan or production evidence.
Base: branch `reborn-business-record` at `276bb09a`.

**Every piece of Strelva today lands in one of four customer nouns, or
underneath them.** A business has **Systems** (the website, the booking
page, the intake form, the staff app). Each System has **Connections** (it
reads the business record, appears on the website, acts through Google).
A **Possibility** is a working alternative you can open and compare before
it replaces anything. **Make real** switches it on. A **Version** is the
same System adapted for another place, segment or agency client.

The selected model lives in the `PRODUCT_MODEL.md` ledger (records
`DESIGN_SYSTEMS_PRODUCT_MODEL`, `PRIM_SYSTEM`, `PRIM_SYSTEM_CONNECTION`,
`PRIM_POSSIBILITY`, `PRIM_CONTEXT_VERSION` and the `RULE_*` records). That
file is untracked and outside this branch, so it is cited by record ID, not
linked.

The short version of what this inventory found:

- **The System identity already exists, under another name.** Almost every
  native thing a business makes is a `saved_product_work` row: websites,
  internal apps, custom apps, schedules, onboarding cases, trackers,
  documents and checks. The managed website for a live client is a
  `tenants` row reached through `stable_id`. A System registry can sit on
  those two IDs without moving any data.
- **The best working Possibility is the website rebuild.** It builds a
  complete alternative site beside the live one, shows before and after,
  and then publishes with per-step launch states. That is the Possibility
  and Make real loop for one System, already built behind a flag.
- **Nothing in the code is a contextual Version yet.** Every "version" in
  the code today is a temporal release or revision. The closest real case
  is Twin Trees: one paying account, two location sites
  (`twintrees-camillus`, `twintrees-fayetteville`).
- **Three different tables link a workspace to a tenant.** These are
  `offering_website_bindings`, `tenant_workspace_links` and
  `website_hosted_tenant_reservations`. The managed-website System has to
  pick one.
- **Two concepts don't fit the four nouns.** The first is what Strelva
  promises to keep true: responsibilities, the "Running" place. The second
  is finite requested work: service requests and delivery commitments.
  Both are real and both are priced or contracted. They need their own
  nouns rather than being squeezed into System or Possibility.

## How to read the tables

Each row gives:

- **Lands as:** one of `System`, `Connection`, `Possibility`,
  `Make real`, `Version`, `release/revision`, `supporting`, `health` or
  `retire`.
  - `release/revision` is the temporal history axis (`RULE_CONTEXT_VERSION_IDENTITY`
    keeps it separate from Versions).
  - `supporting` means records, grants, operations, receipts or money, which
    stay underneath and are never a customer noun.
  - `health` is the operational health and pause state that
    `RULE_SYSTEM_PAUSE_HEALTH` keeps separate from Draft, Live and Paused.
- **Risk:** risk to the live clients on the tenant model if the change is
  done wrong.
- **Lane:**
  - B: `src/platform/systems`
  - C: `src/platform/possibilities` and `src/platform/make-real`
  - D: `src/platform/system-versions`
  - E: `src/experience/systems` and the workspace routes
  - F: `src/platform/system-health` and scheduling pause
  - G: AGENTS.md, CONTEXT.md, DESIGN.md, the Reborn page and ADRs
  - "—" means the code stays as it is and is only read by an adapter.

Inferences are marked *(inference)*. Everything else cites a file read on
this branch.

## The four nouns and what already exists for each

| Noun | Strongest existing seed | Gap |
| --- | --- | --- |
| System | `saved_product_work` (`id`, `workspace_id`, `product_id`, `resource_kind`, `source_work_id`) in `supabase/migrations/20260905190000_release_one_workspaces.sql`; `tenants.stable_id` for live sites | No row says "this is a System". Identity is per product: `website_work_id`, `work_id` and tenant slug. No shared lifecycle. |
| Lifecycle | `InquiryCapabilityStatus = draft \| live_unverified \| live \| paused \| failed` (`src/products/inquiries/contracts.ts`) is the closest match to Draft/Live/Paused with health beside it | Each product has its own states: application `draft/installed/retired`, custom app `draft/released/retired`, website `building/review_ready/approved/published/failed`, schedule `active/paused`. |
| Connection (System to System or resource) | `work-context` source grants (`read` or `use_in_work`, pinned to the source revision, stale on change) in `src/platform/work-context/service.ts`; `public_website_booking_grants` (a booking appearing on a website); `InquiryConnectionView.canSee/canDo` (`src/products/inquiries/connections.ts`) | No typed kind (`read/act/appear/share/depend/trigger`) and no propagation policy. |
| Connection (external account, the old `PRIM_CONNECTION`) | Redis `connections:{tenant}:{provider}` (`src/lib/connections.ts`, `google-token.ts`); `workspace_calendar_connections`; `domain_claims`; `integration-registry.ts` status `connected/needs_reauth/sync_failed/not_configured/unknown` | Tenant Google tokens live only in Redis. Workspace and tenant connections are separate stores. |
| Possibility | Website rebuild (`src/products/websites/rebuild-*.ts`, `RebuildExperience.tsx` "Before and after", "Approve this preview"); inquiry rehearsal (`REHEARSAL_CHECK_IDS`, state `rehearsing`); tracker experiments (`src/products/tracker/experiment.ts`, evidence `simulated/operator_reported/measured`); work-plan proposed apps ("Review a proposed app before anything is created") | Every one is single-System and product-specific. None pins a baseline across Systems. A proposed app plan is a suggestion, not something you can open and use, so it falls short of `PRIM_POSSIBILITY`. |
| Make real | Website launch states `launch_started/launch_prepared/launch_confirmed/launch_failed`; `inquiry_publication_claims` (`claimed/accepted/verification_failed/failed`); governed-work `proposals → decisions → execution_attempts → outcomes`; `execute_work_plan_output` atomic receipt; standing responsibility `admit` | No grouped, multi-effect activation. Each product publishes on its own. |
| Version (contextual) | None in code. The closest lineage mechanism is inquiry patterns: `PatternInstallationStatus = installed \| update_available \| conflicted` (`src/products/inquiries/contracts.ts`, `inquiry-pattern-updates.ts`). That is a shared origin offering an upgrade that can conflict with local changes. Offering `definition_version` is the other hint. | Must be built. Twin Trees is the real same-business case. Agency origin to two clients is the cross-business case. |
| release/revision | `application_releases.version`, `custom_application_releases.version`, `website_documents.revision` + `website_document_heads.approved_revision`, `content_versions`, `site_snapshots`, `business_record_revisions`, offering `definition_version` (semver) | Already consistent in spirit: immutable published rows plus a head pointer. They keep the name "version" in storage, but the customer word becomes **History** or **Releases**, never Version. |

## Inventory: `src/platform`

| Module | Evidence | Lands as | What has to change | Risk | Lane |
| --- | --- | --- | --- | --- | --- |
| workspaces | `src/platform/workspaces/` (`workspaces`, `workspace_memberships`, `saved_product_work`, delegations, handoffs, invitations, `workspace_operations`) | supporting (the Business root); `saved_product_work` is the **System identity seed** | System registry references `saved_product_work.id` rather than copying payloads. `source_work_id` is lineage between work items, not Version lineage; do not reuse it for Versions. | Low. Workspace-only; no live client has a workspace (Reborn page, Oct 2). | B |
| business-record | `src/platform/business-record/`, `20261002120000_business_record.sql` | supporting (the business context every System reads) | Becomes the source of `read` Connections. "Website reads hours" is a Connection from the website System to the record, not a copy. | Medium. Conversion writes facts from live tenants; unapplied in production. | B (connection), — (record) |
| business-record `tenant_workspace_links` | same migration | supporting; anchor for the **managed-website System** of each converted client | Pick this as the one workspace-to-tenant link and have offering bindings and hosted reservations read through it (see "Missing or colliding concepts"). | High if a second link disagrees: wrong site shown for a business. | B, G (ADR) |
| offerings | `src/platform/offerings/definitions.ts` (`private_staff_requests`, `customer_inquiry_intake`, `managed_website_changes`, all `1.0.0`), `offering_installations` (`draft/active/retired`) | supporting (commercial packaging + install record); customer noun **retired** | An installation creates or attaches a System. Its `definition_id@definition_version` is the System's origin, which is the hook for Version lineage. Stop showing "Installed offerings" and "Retired offerings". | Low. Workspace-only. | B (install → System), D (origin), E (UI) |
| offerings `offering_website_bindings` | `20260915060000_offering_websites.sql` | Connection (business ↔ managed site), duplicate of the tenant link | Fold into `tenant_workspace_links` or make it a typed Connection that references the link. | Same as above. | B |
| offerings agency drafts | `agency-website-draft*.ts`, `agency_managed_website_draft_{grants,revisions,preparations}`; `agency-draft-access.ts` | supporting (grant) + **Possibility** prepared by a provider for one System | An agency draft is a candidate change to the client's System, so it is a Possibility on that System. The grant stays a grant. It is **not** a contextual Version (see below). | Medium. Writes through to client website drafts. | C, D (reject mapping), — (grants) |
| offerings provider delivery | `provider-delivery*.ts`, `offering_provider_deliveries` | supporting / missing concept (provider commitment) | Keep. Surfaces as "who operates this System". | Low. | G (vocabulary) |
| capabilities | `src/platform/capabilities/` (registry, `version`, qualification) | supporting (executable action contracts) | Make-real steps call qualified capabilities by exact version. No customer noun. | None. | C (consumer) |
| products | `src/platform/products/catalog.ts`, `executables.ts` (`websites`, `onboarding`, `applications`, `scheduling`, `investigations`, `operations`) | supporting; `executables` becomes the list of **System kinds** Strelva can make | The kind is an implementation category, not identity (`PRIM_SYSTEM`). Catalog products like `ai_visibility` and `homefinder` are not Systems. | None. | B |
| work-context | `src/platform/work-context/` (source grants pinned to revision, facts `current/stale/conflicting`) | **Connection** (`read`/`depend` with freshness); closest existing contract to `RULE_SYSTEM_CONNECTION_CONTRACT` | Generalize from work-to-work grants to System-to-System connections; keep revision pinning and stale detection. | None. | B |
| work-participation | `src/platform/work-participation/` (grants, contributions, `operational_assignments`) | supporting (grants); "share" Connection kind for people | `share` is access. Keep assignment as the provider path. | Low. | — |
| agent-access | `src/platform/agent-access/` (scoped tokens per work) | supporting (grant); a `share` Connection to an outside AI | Token scope becomes "this System, read/propose". | Low. | — |
| work-execution | `engine.ts` (responsibility DAG, `paused`, `needs_attention`), `standing.ts` (`proposed/active/paused/revoked`) | supporting + **missing concept** (Responsibility, "What Strelva keeps running") + health/pause | Standing work attaches to a System. Pause of a System pauses its standing work and keeps receipts. | Low. Workspace-only. | F (pause), G (noun) |
| work-economics | `src/platform/work-economics/` (jobs, allowances, payer transitions, Stripe sync) | supporting (money) | Make real preflights budgets here (`COMP_MULTI_SYSTEM_ACTIVATION` step 2). No change to Stripe. | High if touched: live Stripe. Do not touch. | C (read only) |
| service-requests | `src/platform/service-requests/` (`draft/requested/withdrawn`, delivery commitment `proposed … accepted`) | **missing concept** (finite requested work) | A request can target a System or ask for a new one. It is not a Possibility until something exists to open. | Low. | G |
| bounded-work | `src/platform/bounded-work/` (revision + history base for payloads) | release/revision | Becomes the per-System revision log for native kinds. | None. | — |
| public-continuations | `src/platform/public-continuations/` | supporting (imports a public result into a workspace) | A continued public audit can seed a Possibility. | None. | C (optional) |
| relationships | `src/platform/relationships/` | supporting (display status) | None. | None. | — |
| customers | `src/platform/customers/` (enterprise mapping, Home Finder readiness) | Connection (to an external product) + health | Home Finder is out of Reborn scope. Keep it behind `STRELVA_CUSTOMERS_RELEASE`. | None. | — |
| workspace-exit | `src/platform/workspace-exit/` (resource kinds `offering/standing/investigation/native_application/custom_application`, `successor_named/stopped`) | supporting (retirement lifecycle) | Exit must list Systems by System ID and each one's Versions and Connections. `RULE_SYSTEM_PAUSE_HEALTH` keeps retirement as a backend concern. | Medium: wrong exit drops data. | B, F |
| workspace-exports | `src/platform/workspace-exports/` (`schemaVersion: 2`) | supporting | Add a `systems[]` section in schema 3, additively. | Low. | B |
| workspace-release.ts | `STRELVA_WORKSPACE_RELEASE` | supporting (gate) | The whole System UI also needs `STRELVA_SYSTEMS_RELEASE` (`src/platform/systems-release.ts`, October 5): Systems Home, System pages, Possibilities, Make real and Versions. Off, the workspace renders as it did before. | None. | E |

## Inventory: `src/products`

| Module | Evidence | Lands as | What has to change | Risk | Lane |
| --- | --- | --- | --- | --- | --- |
| websites | `src/products/websites/` (44 files): `document-store.ts` (v2 documents), `rebuild-*.ts`, `site-health.ts`, `deployment.ts`, `domain-verification.ts`; `WebsiteLifecycle = draft/preview_ready/approved/launch_pending/published/failed`; rebuild `building/review_ready/approved/published/failed`; launch history `launch_*`. Publishing provisions a hosted **tenant row** (`provisionHostedWebsiteTenant`, `reserve_website_hosted_tenant`). | **System** (website). Rebuild is a **Possibility**; approve + publish is **Make real**; `website_documents.revision` is release/revision; `website_document_health` is health | Website System ID = the website `saved_product_work.id` for native sites, and the tenant `stable_id` (through the link) for live custom-repo sites. A published native site has both: a work row *and* a hosted tenant. The registry must treat them as one System, not two. When a converted client's site moves from custom repo to v2 document, it must keep the same System ID. That is the identity test in `PRIM_SYSTEM`. | High. Publishing and domains reach live hosts. Rebuild is behind `STRELVA_WEBSITE_REBUILD_RELEASE`. | B, C, F |
| managed-presence | `src/products/managed-presence/legacy.ts` (`resolveLegacyManagedPresence`) | adapter for the managed-website System; **retire** after migration | Becomes the read adapter that turns a tenant into a website System card (name, domain, live link, status). | High: it is how existing clients appear. | B, E |
| inquiries | `src/products/inquiries/` (37 files): `InquiryCapabilityStatus`, request states `shaped … rehearsing … live_unverified`, change receipts with undo, `connections.ts`, `inquiry_workspaces` keyed by `tenant_id` + `business_id`, Redis-authoritative tenant leads, `STRELVA_INQUIRIES_RELEASE` | **System** (customer inquiries / lead intake). Rehearsal is Possibility isolation. Publication claim is Make real. `connections.ts` is the first Connections panel. | Its status already splits lifecycle from verification. Reuse that shape for every System (F). Inquiry form appearing on a website is an `appear` Connection. Pattern updates (`installed/update_available/conflicted`) are the model for D's upgrade candidates. | High. Leads for live clients are Redis-only and expire (Reborn section 0). Do not change ingestion. | B, C, E, F |
| scheduling | `src/products/scheduling/` (schedules with `active/paused`, `public_website_booking_grants`, `public_website_bookings`, calendar connections `outlook/google`) | **System** (bookings). Booking on a website is an `appear` Connection. Calendar is an external Connection. Pause is lifecycle. | Pause keeps existing reservations and stops new ones (`RULE_SYSTEM_PAUSE_HEALTH` validation). Tenant booking (`src/lib/booking.ts`, Redis config) stays legacy until Reborn section 2. | Medium. The tenant widget is live for wellness clients. | F, B |
| applications | `src/products/applications/` (`application_states` `draft/installed/retired`, `application_releases`, grants) | **System** (internal app) + release/revision | `installed` maps to Live and `retired` to archived. `candidate_versions` is a single-System Possibility seed. | Low. | B, C |
| custom-applications | `src/products/custom-applications/` (`custom_application_states` `draft/released/retired`, releases, reviews, budgets) | **System** (internal app built from code) + release/revision | Same as applications. The release candidate is the Possibility, and "Review and release" is Make real. | Low. | B, C |
| onboarding | `src/products/onboarding/` (resource kind `case`, item states `missing/supplied/correction/accepted`) | **System** (onboarding flow, an example `PRIM_SYSTEM` names) | Distinguish the onboarding flow (System) from each case (a record of it) *(inference: today one case = one work row, so flow and instance are the same row)*. | Low. | B |
| documents | `src/products/documents/` (private plain text, `revision` + edit/undo history; "Private document changes never publish a website") | **System** only once it becomes something a business sends: a proposal or report. Today it is a private file, closer to a record. The issued copy is an immutable output (`RULE_SYSTEM_OUTPUT_IDENTITY`). | The proposal System in `PRIM_SYSTEM`'s validation has no code behind it. Documents has no audience, issue or accept step and no snapshot. | Low. | B |
| tracker | `src/products/tracker/` (CSV import, changes, `experiment.ts`: up to 5 versioned candidates compared against a baseline) | **System** (operational list). Experiments are Possibility evidence. | Experiment evidence kinds (`simulated/operator_reported/measured`) are the honest-evidence vocabulary Possibilities need. Reuse them. | Low. | B, C |
| investigations | `src/products/investigations/` ("Ongoing checks": compare two saved works or fingerprint a public page; `active/paused`; source status `available … access_denied`) | health machinery or a small **System** (a standing check) | *(inference)* Treat a saved check as part of the health of the System it watches, not as a separate System, unless the owner names it. | Low. | F |
| work-plans | `src/products/work-plans/` (plan → `execute_work_plan_output`) | **Possibility** seed (a proposed System) + Make real (atomic plan output) | A plan shows a proposed app; a Possibility needs a usable draft. Have plan execution create the draft System in `Draft`, then present it as a Possibility. | Low. | C |
| operations | `src/products/operations/` (inbox, sweep, native execution, website draft adapter) | supporting (operations queue) | Inbox items reference System IDs. | Low. | — |
| ai-visibility, website-audit, assessment | `src/products/{ai-visibility,website-audit,assessment}/` | issued output (public result), Possibility trigger | An audit of a site is evidence that opens a rebuild Possibility. It is not itself a System. | None. | C |
| domain-monitor | `src/products/domain-monitor/` + `src/lib/domain-monitor*.ts` | health | Feeds website System health. | Low (read only). | F |
| home-finder | `src/products/home-finder/` | external product Connection; out of Reborn | None now. | None. | — |
| product-learning | `src/products/product-learning/` (`STRELVA_PRODUCT_LEARNING_RELEASE`; options `integration/workflow_removal/new_service/no_build`) | supporting (internal learning). Its options are internal Possibilities for Strelva itself. | Not customer-facing. Keep it off customer vocabulary. | None. | — |

## Inventory: `src/experience` and workspace routes

| Module / route | Evidence | Lands as | What has to change | Risk | Lane |
| --- | --- | --- | --- | --- | --- |
| app-frame places | `src/experience/app-frame/workspace-places.ts`, `StrelvaSidebar.tsx`: Home, Customers, Requests, Running; "Website and apps", "All apps and files"; `apps/work/products` all titled "Apps" | Home + Systems list | "Website and apps" becomes the business's Systems by name, with the website pinned first. "Running" keeps its own place because Responsibility does not fit. Customers stays a records place, not a System. | Low. Workspace-only. | E |
| workspace | `src/experience/workspace/` (65 files): `BusinessHome`, `AgencyHome`, `OfferingDirectory`, `OfferingInstallation`, `WorkspaceTemplateLibrary`, `TrackerExperimentForm`, `WorkspaceOngoing`, `WorkspaceRequests` | System home (Home), System view (opened work), retire offering shelf | `?view=` work views become one System view whose main area is the thing. Connections, Possibilities and Versions are contextual panels (`DESIGN_SYSTEMS_PRODUCT_MODEL.presentation`). | Low. | E |
| websites | `src/experience/websites/` (`WebsiteExperience`, `RebuildExperience`, `WebsiteConnections`, "Revision history") | System view (website), Possibility (rebuild), Connections panel | Rebuild becomes "a Possibility for your website". "Revision history" stays as history. | Medium (the rebuild flag). | E, C |
| inquiries | `src/experience/inquiries/` (steps New, Shape, Work, Plan, Preview, Rehearsal, Receipt; "Recorded connections for this Business") | System view (inquiries) | The "Capability" and "Version" labels in `views.tsx` move to System and History. | Low. | E |
| agency-website | `src/experience/agency-website/` ("Prepare a website update", "Saved preview") | Possibility prepared by a provider | Present as a Possibility on the client's website System. | Medium. | E, C |
| applications, custom-applications | `src/experience/{applications,custom-applications}/` ("Build candidate", "Release candidate", "Live release") | System view + release | "Release candidate" becomes a Possibility, or stays release language for builders *(decision for E/G)*. | Low. | E |
| scheduling | `src/experience/scheduling/` ("Calendar connections") | Connections panel (external) | Show as a Connection on the booking System. | Low. | E |
| operations | `src/experience/operations/` ("Keep something running", "Restore an earlier live version", "Allow this exact source version for seven days") | Responsibility (missing noun), history, Connection grants | "Restore an earlier live version" is release language; keep it. | Low. | E, G |
| delivery | `src/experience/delivery/` (preview fixtures only; `WorkspaceLayout` imports the workspace's own `BusinessHome`, not this one) | deleted October 6, 2026 with `/preview/strelva/{agency,client,start}` | None. | None. | E |
| customers | `src/experience/customers/` (Home Finder) | out of scope | None. | None. | — |
| product, conversation | `ProductShell`, `stream.ts` | public assessment shell; chat plumbing | None. | None. | — |
| `/workspace/*` routes | `src/app/workspace/` (account, assignments, business/new, contribute, delivery, exit, export, invitations) | supporting routes | Add a System route (for example `/workspace?view=system&system=<id>`) *(lane E's call)*. | Low. | E |
| `/apps/[workId]`, `/custom-applications/*`, `/agency-applications/*`, `/agency-websites/[bindingId]` | `src/app/` | System and Possibility entry points | Keep the URLs and resolve them to System IDs. | Low. | E |
| `/business`, `/business/[tenant]` | `src/app/business/` (inquiries by tenant slug) | legacy entry to the inquiries System | Stays tenant-keyed until conversion. | Medium (live owner entry). | — |
| `/dashboard/*` | `src/app/dashboard/`, `src/lib/dashboard-surfaces.ts`, `src/lib/features/registry.ts` (Today, Ask Strelva, Website, Google Business, Analytics, Reports, Reviews; wellness and ecommerce sets) | legacy tenant UI, **stays** until Reborn section 6 | No System vocabulary here. gldf and rohlax repos hard-code `/dashboard`. | High if changed. | — |
| `/admin/*` | `src/app/admin/` (Overview, Internal work, Managed-site work, Website rebuilds, Drafts, Maintenance, Clients, Accounts, Leads, Onboard, Pay links, Analytics, Ops, Uptime, Audit) | operator console; supporting | `/admin/clients/[id]` "Site health" reads System health once F lands. Queues reference System IDs. "Onboard" plans are packaging, not Systems. | Medium. Operators run live clients from here. | F (health), — |

## Inventory: legacy tenant model (`src/lib`)

Nine live clients run here. The Sept 30 read-only sweep found 12 active
tenant IDs: `cocard-anderson`, `gldf`, `leslie-bookkeeping`, `mclears`,
`orange-crate`, `rhm-innovations`, `rohlax`, `spacejam-storage`, `strelva`,
`twintrees-camillus`, `twintrees-fayetteville` and `vermont-unlimited`
([acceptance record](../operations/strelvav2-horizontal-acceptance.md)).
Which nine are the paying clients is not settled. The
[Reborn page](./strelva-reborn.md) lists it as unproven.

| Piece | Evidence | Lands as | What has to change | Risk | Lane |
| --- | --- | --- | --- | --- | --- |
| Tenant row | `src/lib/tenants.ts`, `TenantConfig` in `src/lib/types.ts` (`stable_id`, slug `id`, `site_name`, `template`, `industry`, `delivery_model`, `custom_repo`, billing fields) | **System** (managed website), read through an adapter | System identity is `stable_id`, never the slug. Do not add System columns to `tenants`. The registry references it. | High. Partial updates must keep `site_name` and `created_at`. | B |
| Slug rename | `src/lib/tenant-rename.ts` | supporting | A System keyed on `stable_id` survives a rename by construction. Add a test. | High if keyed on slug. | B |
| Site capabilities | `src/lib/site-capabilities.ts` (sections, `allowedActions`, `supportsDraftPreview`), `/api/v1/site-capabilities` | supporting (what the website System can do) | Stays the per-tenant v1 contract. Reborn section 7 keeps it. | High (client repos read it). | — |
| Content, drafts, page config | `src/lib/storage/{draft-store,page-config-store,version-store,site-snapshot-store}.ts`; `content`, `draft_content`, `page_config`, `content_versions` (`live/rolled-back`), `site_snapshots` | release/revision of the legacy website System | `content_versions` and `site_snapshots` are history, not Versions. | High (live content). | — |
| Governed work + AI governance | `src/lib/ai-governance.ts`; `proposals/decisions/execution_attempts/outcomes`; Redis event lifecycle | supporting (approvals, receipts); Make real reuses it | A Make real effect that touches content or Google still goes through `ai-governance.ts` and approval (AGENTS.md "Outside writes"). | High. | C (consumer) |
| Leads | `src/lib/leads.ts` (Redis `leads:{t}`, `lead:{t}:{id}`, 90-day TTL) | records of the inquiries System (supporting) | Reborn section 0 dual-writes these to Postgres before anything else. | **Highest**. Data is being lost today. | — (Reborn) |
| Booking | `src/lib/booking.ts`, `storage/booking-store.ts` (PG `bookings` + Redis config) | records + config of the booking System | Pause is not available on the tenant widget. F's pause applies to workspace scheduling only until Reborn section 2. | Medium. | F (scope note) |
| Google OAuth, connections | `src/lib/{google-token,google-resources,oauth-state,connections}.ts` (Redis `connections:{t}:{provider}`, only copy), `integration-registry.ts` | external **Connection** (`PRIM_CONNECTION`) | Customer Connections read these through an adapter. The move to Postgres is Reborn section 2/4, through `crypto/secrets.ts`, without re-consent. | High. Losing a token forces re-consent. | B (adapter) |
| Domains | `src/lib/domains.ts` (`domain_claims` `pending/verified/misconfigured/conflict/error`), `domain-monitor*.ts` | external Connection (domain) + health | The domain is a Connection of the website System. Its status is health. | High (DNS is Jacob's yes). | B, F |
| Scan | `src/lib/scan.ts`, `scan-store.ts` (Redis `reb:scan:*`) | health / evidence | Feeds website health and opens rebuild Possibilities. One scanner only. | Low. | F |
| Orders, rewards, newsletter | `src/lib/orders.ts`, `rewards/*`, `newsletter.ts` | records of a store System *(inference: gldf's store is one System with these as records)* | Reborn section 4 decides workspace home vs `/dashboard`. | Medium (gldf runs a store). | — |
| Email | `src/lib/email/send.ts`, `email-enabled.ts` | supporting | Make real never sends without the gate. | High. | — |
| Heartbeat, crons | `src/lib/heartbeat.ts` (~26 crons) | health | System health reads heartbeats. Absence of events is not health (`RULE_SYSTEM_CONNECTION_CONTRACT`). | Low. | F |
| Custom repo metadata | `CustomRepoMetadata.revalidationHealth` (`healthy/failing/...`), dependency status `healthy/degraded/paused/failing` | health of the managed-website System | Already models degraded dependencies. Reuse. | Low. | F |
| Accounts | `accounts` (`active/paused/churned`), `account_memberships`, `subscriptions` | supporting (payer). Twin Trees: one account, two tenants. | Account grouping is evidence for a same-business Version case. | Medium. | D (evidence) |

## `/api/v1` contract

Every route is keyed by `[tenant]` slug: `content`, `page-config`,
`site-capabilities`, `collections`, `track`, `leads`, `inquiries`,
`bookings` (+ `reservations`, `readback`) and `spam-pit` (`src/app/api/v1/`).
Contract constants live in `src/lib/scaffold-contracts.ts`
(`SCAFFOLD_CONTRACT_VERSION = "v1"`, `x-reb-signature`). Shared client
behavior lives in `custom-repo-starter/`.

**Lands as:** the public interface of the website, inquiries and booking
Systems. **Change:** none. Systems resolve behind the slug, and every
addition is a new optional field. A System ID may be added to responses only
if no client parses unknown fields strictly *(unverified: only gldf and
rohlax are in `release-manifest.json`)*. **Risk:** highest. Client repos
call these on every page view. **Lane:** none. No lane should edit
`src/app/api/v1` in this transition.

## Agent tools

`src/lib/agent-shared.ts` exports these tools:

- `read_site`, `patch_site`
- `undo_last_change`
- `create_gbp_post`, `update_business_hours`, `upload_gbp_photo`

`src/app/api/agent/route.ts` holds 24 more tools inline, including
`read_section`, `update_section`, `request_custom_change`,
`reply_to_review`, `save_entry` and `show_connections`.

**Lands as:** supporting (actions on a System). The tools stay keyed by
tenant. Two changes later:

- `show_connections` becomes the Connections panel of the System in
  context.
- A future `explore_possibility` tool creates a Possibility instead of
  proposing a direct edit.

Moving the inline tools into `agent-shared.ts` is Reborn section 4, not this
transition. **Risk:** medium. The tools write live content through approval.
**Lane:** none now; C later.

## Key tables, by landing

| Lands as | Tables |
| --- | --- |
| System identity (referenced, not moved) | `saved_product_work`, `tenants` (`stable_id`), `application_states`, `custom_application_states`, `website_document_heads`, `inquiry_workspaces` |
| Connection (to the business, a System or a person) | `tenant_workspace_links`, `offering_website_bindings`, `website_hosted_tenant_reservations`, `public_website_booking_grants`, `workspace_work_context`, `application_use_grants`, `custom_application_grants`, `customer_resources` |
| Connection (external account) | `workspace_calendar_connections`, `domain_claims`, `integrations`, Redis `connections:*` |
| Possibility / Make real seeds | `website_crawl_pages` + website payload candidates, `agency_managed_website_draft_{revisions,preparations}`, `inquiry_publication_claims`, `work_plan_output_executions`, `proposals`/`decisions`/`execution_attempts`/`outcomes` |
| release/revision | `website_documents`, `website_document_publications`, `application_releases`, `custom_application_releases`, `custom_application_artifacts`, `content_versions`, `site_snapshots`, `business_record_revisions` |
| health | `website_document_health`, `domain_claims.status`, `standing_responsibility_runs`, `workspace_calendar_event_receipts`, Redis `reb:heartbeat:*`, `reb:scan:*`, `reb:domain-monitor:*` |
| supporting: records | `business_records`, `business_record_facts`, `business_services`, `business_people`, `business_contacts`, `bookings`, `public_website_bookings`, `application_records`, `inquiry_record_overlays`, `collection_entries`, `reviews`, `newsletter_subscribers`, `reward_*` |
| supporting: grants and people | `workspace_memberships`, `memberships`, `workspace_delegations`, `workspace_handoffs`, `workspace_invitations`, `operational_assignments`, `workspace_agent_access_tokens`, `agency_*_draft_grants`, `super_admins` |
| supporting: receipts and money | `website_document_receipts`, `standing_responsibility_receipts`, `workspace_export_receipts`, `workspace_creation_receipts`, `work_provider_receipts`, `job_economics*`, `work_allowance*`, `subscriptions`, `pay_links` |
| missing concept: Responsibility | `standing_responsibilities`, `standing_responsibility_jobs`, `offering_installations.responsibility` |
| missing concept: Requested work | `service_requests`, `service_request_commands`, `offering_provider_deliveries` |
| Version (contextual) | none yet |

## Customer vocabulary today

These strings come from a scan of `src/experience`, `src/app`,
`src/platform` and `src/products`:

| Today | File | Becomes |
| --- | --- | --- |
| "Website and apps", "All apps and files" | `app-frame/StrelvaSidebar.tsx`, `workspace/BusinessHome.tsx` | The business's Systems by name ("The Mooney Firm website", "Intake form"). The section label is E/G's call. |
| "Apps" (titles for `apps`, `work`, `products`) | `app-frame/workspace-places.ts` | Same as above. |
| "Get or build an app", "All apps & templates", "Find an app template…" | `workspace/WorkspaceLayout.tsx`, `WorkspaceComposer.tsx` | "Make" (verb), with origins as the starting points. |
| "Installed offerings", "Retired offerings", "Back to offerings", "Retire this offering" | `workspace/OfferingDirectory.tsx`, `WorkspaceAllowanceSummary.tsx` | Retire. Show the Systems the offering created. |
| "All products" | `workspace/WorkspaceLayout.tsx` | Retire. |
| "Capability", "No inquiry capability is live here yet." | `inquiries/views.tsx` | System + lifecycle ("No inquiry form is live yet."). |
| "Version", "Rehearse this version first", "Inspect version and scope" | `inquiries/views.tsx` | History / release. "Rehearse" belongs to a Possibility. |
| "Tracker version", "Refresh latest version" | `workspace/WorkspaceExperimentResult.tsx` | History. |
| "Restore an earlier live version" | `operations/BoundedWorkExperience.tsx` | History (keep the meaning; avoid the word Version). |
| "Connections", "Recorded connections for this Business" | `inquiries/views.tsx` | Connections. This one already fits. |
| "Connect existing work", "Connected work" | `workspace/OfferingInstallation.tsx`, `BusinessHome.tsx` | Connections. |
| "Approve this preview", "Before and after" | `websites/WebsiteExperience.tsx`, `RebuildExperience.tsx` | Possibility + Make real. |
| "Recording a comparison keeps it experimental" | `workspace/TrackerExperimentForm.tsx` | Possibility evidence. |
| "Running", "What Strelva keeps running", "Keep something running" | `workspace-places.ts`, `operations/ResponsibilityExperience.tsx` | Keep. This is the missing Responsibility noun. |

The collision to resolve: the
[product ontology](../architecture/product-ontology.md) defines **Version**
as "restorable historical state". The selected model makes Version mean a
contextual adaptation. One of them has to change in the ontology (lane G).
Every customer-facing "version" string above means history.

## Worked examples

### gldf: a live custom-repo client becomes a workspace with Systems

Today gldf is a `tenants` row with a custom repo
(`../greatlakesdriedfruits`, `release-manifest.json`), Redis leads, a store
with rewards, and Google tokens in Redis.

After conversion, `convert_tenant_to_business` creates the workspace and a
`tenant_workspace_links` row keyed on gldf's `stable_id`. The System
registry then shows:

- **Great Lakes Dried Fruits website** (System, Live). Its implementation
  ref is the tenant `stable_id`, through the link. Its health comes from
  `revalidationHealth`, `domain_claims` and scan.
- **Store** (System, Live) *(inference: orders and rewards as its
  records)*.
- **Customer inquiries** (System, Live). Its records are the leads, which
  stay Redis-authoritative until Reborn section 2.

Its Connections:

- website **reads** the business record (hours, address)
- inquiries **appear** on the website (`/api/v1/leads/gldf`)
- website **acts** through Google Business (a Redis connection, needs
  approval)
- website **depends on** the domain claim

Nothing about `/api/v1`, `/dashboard` or the repo changes. The Systems are a
view over what exists. Risk lives in the conversion, not the view.

### The Mooney Firm: a native website System made through a Possibility

Mooney is the default walkthrough, not one of the active tenants
(`docs/product/roadmap.md`). The
[rebuild spec](../capabilities/website/website-rebuild-spec-2026-10-01.md)
flow becomes:

1. Paste `attymooney.com`. The rebuild runs and produces a working
   alternative site. That is a **Possibility** on a new website System in
   `Draft` (`saved_product_work` product `websites`). *(Modeling choice: the
   owner's old site at attymooney.com is outside Strelva, so it could also
   be treated as an external baseline the Possibility replaces.)*
2. The review panel shows facts needing a decision. "Before and after"
   is Possibility evidence.
3. Approve, and the site goes live at `mooney.strelva.com`. That is **Make
   real**. Publishing reserves a hosted tenant row, so from this point the
   System has a work ID *and* a tenant `stable_id`. It is already per-step: `launch_started`, `launch_prepared`,
   `launch_confirmed` or `launch_failed`. The domain is a separate effect
   that waits on DNS. It is not atomic, and does not pretend to be
   (`COMP_MULTI_SYSTEM_ACTIVATION`).
4. Then add the Mooney intake form, an inquiries System. It is connected:
   it **appears** on the website, **reads** practice areas from the
   business record, and **triggers** an owner notice.

Six months later the owner asks for online consult booking. Strelva
prepares a Possibility affecting two Systems: a new booking System, and a
website change that adds "Book a consult". That is the first multi-System
Make real. It needs C's grouped activation, and it does not exist today.

### Twin Trees: the first real contextual Version

Twin Trees is one account paying a bundled $300/month plan
([roadmap](./roadmap.md)) for two sites: `twintrees-camillus` and
`twintrees-fayetteville`. They are the same business in two locations.
This is the same-business Version case in `RULE_CONTEXT_VERSION_IDENTITY`:
one website System with a Camillus Version and a Fayetteville Version, each
with its own domain, hours and booking calendar bindings.

*(inference)* If the two locations are separate legal businesses, they
become two workspaces with a shared agency origin instead. Conversion has to
ask which before it runs. Reborn already says one workspace can hold several
tenants.

### Agency website drafts are Possibilities, not Versions

The brief suggested agency website drafts might become Versions. The code
says otherwise.

`agency_managed_website_draft_{grants,revisions,preparations}` and
`/agency-websites/[bindingId]` let an agency prepare one change to one
client's live site, under a grant, for the client to review. That is a
candidate alternative to an existing System's current state: a
**Possibility**, prepared by a provider.

The agency Version case is different. The agency's own reusable website
setup (a "method") is an origin. Client A's site and client B's site are
two business-owned Systems that descend from it, each with its own data and
Connections. A common fix to the origin is offered to each as an upgrade
candidate. That upgrade candidate is itself a Possibility on each client's
System. No code does this yet. Lane D builds it.

### Pricing extraction (the stress test)

`COMP_SYSTEM_EXTRACTION` needs facts that two Systems disagree on. Today
prices live in website documents, `business_services` (business record)
and offering configuration. A Possibility that creates a Pricing System and
re-points the website and a proposal to it is buildable only after the
business record is live, and after documents gain issued-snapshot pinning.
It belongs late in the sequence.

## Sequence

What has to land first, and what stays on the tenant model.

1. **Reborn sections 0 to 3 come first, unchanged.** These are lead
   dual-write, the business record, `tenant_workspace_links` and
   conversion. A managed-website System cannot exist for a live client
   until its tenant is linked. None of the Systems work changes those
   gates.
2. **B: System registry as a projection.** Add a table of
   `(system_id, business_id, kind, implementation_ref, origin)` and
   adapters for the following, with no payload copy:
   - `saved_product_work` (websites, applications, custom apps,
     scheduling, onboarding, tracker, documents)
   - tenants, through the link
   - inquiry workspaces

   Prove two things locally: a website System keeps its ID when its
   implementation moves from custom repo to v2 document, and when the slug
   is renamed.
3. **F: lifecycle and health as two fields.** Map each product's state
   onto Draft, Live or Paused, using the inquiry status shape. Health
   reads existing sources. Ship pause for workspace scheduling first.
   Tenant booking stays legacy.
4. **B: typed Connections over existing bindings.** Start with
   `read` (the business record), `appear` (inquiry and booking on a
   website) and external-account Connections over calendar, domain and
   Google. All are read-only projections.
5. **E: System home and System view behind the workspace flag plus a new
   one.** `/dashboard`, `/business/[tenant]` and `/admin` are untouched.
6. **C: wrap the website rebuild as the first Possibility, and its publish
   as Make real.** Then inquiry rehearsal. Then the first two-System
   Possibility (booking + website), with per-effect progress and
   interrupted-activation tests.
7. **D: Versions last.** First Twin Trees as the same-business case in a
   local fixture. Then agency origin → two businesses. Do not reuse
   `version` columns. They are the release axis.
8. **G: vocabulary and ADR.** This covers retiring "offering", "app" and
   "product" as customer nouns, the ontology Version collision, and naming
   Responsibility and Requested work.

**Stays behind the legacy tenant model until each client is converted and
its owners are in (Reborn section 6):**

- every `/api/v1/*` route
- `/dashboard/*`
- `/business/[tenant]`
- Redis leads, booking config, OAuth and orders
- the custom repos
- `src/app/api/agent/route.ts`
- `/admin/clients` and onboard
- Stripe billing on `tenants`

Systems for those clients are read-only views until then.

## Where the four nouns do not fit

1. **Responsibility: what Strelva keeps true.** `standing_responsibilities`,
   `offering_installations.responsibility`, the "Running" place and ADR 0007
   all treat it as the unit Strelva prices and is accountable for. It is not
   a System (nothing is made), not a Connection, and not a lifecycle state.
   It attaches to Systems. **This looks like a real missing concept.** It
   is the commercial core, and Reborn's offering work depends on it.
2. **Requested work: a finite job someone asked for.** `service_requests`,
   delivery commitments and the "Requests" place represent this. AGENTS.md
   says a request is not an accepted job until scope and deadline are
   agreed. A request can become a Possibility once something exists to
   open, but most requests ("fix the hours on the contact page") are just
   work. **Also a real missing concept.**
3. **Records and the Customers place.** Contacts, inquiries, bookings and
   orders belong to the business and are read by many Systems. The model
   puts the business record at the root ("Business supplies shared
   context"), so this is covered as context. However, the customer-facing
   Customers place has no noun in the four. *(inference: fine as a place,
   not a primitive.)*
4. **Issued outputs.** An issued proposal, a sent report or an audit
   result is immutable and not a System. `RULE_SYSTEM_OUTPUT_IDENTITY`
   covers the rule. There is no customer noun yet, and documents have no
   issued-snapshot storage.
5. **Provider: who operates the System.** Today this is seats, delegations,
   assignments and provider delivery. The managed default means most
   clients never touch Systems themselves. "Operated by Strelva" has to be
   visible on every System, and it is neither a Connection nor a Version.
   *(inference: an attribute of the System plus grants, not a fifth noun.)*
6. **The temporal release axis.** Releases and revisions are everywhere in
   storage, and customers do see "history" and "restore". The model keeps
   them separate from Versions, but gives them no customer word. History is
   the obvious one.
7. **Origin, for agency methods.** Version lineage needs a name for the
   shared source that Versions descend from. Today that is offering
   definitions and the proposed Method. Lane D must name it without
   reviving "template" or "snapshot".

## Decisions others must reconcile

- **B:** System identity references `saved_product_work.id` and
  `tenants.stable_id`. It does not get a new copy of either.
- **B and G:** pick one workspace-to-tenant link. This map recommends
  `tenant_workspace_links`, because it keys on `stable_id`, survives
  deprovision, and is what conversion writes. Under that recommendation,
  `offering_website_bindings` and `website_hosted_tenant_reservations`
  become readers of it or are retired by migration.
- **C and D:** agency website drafts are Possibilities, not Versions.
- **D:** no `version` column in existing tables means a contextual Version.
- **F:** use `InquiryCapabilityStatus` as the template for separating
  lifecycle from verification.
- **E and G:** retire "offering", "product" and "app" as customer nouns.
  Keep "Running" and "Requests" as places until G names their concepts.
- **G:** fix the ontology's Version definition.

## Not proven

- Which nine tenants are the live paying clients.
- Whether any client repo besides gldf and rohlax tolerates new response
  fields.
- Whether gldf's store should be one System or several.
- Whether Twin Trees is one business or two.
- Whether owners will ever open a System view. One sign-in in 30 days (Reborn
  page).

Every claim here is from code and docs on this branch. Nothing in this map
was run against production.
