# The rest of the Systems a business starts with

> **Changed by ADR 0013 / decision 2.** Platform operators do not make or change Systems
> for clients. The super-admin maker role, conversion-admin recipient assumption and
> operator client-recovery flows below (§3.1.1, §3.4.4, §4, §6–8) are older implementation
> and need engineering follow-up through the ordinary agency path. Strelva's agency has the
> same delegated scope as every agency. Automated platform sends/checks remain platform
> behavior and name Strelva in their receipts.

Status: wave 6 launch code built and locally verified,
2026-10-07, branch `w6/catalog`. This does not authorize production rollout or
the open commercial decisions. The “today” statements below describe the
October 6 baseline. Current evidence is in the
[catalog stream handoff](../streams/w6-catalog.md).
§3.4 items 3 and 4 (one recipient resolver for `weekly-report`,
`monthly-report` and `runWebsiteMonthlyReports`) built and proven locally on
`build/business-ownership` (Oct 6). The hosted path still needs a current
owner to read the report; a converted business without one is reported as
"no owner has accepted this business yet".

### Local implementation evidence, wave 6 round 5

| Launch promise | Built and tested locally | Remaining production evidence |
| --- | --- | --- |
| §3.1 Sentence → Draft → rehearsal → Live → staff use | Maker-only plans and create/change RPCs; contact/person links; atomic member and use-grant submits/edits; gated notices, retries, receipts and operator recovery. Real disposable Supabase Auth takes a sentence through the journey at 1280 and 360px using bounded model/mail fixtures. Owners file Requests; failed maker planning files a pending Request. | Real model quality, provider delivery and use in the Strelva-owned test business. |
| §3.2 Store, rewards and subscribers | Website Store Connection with no checkout authority; frozen tenant store/rewards; additive newsletter contact mirror and dry-run backfill. Exact gldf/rohlax subscribe bodies are tested with flags on and off. | Live converted-client parity, newsletter backfill and current store/rewards counts. |
| §3.3 Wellness | Schedule/roster project as Bookings views; tenant routes remain in place; members stay frozen. | Current wellness usage and converted-client parity. |
| §3.4 Analytics and reports | Workspace traffic and Search Console evidence distinguish unavailable/stale reads from zero. One recipient rule; send/suppression/failure receipts, operator recovery and monthly Running text. Typed Postgres analytics/report state preserves Redis fallback and monotonic sent markers. | Actual Google access, reviewed live recipient dry run, state backfill and one delivered recap receipt. |
| §3.5 Documents and bounded histories | Private files stay outside Systems. Append-only full revision tables plus 20 recent document receipts and bounded onboarding/application windows; paginated history respects exact-work access. Engine and SQL regressions take 1,000 document edits plus latest Undo, 600 onboarding changes and application History past its prior cap. Rendered document states cover editable/read-only, loading, empty, history error/retry, flag off and denied access. | Apply migrations after checking current workspace row counts. |
| §3.6 Checks and merges | Saved checks become watched-System health with last-checked/stale evidence; tracker becomes `internal_app`; documents, onboarding and checks stay outside Home Systems. Agency website drafts remain website Possibilities. | Release activation and live health evidence. |

No catalog change touches `/api/v1`, `custom-repo-starter`, the storefront
contracts or manifest relative to this stream's integration base. The local
client compatibility check remains 196/196. The deployed 60/60 byte comparison
requires separately authorized production reads and is not claimed here.

This spec covers everything in [Strelva 1.0.0](../strelva-1.0.0.md) §2 other
than the website, inquiries, bookings and publishing: internal tools, store,
rewards and newsletter subscribers, wellness, analytics and reports, documents,
tracker, onboarding and ongoing checks. It decides what each one is in the
model, says what each kept item does at 1.0.0, and gives a recommendation on
the audit's proposed cuts and merges.

Sources read: ADR 0011, `CONTEXT.md` "Product model", `DESIGN.md` Oct 2 and
Oct 4 rules, `docs/product/{strelva-1.0.0,strelva-reborn,systems-transition}.md`,
`docs/capabilities/README.md`, `release-manifest.json`, the Sept 30 production
record in `docs/operations/strelvav2-horizontal-acceptance.md`, the code cited
below on branch `reborn-1.0-model`, and the local client checkouts next to
this repo (`../greatlakesdriedfruits`, `../rohlax-wellness`,
`../rhm-innovations` and the rest). The Oct 4 audit output
(`output/product-audit-2026-10-04/`) is not on this machine, so the audit's
cuts are judged from code, not from its reasoning.

## 1. The moment

**Leslie Bookkeeping, intake for new clients** (illustrative; Leslie has not
asked for this). Jacob, as Strelva, types one sentence in Leslie's workspace:
"Track each new bookkeeping client: who they are, which documents we have,
and who on staff is handling them." Strelva drafts a plan, then a working app
with a form and a list. Jacob opens it, adds two test records, and they stay
in the draft's own data. He turns it on. Leslie never signs in. When a staff
member submits a new client, the client lands in Leslie's business contacts,
and the person assigned gets an email naming the client and what is missing.

**Great Lakes Dried Fruits, the first conversion.** gldf runs its store,
checkout and rewards in its own repo, with its own Stripe and Supabase. After
conversion, gldf's workspace shows the website by its own name. The store
appears beside it as a Connection: "Store on greatlakesdriedfruit.com · runs
in gldf's own checkout". Newsletter sign-ups from the site keep landing where
they land today and also show as contacts. The monthly recap email still goes
to the owner. Nothing about gldf's checkout, rewards or `/dashboard` changes.

## 2. In the model

### Disposition

"Prod users" uses the Sept 30 production record (0 workspaces, 12 active
tenants, 1 sign-in in 30 days), the manifest, and the local client checkouts.
No fresh production read was made.

| Item | Lands as | Prod users today | Evidence |
| --- | --- | --- | --- |
| Internal apps (`applications`) | **System** (kind `internal_app`) | 0. Production had 0 workspaces | `src/products/applications/`; capabilities README "In production, unproven" |
| Work plan → app draft | **Make** path for internal tools, not a System | 0. `STRELVA_PLANNING_ENABLED` off | `src/products/work-plans/native-output.ts` creates `applications` drafts |
| Custom applications (Docker builds) | **Frozen** at 1.0.0, building cut | 0 | `src/products/custom-applications/build.ts` shells out to `docker run`; Vercel has no Docker |
| Tracker | **Part of internal tools** (an internal tool that starts from a list or CSV) | 0 | `src/products/tracker/`; already has assignees and record links |
| Store (orders view, `commerce` set) | **Connection** of the website System to the client's own checkout. Strelva's order view **frozen** | gldf and rhm-innovations run stores, but in their own repos | gldf `src/app/api/{checkout,webhooks/stripe}`; rhm same. No checkout calls `trackOrder` or posts an `order` beacon to `/api/v1/track` |
| Rewards (`reb:rewards:*`) | **Frozen** at 1.0.0 | gldf's real rewards live in gldf's own Supabase | `../greatlakesdriedfruits/src/lib/rewards/member-repository.ts` uses gldf's Supabase. Strelva's KV is written only by `/api/rewards/members/[email]/adjust` |
| Newsletter subscribers | **Records** in the business (contacts with source `newsletter`), read by the Publishing System | gldf and rohlax post to `/api/newsletter/subscribe` | Manifest notes; `../rohlax-wellness/src/app/api/newsletter/subscribe/route.ts`; `newsletter_subscribers` is already Postgres |
| Wellness: schedule, roster | **Part of the Bookings System** (views of its bookings) | Unknown which tenants have the `wellness` set | `src/lib/features/registry.ts`; `/dashboard/{schedule,roster}` read `src/lib/booking.ts` |
| Wellness: members | **Frozen** with rewards | Unknown | `/dashboard/members` reads `listMembers` from the rewards KV |
| Analytics | **Health and evidence** of the website System | All tenants: `analytics` is a locked core feature | `src/lib/features/registry.ts`; 5 repos post `/api/v1/track` |
| Search Console | **Connection** (website reads Google Search Console) | Every active tenant with a `siteUrl` | cron `search-console` daily 07:00 UTC (`vercel.json`) |
| Weekly and monthly reports | **Running** item ("Strelva sends you a recap every month"), each send an issued output | All tenants with `ownerEmail`, but client email is gated | crons `weekly-report` Mon 14:00 UTC, `monthly-report` 1st 15:00 UTC; `src/lib/email-enabled.ts` |
| Documents | **Supporting files**, not a System, at 1.0.0. A sent proposal is a later System | 0 | `src/products/documents/engine.ts` |
| Onboarding | **Frozen** at 1.0.0 (works, not offered in Make) | 0 | `src/products/onboarding/`; no `onboarding/case` mapping in `src/platform/systems/from-existing.ts` |
| Ongoing checks | **Health** of the System they watch | 0. Scheduled runs need `STRELVA_BACKGROUND_WORK_RELEASE`, off | `src/products/investigations/`; `src/app/api/cron/workspace-work/route.ts` line 10 |

### How they connect

- An internal tool **reads** the business record (contacts and people) and
  **triggers** an email to an assigned person. It may **appear** nowhere
  public.
- The website System **appears with** the client's own store and **reads**
  Search Console. Analytics, uptime and checks feed its health.
- The Publishing System (another spec) **reads** newsletter subscribers from
  the business's contacts.
- The Bookings System (another spec) owns schedule and roster. This spec only
  says they are views of it.
- Reports belong to **Running**, not to any System page, and each send leaves a
  receipt in **Strelva handled**.

## 3. What it does at 1.0.0

### 3.1 Internal tools (kept, System)

1. Only Strelva operators and an agency acting under an active delegation can
   make or change an internal tool. Owners and members get a 403 with "Ask
   Strelva to build this" and can file it as a Request. Today
   `createApplicationService().create` (`src/products/applications/server.ts`)
   and `createCustomApplicationService().create`
   (`src/products/custom-applications/lifecycle.ts`) check only
   `store.member`.
2. Owners, admins and members can use a live tool: submit, view and edit
   records, as the existing use grants allow (`application_use_grants`,
   `src/products/applications/access.ts`).
3. Make from a sentence: the sentence goes to work-plan generation
   (`src/products/work-plans/generation.ts`). Executing the plan creates the
   app in Draft through `execute_work_plan_output`. The Draft opens as a
   working tool on its own rehearsal data
   (`rehearse_application_candidate`), never on live records.
4. Turning it on is install (`installed` → Live). Retire maps to Paused, and
   records stay readable.
5. A tracker is the same System kind. Importing a CSV
   (`src/products/tracker/import.ts`) is another way to make an internal tool.
   Existing trackers keep their engine and data.
6. A field can be a **contact**. On submit, Strelva finds or creates a
   `business_contacts` row by email or phone, and the record stores the
   contact ID, not a copy of the name.
7. A field can be an **assigned person** pointing at `business_people`.
   Tracker rows already carry `assigneeId` and up to 20 record links
   (`trackerRecordCoordinationSchema`); applications reuse that shape.
8. On submit, Strelva emails the assigned person through
   `src/lib/email/send.ts`. The email names the tool, the record title and the
   one next step. If the person has no account, the email still goes out, with
   no record data beyond the title (decision 9.3). One email per submit, with
   a receipt in Strelva handled.
9. The System page shows the live tool first, with records, and History
   (releases from `application_releases`) beside it.

### 3.2 Store, rewards, newsletter (store is a Connection; rewards frozen; subscribers are records)

1. A converted client whose site has a checkout shows a **Store** Connection
   on its website System: direction "appears with", authority "none, the
   client's checkout", source of truth "the client's Stripe", freshness
   "not read by Strelva".
2. Strelva makes no store, checkout, order or refund write at 1.0.0.
3. The `/dashboard/store` order view and the `order-review-request` cron stay
   as they are, read-only, and get no workspace home (decision 9.4).
4. Rewards stay frozen: `/dashboard/members` and the adjust route keep
   working on the tenant side. Nothing new reads them.
5. Every newsletter subscribe still writes `newsletter_subscribers` through
   `/api/newsletter/subscribe` with the same response. After conversion it also
   upserts a business contact with source `newsletter`.
6. Unsubscribe state stays in `newsletter_subscribers`. A contact never makes
   someone a subscriber.

### 3.3 Wellness (part of Bookings, members frozen)

1. Schedule and roster become the Bookings System's day and week views. The
   bookings spec owns how they read the one booking store.
2. Tenants with the `wellness` set keep `/dashboard/{schedule,roster,members}`
   until Reborn §6 redirects them.
3. No new wellness surface is built.

### 3.4 Analytics and reports (health, a Connection and a Running item)

1. The website System's health shows traffic trend and Search Console
   standing next to uptime. Health never changes lifecycle.
2. Search Console is a read Connection: authority "Strelva's service account
   was added to the property", source of truth "Google", freshness "daily,
   07:00 UTC". If no data comes back, the Connection shows "not reachable",
   never zero traffic.
3. Each report cron resolves its recipient one way: tenant → link
   (`tenant_workspace_links`) → `resolve_business_owner_recipient`, falling
   back to `tenants.owner_email`. Unconverted tenants use the fallback.
4. The hosted-site path (`runWebsiteMonthlyReports` in
   `src/products/websites/site-report.ts`) uses the same rule. Today it reads
   the first `owner` membership with a confirmed email, which a converted
   client does not have: the conversion operator joins as `admin`.
5. Each send, suppression or failure is a receipt in Strelva handled
   ("Strelva sent your September recap to pat@…"). It is not a Needs you item.
6. Report cadence and last-sent markers move to Postgres (§5).
7. Running shows one line per business: "Strelva sends you a monthly recap."

### 3.5 Documents (supporting files, cap fixed)

1. A document is a private file under a business, listed in "All apps and
   files". It is not on Home as a System.
2. A document takes any number of edits. Today the 201st edit fails: verified
   locally on 2026-10-06 by running `changeDocument` 205 times. Edit 201
   throws a `ZodError` (`history: z.array(receiptSchema).max(200)` in
   `engine.ts`), and `/api/documents` answers 400 "Check the document title and
   text. Documents support up to 50,000 characters and 200 revisions." Undo
   appends a receipt too, so the document is stuck for good.
   `update_document_work` (`20260911210000_document_work.sql`) also requires
   the payload history to grow by exactly one, so the fix needs a migration.
3. The fix moves full receipts into an append-only revision table
   (`document_revisions`) and keeps the latest 20 receipts in the payload, so
   the editor's "Change history" card still shows recent edits. Undo of the
   latest edit keeps working. (Corrected while building: keeping only one
   receipt would have emptied that card.)
4. The same pattern is applied to onboarding (`history ... .max(500)`) and to
   application revision and release history (`APPLICATION_VERSION_HISTORY_LIMIT
   = 100`). Those hit the limit later, and their error messages already name
   the limit.

### 3.6 Ongoing checks (health)

1. A saved check is shown inside the health of the System it watches ("Live ·
   prices on site disagree with the price list"). It is not a System card.
2. Checks run only when someone presses run until
   `STRELVA_BACKGROUND_WORK_RELEASE` is on. Health says "last checked <date>",
   so a stale check never reads as healthy.

## 4. States and rules

- Internal tool lifecycle: Draft (`draft`), Live (`installed`), Paused
  (`retired`, records kept). Health: last submit failure, last notice failure.
- **Who can make or change** an internal tool: a Strelva operator (an active
  `super_admins` row and a membership in the workspace), or an agency with an
  active `workspace_delegations` grant for that workspace. Not owner, admin or
  member. Today the only roles are `owner/admin/member`
  (`src/platform/workspaces/permissions.ts`), with no Strelva-staff entry by
  design. 1.0.0 adds a `make_systems` permission checked in the create RPCs and
  in `workspace_role_allows`, plus the parity test.
- **Who uses it:** anyone with a use grant. Owners never need to sign in: the
  assigned-person email is the only owner-free path, and none of this needs
  the owner.
- **Needs you:** nothing in this spec creates a Needs you item. Turning a
  tool on is Strelva's call under the managed default, except when the tool
  emails people outside the business (decision 9.3).
- **Never:** Strelva never writes to a client's store, Stripe or rewards.
  Strelva never sends a report or notice while `EMAIL_SENDING_ENABLED` is not
  `"true"`; it records a suppression receipt instead. A contact is never
  subscribed to a newsletter by being created. No `/api/v1` response, `reb:`
  key or tenant row changes.

## 5. Built on

**Reused:** `saved_product_work`, `application_states`,
`application_releases`, `application_records`, `application_use_grants`;
`src/products/{applications,tracker,work-plans,documents,investigations}/`;
`src/platform/systems/from-existing.ts` (already maps applications, custom
applications, documents and trackers); `business_contacts` and
`business_people` (`20261002120000_business_record.sql`);
`resolve_business_owner_recipient` (`src/platform/business-record/service.ts`);
`src/lib/email/send.ts`; `newsletter_subscribers`
(`src/lib/storage/newsletter-store.ts`); Search Console data in Postgres
(`src/lib/storage/search-store.ts`); click metrics in Postgres
(`trackClick` in `src/lib/storage/analytics-store.ts`).

**New:**

- `make_systems` permission and the create-time check (S).
- Contact and assigned-person field types; contact upsert on submit; adds
  `internal_app` and `newsletter` to the `business_contacts.sources` check
  (M).
- Submit notice through `send.ts` with a receipt (M).
- Document revision table and RPC change (M). Same for onboarding and
  application history (S each).
- One recipient resolver used by `weekly-report`, `monthly-report` and
  `runWebsiteMonthlyReports` (S).
- `from-existing.ts` drops `documents/document` from the System list and
  treats `tracker/tracker` as kind `internal_app` (S).

**Redis to Postgres, for this catalog:**

| Redis key | Today | 1.0.0 |
| --- | --- | --- |
| `analytics:cfg:{tenant}` | Only copy of the analytics config (`src/lib/analytics.ts`) | Moves to Postgres; Redis read-through only. Reborn §2 line |
| `analytics:{surface}:{tenant}:{days}` | TTL cache | Stays a cache |
| `reb:report-cadence:{tenant}`, `reb:report-sent:{tenant}` | Only copy (`src/lib/report-cadence.ts`) | Move to Postgres. Old keys stay readable as a fallback, never renamed |
| `reb:gcp-token:*` | Token cache | Stays a cache |
| `orders:{tenant}`, `order:{tenant}:{id}` | 90-day visibility layer (`src/lib/orders.ts`) | Not moved. Frozen. Read their size first (§10) |
| `reb:rewards:{tenant}:*` | Strelva-side rewards (`src/lib/rewards/kv.ts`) | Not moved. Frozen. Read their size first (§10) |

Built locally: `tenant_analytics_config` and `tenant_report_state`
(`20261007194000`) through `src/lib/storage/redis-move.ts`. These are the only
Postgres home for these keys. The money-and-data stream's generic
`tenant_client_records` store also covered them; at integration (2026-10-06)
it was dropped for these keys so nothing writes them to two Postgres homes.
The typed tables won because they hold rules a generic JSON row cannot: a
forward-only last-sent marker read as the later of both stores, and
Postgres-first writes that stop before Redis on failure. `redis-move.ts`
stays a local helper for these two stores.

Booking config in Redis (`src/lib/booking.ts`) belongs to the bookings spec.
Workspace products already live in Postgres; nothing there moves.

**Retires or freezes:** custom application building (§9.1), `src/experience/delivery`
fixture shell, product learning from release scope, the Customers view, the
separate assessment presentation, and "Tracker" and "Experimental" as
on-screen labels.

**Tenant model vs workspace model:** internal tools, documents, onboarding and
checks are workspace-only and have no live clients to protect. Store,
rewards, newsletter, wellness, analytics and reports are tenant-only today and
keep running there. The workspace reads them through the link and never
copies them.

## 6. Moving today's clients

1. Nothing in the tenant routes changes: `/api/v1/track`,
   `/api/newsletter/subscribe`, `/api/rewards/*`, `/dashboard/{store,members,
   schedule,roster,analytics,reports}` and the four crons keep their behavior
   and responses. gldf and rohlax call `/api/newsletter/subscribe` from their
   own repos, so its response shape is frozen like `/api/v1`.
2. Conversion (`convert_tenant_to_business`) adds no store, rewards or
   wellness data. After it runs, a projection adds the Store Connection when
   the tenant has the `commerce` feature, or a checkout the operator confirms.
3. Contact backfill from `newsletter_subscribers` runs per converted tenant as
   a dry run first, upserting by email with source `newsletter`. It needs
   Jacob's yes like any production backfill.
4. Report recipient change: before switching a cron to the resolver, a dry
   run lists, for each active tenant, today's recipient and the resolved one.
   Any difference is reviewed by Jacob before the switch.
5. Report cadence migration copies each `reb:report-cadence` and
   `reb:report-sent` value into Postgres and keeps reading Redis when no row
   exists, so a missed copy cannot double-send a report.
6. The document, onboarding and application history migrations run on
   workspace tables with 0 production rows as of Sept 30. Re-check the count
   before applying.

## 7. Failure and undo

| What fails | What the person sees | Undo |
| --- | --- | --- |
| Assigned-person email suppressed or fails | Record saved. Strelva handled: "Couldn't email Sam about Acme Co. Strelva will retry." Operator queue gets it after 3 failures | Email can't be unsent |
| Contact upsert conflicts (email matches one contact, phone another) | Record saved with the email match; operator queue gets a merge item | Record edit is undoable |
| Non-builder tries to make a tool | 403, "Ask Strelva to build this", with a Request button | — |
| Plan generation fails or no model is configured | "Strelva couldn't draft this yet" and a Request is filed | Nothing was created |
| Search Console unreachable | Connection "not reachable since <date>"; health stays separate | — |
| Report recipient can't be resolved | No send; suppression receipt; operator queue item | — |
| Document revision write conflicts | Existing "This document has a newer revision" message | Latest edit undo, as today |

## 8. Proof

- Unit and SQL tests: `make_systems` parity between TS and SQL; create denied
  for owner, admin and member and allowed for an operator and a delegated
  agency; cross-workspace denial on contact links.
- A document takes 1,000 edits and the latest undo still works (the
  2026-10-06 local run is the failing baseline). Same for onboarding at 600
  changes.
- Recipient resolver: converted tenant with `owner_recipient`, converted
  tenant without it (falls back to `tenants.owner_email`), unconverted tenant,
  hosted site with an `admin` but no `owner`.
- Authenticated local journey on desktop and mobile: sentence → plan → Draft
  tool → rehearsal records → Live → member submit → contact created →
  assigned-person email captured by the email test sink → receipt.
- `pnpm check:custom-repos` and a byte-identical storefront comparison (the
  Sept 30 60/60 method) plus identical `/api/newsletter/subscribe` responses
  for gldf and rohlax.
- Production proof on a Strelva-owned test business (`strelva`): one internal
  tool live, one submit, one delivered notice, one monthly recap with a
  receipt. Needs email sending on for that business only (decision 9.5).

## 9. Open decisions

1. **Custom application builds.** Options: (a) cut from 1.0.0 and freeze the
   code; (b) move builds to a hosted sandbox such as Vercel Sandbox; (c)
   delete. Recommend (a). Production has 0 workspaces, native apps cover the
   intake-and-list job, and (b) is a new dependency that needs your yes.
2. **Can owners build?** ADR 0011 says "a business that chooses to" makes its
   own Systems. Reborn says app building is agency or Strelva only. Recommend
   operator and agency only at 1.0.0, with owners filing Requests. If you
   allow owners, drop the `make_systems` check for `owner` and keep it for
   `member`.
3. **Assigned-person email content.** Options: title only plus a sign-in link;
   full record in the email; a signed one-record link that needs no account.
   Recommend title and the one missing item, with a sign-in link. The signed
   link is better for owners who never sign in, but it is a new
   unauthenticated surface that needs a security review.
4. **Store order view.** Options: (a) freeze `/dashboard/store` and the
   order-review cron as they are; (b) retire both; (c) wire gldf's and rhm's
   Stripe webhooks to send order beacons. Recommend (a) until the Redis count
   in §10 is read. If it is empty, choose (b). (c) changes client repos.
5. **Email sending.** Reports and notices are the main way to reach owners who
   never sign in, and client email is paused unless `EMAIL_SENDING_ENABLED` is
   `"true"`. Options: turn it on globally, or add a per-business switch first
   on `strelva`. Recommend the per-business switch. SMS is not needed for
   anything in this spec, and nothing in the code sends SMS.
6. **The audit's cuts and merges** (all need your yes):

| Proposal | Recommend | Why |
| --- | --- | --- |
| Cut custom-application builds | Yes, as freeze | Decision 9.1 |
| Cut `src/experience/delivery` | Yes, delete | Only `/preview/strelva/{agency,client,start}` and its own two tests import it. The live Home is `src/experience/workspace/BusinessHome.tsx` |
| Cut product learning | Yes, out of release scope; keep the code behind its flag | Super-admin only, flag off, not business-facing. It is Strelva's own research tool, so deleting it loses data collection |
| Cut the Customers page | Yes | It left navigation Oct 5 (`workspace-places.ts`). It only listed where people reach the business, and the single business contact record it needs is not built. Contacts live in the business record |
| Merge tracker into internal tools | Yes | Same job (records with a form or list). Tracker brings assignees and record links that internal tools need for 3.1.6–8 |
| Merge saved checks into System health | Yes | §3.6. A check has no meaning without the System it watches |
| Merge assessment into the website audit | Yes | Both are issued outputs that open a rebuild Possibility; neither is a System |
| Agency website drafts become website Possibilities | Yes | Matches `systems-transition.md`: one change to one client's System, under a grant |

## 10. Unknowns

**Facts we don't have (each is a read-only query that needs your yes to run
against production):**

- Which active tenants have the `wellness` or `commerce` features:
  `select id, features from tenants where active`.
- Whether `orders:*` and `reb:rewards:*` hold anything in production Redis
  (a key count by tenant, no values).
- Whether `EMAIL_SENDING_ENABLED` is `"true"` in production today. The Reborn
  page lists turning it on as needing your yes, which suggests it is off. If
  so, no weekly or monthly report has reached an owner.
- How many active tenants have `analytics:cfg` set and Search Console data
  rows.
- Whether gldf's own Supabase is still paused. It was on Sept 30, when its
  rewards, contact and review writes failed. That is gldf's repo, not
  Strelva, but it is the live state of gldf's store.

**Inferences (not verified):**

- No client sends order beacons. This is true of the local checkouts, but
  deployed commits can differ (the manifest notes gldf and rohlax are ahead
  of their pins).
- `smokin-buddha` is in the manifest but not in the Sept 30 list of 12 active
  tenants. Which list is current is unknown.
- Template-rendered tenants (`twintrees-*`, `spacejam-storage`) may use the
  tenant booking widget. rohlax's repo does not call `/api/booking`.
- Whether anyone wants internal tools. 0 workspaces, and no client has asked
  for one in the record. Leslie's intake is an illustration, not demand.
