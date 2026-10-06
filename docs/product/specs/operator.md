# One place to operate

Status: draft spec, 2026-10-06. Not built, not approved. For Jacob's review.

Strelva's main delivery cost is operator time. Today that time is spread over
six queues in two stores and fifteen `/admin` pages, and some live sites are
not checked at all. This spec defines the one queue a Strelva operator works
from at 1.0.0, keyed to Business → System, and the receipts, checks and
measures that make it trustworthy.

Sources read: `docs/architecture/operator-command-center.md`,
`docs/product/strelva-reborn.md` §5, `docs/product/strelva-1.0.0.md` §5,
`docs/product/systems-transition.md`, `docs/architecture/persistence-boundaries.md`,
`AGENTS.md`, and the code cited below. Draft PR #205
(`feat/business-effort-minutes`) read from `origin`.

## 1. The moment

Tuesday, 8:40 a.m. Jacob opens `admin.strelva.com`. One list.

At the top: **McClear's · website · a lead's Postgres copy failed 3 hours
ago.** McClear's sends its contact form through `/api/v1/leads/mclears`
(`release-manifest.json`). The lead is safe in Redis for 90 days, but not yet
kept. The row says so, with the retry count, and offers **Retry now**. He
clicks it. The row closes with a receipt: "Kept in Postgres 08:41, read back."

Second: **gldf · website · change request, triage due 10:00 today.** The
owner asked for a new wholesale page yesterday. Due time comes from the
existing next-business-day rule (`getTriageDueAt`, `src/lib/custom-repos.ts`).
He assigns it to himself, quotes it, and the owner gets the quote by email
because gldf's owner has not signed in this month.

Third: **The Mooney Firm · attymooney.com · 2 review replies drafted by
Strelva, waiting on you.** He opens the diff, approves both. Each reply goes
to Google, is read back, and leaves a receipt. The receipt says plainly:
"Google review replies can't be undone from Strelva. You can edit or delete
the reply in Google."

Below the fold, grouped by business: Rohlax (a domain expires in 21 days,
owner's call, emailed Monday, no answer), Twin Trees (site checks green, one
draft maintenance digest), Leslie (nothing waiting).

When he closes an item, a one-line prompt asks "Minutes on this?" prefilled
from the time the item was open in front of him. He accepts 6. At the end of
the month the console shows McClear's at 41 human minutes, gldf at 190, and
the median business at 38.

What he gets: one list that is complete, ordered by harm, with every outside
write either undoable or honestly labeled as not undoable, and a measured cost
per business.

## 2. In the model

- The queue is **operator machinery**, not a customer noun. Owners never see
  it. It sits under **Requests** (finite work: change requests, service
  requests) and **Running** (what Strelva keeps true: site up, domain
  verified, leads kept).
- Every item is keyed **Business → System**. Business is the customer
  workspace (`workspaces.id`). Before a tenant is converted, the business is
  the tenant (`tenants.stable_id`) and the item says "not yet a workspace".
  System is a row in `systems` (`supabase/migrations/20261004120000_systems.sql`)
  or, for unconverted tenants, the managed website identified by tenant
  `stable_id` (the rule in `systems-transition.md` row "websites").
- A health or domain item is **health** of a System or of a **Connection**
  (domain is an `appear` Connection with `target_type = 'domain'`). It never
  changes lifecycle. "Live · domain unverified" is valid.
- An item that waits on the owner is the owner's **Needs you** on their side,
  and an "owner's call" item on the operator's side. The operator can see it
  and chase it; the operator cannot decide it.
- Every outside write produces a **Strelva handled** receipt the owner can
  see, and the same receipt is the operator's evidence.
- Proactive "Ready to work" ideas (`src/app/admin/actions/portfolio-opportunities.ts`)
  are **Possibilities**, not queue items. They stay in their own lane.

## 3. What it does at 1.0.0

1. **One list.** `/admin` shows one queue across every tenant and every
   workspace. It reads all sources in the table below. No source is left out
   silently: if a source can't be read, the queue shows "Couldn't read
   change requests (Redis unavailable)" at the top, not a shorter list.

   | Kind | Source today | Store |
   | --- | --- | --- |
   | `draft_review` (Strelva-drafted content, GBP post/hours, review reply, newsletter) | `events:{tenant}` + `event:{id}`, status `pending` (`src/lib/events.ts`); `src/app/admin/actions/portfolio-actions.ts` | Redis, mirrored to `unified_events` |
   | `site_draft` (content drafts with preview diffs) | `listDrafts` (`src/lib/storage/draft-store.ts`), `/admin/drafts` | Postgres |
   | `maintenance_digest` | `maint-digest:{tenant}`, `maint-digest:pending` (`src/lib/maintenance-digest.ts`) | Redis |
   | `change_request` (custom-repo requests) | events of type `change_request`, statuses `requested … shipped/declined` (`src/lib/types.ts`), `/api/change-requests` | Redis |
   | `owner_pending` (escalated to owner, not answered) | events with `reviewAudience: "owner"` still pending (`src/lib/event-actions.ts` `escalateEventToOwner`, `src/lib/needs-you.ts`) | Redis |
   | `ops_alert` (webhook, revalidation, failed write, domain drift, stale SMS) | `src/lib/ops.ts` metrics via `src/lib/attention.ts` | Redis |
   | `domain_alert` (down, parked, expiring) | `domain-monitor` cron, `src/lib/domain-monitor-store.ts` | Redis |
   | `domain_unverified` (hosted domain waiting 7+ days) | `website-domain-verification` cron, `reb:website-domain-alert:*` | Postgres + Redis marker |
   | `site_health` (published revision not verified, scan grade drop) | `website_document_health`; `portfolio-scan` + `scan-store` | Postgres, Redis |
   | `service_request` (asked of Strelva, acceptance pending) | `service_requests` where `provider_kind='strelva'` and `provider_acceptance='pending'` (`src/platform/service-requests`) | Postgres |
   | `operational_exception` (failed or uncertain step) | `listOperationalExceptions` (`src/products/operations/inbox.ts`) | Postgres |
   | `assignment_offer` | `operational_assignments` status `offered` | Postgres |
   | `lead_unkept` (client lead whose Postgres copy failed) | `reb:lead-mirror:pending` (`src/lib/lead-mirror.ts`) | Redis |
   | `prospect_lead` (Strelva's own sales leads, workflow `new`) | `lead-workflow:{token}` (`src/lib/lead-workflow.ts`) | Redis |
   | `readback_failed` (provider accepted, read-back failed) | new: from the receipt ledger (behavior 6) | Postgres |

2. **Every item has the same shape:** business, System (or "not attached"),
   kind, one-line plain title, whose move it is (Strelva, owner, provider),
   priority, opened at, due at, assignee, state, source link, and the receipts
   it produced. Each row deep-links to the existing screen that works it
   (`/admin/clients/[id]`, `/admin/drafts`, the workspace job link).
3. **Priority is computed, not hand-set.** Four levels:
   - **P1 harm now:** site down or parked, domain expiring in 7 days or less,
     lead not kept, accepted write with failed read-back, webhook or
     revalidation failures.
   - **P2 someone waiting on Strelva:** change request, service request,
     assignment offer, operational exception.
   - **P3 Strelva's own drafts:** draft review, site draft, maintenance digest.
   - **P4 owner's call:** waiting on the owner. Shown, chased, never decided by
     the operator.
   Within a level, oldest due time first. An operator can pin an item to the
   top for a day; the pin is recorded.
4. **Due time and age.** Every item shows its age. Items with a known clock
   show a due time and turn late after it. Existing clocks are reused:
   change-request triage is next business day (`getTriageDueAt`); hosted
   domain verification alerts at 7 days; approve-from-email links last 14 days
   (`src/lib/approve-link.ts`); events expire at 90 days (`EVENT_RETENTION_DAYS`,
   `src/lib/events.ts`), so a pending draft older than 80 days is raised to
   P2 with "expires in N days". Proposed new clocks (Jacob to confirm, see §9):
   P1 acknowledged in 2 hours during the working day; owner's-call items
   chased by email at 3 and 7 days.
5. **Assignment.** Any super admin can take an item, hand it to another super
   admin, or release it. Assignment is a claim, not an authority: the action
   itself re-checks permission exactly as today. Workspace staff who are not
   super admins keep using the exact-job assignment link
   (`operational_assignments`); they do not enter `/admin`.
6. **One receipt for every outside write.** Every write to a provider or a
   live site records: business, System, provider, what was asked, the
   provider's acceptance, a read-back result (`matched`, `differs`,
   `failed`, `not_possible`), the before-state when one can be read, and
   whether undo exists. A failed read-back becomes its own `readback_failed`
   item; the write is never re-sent automatically (`AGENTS.md`, "Outside
   writes").
7. **Undo where it exists, plain labels where it doesn't.**

   | Write | Undo at 1.0.0 |
   | --- | --- |
   | Tenant content publish | Yes: restore prior version (`src/lib/storage/version-store.ts`, `/api/content/[section]/versions`) |
   | Hosted v2 website publish | Yes: republish the prior immutable revision (`website_document_publications`) — *inference, to verify* |
   | Inquiry capability publish | Yes: existing `inquiry_capability_undo` (`src/lib/event-actions.ts`) |
   | Calendar event | Per `workspace_calendar_event_receipts` |
   | GBP hours (`updateBusinessHours`) | No undo. Receipt keeps the before-hours; "Put back" drafts a new GBP write that goes through approval |
   | GBP post, photo, review reply | No undo. Label says "Change it in Google" |
   | Email sent | No undo. Receipt from `sendEmailWithReceipt` |
   | Stripe (pay link, subscription change) | No undo. No Stripe write from the queue at 1.0.0 |
   | Domain add (`addVercelDomain`) | Remove Strelva's claim only (`removeCustomDomain`, `src/lib/domains.ts`). The Vercel domain is never removed |
   | Domain removal | No undo. Requires typing the domain; refuses the last domain (existing guard) |

8. **Actions from the queue.** Without leaving the list: approve, skip,
   escalate to owner, bulk-approve per business (existing
   `bulkResolvePortfolioActions`, sequential, honest partial failure), retry a
   lead copy, re-run a health or domain check, accept or decline a service
   request, triage or quote a change request, take, hand off, snooze with a
   reason (max 7 days, P1 can't be snoozed), add a note, and log minutes.
   Anything that writes outside goes through the same governed path it uses
   today (`resolveEventAction`, `src/lib/ai-governance.ts`). The queue adds no
   new write path.
9. **Health covers every site.** The `website-health` cron checks only
   published v2 documents and is skipped while
   `STRELVA_WEBSITE_REBUILD_RELEASE` is off
   (`src/app/api/cron/website-health/route.ts`), so in production today it
   checks nothing, and it never checks custom-repo sites. At 1.0.0, every
   active tenant and every published workspace site gets a System health
   result from the observations in `src/platform/system-health/observations.ts`
   (`domain.uptime`, `domain.expiry`, `site.scan`, `cron.*`), independent of
   the rebuild flag. Custom-repo sites also get `revalidationHealth`
   (`CustomRepoMetadata`). A site with no evidence shows `unknown`, never
   green.
10. **Domain checks cover every domain.** `domain-monitor` already scans every
    active tenant (`scanPortfolioDomains`, `src/lib/domain-monitor.ts`).
    `website-domain-verification` only reads `websiteDocumentStore.listPublished()`
    and is also gated on the rebuild flag. At 1.0.0, verification runs over
    every `domain_claims` row in `pending` or `misconfigured`, for tenants and
    workspaces alike, read-only against Vercel.
11. **One domain view per workspace.** The workspace's domain panel and
    `/admin/clients/[id]` "Domains" read one projection over both stores:
    tenant `domain_claims` (Postgres, mirrored at `reb:domain-claims`) and the
    hosted-site registration state (`registration_attempt`,
    `20261001130000_domain_registration_attempt.sql`). Each domain shows: which
    System it appears on, verification, uptime, expiry, last check, and who
    can change it.
12. **Client leads are visible.** `/admin/client-leads` (exists locally,
    `src/app/admin/client-leads/`) stays, filtered by business. Each business
    row in the queue shows leads in the last 7 days and any unkept lead. The
    queue never shows lead contents in the list; contents open on click.
13. **Human minutes per business.** Built on PR #205
    (`src/platform/business-effort/`, `business_effort_entries`,
    `business_effort_voids`). Closing a queue item prompts for minutes,
    prefilled from time the item was open and focused, with category mapped
    from kind (`change_request` → `change`, `draft_review` → `review`, health
    and domain → `recovery`, `prospect_lead` → `sales`). The operator can edit
    or skip. Work done outside the queue is still logged by the existing form.
    `/admin/work` shows the monthly median, per business, per kind and per
    System.
14. **Owner reach outside the app.** An owner's-call item records how the
    owner was told (email, approve link, or not yet) and when. If client email
    is paused (`EMAIL_SENDING_ENABLED` unset), the row says "Owner not told:
    client email is paused", not "waiting on owner".

## 4. States and rules

Item states: `open` → `taken` → `waiting_on_owner` | `waiting_on_provider` →
`done` | `dismissed` | `expired`. `done` needs a receipt or a stated reason.
A source closing its own item (a draft approved on the client dashboard)
closes the queue item with "closed elsewhere by {actor}".

Authority:

- **Strelva operator** (verified user with an active `super_admins` row): sees
  every business, takes and works items, approves Strelva-drafted changes
  where policy allows, triggers checks.
- **Owner:** decides owner's-call items: publish, launch, payment, exit,
  anything set to owner review. The operator escalates; never decides.
- **Member, agency:** no `/admin`. Agency queue is out of 1.0.0 (assumption 2).

Never:

- The queue never writes outside on its own. A computed priority never
  approves anything.
- No outside write without a receipt. No receipt says "done" before provider
  acceptance; no receipt says "verified" without a read-back.
- No retry of an accepted write.
- No Stripe, DNS or production data action from the queue without Jacob's
  explicit yes (`AGENTS.md`, "Needs Jacob's yes").
- No Vercel domain removal. Ever.
- No change to `/api/v1`, `reb:` keys or tenant rows. The queue reads them.
- Server actions re-check super admin themselves; the `/admin` layout gate
  does not protect a POST (existing rule in `operator-command-center.md`).

## 5. Built on

Reused:

- `src/app/admin/page.tsx`, `TodayFeed.tsx`: becomes the queue page.
- `src/app/admin/actions/portfolio-actions.ts`, `actions.ts`: bulk approve.
- `src/products/operations/inbox.ts`: its `OperationalExceptionProjection`
  (with `effect` certainty, `safeAction`, `ageAt`, `deepLink`) is the model
  for the shared item shape.
- `src/lib/attention.ts`, `src/lib/ops.ts`, `src/lib/churn.ts`.
- `src/platform/system-health/*`: health per System.
- `src/lib/domains.ts`, `src/lib/domain-monitor*.ts`, `src/products/websites/domain-verification.ts`.
- `src/lib/email/send.ts` `sendEmailWithReceipt`, `src/lib/approve-link.ts`.
- `src/lib/client-leads.ts`, `src/lib/lead-mirror.ts`.
- PR #205 business-effort module.
- `tenant_workspace_links` (`20261002120000_business_record.sql`) for tenant →
  business.

New (proposed, names not final):

- `src/platform/operator-queue/`: one read projection over the sources in §3.1.
  Each source keeps its authority; the queue stores nothing it copies.
- Postgres `operator_queue_marks`: per source ref, assignee, pin, snooze,
  notes, owner-told timestamps. Keyed by `(source, source_ref)`. This is the
  only new state.
- Postgres `outside_write_receipts`: one ledger for writes that have no
  receipt store today (GBP hours, posts, photos, review replies, domain add
  and claim removal, tenant content publish). Writes that already have one
  (`website_document_receipts`, `workspace_calendar_event_receipts`,
  `inquiry_publication_claims`, `work_provider_receipts`, email receipts) are
  read in place, not copied.
- A health cron over all active tenants, not gated on the rebuild flag.

Tenant model vs workspace model: every source in §3.1 except service
requests, operational exceptions, assignments and `website_document_health`
is tenant-keyed today. The projection resolves tenant → workspace through
`tenant_workspace_links`; unconverted tenants appear under their own name.

Retires: `/admin/actions` "Pending approvals" (folded into the queue), the
`TodayFeed` lists, the attention panel's separate list
(`attention-digest` Slack cron keeps running, reading the queue). Pages
stay addressable as redirects.

## 6. Moving today's clients

1. Ship the projection read-only first, beside today's `/admin`. Compare
   counts per source for two weeks: queue count must equal the sum of source
   counts, every day.
2. Then switch `/admin` to the queue. Old pages keep working.
3. Receipts: add `outside_write_receipts` writes alongside each existing write
   path, one path at a time, starting with GBP review replies (highest
   volume). The write itself does not change.
4. Health and domain coverage: run the new checks in report-only mode, compare
   with `domain-monitor` results, then raise items.
5. As each tenant converts (Reborn §3), its items move from "not yet a
   workspace" to its business with no loss: source refs don't change.
6. Minutes: PR #205 binds tenants through `offering_website_bindings`. The
   conversion uses `tenant_workspace_links`. Before merge, #205 must resolve
   through links too, or converted clients read "not attached".

## 7. Failure and undo

| Failure | What the operator sees | Undo |
| --- | --- | --- |
| A source can't be read | Banner naming the source; list marked incomplete | n/a |
| Provider rejects a write | Item stays open, reason shown, nothing marked done | n/a |
| Provider accepts, read-back fails | `readback_failed` P1 item; never auto-retried | Per §3.7 |
| Bulk approve partly fails | Per item: landed / not landed, with reasons | Per item |
| Item closed elsewhere | "Closed by {actor} at {time}" | n/a |
| Health evidence stale | System shows `unknown`, item "no recent evidence" | n/a |
| Owner not reachable (email paused) | "Owner not told" on the item | n/a |
| Minutes entered wrong | Void with reason (PR #205), never edit | Void |

## 8. Proof

- Unit: projection per source, priority and due-time rules, tenant → workspace
  resolution, owner-not-told when email is paused.
- Count parity test: synthetic Redis and Postgres fixtures for all 15 kinds;
  queue total equals source totals; one source down marks the list incomplete.
- Receipt tests per write path: accepted + read-back matched, accepted +
  read-back failed (no retry), rejected.
- Undo tests: content version restore; domain claim removal leaves Vercel
  untouched (assert no Vercel delete call).
- Health coverage test: every active tenant, including all 9 custom repos in
  `release-manifest.json`, yields a health result with the rebuild flag off.
- Authenticated local journey at 390px and desktop: open, take, approve,
  close with minutes, on a Strelva-owned test business and on gldf data in a
  scrubbed local copy.
- Production proof (needs Jacob's yes): read-only queue live for 14 days with
  count parity holding daily; one real review reply approved from the queue
  with a read-back receipt; one month of minutes logged for every live client.

## 9. Open decisions

1. **Where the queue lives.** (a) `/admin` only; (b) the agency surface Queue
   (`DESIGN.md` "Not built yet"), which Strelva uses as its own agency under
   assumption 2; (c) one projection rendered in both. **Recommend (c)** with
   `/admin` first. If partner agencies come into 1.0.0, (c) is required and the
   projection must filter by delegation.
2. **Clocks.** Proposed: P1 acknowledged in 2 working hours; owner chase at 3
   and 7 days. Different numbers change only config.
3. **Minutes capture.** (a) manual only (#205 today); (b) prompt on close with
   prefill; (c) fully timed. **Recommend (b)**: (a) undercounts, (c) counts
   tabs left open.
4. **Undo for GBP hours.** (a) label only; (b) "Put back" drafts a new
   approved write from the stored before-state. **Recommend (b)**. It is a
   Google write, so it still needs approval and Google access.
5. **Prospect leads in the same queue.** Strelva's sales leads are not a
   client's business. Recommend in, as their own kind with no System, so one
   list stays complete. If Jacob wants sales separate, drop the kind.
6. **Owner reach beyond email.** No SMS sender exists (no provider in
   `src/lib`; only a legacy `sms:pending:{tenant}` marker read by
   `src/lib/ops.ts`). Under assumption 6, email is the only channel and client
   email is paused in production. Turning on `EMAIL_SENDING_ENABLED` is
   required before any owner's-call item can work. SMS would be a new
   dependency and needs Jacob's yes.

## 10. Unknowns

Facts:

- The "six queues" count comes from Reborn §5. The code shows more sources
  (15 kinds in §3.1). The October 4 audit that may define the six is not in
  this checkout (`output/product-audit-2026-10-04/` not found).
- `website-health` and `website-domain-verification` both return
  `skipped` while the rebuild flag is off.
- `tenant_leads`, `systems` and business-record migrations are local only.

Inferences, to check:

- That a hosted v2 publish can be undone by republishing a prior revision.
  Find out: read `src/products/websites/deployment.ts` and the publication RPCs.
- That GBP posts and photos can be deleted through the API. Find out: Google
  Business Profile API docs; until then, label "no undo".
- Real queue volume. Unknown. Find out: run the read-only projection for two
  weeks and count items per kind per business.
- Whether minutes per business are dominated by a few clients (gldf, custom
  repos). Unknown until #205 data exists for one full month.
