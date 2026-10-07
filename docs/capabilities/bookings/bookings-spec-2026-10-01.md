# Bookings: every client bookable by a visitor, an inquiry or an AI assistant

Status: working default spec, updated October 6, 2026 (first proposed
October 1). On October 6 Jacob adopted every spec recommendation as the
working default ([product model](../../product/product-model.md#decisions-the-specs-need)).
Nothing here is deployed, and no production step is authorized by this
page. Sibling of the
[website rebuild spec](../website/website-rebuild-spec-2026-10-01.md), whose `Booking`
and `InquiryForm` components this capability powers.

## Current implementation status — wave 6, round 5, October 7

Branch `w6/bookings`, code and local fixtures only. This status supersedes the
historical wave-2/3/4 gap lists below; those describe their original checkpoints.
No production step or notification is authorized here. Full results, switches,
14 migrations/rollbacks and rollout order: [stream handoff](../../product/streams/w6-bookings.md).

The first full verification below passed; final audit closure is still active for
tenantless workspace bookings and visitor phone/timezone/native confirmation copy.
Their fresh final evidence will replace this checkpoint before completion.

Built and locally tested: both visitor entry paths on one store; current record
hours/services/phone; stable receipts, customer management and immutable history;
per-service bookability/mode/buffer/intake; exact-revision owner-approved instant
rules; inquiry three-slot offers and owner proposal replies; staff-entered requests
without decision authority; agent API/MCP/OpenAPI/ReserveAction with customer
confirmation and 15-minute holds; reminders and separate request clocks; calendar
busy/mirror/recovery; owner history/no-shows/outside-hours/intake/health; bounded
record fallback; pause and completed-workspace-exit admission rules. Agent bookings
were required by this adopted spec and use no new dependency.

A read-only daily booking-parity cron at `45 5 * * *` UTC compares bookings and
60 days of slots, writes only parity/heartbeat evidence, and cannot advance the
streak after a partial or failed run. It is authenticated and heartbeat-registered.
Every notice remains behind its switch and all three existing email gates;
flag-off visitor response/default regressions and client compatibility pass.

Local proof: 6,388 tests pass (39 intentionally skipped across the repository),
typecheck/lint/boundaries/build pass, client compatibility 196/196, and isolated
PostgreSQL checks pass including 30 tests through both real booking route families.
Desktop/mobile evidence and limits: [rendered fixture review](../../../output/w6-bookings-ui/README.md).
The production build requires `NODE_ENV=production` on this host, whose inherited
value is `development`; failures and corrective reruns are preserved in the handoff.

Still unproven: production migration/backfill, seven consecutive parity days,
real provider grants/event behavior, outside-client use and delivered/read-back
email. The disposable real-provider suite is present but was not enabled.
Google granular scopes and revoke-before-wipe are implemented behind flags.
Microsoft disconnect wipes local credentials, while application consent must be
removed in My Apps (or by an administrator for admin-granted consent). Automatic
per-application Microsoft revocation is **not implemented** with the existing
calendar permission. The [account-wide Graph revocation API](https://learn.microsoft.com/en-us/graph/api/user-revokesigninsessions?view=graph-rest-1.0)
requires broader permission and affects all apps; no such permission was added.
That literal spec line needs an accepted provider exception or separately authorized
authority design. It is not silently marked complete.

**Built locally October 6 (wave 2, branch `w2/bookings-inquiries`, not
applied or deployed; every switch off).** Phase 1a of the build plan:

- **One store.** Migration `20261008141000_booking_store.sql`:
  `business_bookings` (calendar = the tenant's stable id for both route
  families, exclusion constraint on held, requested and confirmed time plus
  buffer; Calendly imports kept, never refused), `business_booking_history`,
  `booking_settings`, and `public_website_bookings.booking_id`. RLS on,
  grants revoked, service-role functions, per-business denial tests in
  `tests/booking-store-schema.sql`. Uses `btree_gist`.
- **The move** (`src/platform/bookings/`, `src/lib/storage/booking-store.ts`
  keeps every signature): `STRELVA_BOOKING_STORE_WRITE=1` dual-writes both
  route families (failures queued in `reb:booking-store:pending`, replayed by
  the reconcile cron); `scripts/booking-store-move.ts` backfills (dry run by
  default; legacy bookings, Redis config and overrides, API receipts) and
  records the 7-day compare (bookings and 60 days of slots per service);
  `STRELVA_BOOKING_STORE_READ=compare|postgres` flips reads after 7 days of
  parity, store-first with the legacy path as rollback. Schedule-payload
  reservations without a receipt are not copied (no tenant calendar).
- **Record.** Once reads flip, hours, services and phone come from the
  business record at use; booking settings only narrow; a removed or
  inactive service stops being bookable.
- **Pause.** A paused bookings System offers no slots on either route and
  refuses new bookings with the business phone; every booking, cancel path
  and API management token keeps working.
- **Owner.** "New booking" notice through `src/lib/owner-recipient.ts`
  (`STRELVA_BOOKING_OWNER_NOTICE=1`); request mode creates `requested`
  bookings that reach Needs you as urgent `customer.commitment` items
  (approve confirms, Not yet or a lapse declines).
- **Calendly** writes `import` bookings and cancels them.
- **Wellness.** `/workspace/bookings` day and week views; `/dashboard/roster`
  and `/dashboard/schedule` are `ready` behind the Systems flag.

Proof: `src/__tests__/booking-one-store.test.ts` (both real routes, in memory
and against the real functions in `check:workspace-sql`),
`booking-store-availability`, `workspace-bookings`, `booking-store-move-plan`,
`webhook-signatures`; `check:workspace-sql` and `check:workspace-upgrade`
pass; `check:custom-repos` 196/196. Not built: reminders, the manage link
page, the hold-expiry sweep, the 24 h and 72 h request clocks (a request
lapses on the Needs you clock and is declined), agent bookings and MCP,
calendar busy times on the tenant routes, editing hours from a booking
screen. Production steps (migration, backfill, compare, each flip, owner
email) each need Jacob's yes.

**Built locally October 9 (wave 3, branch `w3/bookings-inquiries-gaps`, not
applied or deployed; every switch off).** Migration
`20261009110000_booking_lifecycle.sql` (send log, clocks, sweep, manage
lookup, schedule copy, narrowing hours; RLS on, grants revoked,
cross-business refusals in `tests/booking-lifecycle-schema.sql`, in
`check:workspace-sql`).

- **Reminders and clocks.** The `booking-reminders` cron (every 15 minutes,
  `vercel.json` and `CRON_MAX_AGE_SECONDS`; off unless
  `STRELVA_BOOKING_REMINDERS=1` and the store's write switch): customer
  reminders 24 h and 2 h before (skipped when the booking was made inside
  that window or is an import), the owner chased once at 24 h, and at 72 h
  the request is declined ("Expired"), never confirmed, and the customer is
  told with up to three open times. Needs you then withdraws the item with
  that reason. Holds not confirmed in 15 minutes are released. Each message
  is claimed once in `business_booking_messages` and goes through
  `src/lib/email/send.ts` (customer mail from `mail.strelva.com` with the
  business name); a failed send is recorded, never resent. API receipts
  awaiting their calendar read-back are not owner requests and have no
  clock.
- **Manage link.** `/b/[token]` (`STRELVA_BOOKING_MANAGE_PAGE=1`) uses the
  existing public-receipt management token, looked up by hash, and stops
  working once the booking ends. Change time and cancel run the public
  booking service's own change and cancel; a paused schedule closes changes
  and keeps cancel. GET never changes anything. Reminders link to it.
- **Calendar busy times** on the tenant routes
  (`STRELVA_BOOKING_CALENDAR_BUSY=1`, store-served reads only): the
  workspace's calendar connection blocks busy times (60-second Redis
  cache); a revoked, errored or unreadable calendar offers slots anyway and
  turns an instant booking into a request.
- **Schedule reservations without a receipt** copy into the store
  (`booking-store-move.ts schedules`, dry run by default): on the calendar
  of the tenant the schedule is published to, else the workspace's own.
- **Booking-only hours** are edited from `/workspace/bookings` by an owner
  or admin, bounded by each day's opening hours in the record; the store
  refuses anything outside them, and a record with no hours is told to add
  them first.
- **Calendly**: the signed webhook also reads Calendly's API v2 payload
  shape; imports and cancels are proven end to end through the route.

Proof: `booking-lifecycle`, `booking-reminders-cron`, `booking-manage-link`,
`booking-hours-edit`, `booking-schedule-copy`, `booking-store-move-plan`,
`booking-one-store` (calendar busy and Calendly end to end), and the SQL
test above. Not built: agent bookings and the MCP server (they need the
customer confirmation email and the dependency decision), customer
cancellation and reschedule emails, a manage token for legacy widget
bookings, the `ReserveAction` markup. Known gaps: a Needs you day-3
reminder can coincide with the 72-hour lapse; the legacy dashboard's
config save, while dual-writing, overwrites hours edited on the bookings
screen. Production steps (migration, each switch, live email) need Jacob's
yes.

**Built locally October 6 (wave 4, branch `w4/journey-gaps`, code only).**
Once the one store serves (`STRELVA_BOOKING_STORE_READ=postgres` after the
parity streak), the visitor's `POST /api/booking` no longer needs Redis: the
store's exclusion constraint guards the slot, the legacy Redis slot lock is
best effort, and the rate limit falls back to a per-instance count when Redis
is absent or down. When nothing can store or guard the booking (store
unreachable and no Redis; or Redis down on legacy reads), the visitor gets a
503 that says nothing was booked, never a 500 or a false success. A failing
activity log or owner notice after the booking is stored no longer fails it.
Proof: `booking-without-redis` (9 tests; 8 fail without the change) and the
booking suites above unchanged; the tenant-host journey step in
`tests/booking-approval-authenticated-local.spec.ts` (not yet run on a stack).

**October 6 update.** This spec now sits inside the 1.0.0 model: bookings is
a **System** that reads the business record. The new section
[Bookings in the 1.0.0 model](#bookings-in-the-100-model) says how. Every
claim changed on October 6 is marked **[Changed Oct 6]**, and every added
claim **[New Oct 6]**. Unmarked text is the October 1 spec and still holds.
Where they disagree, the marked text wins.

## What it does

A visitor on a Strelva site picks a time and gets a confirmation, a reminder
and a link to reschedule. A visitor who sends an inquiry at 10pm is offered
three open times right away. The owner approves one tap from their phone. An
AI assistant asked to "book a consult with a Buffalo estate lawyer" can find
the open slots and request one through a published API.

Strelva owns the booking record. A connected Google or Outlook calendar
blocks busy times and gets a copy of each booking. Bookings work on day one
with no calendar connected.

We believe a five-person firm should answer at 10pm as well as a company with
a front desk. Its website can already do the answering.

## Why now

- **The phone goes unanswered.** CallRail's analysis of 1.1M leads found missed
  calls run 28% in legal and 32% in healthcare (vendor data, Jan 2025). In a
  Clio secret-shopper study, 40% of law firms answered the phone (vendor).
- **People book after hours.** 46–52% of salon bookings happen outside opening
  hours (Phorest 2019, Book Salon 2021; vendor data, salons only).
- **Reminders work.** A Cochrane review of 7 trials (5,841 people) found
  reminders improve attendance by 14%.
- **AI assistants now book.** Google AI Mode books through partners like
  Booksy, Fresha and Vagaro. Where a business has no online availability,
  Google's AI phones it on the customer's behalf. ChatGPT books tables
  through Yelp, OpenTable and Resy since August 10, 2026. In a Yelp-funded
  Morning Consult survey, 65% said being able to act, such as booking,
  matters when they use AI for local search.
- **Generic schedulers don't reach those assistants.** Acuity, Calendly and
  Cal.com aren't on the Reserve with Google partner list; Square, Mindbody,
  Setmore and SimplyBook are.

Sources are in the [research section](#sources).

## The experience

### Visitor, instant booking (wellness, trades)

1. On the site, the `Booking` component shows services, then the next open
   days and times in the visitor's time zone.
2. They pick a time and enter name, email and phone, plus any intake
   questions.
3. **Confirmed.** They get an email with the time, address, a calendar file,
   and a link to reschedule or cancel. Reminders arrive 24 hours and 2 hours
   before.

### Visitor, request booking (law, bookkeeping)

1. The visitor sends an inquiry, or picks "Request a consultation."
2. The confirmation screen offers three open times. They pick one, or say
   "none of these work."
3. The owner gets one email: "New consult request: [name], Tue 2:00 PM.
   [Approve] [Suggest another time]." The approve link is signed (the
   existing `approve-link.ts`). One tap approves. **[Changed Oct 6]** The
   email goes to the owner recipient (the business record's
   `owner_recipient`, falling back to `tenants.owner_email`) as an urgent
   **Needs you** item. The link opens a confirm page and the POST from it
   approves, per the [needs-you spec](../../product/specs/needs-you.md)
   item 9. The owner never has to sign in.
4. The visitor gets the confirmation, the calendar file and the manage link.
   If the owner suggests another time, the visitor gets new options.

### AI assistant

1. The assistant finds the business, then reads its services and open slots
   from Strelva's public booking API. It can find that API through JSON-LD on
   the site or through the MCP server.
2. It sends a booking request with the customer's name and email.
3. The customer gets an email: "[Assistant] requested Tue 2:00 PM with
   [business]. [Confirm]." The booking holds the slot for 15 minutes and is
   only placed once the customer confirms. That stops anonymous agents from
   filling the calendar.
4. After confirmation it follows the business's mode: instant or request.

### Owner

- **Setup is one screen:** services (name, length, price shown or hidden,
  instant or request), weekly hours, and an optional calendar connection.
  Defaults: one 30-minute "Consultation," request mode, weekdays 9–5, a
  15-minute buffer, 4 hours' minimum notice, bookings up to 60 days out.
  **[Changed Oct 6]** Services, lengths, prices and weekly hours are not
  entered here. They are read from the business record, and editing them
  edits the record, which the website and Google listing also read. The
  booking screen keeps only what is about booking: mode, buffer, notice,
  advance window, daily cap, intake questions, and optionally narrower
  bookable hours. The defaults above apply only where the record has no
  value. At 1.0.0 Strelva sets this up through a Request; owners don't build
  Systems.
- **Bookings live in the workspace:** upcoming, requests waiting for them,
  past, no-shows. Each has its history: requested, approved, reminded,
  rescheduled, cancelled.
- **Already on Vagaro, Booksy, OpenTable, Jobber or Calendly?** "Use my
  current booking tool." The site's booking component links to it, and
  where the tool sends webhooks (Calendly today), those bookings show in the
  same list. We never move someone off a tool that already reaches AI
  assistants.

## Decisions

| Decision | Default | Why |
| --- | --- | --- |
| Source of truth | A Strelva booking record in Postgres | Bookings work without a calendar. Calendar outages and token expiry never lose a booking. |
| One store **[New Oct 6]** | One booking store for `/api/booking/*` and `/api/v1/bookings/*` | Today there are three: the tenant `bookings` table plus Redis config, the schedule JSON in `saved_product_work`, and `public_website_bookings` receipts (Reborn §2). |
| Hours and services **[New Oct 6]** | Read from the business record | One fact, one place. Changing Friday hours changes slots the same minute. |
| Owner decisions **[New Oct 6]** | Through Needs you, by email first | Owners may never sign in (1 sign-in in 30 days). |
| Calendar role | Busy-time source and a mirror of confirmed bookings | Avoids double-booking without making Google verification a launch blocker. |
| Default mode | Request (owner approves) | Most target clients (legal, bookkeeping) qualify before meeting. Wellness and trades switch to instant. |
| Agent bookings | Customer confirms by email before the slot is placed | Prevents spam and holds a real person to the booking. |
| Existing tools | Link and import; don't replace | Vagaro, Booksy and OpenTable already reach Google AI Mode and ChatGPT. |
| Reminders | Email at 24 hours and 2 hours | Proven to help. SMS waits for a provider decision. |
| Payments | Not in this capability | Deposit evidence is vendor-only. Ships as a later add-on through Stripe. |
| Calendar sync | Live busy-time reads with a 60-second cache | No push channels needed at our volume. |

What we removed: hand-entered interval schedules (`calendar/contracts.ts:4-6`),
where each interval was one slot. Weekly hours and service lengths replace
them. **[Changed Oct 6]** The intervals live in
`src/products/scheduling/contracts.ts` (`intervalSchema`,
`scheduleSchema.availability`). The weekly hours that replace them come
from the business record's `hours` fact.

## Bookings in the 1.0.0 model

**[New Oct 6]** This whole section is new on October 6. It maps the spec
onto the [product model](../../product/product-model.md) and
[Reborn §2](../../product/strelva-reborn.md#2-data-owned-by-the-workspace).

### The moment

On Monday the owner of The Mooney Firm emails Strelva that Friday hours
change to 9–3. Strelva updates the business record. That same minute
attymooney.com shows the new hours, and Friday consult slots after 3pm stop
being offered. Nobody edited a booking setting.

At 10pm Tuesday a visitor requests a Thursday 2pm consult. The owner gets
one email with **Approve** and **Suggest another time**, taps Approve on
their phone, confirms on the page it opens, and the visitor gets the
confirmation and calendar file. Strelva handled shows "Strelva confirmed
Thursday's consult with Dana." The owner never signed in.

This is the target. Today hours and services are copied into booking config
in Redis, the owner request email doesn't exist, and no notice uses the
owner-recipient rule.

### In the model

- The **bookings System** is one per business at 1.0.0 (kind `booking`,
  `src/platform/systems/from-existing.ts`; today it is adopted from a
  `scheduling/schedule` saved work). Its lifecycle is Draft, Live or Paused;
  health is separate ("Live · calendar disconnected").
- **Bookings are records inside it.** Each points at one business contact
  (`business_contacts`, source `booking`), the same contact an inquiry from
  that person points at.
- **Wellness schedule and roster are part of it**, as its week and day
  views ([systems-catalog §3.3](../../product/specs/systems-catalog.md)). No
  new wellness surface is built. Members stay frozen with rewards.
- Owner decisions are **Needs you** items; what Strelva did is **Strelva
  handled**; instant mode is a **Running** item.

Connections of the bookings System. A Connection never grants authority by
itself.

| Connection | Kind | Authority | Source of truth | Freshness | On failure |
| --- | --- | --- | --- | --- | --- |
| Business record: hours, services, owner recipient, address, phone | reads | None | Business record | Read at use, never copied | Record unreadable: slots fall back to the last read for 1 hour, then none are offered; operator alerted |
| The client's site (`Booking` component, legacy widget) | appears in | None | Bookings store | Each request | Store down: "Booking is unavailable, call [phone]" |
| Google or Outlook calendar | reads busy times; acts on events | Owner grants (`access.grant`, sign-in) | Strelva's bookings, never the calendar | 60-second cache | Bookings continue; instant becomes request; "Live · calendar disconnected" |
| Inquiries System | shares with | None | Each its own store | — | Neither loses a record because the other is down |
| Calendly | triggers | Owner grants | Calendly for its own bookings | Each webhook | Missed webhooks show as health, not as lost bookings |
| Google listing booking link | appears in | Publishing System's Google write rules | Business record `links` (kind `booking`) | Publishing's | Owned by the [publishing spec](../publishing/publishing-spec-2026-10-06.md) |

### Hours and services read from the record

The business record already holds what bookings needs
(`20261002120000_business_record.sql`):

- the `hours` fact: `timezone`, `weekly` (`day`, `opens`, `closes`) and
  `overrides` (`date`, `closed`, `opens`, `closes`, `label`);
- `business_services`: `name`, `duration_minutes`, `price_text`, `active`,
  `external_ref`;
- `owner_recipient`, `phone`, `address`.

Bookings reads them and keeps no copy. Rules:

1. **Bookable hours can only narrow.** A schedule's `bookableHours` and
   `bookableOverrides` subtract from the record's hours. They can never open
   a time the business is closed. A wellness practitioner who takes clients
   Tuesday to Saturday while the shop is open daily is a narrowing.
2. **Owner-stated fact changes apply at once** (`fact.owner_stated`, handled
   with a receipt, needs-you item 5). Existing bookings that fall outside new
   hours are kept and listed for the owner. Strelva never cancels one on its
   own.
3. **A service removed from the record stops being bookable.** Existing
   bookings keep `serviceNameAtBooking`.
4. **Editing a service or hours from the booking screen edits the record.**
   There is one place.
5. **Versions.** The record holds one `hours` fact per business. A business
   with two locations and different hours (Twin Trees, if the owner says one
   business) needs per-location hours, which the record doesn't have. That
   waits on the Twin Trees answer in
   [agency-and-versions](../../product/specs/agency-and-versions.md).

### One booking store

Today there are three stores that don't talk:

| Route | Store today | Config today |
| --- | --- | --- |
| `/api/booking/*` (tenant widget, by host) | Postgres `bookings` table (`tenant_id` text, `date`, `start_time` text; `src/lib/storage/booking-store.ts`) | Redis `reb:booking:config:{t}` and `reb:booking:overrides:{t}`; services from tenant content `services`; Redis slot locks |
| Workspace scheduling | The schedule's JSON in `saved_product_work.payload` (`availability`, up to 1,000 `reservations`, `src/products/scheduling/contracts.ts`) | Same payload |
| `/api/v1/bookings/[tenant]` (granted public API) | `public_website_bookings` receipts, bound to a `public_website_booking_grants` row and the schedule | The schedule |

At 1.0.0 there is one store: a new table keyed by `workspace_id` and the
bookings System, with a nullable `tenant_stable_id` for bookings taken
through a tenant route (the `tenant_leads` pattern: RLS on, privileges
revoked, service-role functions, cross-workspace denial tests). Both route
families write it and its exclusion constraint guards both, so a widget
booking and an API reservation can't take the same slot.

- `/api/booking/*` keeps its request and response shapes.
- `/api/v1/bookings/*` is additive only. `public_website_bookings` stays as
  the public receipt (management token, request hash) and gains a reference
  to the booking row.
- The schedule payload keeps its `pause` and revision history; its
  `reservations` array stops being written once reads flip.

### Moving today's bookings

Field mapping from `src/lib/booking.ts` and `src/lib/types.ts`:

| Legacy field | 1.0.0 home |
| --- | --- |
| `BookingConfig.timezone` | Record `hours.timezone` |
| `weeklySchedule[]` `{day, start, end, enabled}` | Record `hours.weekly` when the record has no hours. When the record has hours and they differ, the schedule's `bookableHours` (narrowing only; any part outside record hours is listed for the operator, not imported) |
| `slotDuration` (minutes) | Default length for services whose `duration_minutes` is empty |
| `bufferTime` (minutes) | `bufferMinutes` on each booking service |
| `bookingLeadTime` (hours) | `minNoticeMinutes` = hours × 60 |
| `maxAdvanceBooking` (days) | `maxAdvanceDays` |
| `requirePayment` | Not carried. Payments are out of this capability. Any tenant with `true` is listed in the migration report |
| `DateOverride` `{date, available, start, end, reason}` | Schedule `bookableOverrides` (`closed` = `!available`, `opens`/`closes`, `label` = `reason`). The record's own closures are untouched |
| Tenant content `services[]` `{id, name, duration, price, comingSoon}` | `business_services` (already imported by `src/platform/business-record/tenant-import.ts`, with `external_ref` = the legacy id) |
| `Booking.serviceId` | `serviceId` through `business_services.external_ref` |
| `Booking.serviceName` | `serviceNameAtBooking` |
| `date` + `startTime` / `endTime` | `start` / `end` as timestamps in the config's time zone at migration |
| `clientName`, `clientEmail`, `clientPhone` | `customer`, plus a `business_contacts` row once converted |
| `notes` | Intake answer `notes` |
| `status` `confirmed`/`cancelled`/`completed`, `cancelledAt` | Same statuses; history row for the cancellation |
| `id` | `legacyId` |
| Redis slot locks | Retired. The exclusion constraint replaces them |

Steps. Each production step is Jacob's yes.

1. **Find who uses it.** The read-only query from item 8 above: tenants with
   rows in `bookings` or keys under `reb:booking:config:*`. The
   [systems catalog](../../product/specs/systems-catalog.md) infers
   template-rendered tenants (`twintrees-*`, `spacejam-storage`) may use the
   widget and finds rohlax's repo doesn't call `/api/booking`.
2. **Migration.** The new store, booking settings and history. Additive.
3. **Dual-write.** Both route families write the new store beside today's
   store. A failed new-store write never fails the visitor; it is queued and
   retried like `src/lib/lead-mirror.ts`.
4. **Backfill.** Copy legacy `bookings` rows, the Redis config and overrides,
   and schedule-payload reservations. Dry run by default.
5. **Compare for 7 days.** Slots offered by old and new paths, per tenant,
   for the next 60 days; booking counts and hashes per tenant. Zero
   unexplained differences
   ([money-and-data](../../product/specs/money-and-data.md) item 13).
6. **Flip reads** per store behind an env switch. `getBookings`,
   `getBookingConfig`, `getDateOverrides` and `getAvailableSlots` keep their
   signatures, so `/dashboard/schedule` and `/dashboard/roster` follow
   without edits until Reborn §6 redirects them to the System's views.
   Rollback: switch back; both stores still receive writes.
7. **Retire.** Redis config keys stay as cache and are not deleted (`reb:`
   keys are frozen). The legacy `bookings` table stays, read-only.

### Pause keeps reservations

Pausing is `system.pause`, always `owner_decides`. The bookings System and
its schedule already share one pause in one transaction
(`20261004120000_systems.sql`), and `src/products/scheduling/lifecycle.ts`
already says "Existing appointments are unchanged". At 1.0.0 the same rule
covers both route families:

- no new slots on `/api/booking/availability` or `/api/v1/bookings`; a POST
  is refused with the paused message and the business phone;
- every future booking stays confirmed, keeps its reminders, its calendar
  copy and its manage link;
- customers can cancel while paused; rescheduling needs a new slot and is
  refused until resume;
- pending requests stay in Needs you; the owner can still approve them;
- resume shows what changed while paused (`lifecycle.ts` "what a resume has
  to review").

Pause is not billing. Today the public `/api/booking` POST calls
`requireActiveSubscription`, which returns 402 to visitors when billing is
on and the tenant is lapsed past grace. That contradicts
[money-and-data](../../product/specs/money-and-data.md) item 6 (a lapse
never stops a site or drops a lead). Working default: remove the gate from
the visitor POST and keep it on owner routes.

### Owner notices and Needs you

| Event | Route | Reaches the owner by |
| --- | --- | --- |
| Instant booking confirmed | Handled under the approved Running item | "New booking" email at once; Strelva handled receipt |
| Booking request | `customer.commitment`, owner_decides, urgent | One email per request with Approve and Suggest another time; Home if signed in |
| Customer cancels or reschedules | Handled | Email; Strelva handled |
| Go live, pause, resume | `system.go_live`, `system.pause` | Morning Needs you email |
| Turn on instant for a service | `running.approve` | Morning Needs you email |
| Connect a calendar | `access.grant` | Magic-link sign-in; no one-tap |
| Calendar disconnected | `health.owner_action` | Morning email: "Reconnect your calendar" |

Every one resolves its address once through the owner-recipient rule. While
client email is gated off, items are created and recorded `suppressed`, and
the operator queue shows "Owner not told" (needs-you step 3). Members can
see and take bookings by hand (origin `owner`) but decide nothing.

### What retires

- Redis as the authority for booking config and overrides.
- Redis slot locks.
- The hand-entered `availability` intervals as the source of open times.
- Booking-owned copies of services and hours.

### Open decisions

All have a working default from October 6. Jacob can overturn any.

1. **One new table or extend `bookings`.** (a) New table (default): native
   bookings have no tenant, and `bookings.tenant_id` cascades on tenant
   delete. (b) Extend `bookings` additively. (b) saves a copy step but keeps
   slug-keyed rows and the cascade.
2. **Imported legacy hours that differ from the record.** (a) Keep them as
   narrower bookable hours and list the rest for the operator (default).
   (b) Overwrite the record. (b) would change the website's hours without the
   owner.
3. **Billing gate on visitor booking.** (a) Remove it (default). (b) Keep
   it. (b) means a lapsed client's visitors can't book.
4. **Who approves requests.** (a) Owner only at 1.0.0 (default). (b) Members
   the owner names. (b) needs a Needs you lifecycle that names members.

### Unknowns

**Facts (code, 2026-10-06):** three stores, as above. A production Vercel
deploy refuses to run unless `DATA_SOURCE=postgres`
(`src/lib/db/source-flags.ts`), so production legacy bookings are in the
Postgres `bookings` table. Legacy customer confirmations send only when
`CUSTOMER_EMAIL_ENABLED` is on (default off, per
`src/app/api/booking/route.ts`). The legacy route sends no owner notice.

**Inferences (not verified):** which tenants use the legacy widget and how
many bookings and configs exist. The read-only query in step 1 answers both,
with Jacob's yes.

## Model

**[Changed Oct 6]** The model below is the October 6 version. Changes from
October 1 are commented `// Oct 6`. Name, length and price moved to the
business record's `business_services`; weekly hours, time zone and
overrides moved to its `hours` fact. The booking System keeps only
booking settings.

```ts
const BookingService = z.object({
  id, workspaceId, scheduleId,
  businessServiceId: z.string().uuid(),    // Oct 6: business_services.id; name, duration_minutes, price_text read from it
  bufferMinutes: z.number().int().min(0).max(120).default(15),
  mode: z.enum(["instant", "request"]).default("request"),
  intake: z.array(IntakeQuestion).max(8),
  bookable: z.boolean(),                   // Oct 6: offered for booking; business_services.active still wins
});

const BookingSchedule = z.object({
  id, workspaceId,
  systemId: z.string().uuid(),             // Oct 6: the bookings System this belongs to
  // Oct 6: time zone, weekly hours and overrides are read from the record's `hours` fact.
  // These two optional fields can only narrow it, never open hours the business is closed.
  bookableHours: z.record(Weekday, z.array(TimeRange).max(4)).optional(),
  bookableOverrides: z.array(DateOverride).max(366).optional(),
  minNoticeMinutes: z.number().int().default(240),
  maxAdvanceDays: z.number().int().default(60),
  maxPerDay: z.number().int().optional(),
  calendarConnectionId: z.string().uuid().optional(),  // existing workspace_calendar_connections
});

const Booking = z.object({
  id, workspaceId, serviceId, scheduleId,
  tenantStableId: z.string().uuid().optional(),   // Oct 6: set for bookings taken through a tenant route
  start: IsoDateTime, end: IsoDateTime,
  status: z.enum(["held", "requested", "confirmed", "cancelled", "declined", "no_show", "completed"]),
  origin: z.enum(["site", "inquiry", "agent", "owner", "import", "legacy"]),  // Oct 6: `legacy` for rows moved from the tenant `bookings` table
  serviceNameAtBooking: shortText(160),    // Oct 6: what the customer booked, kept if the service is renamed
  customer: { name, email, phone? },
  contactId: z.string().uuid().optional(), // Oct 6: business_contacts.id (source `booking`) once the business is converted
  intakeAnswers: z.record(z.string(), z.string()),
  inquiryId: z.string().optional(),
  agent: z.object({ name: shortText(120), confirmedAt: IsoDateTime.optional() }).optional(),
  calendarEvent: z.object({ provider, eventId, receiptId, readBack: z.enum(["confirmed", "unknown", "failed"]) }).optional(),
  manageTokenHash: z.string().optional(),  // Oct 6: optional; legacy bookings never had one
  requestFingerprint: z.string().optional(), // existing public booking fingerprint; Oct 6: optional for legacy rows
  legacyId: z.string().optional(),         // Oct 6: the tenant `bookings.id`, kept for old links and activity
});
```

Every status change writes a history row: actor, from, to, time and reason.

## How it works

### Availability

- Slots come from weekly hours, overrides, service length plus buffer,
  minimum notice, maximum advance and the daily cap. **[Changed Oct 6]**
  Weekly hours, time zone and overrides are the business record's `hours`
  fact, intersected with the schedule's optional `bookableHours` and
  `bookableOverrides`. Service length is `business_services.duration_minutes`;
  where it is empty, the schedule's default length (60 minutes, today's
  `slotDuration` default) applies. Existing confirmed and
  held bookings are subtracted, then calendar busy times if a calendar is
  connected.
- Generation reuses and replaces the legacy logic in `src/lib/booking.ts:87`
  (`generateSlots`), made time-zone-correct from the schedule's IANA zone.
  It gets tests across DST changes.
- Busy-time reads use the existing adapters: Google `/freeBusy`
  (`calendar/adapters.ts:529`) and Outlook `calendarView` (`:441`). Results
  are cached 60 seconds per schedule in Redis, a cache only.
- If a busy-time read fails, return slots with `calendarChecked: false`.
  Instant services switch to request mode for that booking so the owner
  confirms. Bookings are never refused because a calendar is down.

### Placing a booking

1. Hold the slot with a Postgres row lock or exclusion constraint on
   `(schedule_id, tstzrange(start, end + buffer))` for `held`, `requested`
   and `confirmed` rows. Two visitors can't take the same slot.
2. Instant: `held` → `confirmed`, then the calendar write. Request:
   `requested`, plus an approval item. Agent: `held` for 15 minutes until the
   customer confirms; unconfirmed holds expire through the sweep cron.
3. Calendar write after confirmation uses the existing repeat-safe path
   (`calendar/service.ts:346-517`: a deterministic Google event ID, an
   Outlook `transactionId`, read-back, recovery on unknown). An unknown or
   failed read-back is recorded on the booking and is **not** retried as a
   new write (AGENTS.md, outside writes). The booking stays confirmed.
4. The existing request ID and fingerprint rules
   (`public-booking.ts`, migration `20260920123000`) dedupe retries.

### Inquiry to booking

- When an inquiry arrives for a workspace with a request-mode service, the
  confirmation screen and the inquiry receipt email offer the next three
  slots. Picking one creates a `requested` booking linked to the inquiry.
- The inquiry reply templates (`delivery-message.ts`) gain a "propose times"
  reply. The owner picks up to three slots, and the customer picks from a
  signed link.

### Approvals

- A request creates an approval item through the governed path. The owner
  approves in the workspace or from a signed link (`signApproveToken`,
  `src/lib/approve-link.ts:54`). Approval sends the confirmation and writes
  the calendar event.
  **[Changed Oct 6]** The governed path is **Needs you**. A booking request
  is change kind `customer.commitment` (it promises a time), always
  `owner_decides`, and urgent, so it is emailed at once, one email per
  request. Approve runs the booking's own confirm; Needs you records the
  decision and makes no second write path.
- Requests not answered in 24 hours remind the owner once. After 72 hours
  the customer is told and offered new times. **[Changed Oct 6]** This is
  the booking request's own clock, like the inquiry reply's 24-hour budget.
  It replaces the Needs you day 3, 7 and 14 clock for this kind: at 72 hours
  the item closes "Expired, nothing changed" and its Not yet path (new times
  to the customer) runs. Silence never confirms a booking.
- **[New Oct 6]** Instant mode is a standing approval. Choosing instant for a
  service is a **Running** item the owner approves once ("Strelva confirms
  Consultation bookings in your open hours", `running.approve`). Each
  instant booking after that is handled and shows in Strelva handled.

### Notifications

| Message | To | When |
| --- | --- | --- |
| Booking confirmed, with calendar file and manage link | Customer | On confirm |
| Request received, owner will confirm | Customer | On request |
| Confirm your booking (agent-made) | Customer | On agent hold |
| New request, approve or suggest | Owner | On request |
| New booking | Owner | On instant confirm |
| Reminder | Customer | 24 h and 2 h before |
| Rescheduled / cancelled | Both | On change |

**[Changed Oct 6]** "Owner" in this table means the business's owner
recipient, resolved once by `resolve_business_owner_recipient` (the record's
`owner_recipient`, falling back to `tenants.owner_email`). No booking notice
picks its own address. "New booking" is a notice; "New request" is a Needs
you item.

All of them go through `src/lib/email/send.ts`, gated by `email-enabled.ts`.
They come from `mail.strelva.com` with the client's name, the client-branded
domain. A `booking-reminders` cron runs every 15 minutes. It is declared in
`vercel.json`, authenticated with `requireCronRequest`, and registered in
`CRON_MAX_AGE_SECONDS`. A send log makes each reminder go out once.

### Manage link

`/b/[token]`: a page showing the booking, with Reschedule (same service, new
slot, same mode rules) and Cancel. The token is hashed at rest (existing
pattern, `public-booking.ts:489-531`) and expires after the booking ends.

### Calendars

- **Narrow the Google scope.** Today the code requests the full
  `https://www.googleapis.com/auth/calendar` scope (`calendar/oauth.ts:78`).
  Request only busy-time and event-write scopes. **Verify the exact granular
  scope names against Google's current list before submitting.**
- Reuse the GBP Google Cloud project and consent screen (`GOOGLE_CLIENT_ID`).
  Add the calendar redirect URI and scopes. Submit verification on day one.
  Google says 3–5 business days; practitioners report 2–8 weeks.
- Microsoft: an Entra multi-tenant app with `Calendars.ReadWrite` and
  publisher verification.
- Disconnecting revokes the token at the provider, then wipes it. Today it
  only wipes it (`calendar/repository.ts:320`).
- While verification is pending, bookings still work without a calendar.
  Only conflict-checking is missing.
- **[Changed Oct 6]** Line references drifted since October 1. The full
  scope is now `src/products/scheduling/calendar/oauth.ts:80`; disconnect is
  `revokeWorkspaceCalendarConnection` at
  `src/products/scheduling/calendar/repository.ts:337`, which calls the
  `revoke_workspace_calendar_connection` RPC and makes no provider revoke
  call. The claims are unchanged.
- **[New Oct 6]** The calendar is a **Connection** of the bookings System,
  not part of it. Its contract is in
  [Bookings in the 1.0.0 model](#bookings-in-the-100-model). Connecting one
  is `access.grant`, which needs the owner's sign-in (a magic link); Google
  or Microsoft consent needs the owner's own account anyway.

### AI assistants

- **Public API, additive under `/api/v1/bookings/[tenant]`:**
  - `GET .../services`: services, lengths, modes and time zone. This is new;
    today a caller must already know a `capabilityId`.
  - `GET .../slots?service=&from=&to=`
  - `POST .../reservations` with `origin: "agent"` and `agent.name`.
    Agent-made bookings always go through the customer confirmation email.
  - An OpenAPI document at `/api/v1/bookings/openapi.json`.
- **MCP server** at `/api/mcp/bookings/[tenant]` with tools `list_services`,
  `find_slots`, `request_booking` and `get_booking_status`. It covers the
  same operations and limits as the public API. **Needs Jacob's yes for the
  dependency (`@modelcontextprotocol/sdk`) or we hand-roll the protocol.**
- **Site markup.** Hosted sites add JSON-LD `potentialAction: ReserveAction`
  pointing at the booking page. It's cheap; evidence that it helps is
  unproven.
- **Google Business Profile booking link.** Set the profile's booking URL to
  the site's booking page. The GBP API write is blocked until Google approves
  API access, so until then an operator sets it by hand.
- Rate limits: the existing 20-per-window limit per IP, plus [n] agent holds
  per tenant per hour.

### Reserve with Google (separate track)

Apply to the Actions Center as a booking platform. Requirements: merchant
contracts (we have them), merchants matching their Maps listings, an
inventory feed, a booking server and real-time updates. Google publishes no
minimum merchant count, and acceptance is uncertain. If accepted, the feeds
and booking server are about 8–10 days of work on top of this spec. That's
outside the bar for a 5 because the timing is Google's.

### Existing tools

- Calendly: the existing webhook (`api/webhooks/calendly`) writes `import`
  bookings into the same list. **[Changed Oct 6]** Correction: today the
  webhook writes an activity event (`addEvent` in `src/lib/events.ts`), not
  a booking. Writing `import` bookings into the one store is new work. At
  1.0.0 Calendly is a *triggers* Connection on the bookings System.
- Vagaro, Booksy, OpenTable, Jobber, Square: the `Booking` component links
  out to the tool's booking page, and the workspace shows "Bookings happen in
  [tool]." Imports are added per tool only when its API allows it and a
  client needs it.
- Legacy `/api/booking/*` tenants keep working unchanged. They move to the
  native engine one at a time, with a side-by-side check of slots for 7 days.
  Which tenants use it needs a read-only production query. **Reading
  production data needs Jacob's yes.** **[Changed Oct 6]** They move to the
  one booking store first, with their routes and responses unchanged, then
  to the native slot engine. The order and field mapping are in
  [Moving today's bookings](#moving-todays-bookings).

## Failure paths

| Failure | Visitor or owner sees | System does |
| --- | --- | --- |
| Two visitors pick the same slot | Second sees "Just taken," with the next 3 slots | Constraint rejects the second hold |
| Calendar read fails | Normal slots; instant becomes request for that booking | Recorded as `calendarChecked: false` |
| Calendar write unknown or failed | Booking confirmed; owner sees "not on your calendar yet" | Read-back state stored; no blind rewrite |
| Token revoked or expired | Owner: "Reconnect your calendar" | Connection marked errored; bookings continue |
| Owner never answers a request | Customer told at 72 h, offered new times | One owner reminder at 24 h |
| Agent hold not confirmed | Nothing | Hold expires at 15 min |
| Duplicate submit | Same confirmation | Fingerprint dedupe |
| Email disabled | Workspace shows bookings; no messages | Messages logged as `suppressed` |
| Customer cancels after the cutoff | Allowed; owner notified | Late cancellation recorded |
| DST change | Correct local times | Slot tests across DST |
| Workspace exit | Future bookings listed for the successor | Exit pauses new bookings; manage links keep working |
| Bookings System paused **[New Oct 6]** | Visitor: "Bookings are paused" with the business's phone from the record; existing customers can still cancel | No new slots on either route; existing bookings, reminders, calendar copies and manage links continue |
| Owner recipient email bounces **[New Oct 6]** | Operator: "Owner not told" | Request still expires on its 72-hour clock and the customer is offered new times |
| Business record hours changed **[New Oct 6]** | New slots follow at once | Existing bookings outside the new hours are kept and listed for the owner; none are cancelled automatically |
| Subscription lapsed **[New Oct 6]** | Today: legacy widget visitors get a 402 | Visitor booking is never gated by billing (see the 1.0.0 section) |

## Done means proven: the bar for a 5

Checked rows below mean local code/fixture proof only, as recorded in the current
status and handoff. Production rows stay unchecked. The real-provider suite is
implemented but its credentialed cases remain skipped; 429 is a deterministic
contract test rather than a deliberately induced provider rate limit.

- [ ] On tenant zero in production: book, reschedule and cancel through the
      site with a real Google calendar and a real Outlook calendar connected.
      Events appear and disappear in both.
- [ ] Inquiry → three slots → request → one-tap approval → confirmation,
      end to end in production.
- [ ] An outside client books through the MCP server and the public API,
      and the customer confirmation gate holds.
- [ ] Customer confirmation and reminder emails are delivered and read back.
- [x] Failure-path tests for every row above, including concurrency and DST.
- [x] A real-provider test suite behind a flag: revoked token, 429, deleted
      event, etag conflict.
- [x] Desktop and mobile review of the booking component, manage page, owner
      setup and owner list in empty, loading, error and permission states.
- [x] `pnpm check`, `check:custom-repos` and the workspace SQL checks pass.
      `/api/v1` changes are additive, and contract tests cover the new
      routes.
- [x] `booking-reminders` and hold-expiry crons declared, authenticated and
      registered.
- [x] **[New Oct 6]** One store: a legacy `/api/booking` booking and a
      `/api/v1/bookings` reservation land in the same table, and the slot
      each takes is refused to the other. Tested locally with both routes.
- [x] **[New Oct 6]** Changing Friday hours in the business record changes
      Friday slots on both routes with no booking-side edit.
- [x] **[New Oct 6]** Pausing the bookings System keeps every future
      booking, its reminder and its manage link, and offers no new slots.
- [ ] **[New Oct 6]** A request reaches the owner recipient by email and is
      approved from the link without signing in, on the `strelva` test
      business in production after Jacob's yes on email.
- [x] **[New Oct 6]** `/dashboard/schedule` and `/dashboard/roster` show the
      same bookings before and after the store flip, for a wellness fixture.

## Build plan

| Phase | Work | Days |
| --- | --- | --- |
| 0 | Submit Google verification and register the Microsoft app. They run in the background. | 0.5 |
| 1 | Services, schedules, slot engine, hold constraint, workspace setup and list | 5 |
| 2 | Confirmation, reminders, manage link, owner notifications, crons | 3 |
| 3 | Request mode, inquiry to booking, one-tap approval | 3 |
| 4 | Real calendars: narrower scopes, provider revoke, real-provider suite | 3 |
| 5 | Services discovery, OpenAPI, MCP server, agent confirmation gate, JSON-LD | 3 |
| 6 | Existing tools: link-out mode, Calendly imports in the list | 1.5 |

About 19 working days. Phases 1–3 make a usable product on their own, with
no calendar or Google dependency. Reserve with Google is extra and depends
on acceptance.

**[Changed Oct 6]** Add phase 1a before phase 1: the one store, the legacy
field migration, hours and services read from the record, and the wellness
views on the new store. Reborn §2 sizes it L (three to seven days), which
puts the total at about 22–26 working days. These are estimates, not
measurements. Phase 1 no longer builds its own services and hours setup;
it builds the booking-only settings.

## Needs Jacob's yes

1. **Email in production.** Without it, no confirmations or reminders go
   out.
2. **The Google consent screen change and verification submission.** These
   are outward-facing and touch the screen that already carries
   `business.manage`.
3. **The Microsoft Entra app registration and publisher verification.**
4. **Env vars:** `GOOGLE_CALENDAR_CLIENT_ID/SECRET` (or the shared Google
   client), `MICROSOFT_CLIENT_ID/SECRET`. Confirm `STRELVA_CALENDAR_FIXTURE`
   is unset in production.
5. **A migration** for services, schedules, bookings and history.
   **[Changed Oct 6]** Services now live in the business record migration
   (`20261002120000_business_record.sql`, `business_services`). This
   migration adds the booking settings, the one booking store and its
   history.
6. **The MCP dependency,** or approval to hand-roll it.
7. **The Reserve with Google interest form.** It speaks for Strelva as a
   platform.
8. **A read-only production query** to find the legacy booking tenants.
9. **[New Oct 6] The legacy booking backfill and each read flip** (the
   moving steps below), and the env switch that flips reads.
10. **[New Oct 6] Removing the billing gate** from the public `/api/booking`
    POST. It changes what a lapsed client's visitors see.

## What it can't do yet

- **Deposits or payments.** That's a later Stripe add-on.
- **SMS reminders.** They need a provider decision.
- **Team round-robin or multiple staff on one service.** One schedule per
  calendar for now.
- **Recurring appointments and class or group bookings.**
- **Booking through Google AI Mode directly.** That needs Reserve with Google
  acceptance. Until then, assistants reach us through the API, MCP and the
  site.

## Sources

- CallRail missed calls: <https://www.businesswire.com/news/home/20250114793850/en/CallRail-Releases-Report-Benchmarking-Marketing-Efforts-for-Small-Businesses>
- Clio response study: <https://www.clio.com/about/press/clios-legal-trends-report-reveals-law-firms-struggle-to-respond-to-client-inquiries/>
- After-hours salon bookings: <https://www.salontoday.com/articles/data-confirms-demand-for-online-booking>, <https://news.cision.com/san-francisco-oy/r/new-data--over-50--of-beauty-and-hair-salon-customers-book-their-appointment-outside-the-opening-hou,c3463133>
- Reminder trials: <https://www.thepermanentejournal.org/doi/10.7812/TPP/21.078>
- Google AI Mode agentic booking: <https://www.searchenginejournal.com/google-ai-mode-adds-agentic-booking-expands-to-more-countries/554345/>, <https://9to5google.com/2025/11/17/google-ai-mode-travel/>
- Google AI calling businesses: <https://support.google.com/business/answer/16190256?hl=en>
- ChatGPT bookings through Yelp: <https://9to5mac.com/2026/08/10/chatgpt-users-can-now-book-tables-and-join-restaurant-waitlists-through-yelp/>
- Yelp and Morning Consult survey: <https://ppc.land/chatgpt-gains-yelp-table-booking-as-65-want-action-in-ai-local-search/>
- Reserve with Google requirements: <https://developers.google.com/actions-center/verticals/reservations/e2e/overview>, partners <https://www.google.com/maps/reserve/partners>
- Google sensitive-scope verification: <https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification>
- Calendly MCP: <https://calendly.com/blog/mcp-server>
