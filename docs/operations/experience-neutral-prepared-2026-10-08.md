# Experience and neutral-provider preparation — October 8, 2026

Private lane based on `3ecb25f15eeab4b637d14561d7747a47e03a4947`.
This records prepared source and compatibility disposition. It is not release,
rendered UI, native SQL, real agency/provider operation or commercial proof.

## Directory and neutral serving

Released All Systems enumerates every authorized canonical System, independently
of saved work, installations and Home’s bounded pins. Each row opens its System
identity. Supporting files have their own rows and destinations; both are
searchable. Unavailable registry reads cannot become an empty-success claim.
Account-authorized unassigned sites retain explicit assignment handoff. Stopped,
delegated-read and provider-seat views retain their prior authority restrictions.

New help requests and offering-provider choices require explicit ordinary agency
identity, resolved from active seats of the selected business. The customer need
not belong to that agency. No special platform designation or automatic selection
is offered. `providerOfRecord` presentation names the recorded agency; a requested
provider and a legacy tenant relationship cannot establish operation.

`20261020090040_neutral_service_requests.sql` retains historical rows and command/
acceptance receipts. Direct business members keep history reads; owners retain
cancel/withdrawal. New special-provider writes, inbox/provider response, provider
delivery acceptance and special operational-assignee writes fail closed. Ordinary
responses use exact seats/staff/current verified identity, held through writes.
Readers are lock-free. Outside publish/Google/email/payment effects continue through
the existing verification/mandate gates; a request or provider label grants none.
Historical special-provider work is explicit read-only compatibility, not an
implicit conversion to an invented agency identity. Production migration and an
owner-approved ordinary-provider assignment remain separate actions.

## Dashboard route snapshot

`src/platform/owner-entry/dispositions.ts` remains the executable owner. The
following is a dated inventory of all 25 dashboard page dispositions, also used
by `/client/{tenant}/dashboard/*`. Owner-entry routing verifies current membership
and release gates before 307 redirects. A ready disposition does not assert full
feature parity. Existing source/history IDs, query/ranges/fragments, checkout
success and rollback behavior remain owned by the disposition/route tests.

| Old dashboard route | Destination or retained behavior | Disposition |
| --- | --- | --- |
| `/dashboard` | Home: Needs you, From your site, Strelva handled, In progress, Recent | ready |
| `/dashboard/chat` | Ask Strelva (view=ask), on Home and on each System | ready |
| `/dashboard/site` | Website System: the site's editor, or Ask for a change on a repo-only site | ready |
| `/dashboard/content` | Website System | ready |
| `/dashboard/assets` | Website System, photos | ready |
| `/dashboard/brand-kit` | Website System, look | ready |
| `/dashboard/collections` | Website System, blog and collections (they appear through /api/v1/collections) | ready |
| `/dashboard/google` | Website System Connections: Google Business | ready |
| `/dashboard/history` | Website System, History | ready |
| `/dashboard/integrations` | Website System Connections | ready |
| `/dashboard/sources` | Connections on each System | ready |
| `/dashboard/sources/[id]` | That Connection on the Website System | ready |
| `/dashboard/health` | Website results and health | ready |
| `/dashboard/leads` | Inquiries (/workspace/inquiries), every linked site's leads | ready |
| `/dashboard/members` | Website Connection: existing members, read-only | ready |
| `/dashboard/roster` | Bookings System, day view (/workspace/bookings?view=day) | ready |
| `/dashboard/schedule` | Bookings System, week view (/workspace/bookings?view=week) | ready |
| `/dashboard/ownership` | Business details, ownership | ready |
| `/dashboard/reports` | Recaps, under Home's Recent (/workspace/recaps) | ready |
| `/dashboard/analytics` | Website results and health (/workspace/results) | ready |
| `/dashboard/review` | Needs you, on Home | ready |
| `/dashboard/reviews` | Google listing: Reviews (/workspace/reviews) | ready |
| `/dashboard/settings` | Business menu: Business details (/workspace/business-details), People and access, account, plan | stay |
| `/dashboard/store` | Website Connection: existing catalog and order evidence | ready |
| `/dashboard/[...notFound]` | Home | ready |

Settings/billing remain explicitly retained at launch. `/dashboard/review?legacy=1`
keeps edit-before-approve/operator controls, while canonical Needs you is released
separately. Redis lead fallback, health/date/Ask handoffs, review voice/drafting and
listing receipts retain the exact recorded parity gaps in that owner. Members and
rewards remain read-only/frozen. These are retained contracts and remaining proof,
not blanket deletion candidates.

## Other destination disposition

| Old destination | Prepared behavior |
| --- | --- |
| `view=work`, `view=apps` | Released canonical Systems and distinct files; off-gate legacy list remains rollback compatibility. |
| `view=products` / old offering entry | System catalog plus explicit retained offering setup, assignment and resource contracts. |
| New customer website creation | Released rebuild entry at `/workspace/site?entry=rebuild`; same-tab actor/business request draft retained. |
| Existing saved website v1 drafts | Existing `WebsiteExperience` compatibility; no silent payload rewrite/deletion. Existing v2 rebuilds retain exact `workId`. |
| `/admin/websites?workspaceId&workId` | Ordinary canonical rebuild entry; destination independently checks access. Without valid IDs, choose a workspace. |
| `/admin/work` default service request inbox | Explains ordinary agency workspace serving; platform operator status supplies no provider inbox. Other support/approval behavior retained. |
| `/workspace/delivery?providerKind=strelva` | Explicit retired-inbox compatibility; existing receipts remain in their business. |
| Agency request/delivery Queue | Exact agency workspace routes; ordinary service-request and delivery APIs with current seats/staff. |
| Old `view=customers` | Existing retired-view Home alias; no released competing Customers page. |
| Old `/preview/strelva/client`, `/preview/strelva/agency`, DeliveryExperience/delivery BusinessHome | Already deleted in the base candidate; carried unchanged. |
| Preview CustomersApp | Retained dated preview-only design evidence; not a release destination. |
| `operator-queue/agency-queue.ts` | Retained tested projection compatibility with corrected stale comment; released AgencyHome owns agency Queue. |

Dashboard components, tenant/lib compatibility reexports, shared queue approval
helpers, stable IDs, HMAC/v1 API/customer contracts and all historical migration
bytes are retained. No client-repo, marketing, provider, production or pricing
mutation is included.

## Proof and remaining work

Focused run: 13 files /148 tests pass (local) covering canonical registry-only
inquiry/listing/newsletter directory and file search, direct/delegated/provider-seat
views, explicit request recipient, retired operator presentation, retained request
reads, same-tab website draft carry and owner-entry route contracts. Scoped ESLint
has zero errors/warnings. `git diff --check` passes.

Original failed evidence: old assertions expected special-Strelva writes and
operator inbox; after replacement, one directory assertion incorrectly included
independent pinned navigation. Corrected to test the directory itself. Vitest then
hit ENOSPC before importing Systems runtime; coordinator recovered storage without
lane cache/data deletion. Subsequent 148-test run passes. The optional route-map
`tsx -e` command failed EPERM opening its CLI IPC socket; the dated route inventory
above was read from source instead.

Native fixture: `tests/neutral-service-requests-schema.sql` after migration90040.
Native SQL/READ ONLY/populated upgrade/current-authority concurrency checks,
typecheck, combined source tests/build, rendered desktop/mobile/loading/error/
permission/stopped/empty verification remain pending the coordinator window.
ProviderOfRecord server population is assigned to runtime; platform Queue source
removal is assigned to integration. No finished full1.0 claim follows this lane.


### Follow-up proof and entry convergence

The private follow-up keeps saved preview scenarios on direct System links, sanitizes Next router history markers, and requires business identity on System sign-in returns. HomeFinder uses stored `home_finder` identity and opens the actual ordinary business management page; Units is discoverable in customer/agency settings. No unqualified public brokerage address is synthesized. The root server owns HomeFinder health evidence.

Navigation: 7 focused suites/65 tests pass. Enterprise/reader type follow-up: 4 suites/52 tests pass. Scoped lint and diff checks pass. The genuine READ ONLY fixture passed in a repaired native attempt, including owner/current staffed agency and withdrawn seat. Final atomic catalog rollback proof remains unproven: disposable PostgreSQL crashed during earlier baseline with ENOSPC. Failure log `/private/tmp/strelva-experience-neutral-native-final.log` is retained; runner stopped. Integrated typecheck and rendered desktop/mobile remain pending coordinator verification.


### Public-source native introduction

An unverified connected site remains a source, with its identity, verification and live pages unchanged. A same-business URL rebuild with a readable source audit and matching candidate hash can create one stored native website introduction. The effect addresses only the introduced native site and carries no external tenant/domain target. Source lineage is separate from `affects`, so the source System can show the alternative without claiming it will be changed. The proposal stays Exploring until the owner approves the exact candidate revision; later activation/publication still uses current native authority. Member reads do not prepare or revise it, and a paused source is not used to prepare new work. No source ownership, live publication or adoption is inferred.

Private verification covers persistence/replay, source preservation, introduction-only targets, current repository denial, exact approval, content refresh and source-only UI projection. Actual public check/Auth/crawl/System/Possibility qualification remains the coordinator's one-case native window.
