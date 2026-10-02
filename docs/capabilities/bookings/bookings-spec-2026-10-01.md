# Bookings: every client bookable by a visitor, an inquiry or an AI assistant

Status: proposed spec, October 1, 2026. Nothing here is built, deployed or
approved for production. Sibling of the
[website rebuild spec](../website/website-rebuild-spec-2026-10-01.md), whose `Booking`
and `InquiryForm` components this capability powers.

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
   existing `approve-link.ts`). One tap approves.
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
| Calendar role | Busy-time source and a mirror of confirmed bookings | Avoids double-booking without making Google verification a launch blocker. |
| Default mode | Request (owner approves) | Most target clients (legal, bookkeeping) qualify before meeting. Wellness and trades switch to instant. |
| Agent bookings | Customer confirms by email before the slot is placed | Prevents spam and holds a real person to the booking. |
| Existing tools | Link and import; don't replace | Vagaro, Booksy and OpenTable already reach Google AI Mode and ChatGPT. |
| Reminders | Email at 24 hours and 2 hours | Proven to help. SMS waits for a provider decision. |
| Payments | Not in this capability | Deposit evidence is vendor-only. Ships as a later add-on through Stripe. |
| Calendar sync | Live busy-time reads with a 60-second cache | No push channels needed at our volume. |

What we removed: hand-entered interval schedules (`calendar/contracts.ts:4-6`),
where each interval was one slot. Weekly hours and service lengths replace
them.

## Model

```ts
const BookingService = z.object({
  id, workspaceId, scheduleId,
  name: shortText(120),
  durationMinutes: z.number().int().min(5).max(480),
  bufferMinutes: z.number().int().min(0).max(120).default(15),
  mode: z.enum(["instant", "request"]).default("request"),
  priceLabel: optionalText(40),            // shown, never charged
  intake: z.array(IntakeQuestion).max(8),
  active: z.boolean(),
});

const BookingSchedule = z.object({
  id, workspaceId,
  timeZone: IanaZone,
  weeklyHours: z.record(Weekday, z.array(TimeRange).max(4)),
  overrides: z.array(DateOverride).max(366),   // closed days, special hours
  minNoticeMinutes: z.number().int().default(240),
  maxAdvanceDays: z.number().int().default(60),
  maxPerDay: z.number().int().optional(),
  calendarConnectionId: z.string().uuid().optional(),  // existing workspace_calendar_connections
});

const Booking = z.object({
  id, workspaceId, serviceId, scheduleId,
  start: IsoDateTime, end: IsoDateTime,
  status: z.enum(["held", "requested", "confirmed", "cancelled", "declined", "no_show", "completed"]),
  origin: z.enum(["site", "inquiry", "agent", "owner", "import"]),
  customer: { name, email, phone? },
  intakeAnswers: z.record(z.string(), z.string()),
  inquiryId: z.string().optional(),
  agent: z.object({ name: shortText(120), confirmedAt: IsoDateTime.optional() }).optional(),
  calendarEvent: z.object({ provider, eventId, receiptId, readBack: z.enum(["confirmed", "unknown", "failed"]) }).optional(),
  manageTokenHash: z.string(),
  requestFingerprint: z.string(),          // existing public booking fingerprint
});
```

Every status change writes a history row: actor, from, to, time and reason.

## How it works

### Availability

- Slots come from weekly hours, overrides, service length plus buffer,
  minimum notice, maximum advance and the daily cap. Existing confirmed and
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
- Requests not answered in 24 hours remind the owner once. After 72 hours
  the customer is told and offered new times.

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
  bookings into the same list.
- Vagaro, Booksy, OpenTable, Jobber, Square: the `Booking` component links
  out to the tool's booking page, and the workspace shows "Bookings happen in
  [tool]." Imports are added per tool only when its API allows it and a
  client needs it.
- Legacy `/api/booking/*` tenants keep working unchanged. They move to the
  native engine one at a time, with a side-by-side check of slots for 7 days.
  Which tenants use it needs a read-only production query. **Reading
  production data needs Jacob's yes.**

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

## Done means proven: the bar for a 5

- [ ] On tenant zero in production: book, reschedule and cancel through the
      site with a real Google calendar and a real Outlook calendar connected.
      Events appear and disappear in both.
- [ ] Inquiry → three slots → request → one-tap approval → confirmation,
      end to end in production.
- [ ] An outside client books through the MCP server and the public API,
      and the customer confirmation gate holds.
- [ ] Customer confirmation and reminder emails are delivered and read back.
- [ ] Failure-path tests for every row above, including concurrency and DST.
- [ ] A real-provider test suite behind a flag: revoked token, 429, deleted
      event, etag conflict.
- [ ] Desktop and mobile review of the booking component, manage page, owner
      setup and owner list in empty, loading, error and permission states.
- [ ] `pnpm check`, `check:custom-repos` and the workspace SQL checks pass.
      `/api/v1` changes are additive, and contract tests cover the new
      routes.
- [ ] `booking-reminders` and hold-expiry crons declared, authenticated and
      registered.

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
6. **The MCP dependency,** or approval to hand-roll it.
7. **The Reserve with Google interest form.** It speaks for Strelva as a
   platform.
8. **A read-only production query** to find the legacy booking tenants.

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
