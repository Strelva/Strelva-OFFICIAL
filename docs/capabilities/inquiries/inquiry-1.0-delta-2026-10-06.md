# Inquiries at 1.0.0: what changes in the September 11 spec

Status: working default spec, 2026-10-06. Jacob adopted every spec
recommendation as the working default on October 6
([product model](../../product/product-model.md#decisions-the-specs-need)).
No production step is authorized by this page.

**Wave 6 round 5, October 7 — current local implementation:** every retained
acceptance criterion and C1–16 item has claim-specific evidence in the
[wave 6 verification record](./inquiry-wave6-verification-2026-10-07.md), with
flags, all 19 prepared migrations and rollout steps in the
[stream handoff](../../product/streams/w6-inquiries.md). This includes durable
held spam/operator repair, exact owner and assigned-member replies, current
policy/facts, signed account-free decisions, System/Library/Running projections,
booking handoff, complete answer/reply-time cohorts and the read cutover gate.
The older wave 2/3 notes below are historical. Their “not built” lines are
superseded by the evidence record, not removed from history.

**Production state supplied by Jacob:** 0.2.1 is live, every lead dual-writes
to `tenant_leads`, and 43 leads were backfilled. Step 0 is complete. This stream
made no production calls. Seven real production parity days, the read and
authority flips, live recipient/provider proof and deployment remain separately
authorized rollout steps. Code and test doubles cannot provide those clocks.

**Built locally October 6 (wave 2, branch `w2/bookings-inquiries`, not
applied or deployed):** section 6 steps 1 to 4. `src/lib/leads.ts` keeps the
signatures of `getLeads`, `getLeadById` and `getLeadSummary` and reads through
a source switch (`src/lib/lead-reads.ts`): `STRELVA_LEADS_READ` unset is
today's Redis; `compare` serves Redis, reads `tenant_leads` beside it and
logs any lead id in one and not the other; `postgres` serves `tenant_leads`
merged with any Redis lead still pending its copy, but only after 7
consecutive days of parity, and falls back to Redis on any failure. The
lead-mirror-reconcile cron records one parity result per tenant per day
(`checkLeadParity`, shared parity ledger, store `tenant_leads`) while the
switch is on. `STRELVA_LEADS_AUTHORITY=postgres` writes `tenant_leads` first;
a Postgres failure leaves the lead in Redis and `reb:lead-mirror:pending`
and the visitor still succeeds. Migration `20261008140000_tenant_lead_reads.sql`
adds `read_tenant_lead` and `read_tenant_lead_digests`. Scripts and the
operator merge read Redis on purpose (`getRedisLeads`). Proof:
`src/__tests__/lead-read-source.test.ts`, `tests/tenant-lead-reads-schema.sql`
in `check:workspace-sql`, `check:custom-repos` 196/196. Every production step (migration,
compare window, each flip) needs Jacob's yes.

**Built locally October 9 (wave 3, branch `w3/inquiries-gaps`, not applied
or deployed; `STRELVA_INQUIRY_RECORDS` off).** Migration
`20261009113000_inquiry_records.sql`: `tenant_leads.intake_state`
(`kept`, `held_as_spam`, `released`, `confirmed_spam`) with `held_reason`
and `contact_id`; `inquiry_events` (append-only, RLS on, grants revoked);
`hold_tenant_lead_as_spam`, `after_tenant_lead_capture` (the `captured`
event and the contact, matched by email then phone, source `inquiry`),
`record_inquiry_event`, `read_workspace_leads` (direct members, paged with
`p_before`), `read_workspace_inquiry_events` and
`decide_held_workspace_lead` (owner or an active Strelva super admin;
members and admins refused). `read_tenant_leads`, `read_tenant_lead` and
`read_tenant_lead_digests` are replaced to skip spam, so the 7-day parity
is unchanged. App: `src/lib/inquiry-records.ts`; the spam pit also holds
each caught submission in Postgres (Redis pit unchanged); capture runs the
follow-up after Postgres keeps a lead; delivery, reply and timeline writes
are copied into `inquiry_events`; the workspace Inquiries page lists held
messages (Release, It's spam, Move back) through
`POST /api/workspace/inquiries/held`; a drafted reply that quotes a price,
date or promise becomes an urgent, owner-only `customer.commitment` Needs
you item (`src/platform/needs-you/inquiry-policy.ts`). Proof:
`tests/inquiry-records-schema.sql` in both SQL checks,
`inquiry-records`, `inquiry-needs-you-and-held` and `held-inquiry-route`
tests. Not built: Redis readers (`/dashboard/leads`, the inquiry engine)
don't see a released message until reads flip; held spam from connected
sites stays in the client-records spam pit; no operator screen for held
spam (operators can call the same review function).

This page amends the
[September 11 inquiry spec](./inquiry-first-product-spec-2026-09-11.md). It
does not replace it. Where the two disagree, this page wins. Everything the
September 11 spec says that this page does not mark **Changed** still holds.
The [acceptance matrix](./inquiry-first-acceptance-2026-09-11.md) and the
[architecture and security review](./inquiry-first-architecture-security-review-2026-09-11.md)
still apply, with the additions in [Proof](#8-proof).

Five things moved since September 11:

1. Inquiries is a **System** that reads the business record
   ([ADR 0011](../../../../docs/adr/0011-organize-strelva-around-systems-connections-possibilities-versions.md),
   [product model](../../product/product-model.md)).
2. `tenant_leads` is the Postgres store for every lead
   ([Reborn §0](../../product/strelva-reborn.md#0-stop-losing-data-first)).
3. Reborn §2 makes inquiries **Postgres-authoritative**. Redis stops being the
   record.
4. Owner decisions route through **Needs you**
   ([needs-you spec](../../product/specs/needs-you.md)).
5. Owners may never sign in. Everything that needs them also reaches them by
   email.

Marking: **Changed** means this page changes a September 11 claim. **New**
means September 11 said nothing about it. **Kept** means it still holds as
written.

## 1. The moment

McClear's Cottage is the one client repo that posts to
`/api/v1/leads/mclears` today (`release-manifest.json`). A visitor fills the
contact form at 9:40pm on a Saturday asking about a private party for 30.

- The lead is written to `tenant_leads` first. It is kept for as long as
  McClear's is a client, not 90 days.
- The owner recipient (the business record's `owner_recipient`, falling back
  to `tenants.owner_email`) gets one "New inquiry" email.
- Strelva drafts a reply. The draft quotes a per-head price, so it is a
  `customer.commitment`. That is always the owner's call.
- The owner gets an urgent Needs you email at once: the inquiry, the draft,
  and **Approve**, **Not yet** and **Open**. They tap Approve on their phone,
  confirm on the page it opens, and the reply sends. They never sign in.
- What changed shows "Strelva replied to Dana about a private party", with
  the provider receipt.

This is the target. Today the lead lives only in Redis for reads, the owner
email may be gated off (see [Unknowns](#10-unknowns)), and no Needs you email
exists.

## 2. In the model

| September 11 noun | 1.0.0 noun | Marking |
| --- | --- | --- |
| Business | Business, with its business record | **Changed**: facts come from the record, not onboarding answers held by the capability |
| Capability (one inquiry workflow) | The **Inquiries System** (kind `inquiry`, origin `inquiry_workspaces.id`, `src/platform/systems/from-existing.ts`) | **Changed** on screen. `capability` stays the engine's internal word |
| Capability version | System **History** (each published version is a release) | **Changed** on screen. Never called "Version" |
| Inquiry / Record | Records inside the Inquiries System. Each points at one **business contact** | **Changed**: one person, one contact across inquiries and bookings |
| Change, preview, receipt | Kept underneath. Owner sees Needs you items and **What changed** receipts | **Changed** on screen |
| Responsibility | The inquiry policy, one source of routes in the Needs you evaluator, plus a **Running** sentence ("Every inquiry is answered within a day") | **Changed** |
| Connection | Typed Connections on the System page | **Changed** (see C13) |
| Work, Shape, Go | Requests and Ask Strelva | **Changed** (see C4) |
| Agency Attention, Patterns | Agency Queue and Library; patterns read as **Versions** | **Changed** (see C12) |

Connections of the Inquiries System at 1.0.0:

| Connection | Kind | Authority | Source of truth | Freshness | On failure |
| --- | --- | --- | --- | --- | --- |
| The client's site form (`mclears.com` → `/api/v1/leads/mclears`) | appears in | None. Intake only | `tenant_leads` | Each submission | The form keeps working; see section 7 |
| Business record: owner recipient, people, hours, services | reads | None | Business record | Read at use, never copied | Falls back to `tenants.owner_email`; routing to a removed person goes to the owner |
| Email from `mail.strelva.com` | acts on | Each send follows its Needs you route | Inquiry message receipts | Provider read-back | Recorded as suppressed, bounced or failed. Never re-sent |
| Bookings System | shares with | None | Bookings store | — | An inquiry is never lost because bookings is down |

## 3. What changes, item by item

Each item names the September 11 section it amends.

**C1. Changed: the capability is shown as a System.** (§6 Capability)
The Capability screen becomes the Inquiries System page: the live form
first, then records, then Connections, History and health. Lifecycle is
Draft, Live or Paused from `inquiryCapabilityLifecycle`
(`src/platform/systems/invariants.ts`). Health is separate: "Live · owner
email bouncing" is valid. The rules-as-data, immutable published versions
and fixed components are **Kept**.

**C2. Changed: the frame.** (Interface frame)
The sidebar of New, Search, Businesses, Recent work and Account is
superseded by the October 2 places (Home, Customers, Requests, Running),
the business menu, and Ask Strelva as the way in
([DESIGN.md](../../../DESIGN.md)). The rule that switching business never
carries a draft, selection or approval across is **Kept**.

**C3. Changed: Home.** (§1 Home)
Home is Needs you, What changed, In progress, Recent, with Systems by
their own names ("Inquiries · Live · 2 new"). Empty Needs you disappears.
September 11's fixed four-section order and "empty sections stay" are
superseded. "No metric cards, no invented activity" is **Kept**.

**C4. Changed: New, Shape and Go.** (§2 New, §4 Work and Shape)
Owners do not build Systems at 1.0.0; they ask Strelva, which files a
Request ([systems-catalog](../../product/specs/systems-catalog.md)). The
recorded authorization Go stood for survives as two Needs you kinds:

- a new inquiry flow is a Request whose scope the owner accepts
  (`request.scope`);
- publishing or changing a live inquiry flow is `system.go_live` or
  `system.change_live`, always `owner_decides`
  ([needs-you](../../product/specs/needs-you.md), mapping of
  `inquiry_publication_claims`).

"A material shape change needs a fresh decision" is **Kept**: the Needs you
item binds a revision hash, and a changed draft refuses the old link.

**C5. Changed: Make live works from email.** (§5 Change, preview, receipt)
Make live stays owner-only. Because owners may never sign in, it is
reachable from a signed one-tap link (needs-you items 9 and 10): GET shows a
confirm page, POST publishes. The confirm page carries what September 11's
confirmation carried: version, business, where it appears, routing
consequence, sender. "A stale draft cannot publish on an older rehearsal" is
**Kept** and now also covers the link: a changed item refuses with "This
changed since we emailed you."

**C6. Changed: Responsibility becomes the inquiry policy inside Needs you.**
(§10 Responsibility)
The `ResponsibilityPolicy` and `ALWAYS_REVIEW_ACTIONS`
(`src/products/inquiries/contracts.ts`, `inquiry-engine-responsibility.ts`)
are the route source for the `customer.message` change kind. Fixed on top:

- `customer.commitment` (a price, a date, a promise) is always
  `owner_decides`. No trust level moves it.
- `customer.message` floor is `strelva_reviews`. Supervised maps there;
  trusted maps to `handle` with a receipt.
- Owners can only make routes stricter, back to Strelva's default, never
  past it.
- A trust promotion (`promote`) writes a receipt with old and new routes.
- Escalation goes to the owner recipient, not a per-capability address.
- The 24-hour reply budget (`message-review-policy.ts`) is **Kept**. It is
  not replaced by the Needs you 3/7/14-day clock.

**C7. Changed: one owner-recipient rule for inquiry notices.** (New)
Today `captureLead` sends `sendNewLeadEmail` to the tenant config's
`ownerEmail`, and the inquiry engine sets `ownerNotification: "legacy"` so it
doesn't send a second (`src/products/inquiries/delivery.ts`). At 1.0.0 the
notice resolves through `resolve_business_owner_recipient` (Reborn §1). The
"never two owner emails for one lead" rule is **Kept**.

- The new-lead notice is a notice, not a decision. It goes at once.
- A reply that needs the owner is an **urgent** Needs you item: one email
  per item, at once.
- Working default: when a draft that needs the owner exists at notice time,
  the two travel as one email.

**C8. Changed: Postgres is the record.** (Record and rule contract)
September 11 kept leads Redis-authoritative behind adapters (the
`20260911100000` migration says "Redis remains the authority for customer
inquiry records"). At 1.0.0:

- `tenant_leads` is the inquiry record store, keyed by `tenant_stable_id`
  with `workspace_id` filled through `tenant_workspace_links`.
- `/api/v1/leads/[tenant]` keeps its contract and writes `tenant_leads`
  first.
- The engine tables (`inquiry_workspaces`, `inquiry_record_overlays`,
  `inquiry_publication_claims`) stay. They already key on `tenant_stable_id`;
  the workspace is resolved through the link, not copied.
- Spam held for review moves from `reb:spam-pit:*` (30 days) into
  `tenant_leads` with a `held_as_spam` state; delivery, reply and timeline
  keys move to `inquiry_events`
  ([money-and-data](../../product/specs/money-and-data.md), Redis table).

The cutover is section 6.

**C9. New: every inquiry points at a business contact.**
On capture in a converted business, the sender upserts a
`business_contacts` row with source `inquiry` (`upsert_business_contacts`),
matched by email or phone. Customers lists contacts, not leads. A bookings
record for the same person points at the same contact.

**C10. Changed: facts come from the business record.** (§12 Business model
onboarding)
Inquiries reads, never copies:

- routing recipients as `business_people` ids ("send to Maria");
- the owner recipient;
- hours, for "approved hours" and follow-up timing;
- services, for quote and intake options.

Website scans propose facts into the record as `fact.inferred`, which routes
to `owner_decides` until confirmed. "A scan never grants scopes, selects a
sender or enables publication" is **Kept**.

**C11. New: no sign-in is required for anything.**
Every `owner_decides` inquiry item reaches the owner by email (needs-you
item 8). The Inspector and Why stay signed-in and operator surfaces. When
Why finds the owner's email bounced, the bounded fix goes to the operator
queue as "Owner not told" ([operator](../../product/specs/operator.md)),
because the owner can't be reached to fix it.

**C12. Changed: agency surfaces.** (§13 Attention, §14 Patterns)
Partner agencies are out of 1.0.0. Strelva uses the agency surface itself:
Attention becomes the one Queue, Patterns become the Library. Pattern
installations are read as Versions through `patternInstallationAsVersion`
([agency-and-versions](../../product/specs/agency-and-versions.md)). "A
pattern never copies credentials, inquiry data, approvals or authority" is
**Kept**.

**C13. Changed: Connections are typed and shown on the System.** (§11
Connection)
Google, calendar, Stripe and MLS are not inquiry Connections at 1.0.0. The
calendar belongs to the bookings System. Consent, named scopes, disconnect
and the secrets boundary are **Kept** for any Connection that is added.

**C14. Changed: the booking variant moves to bookings.** (First journey,
"service booking variant")
Buyer, seller and quote variants stay on the one inquiry engine. A booking
request is the bookings System's record; the inquiry hands off to it
([bookings spec](../bookings/bookings-spec-2026-10-01.md), "Inquiry to
booking"). Native reservations already capture a lead
(`src/products/scheduling/public-booking-server.ts`, `captureLead`), so the
link exists today.

**C15. Changed: release flag per workspace.** (Release boundary)
`STRELVA_INQUIRIES_RELEASE` is global today (`src/products/inquiries/release.ts`).
At 1.0.0 it becomes a per-workspace release flag
([owner-entry](../../product/specs/owner-entry.md), item 7).

**C16. Changed: words.** Capability, Responsibility, Work, Shape, Go,
Rehearsal and Agent do not appear on customer screens. Strelva is the only
actor named. Rehearsal still runs; the owner sees "Strelva tried it with 8
test inquiries; all 8 passed."

## 4. States and rules

**Inquiry record states:** `new`, `assigned`, `follow_up_pending`, `handled`,
`blocked` (today's `inquiry_record_overlays.status`), plus **New**
`held_as_spam` and `released` (a held item the owner or operator let
through). Records are append-only evidence. Undo, pause, a System edit or
an exit never delete one (**Kept**, extended to the Postgres store).

**System lifecycle:**

| State | Intake (`/api/v1/leads`) | Owner notice | Strelva replies and follow-ups |
| --- | --- | --- | --- |
| Draft | Accepted, kept | Yes | None |
| Live | Accepted, kept | Yes | Per Needs you routes |
| Paused | Accepted, kept | Yes | Stopped; in-flight items show "Paused" |

**New.** Pausing never stops intake. Losing a lead because Strelva's handling
is paused would break "pausing keeps records and commitments"
([product model](../../product/product-model.md), rule 5).

**Authority:**

| Action | Owner | Member | Strelva (agency, operator) |
| --- | --- | --- | --- |
| Read records | Yes | Yes | Yes, with a receipt |
| Reply when routed to them | Yes | If routed or assigned | Only on its route; never `owner_decides` |
| Approve a commitment | Yes, link or app | No | No |
| Publish, change live, pause | Yes, link or app | No | Prepares; never decides |
| Release held spam | Yes | No | Yes, with a receipt |

**Never:** a second send after provider acceptance (**Kept**); an approval
in chat (ask-strelva); a one-tap link acting on a different revision than it
was emailed for.

## 5. Built on

**Reused as is:** the inquiry engine (`src/products/inquiries/`), fixed
components, rehearsal and publication; `src/lib/lead-mirror.ts` and the
`lead-mirror-reconcile` cron; `record_tenant_lead` and `read_tenant_leads`
(`supabase/migrations/20261005090000_tenant_leads.sql`); `src/lib/email/send.ts`
gated by `email-enabled.ts`; `src/lib/approve-link.ts`;
`src/platform/business-record/`; `src/platform/systems/`.

**New:**

- `read_tenant_lead(tenant, lead_id)`, a by-id read. Only a list read
  exists today.
- A workspace-scoped list read by `workspace_id`, with the membership check
  in the app.
- `held_as_spam` and `released` on `tenant_leads`, and an `inquiry_events`
  table.
- A read-source switch inside `src/lib/leads.ts` (section 6).
- Contact upsert on capture.

All are migrations or env changes: Jacob's yes each.

**Retires:** Redis as the inquiry authority. The `leads:*` and `lead:*` keys
stay as a 90-day cache and are not deleted. `reb:spam-pit:*` stays readable
until its 30-day TTL drains after the flip.

**Tenant vs workspace:** intake and the engine stay tenant-keyed by
`stable_id`. The workspace is resolved through `tenant_workspace_links`, which
`tenant_leads` already follows with a trigger. No row is re-keyed.

## 6. Cutover from Redis reads

Order matters: writes first, reads second, authority last. Each step is
reversible until the last.

**Step 0. Every lead is in Postgres (0.2.1).** Dual-write, backfill
(`scripts/backfill-tenant-leads.ts --apply --i-have-jacobs-yes`) and hourly
reconcile. Complete in production per Jacob's round-5 brief: 0.2.1 dual-writes every lead and 43 were backfilled. This thread did not read production. Do not repeat the backfill; the later read and authority steps remain separate.

**Step 1. One read path.** Every reader goes through `src/lib/leads.ts`.
`getLeads`, `getLeadById` and `getLeadSummary` keep their signatures and gain
a source: `redis` (today), `compare`, `postgres`. Mapping: `lead_id` →
`id`, `captured_at` → `createdAt`; every other `LeadRecord` field has a
column. The ids everything else uses (`inquiry_record_overlays.inquiry_id`,
Redis delivery keys, receipts) are the `lead_…` id, which `tenant_leads`
keeps. Nothing is re-mapped.

The readers that move, found by grep on 2026-10-06:

| Reader | Reads | Note |
| --- | --- | --- |
| `src/app/dashboard/leads/page.tsx` | `getLeads(tenant, 500)` | Gains leads older than 90 days; pages with `p_before` |
| `src/app/dashboard/page.tsx` | `getLeadSummary(tenant, 30)` | Count from Postgres |
| `src/lib/scan.ts` | `getLeadSummary(tenant, 30)` | Same |
| `src/app/api/inquiry-workspace/records/route.ts` | `getLeads` | Workspace records page |
| `src/products/inquiries/server.ts` | `getLeads` (up to 500) | Feeds `projectedInquiryRecords` |
| `src/products/inquiries/follow-up-cron.ts` | `getLeads` | Follow-ups stop missing old leads |
| `src/products/inquiries/reconciliation.ts` | `getLeadById`, `getLeads` | Repair after a crash mid-capture |
| `src/products/inquiries/delivery-approval-service.ts` | `getLeadById` (twice) | Reply approval |
| `src/products/inquiries/delivery-approval-primitives.ts` | re-exports `getLeadById` | Follows |

Scripts (`backfill-tenant-leads.ts`, `convert-tenant-to-workspace.ts`,
`scrubbed-production-copy.ts`, `seed-demo-tenant.ts`) read Redis on purpose
and stay.

**Step 2. Compare for 7 days.** In `compare` mode each read serves Redis and
reads Postgres beside it, logging any lead id or submission hash present in
one and not the other. This is the parity rule from
[money-and-data](../../product/specs/money-and-data.md) item 13. Parity
means zero unexplained misses for 7 days across all tenants. Expected
explained differences: Postgres has leads Redis expired.

**Step 3. Flip reads.** `postgres` mode, per store, behind an env switch
(Jacob's yes). Redis still receives every write as a cache. Rollback: switch
back to `redis`. Nothing is lost, because both still receive every write.

**Step 4. Flip authority.** Capture writes `tenant_leads` first.

- If Postgres refuses or times out, the lead goes to Redis and the
  `reb:lead-mirror:pending` queue, exactly as the mirror does today in
  reverse. The reconcile cron finishes it.
- The visitor's submission never fails on a database error (**Kept** from
  0.2.1).
- After this step, the `20260911100000` comment "Redis remains the
  authority" is false and gets corrected in a follow-up migration comment.
  Migrations already applied are not edited.

**Before step 4, fix deprovision.** `tenant_leads` cascades on tenant delete.
As a mirror that was tolerable. As the only lasting copy it would delete a
client's leads with its tenant row. Working default: change the foreign key
so deleting a tenant with leads is refused, and deprovision exports leads
first ([money-and-data](../../product/specs/money-and-data.md), section 6).

## 7. Failure and undo

| Failure | Who sees what | What happens |
| --- | --- | --- |
| Postgres down at capture | Visitor: normal success | Redis copy plus pending queue; operator queue shows `lead_unkept` until reconciled |
| Redis and Postgres both down | Visitor: today's error (500) | Same as today. Not made worse |
| Owner email gated off | Owner: nothing. Operator: "Owner not told" | Item still opens in Needs you and still lapses on schedule |
| Owner email bounces | Operator: "Email bounced" | Fix `owner_recipient` in the record; Strelva resends the notice, not a customer message |
| Reply approved, provider accepted, read-back failed | Owner: "Sent, delivery not confirmed" | Never re-sent (**Kept**) |
| Link used after the draft changed | "This changed since we emailed you", with Open | Nothing sent |
| Spam false positive | Owner or operator sees it under held items | Release makes it a normal record; no customer email until routed |
| Compare mode finds a miss | Operator alert | Flip blocked until explained |

**Undo:** publishing and config changes keep their undo (`inquiry_capability_undo`).
A sent message is never undoable. Undo never touches records (**Kept**).
Releasing held spam can be put back to held.

## 8. Proof

Added to the September 11 matrix:

- `tests/tenant-leads-schema.sql` extended: by-id read, workspace read,
  `held_as_spam`, deprovision refusal. In both SQL checks.
- Unit tests for each `src/lib/leads.ts` mode, including the id and
  timestamp mapping, and a reader that asks for a lead older than 90 days.
- Failure-path tests: Postgres down at capture after step 4, compare-mode
  mismatch, owner recipient fallback, bounced owner email, changed-item link
  refusal, paused System still accepting intake.
- `pnpm check:custom-repos` passes with McClear's `/api/v1/leads` body
  unchanged.
- A local journey on the `strelva` test business: submit, notice, urgent
  Needs you email, one-tap approve, receipt, without signing in. Then
  production on the same test business after Jacob's yes on email.
- Production read-only proof after step 3: `read_tenant_leads` returns at
  least as many leads per tenant as Redis, and the oldest lead predates the
  Redis 90-day window.

## 9. Open decisions

All have a working default from October 6. Jacob can overturn any.

1. **Pause and intake.** (a) Pause keeps intake (recommended, default).
   (b) Pause rejects intake. (b) loses leads; it changes section 4 and
   breaks product-model rule 5.
2. **Deprovisioned clients' leads.** (a) Refuse tenant delete until leads
   are exported (recommended, default). (b) Keep the cascade. (b) means
   leads die with the tenant.
3. **Notice and decision in one email.** (a) One email when both exist at
   capture (default). (b) Always separate. (b) doubles owner email for every
   quoted inquiry.
4. **Read-source switch.** (a) One env switch for all tenants after 7 days
   of parity (default). (b) Per tenant. (b) only matters if parity fails for
   one tenant, and adds a list to maintain.

## 10. Unknowns

**Facts (code, 2026-10-06):**

- Only McClear's posts to `/api/v1/leads` among the 9 client repos. Native
  booking reservations also capture leads.
- Redis keeps 500 leads per tenant for 90 days. Spam is held 30 days.
- No owner notice uses the owner-recipient rule yet.

**Inferences (not verified):**

- That most leads older than 90 days are already gone. Production Redis was
  not read.
- That client email is off in production. The product model lists this as a
  read-only check
  ([cross-spec problem 3](../../product/product-model.md#problems-that-cross-specs)).
  If it is off, lead notices have reached nobody.
- That owners answer email decisions. 1 sign-in in 30 days says they don't
  use the app. Whether they use email is unmeasured.

**How to find out:** the read-only production snapshot
(`scripts/workspace-target-snapshot.sql`), a count of `leads:*` and
`reb:spam-pit:*` per tenant, and the email gate check. Each needs Jacob's
yes because it reads production.
