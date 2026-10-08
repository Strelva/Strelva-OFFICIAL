# Needs you and Strelva handled

Status: draft spec, 2026-10-06; working default per the product model. Built
and proven **locally** on branch `build/needs-you` (2026-10-06), behind
`STRELVA_NEEDS_YOU_RELEASE` (off). Nothing is in production and client email
stays gated.

- **Built:** the evaluator, change kinds, floors and defaults (TS and SQL,
  with a parity test between them); `decision_policies`,
  `decision_policy_history`, `owner_decisions` and
  `owner_decision_deliveries` (migration `20261007120000_needs_you.sql`);
  adapters for tenant events (through `resolveEventAction`) and service
  request commitments (agree scope, accept result, through
  `change_service_delivery_commitment`); workspace-keyed signed links at
  `/api/approve`; the urgent and morning emails and day 3/7 reminders and
  day 14 lapse as the hourly `/api/cron/needs-you`; Home's Needs you and
  Strelva handled; a route for `undo_business_record_revision`; the parity
  replay (`scripts/needs-you-parity.ts`); the `change_verify_failed` and
  `sendUpdateLiveEmail` fixes.
- **Built locally on `w2/decisions-wiring` (2026-10-06), same flag:**
  adapters for website documents (approve, launch), provider delivery,
  standing responsibilities, finite responsibilities, agency draft grants,
  app and custom-app releases, work plan outputs, money (allowance cap, job
  budget, payer change) and Make real and Version releases, each resolving
  through its lifecycle's own resolver (`src/platform/needs-you/sources/`);
  Ask Strelva's real Needs you port; Make real decided once per plan (the
  item is the approval record, `make_real_plan` fingerprint) and the System
  page's Make it live deciding that item; the Versions release gate's
  approvals port; review-reply approve moved onto the Google listing System
  for linked businesses with `STRELVA_PUBLISHING_RELEASE` (listing receipts
  only, `/admin/queue` reads them); owner policy settings (tighten only, back
  to default, one-tap undo) and the operator's Who decides screen; the
  operator queue's "Owner not told" list; content autonomy and reply mode in
  `decision_policies` for linked tenants, Redis otherwise (migration
  `20261008124000`, seed script dry run by default).
- **Built locally on `w3/decision-gaps` (2026-10-06), same flag:** owners who
  never sign in (product model rule 6). The hourly cron starts one logged
  "Strelva (system)" session per business Strelva runs
  (`strelva_service_reader`, migration `20261009100000`) and reads every
  workspace source through it, so each source kind reaches the owner in the
  morning email. The session reads and opens only: items it opens are marked
  `openedBy: "Strelva (system)"` and logged in `strelva_service_actions`; it
  never reaches a resolver, and deciding still takes the owner's signed link
  or session. A business Strelva doesn't run, or one with no verified owner or
  admin, gets no session (workspace sources stay unread there). Home shows one
  Make real item per rebuild (live plan wins). The leftover SMS check
  (`staleSmsApprovals`, `ClearSmsButton`, `/api/admin/ops/clear-stale-sms`) is
  gone.
- **Built locally on `w4/journey-gaps` (2026-10-06), same flags:** Strelva
  handled lists decided items (approved and Not yet, not only lapses) with
  an honest undo state per lifecycle; none is one tap, each says why
  (migration `20261009130000`). Open decision 1 (a) is applied to Make real:
  an owner with no account approves a Make real plan by signed link; Strelva
  (system) reads and runs that one item under a `make_real_link` session
  bound to it and to the owner recipient, logs the run before it starts, and
  rechecks the plan fingerprint at decision time (migration
  `20261009131000`). Access, money and exit still need a sign-in.
- **Not built:** operational assignment offers (nothing waits on the owner
  today; it needs a new proposed-assignment record) and exit/export (no
  pending state; the adapter proposes nothing); per-System policy overrides
  in the UI; the monthly report's handled list with signed undo links. Money
  read by the session is the reader's own: a payer change or job limit the
  owner hasn't accepted reaches them only when the session reads as that
  owner (a verified owner member), not as Strelva's admin.
- **Unproven:** the parity replay against a scrubbed copy of real tenants,
  the never-signs-in journey with real email, and any production behavior.

**Decided in code (section 6, step 2).** Tenant events open items on the
route they take today (the event's review audience), not the evaluator's.
The evaluator's route takes over at step 3, after the parity replay shows no
blocking mismatch. Until then a 1-2 star review reply in auto mode still
posts after its window.

Today every change asks its own question. A Google post asks, a review reply
asks, a site edit asks, a delivery asks, and each asks in its own store with
its own rules. The owner sees whichever of those reach the screen they never
open. This spec replaces that with one **policy** that decides, per System and
per kind of change, who decides: Strelva does it and reports it, a Strelva
operator reviews it, or the owner decides. It also covers how the owner's
decisions reach someone who never signs in, and what Strelva shows after it
acts.

## 1. The moment

The Mooney Firm, on an ordinary week. The details are illustrative; which of
these the firm has connected today is not checked.

- **Monday, 9:02.** A client leaves a five-star Google review. Strelva drafts
  a reply in the firm's voice. The firm's review replies are set to "post
  after 12 hours unless I stop it". No email goes out for this. The reply
  posts Monday night and shows in **Strelva handled**: "Strelva replied to
  Dana's review."
- **Monday, 14:10.** The owner emails Strelva that Friday hours change to 9–3.
  An operator enters it in the business record as an owner-stated fact.
  Strelva updates attymooney.com and the Google Business hours. No question is
  asked, because the owner said it. Two receipts appear, each with Undo.
- **Tuesday, 07:00.** One email: "Strelva needs 2 decisions." First, a reply
  to a new inquiry that quotes a consult price. Quoting a price is always the
  owner's call. Second, a consult-booking page that is ready to go live on the
  site. Each has **Approve** and **Not yet**. The owner taps Approve on the
  inquiry reply from their phone, confirms, and the reply sends. They ignore
  the booking page.
- **Friday, 07:00.** A reminder covers the booking page only. On day 14 it
  lapses. Nothing goes live. The operator queue shows it as the owner's call,
  unanswered.
- **The monthly report** lists what Strelva handled, with links that undo
  what can still be undone.

The owner never signed in. Every decision that was theirs reached them, and
nothing that wasn't theirs did.

## 2. In the model

- **Needs you** is not a noun of its own. It is one view over decisions that
  belong to the owner, across every **System**, **Request** and **Running**
  item. Each item names the System it touches ("attymooney.com") and what the
  owner is deciding.
- **Strelva handled** is the receipt view. Each entry is something Strelva
  did on a System, said in a sentence with Strelva as the subject.
- **The policy** is set per business, per System, per kind of change. Strelva
  (as the agency) sets it. The owner can make it stricter. Fixed rules in code
  hold no matter what either of them sets.
- **Connections** never grant authority (ADR 0011 rule 2). An *acts*
  Connection to Google means Strelva can post. The policy decides whether it
  may post without asking.
- **Make real** (a Possibility) and **releasing a Version** are changes like
  any other. Each part goes through the policy. If any part routes to the
  owner, the whole Make real waits for the owner.
- A **Running** item is itself a standing approval. When the owner approves
  "Strelva keeps your Google hours matching your business record", each later
  run is handled and reported, not asked again. This is the pattern
  `standing_responsibilities` already enforces in Postgres: one approved
  policy admits many jobs.
- A **Request** at its *Needs you* or *Ready for your review* stage shows as a
  Needs you item. The Request keeps its own stages.

## 3. What it does at 1.0.0

1. **One policy evaluator.** Every proposed change from every source (Ask
   Strelva, background work, Possibilities, Versions, review drafts, inquiry
   messages, agency drafts) is classified into one **change kind** (table
   below). It then gets exactly one **route**: `handle`, `handle_after_notice`,
   `strelva_reviews`, `owner_decides` or `never`. The evaluator is a pure
   function of (change kind, System, origin, business policy, fixed rules) and
   returns the route and the rule that produced it.
2. **Fixed rules come first.** Some routes are fixed and no setting moves them
   (section 4). The evaluator applies them before any business setting.
3. **Strelva sets the defaults; the owner can only make them stricter.**
   Allowed: `handle` → `handle_after_notice` → `strelva_reviews` →
   `owner_decides`. An owner can move a kind to the right on one System or on
   all of them. An owner can move it back left only as far as Strelva's
   default.
4. **Origin counts.** A change the owner asked for, and whose content is
   exactly what they asked for, is handled and reported. "Change Friday hours
   to 9–3" is an example. If Strelva had to interpret the request, the result
   never inherits the owner's authority: it gets no shortcut, and it goes to
   the owner who asked, as content previews and Google drafts asked for in
   chat do today (section 6, "As today (parity)"). A change Strelva started
   never inherits the owner's authority.

   *Corrected while building:* the first draft said an interpreted request
   "routes like a change Strelva started", which would move chat-requested
   previews from the owner to the operator and contradicts the section 6
   parity rows. The parity replay would block on it.
5. **Owner-stated facts propagate.** When the owner states a fact (hours,
   price, phone, address, booking link) in the business record, every System
   and *acts* Connection that reads it updates under `handle`, with a receipt
   each. A fact Strelva inferred or extracted routes to `owner_decides` until
   the owner confirms it. This moves the "high-risk facts" review from every
   copy of a fact to the one place it lives.
   *Built for client sites (#509, ADR 0012):* a fact or service written by
   anyone but a verified owner (a Strelva operator, any agency including
   Strelva's, an admin, an import or a model) stays out of the confirmed copy
   (`business_record_confirmed`) that hosted and connected sites read. An owner-approved Ask
   business-record draft confirms only the entities written by that draft's
   exact receipt, under the same owner session or signed-link decision. It does
   not reopen a second facts approval or confirm unrelated pending edits. Plain
   admin approval still carries no owner confirmation. Native custom-repo
   contact changes enter the existing forced review; unavailable or held review
   is reported as pending, with no automatic provider write. All of
   a business's pending changes form one `business_facts` item
   (`fact.inferred`, `owner_decides`, admins never decide).
   `confirm_business_facts` applies it only for the owner's session or a
   signed link to the trusted owner address (rule 8). A recipient a provider
   wrote is itself pending and never approves. Delivery and the link claim
   resolve that same trusted owner (`resolve_business_owner_recipient`), and the item
   is never emailed to an address only a provider wrote. The owner approves
   only where every value is shown in full (the signed-link confirm page and
   the Needs you card, from `SourceAdapter.review` bound to the item's
   revision); the 1,000-character item detail is whole lines plus a count,
   never a cut value, and a pending recipient change leads it. The hourly
   chase also finds businesses with pending facts and no tenant or bookings.
   The migration rebuilds the confirmed copy
   from the owner's own history, so an earlier provider overwrite or deletion
   stays pending. Confirmed contact facts reach a native website as after the
   owner's own save: signed in, the owner's contact review is prepared at once;
   by link, Strelva's review queue gets it and the decision reads
   done_unverified until then.
6. **Needs you items are one shape.** Each item has the business, System,
   change kind, a plain title, what happens on Approve, what happens on Not
   yet, its source lifecycle and source id, a revision hash, when it opened,
   when it expires, and its delivery history.
7. **Resolving calls the existing lifecycle.** Approve and Not yet run the
   resolver that owns that change today (`resolveEventAction`,
   `approve_website_document`, `decide_provider_delivery`,
   `change_service_delivery_commitment`, the inquiry message review, and so
   on). Needs you records the decision and its outcome. It doesn't make a
   second write path.
8. **Email reaches the owner without sign-in.** Every `owner_decides` item
   reaches the business's **trusted owner address**
   (`resolve_business_owner_recipient`) by email.
   *Built (#524, ADR 0012):* an address is trusted only when it was imported
   at conversion (the site's imported `owner_recipient`, else its
   `owner_email`) into a business with none yet, or the owner set it: their
   own write, or their Approve on the business details item, which goes to
   the previously trusted address or their session. An address an operator,
   any agency (Strelva's included) or an admin writes is pending and receives
   nothing. Editing `tenants.owner_email` after conversion moves nothing.
   Every change is logged with its actor (`business_owner_recipient_events`).
   A link decides only if it was sent to that item while its address was
   trusted, and the address is still trusted
   (`owner_decision_link_bindings`, checked in `claim_owner_decision`). With
   no trusted address nothing is sent; the item is recorded as not sent
   (`no_trusted_owner_recipient`) and the operator queue shows it.
   - **Urgent kinds** go at once, one email per item. Urgent means a customer
     is waiting: an inquiry reply, a review reply in `approve` mode.
   - **Everything else** goes in one morning email per business that has
     open items, at 07:00 in the business's timezone.
   - Each item carries **Approve**, **Not yet** and **Open**.
9. **One-tap links are safe.** The links extend the existing pattern in
   `src/lib/approve-link.ts` and `/api/approve`:
   - The token is HMAC-signed and binds workspace, item, action, recipient
     and revision hash.
   - GET only shows a confirm page. The POST from that page resolves.
   - A replayed link shows "Already handled".
   - If the item changed since the email, the link refuses: "This changed
     since we emailed you."
   - At POST time the server checks again that the recipient is still the
     owner.
10. **Some decisions need a sign-in.** Granting access, spending money,
    changing who pays, and leaving Strelva open in the workspace through a
    magic-link sign-in. There is no one-tap link for them (section 4). The
    magic-link email is still the way in, so the owner still needs no
    password.
11. **Reminders and expiry.** An `owner_decides` item is reminded on day 3
    and day 7 and lapses on day 14. These numbers match the operator spec's
    proposed chase clocks and today's 14-day link life.
    - A lapsed item does nothing. Its Not yet path runs, it closes as
      "Expired, nothing changed", and the operator queue keeps it as the
      owner's call (P4 in [operator.md](./operator.md)) until an operator
      closes or re-asks it.
    - Silence never approves anything. The one exception is a kind already
      set to `handle_after_notice`. It acts at its window, which is not
      expiry.
    - Inquiry replies keep their own 24-hour budget
      (`src/products/inquiries/message-review-policy.ts`).
12. **Operators can escalate.** A `strelva_reviews` item the operator won't
    decide becomes an `owner_decides` item, with the operator's note. This is
    today's `escalateEventToOwner`, generalized. An operator can never decide
    an `owner_decides` item.
13. **Home.** Needs you is first when non-empty, oldest first, with the same
    Approve and Not yet as the email. Kinds that need the owner to edit first
    open their System page. An owner who signs in sees exactly what the last
    email listed, plus anything newer. If Needs you is empty, the section is
    gone.
14. **Strelva handled is one receipt feed.** Each receipt has the System, a
    sentence ("Strelva updated your Friday hours on Google"), the time, what
    changed, outside-write evidence (provider accepted, read-back verified or
    not), and an undo state.
    - Undo states: `undo` (one tap), `undo_needs_review` (undo makes a
      new change that routes through the policy), or `not_undoable` with a
      reason ("Google has the reply; delete it on Google").
    - Home shows the last 7 days. The monthly report, or the weekly one if
      that cadence is chosen (`src/lib/report-cadence.ts`), carries the same
      list with signed undo links.
15. **Undo for things Strelva handled.** Undoing a handled change restores the
    state just before it, if nothing later touched the same item. This is the
    rule `undo_business_record_revision` already enforces.
    - Restoring a prior approved state is handled. It doesn't route back to
      the owner.
    - Undoing an owner-approved change, or a change some later change
      depends on, becomes `undo_needs_review`.
16. **Policy changes leave receipts.** Strelva's default, the owner's
    stricter setting, an earned-trust promotion and an inquiry `promote` each
    write a receipt with the old and new route. Only routes in force when the
    change was proposed apply to it.

    An active platform operator or member of the business's provider agency
    cannot use a direct admin seat to decide an owner item, even if the item
    permits ordinary admins. A verified owner who is also an operator still
    decides through their owner session. The additive
    `20261017120000_owner_decision_operator_refusal` restores this refusal after
    neutral provider predicates, preserving recipient trust and owner-link
    execution effects. Native SQL tests cover both refusal branches, ordinary
    admins, revoked operators and the real-owner exception. This is prepared
    integration code; production execution remains separate.

### Change kinds and their routes

"Default" is Strelva's starting setting for a managed business. "Floor" is
the least strict route allowed. Only Jacob can change a floor, in code.

| Change kind | Example | Default | Floor |
| --- | --- | --- | --- |
| `fact.owner_stated` | Owner gave new hours; push to site and Google | handle | handle |
| `fact.inferred` | Strelva read a price off an old page | owner_decides | owner_decides |
| `copy.routine` | Fix a typo, refresh event text on a low-risk section | strelva_reviews | handle |
| `copy.marketing` | New hero or services copy Strelva wrote | strelva_reviews | strelva_reviews |
| `structure` | Theme, navigation, footer, new page | owner_decides (as a Request) | owner_decides |
| `google.post` / `google.photo` | Google Business post or photo | strelva_reviews | handle_after_notice |
| `review.reply` | Reply to a 4–5 star review | handle_after_notice (12 h) | handle_after_notice |
| `review.reply_critical` | Reply to a 1–2 star review | owner_decides | strelva_reviews |
| `customer.message` | Inquiry reply, follow-up | inquiry policy (below); owner_decides when none | strelva_reviews |
| `customer.commitment` | Quote a price, promise a date, charge | owner_decides | owner_decides |
| `customer.broadcast` | Newsletter send | owner_decides | owner_decides |
| `system.go_live` | First launch, Draft→Live, domain change | owner_decides | owner_decides |
| `system.change_live` | Make real on a Live System, release a Version | owner_decides | strelva_reviews |
| `system.pause` | Pause a System | owner_decides | owner_decides |
| `running.approve` | Approve or widen a standing responsibility | owner_decides | owner_decides |
| `request.scope` | Agree a Request's scope and deadline, accept a result | owner_decides | owner_decides |
| `access.grant` | Connect Google, grant an agency draft access, invite | owner_decides (sign-in) | owner_decides |
| `money` | Accept a job, allowance cap, payer change | owner_decides (sign-in) | owner_decides |
| `exit` | Leave, export | owner only (sign-in), owner-started | owner_decides |
| `health.fix` | Restart, re-verify, retry a failed check | handle | handle |
| `health.owner_action` | Reconnect Google, fix DNS at the registrar | owner action (not a decision) | — |
| `verify.failed` | Write accepted, read-back failed | strelva_reviews | strelva_reviews |
| `suggestion` | An idea or opportunity | never in Needs you; it is a Possibility | — |

Not decided here and needing Jacob's call: the review-reply split by star
rating, and `copy.routine` defaulting to `strelva_reviews` instead of today's
per-tenant setting (section 9).

## 4. States and rules

**Item states:** `open` → (`approved` | `declined` | `expired` | `withdrawn`
| `superseded`) → after resolve, `done`, `done_unverified` or `failed`.

- `withdrawn`: Strelva or an operator pulled it.
- `superseded`: a newer proposal replaced it, and any link for it refuses.
- `failed` leaves the source item pending, as `resolveEventAction` already
  does. The owner sees "Strelva couldn't finish this. We're on it." The item
  moves to the operator queue.
- Accepted-but-unverified is never retried (AGENTS.md "Outside writes").

**Delivery states per item:** `not_sent`, `sent` (provider id from
`sendEmailWithReceipt`), `suppressed` (email gate off or per-client override
off), `bounced`, `reminded_1`, `reminded_2`. If delivery was suppressed, the
operator queue must show that the owner was never told. An unseen ask is not
an unanswered one.

**Who can do what**

| Actor | Can |
| --- | --- |
| Owner | Approve or decline any `owner_decides` item; make any route stricter; undo any `undo` receipt |
| Admin member | Decide items whose lifecycle already allows owner or admin (website approve, provider delivery, service commitments, standing approve). Never the owner-only kinds below |
| Member | See Needs you; decide nothing unless the lifecycle names them (finite responsibility creator, inquiry sponsor) |
| Agency (Strelva today) | Set defaults; decide `strelva_reviews` items; escalate; never decide `owner_decides` |
| Strelva operator | Same as agency; also sees every business's open owner items, read-only |

**Owner-only kinds** are the ones the database already restricts to role
`owner`:

- website launch and publish (`website_document_assert_launch_owner`)
- domain management
- agency draft grants
- operational assignment offers
- workspace exit and export
- payer-transition proposals
- invitations

Converted workspaces make the operator `admin`, not `owner` (Reborn §3), so
these stay with the client.

**What never happens**

- Silence never approves an `owner_decides` item.
- An operator or agency never resolves an item routed to the owner, even
  through an admin tool.
- No route below a floor is ever saved. The evaluator refuses it, and a test
  covers each floor.
- A one-tap link never performs `access.grant`, `money` or `exit`.
- A link never acts on a different revision than the one emailed.
- Suggestions and opportunities never appear in Needs you
  (`OWNER_SUGGESTION_TITLES` is empty today; it stays that way).
- `verify.failed` never reaches the owner as a decision. Today pending
  `change_verify_failed` events carry no `reviewAudience`, so
  `isClientVisibleEvent` likely shows them in the owner queue. Fix it as part
  of this work.

## 5. Built on

**Reused**

- **Policy inputs today (tenant model):**
  - `decideAiContentGovernance` and reason codes in `src/lib/ai-governance.ts`
  - `maybeAutoApprove` and the earned-trust streak in
    `src/lib/ai-auto-approve.ts`
  - `reb:content-autonomy:{tenant}` (`src/lib/content-autonomy.ts`, owner
    panel `ContentAutonomyPanel.tsx`)
  - `reb:reply-voice:{tenant}` modes off, approve and auto, with the
    12-hour `AUTO_POST_DELAY_MS` (`src/lib/reviews/reply-voice.ts`,
    `auto-reply.ts`)
  - `reviewAudience` owner or operator plus `escalateEventToOwner`
    (`src/lib/needs-you.ts`, `src/lib/event-actions.ts`,
    `src/lib/agent-executor.ts`)
- **Policy inputs today (workspace model):**
  - the inquiry `ResponsibilityPolicy`, with trust supervised or trusted,
    pre-authorized actions, `never`, `requiredCleanReceipts` and
    `ALWAYS_REVIEW_ACTIONS` (`src/products/inquiries/contracts.ts:507`,
    `inquiry-engine-responsibility.ts`). This is the only real policy engine
    in the code and is the model for this one.
  - `site-operations.ts` auto-publish gate: verified facts, owner auto mode,
    low risk, confidence ≥ 0.9
  - `approve_website_document` refuses unresolved facts
  - `ApprovalRequirement` in `src/platform/products/contracts.ts`
    (descriptive only today)
- **Lifecycles that resolve** are listed in the mapping in section 6.
- **Email:**
  - sending: `src/lib/email/send.ts` (`sendEmailWithReceipt`), gated by
    `src/lib/email-enabled.ts` (client audience needs
    `EMAIL_SENDING_ENABLED=true`) and per-client `reb:client-email:{tenant}`
    (`src/lib/client-email-override.ts`)
  - layout with `manageUrl`: `src/lib/email/layout.ts`
  - signed links: `src/lib/approve-link.ts`, `src/app/api/approve/route.ts`
  - magic-link sign-in: `SupabaseSignIn.tsx`, `/auth/callback`
  - recipient: `resolveOwnerRecipient` in
    `src/platform/business-record/service.ts`, which nothing calls yet
- **Receipts:**
  - `website_document_receipts`, `standing_responsibility_receipts`,
    `workspace_calendar_event_receipts`, `work_provider_receipts`
  - `business_record_revisions` with `undo_business_record_revision`
  - inquiry `ChangeReceiptStatus` with undo
  - tenant `logActivity` and `src/lib/activity-feed.ts`
  - `auto_approved` events, shown as "Handled" in `QueueCard`
  - site snapshots (`src/lib/storage/site-snapshot-store.ts`)
  - `undo_last_change` (`src/lib/agent-shared.ts`)
- **Home:** `src/experience/workspace/BusinessHome.tsx`, `workspace-home.ts`,
  `business-delivery-summary.ts`; `NeedsYouItem` in
  `src/experience/systems/model.ts` (defined, unused).

**New**

- `src/platform/needs-you/`:
  - the evaluator, the change-kind classifier and adapters, one per source
    lifecycle
  - each adapter turns the source into an item and resolves it through the
    source's own resolver
- Two Postgres tables in the `website_documents` pattern (RLS on, grants
  revoked, service-role functions, cross-workspace denial tests), keyed by
  `workspace_id`:
  - `decision_policies`: workspace, optional system, change kind, route,
    set_by, version, and immutable history
  - `owner_decisions`: the item, delivery log, reminders, expiry, outcome
    and receipt reference
- A workspace-keyed approve token that binds workspace, item, action,
  recipient and revision. The tenant token keeps working.
- A morning email and an urgent email, through `send.ts`, audience `client`.
- A receipt projection: one read model over the receipt stores above. No new
  receipt store.
- A route for `undo_business_record_revision`, which has no HTTP route today.

**Tenant model vs workspace model.** Tenant changes stay authoritative in
Redis events (`src/lib/events.ts`, 90-day TTL), and their resolver stays
`resolveEventAction`. The adapter reaches them through the tenant↔workspace
link. Workspace lifecycles stay in their own tables. Needs you owns only the
policy, the item, delivery and expiry.

**Retires**

- `getNeedsYouData` as the owner's source of truth. It becomes the tenant
  adapter's read.
- The `ContentAutonomy` and `ReplyVoice` mode fields as separate policy
  stores. Their values migrate into `decision_policies`. The Redis keys stay
  readable (frozen `reb:` names).
- The leftover SMS approval check (`staleSmsApprovals`, `ClearSmsButton`).
  SMS approval was removed in May 2026 and nothing writes `sms:pending:*`.
  Removed locally Oct 6 (`w3/decision-gaps`).

## 6. Moving today's clients

**Every approval type today, mapped to its change kind:**

| Today | Where | Change kind | Route after move |
| --- | --- | --- | --- |
| Agent content preview (`agent_preview`) | `ai-review-queue.ts`, `apply-section-update.ts` | `copy.*`, `fact.*` or `structure`, by reason code | As today (parity) |
| Governance `publish` / `auto_approved` | `ai-governance.ts`, `ai-auto-approve.ts` | `copy.routine`, `fact.owner_stated` | handle |
| `manual_structural_change` | `event-actions.ts` | `structure` | owner_decides as a Request |
| GBP post, photo drafts (`gbp_post_draft`, `gbp_photo_draft`) | `agent/gbp-operations.ts` | `google.post`, `google.photo` | strelva_reviews when proactive; owner when the owner asked in chat (today) |
| GBP hours draft (`gbp_hours_draft`) | same | `fact.owner_stated` or `fact.inferred` | handle or owner_decides |
| Review reply draft | `poll-google-reviews`, `review-auto-post` | `review.reply` | Per tenant reply mode (parity) |
| Newsletter draft | `newsletter_draft` events | `customer.broadcast` | owner_decides |
| Change request (custom workflow) | `/api/change-requests` | `request.scope` | Request stages; owner decides scope |
| Inquiry publish or undo | `inquiry_publication_claims` | `system.go_live` / `system.change_live` | owner_decides |
| Inquiry message review | `delivery-approval-service.ts` | `customer.message` / `customer.commitment` | inquiry policy |
| Operator drafts (`/admin/drafts`) | `draft-store.ts` | `copy.*` | strelva_reviews |
| Maintenance digest | `maintenance-digest.ts` | internal; produces suggestions | never in Needs you |
| Offboarding handoff | `offboarding_handoff_request` | `exit` | owner only |
| Finite responsibility approve | `work-execution/engine.ts` | `running.approve` / `request.scope` | owner_decides (today: creator) |
| Standing responsibility approve, admit | `standing.ts` | `running.approve` | owner_decides once, then handle per run |
| Operational assignment offer | `operations/assignments.ts` | `access.grant` | owner (sign-in) |
| Provider delivery decide | `offerings/provider-delivery.ts` | `request.scope` | owner_decides |
| Service delivery agree, accept | `service-requests` | `request.scope` | owner_decides |
| Website approve, launch, undo | `rebuild-service.ts`, website RPCs | `system.go_live` / `system.change_live` | owner_decides |
| Agency website or app draft grant | `agency-website-draft.ts`, `agency-draft-access.ts` | `access.grant` | owner (sign-in) |
| App or custom app publish, rollback | `applications/server.ts`, `custom-applications/lifecycle.ts` | `system.change_live` | owner_decides |
| Work plan accept | `work-plans/execute` | `request.scope` | owner_decides |
| Allowance cap, job accept, payer | `work-economics` | `money` | payer (sign-in) |
| Exit, export | `workspace-exit`, `workspace-exports` | `exit` | owner (sign-in) |
| Business record edit | `business-record/service.ts` | `fact.owner_stated` / `fact.inferred` | by source |
| Make real, Version release | `systems/make-real`, `system-versions` | `system.change_live` | owner_decides |

**Steps.** Nothing here changes what any client receives until Jacob says
yes to email.

1. **Parity first.** Build the evaluator. Seed each converted business's
   policy from its current settings:
   - `reb:content-autonomy`
   - `reb:reply-voice`
   - the tenant's `autoApproveThreshold`
   - inquiry `ResponsibilityPolicy`

   A parity test replays each tenant's recent events (Redis plus the
   `unified_events` mirror) and asserts the evaluator's route equals what
   happened. A mismatch blocks the move.
2. **Read only.** Workspace Home shows the linked tenant's pending
   owner-visible items through the adapter. Approve calls
   `resolveEventAction` with the owner as actor. `/dashboard/review` keeps
   working unchanged for anyone still there.
3. **Policy live, email off.** Items get created and routed. Delivery is
   recorded as `suppressed` while client email is gated. The operator queue
   shows "owner not told". This is the safe default and can ship before email.
4. **Email on, per client.** Use the per-client override
   (`reb:client-email:{tenant}` = `on`) on the Strelva-owned test business,
   then gldf, then the rest. Today's review-alert approve links keep working
   throughout.
5. **Loosening is not migrated silently.** Where today's behavior is looser
   than a new floor, the floor wins. Today's setting is recorded in a receipt
   and Jacob sees the list before step 4. One known case: an owner can set
   content autonomy to `auto` today, which this spec's default does not
   grant.

## 7. Failure and undo

| Failure | What the person sees | Recovery |
| --- | --- | --- |
| Email gate off or override off | Owner: nothing. Operator: "Owner not told" on the item | Operator decides whether to call; item still expires on day 14 |
| Email bounces | Operator: "Email bounced" | The owner sets a new address (signed in), or approves one an operator proposes from the last trusted address |
| No trusted owner address | Operator: "Not sent: no trusted owner address" | An address an operator adds waits; the owner signs in to set it |
| Link expired or item changed | "This changed since we emailed you" / "This link expired", with Open | Owner opens the latest in the workspace or the next morning email |
| Owner no longer owner | "This link isn't for this account" | Nothing acts |
| Resolve fails at the provider | "Strelva couldn't finish this. We're on it." | Item stays pending (source rule); operator queue P1/P2 |
| Provider accepted, read-back failed | Receipt says "Done, not yet confirmed" | `verify.failed` to operator; never retried |
| Scanner prefetches link | Nothing | GET never mutates |
| Make real partly lands | Item-by-item result | Landed parts get receipts; the rest stays open |

**Undo, honestly, by kind**

- Website content (tenant): today undo drafts a revert that needs review
  (`undo_last_change`, version restore to draft). This spec makes undo of a
  Strelva-handled change one tap, under the rule in behavior 15.
- Website v2 launch: undo saves an earlier revision as a new candidate that
  needs owner approval. It stays `undo_needs_review`.
- Business record: `undo_business_record_revision`, one tap, once a route
  exists.
- Inquiry configuration: existing undo with receipts. Inquiries already
  received are kept.
- Google post, photo, review reply: `not_undoable` today. The code has no
  delete path. Saying so is better than offering a fake undo.
- Email or message sent: never undoable.
- Calendar event: cancellation exists (`workspace_calendar_event_receipts`).
- Policy changes: one tap back to the previous route. This can never go
  below the floor or loosen past Strelva's default.

## 8. Proof

- **Evaluator unit tests:** every change kind × every route × every floor;
  refusal of every below-floor setting; owner tighten and loosen bounds;
  origin rules.
- **Parity test** (section 6 step 1) against a scrubbed local copy
  (`pnpm scrubbed-copy`) for every active tenant.
- **Link tests, extending the existing approve-link tests:**
  - tamper, expiry and replay
  - stale revision
  - recipient no longer owner
  - GET-only scanner
  - wrong workspace
  - one-tap refused for `access.grant`, `money` and `exit`
- **Failure-path tests:** suppressed delivery, bounce, provider failure,
  accepted but unverified, and expiry runs the Not yet path and nothing else.
- **SQL tests** for both tables in `check:workspace-sql`, including
  cross-workspace denial and immutable policy history.
- **The `change_verify_failed` leak:** a test that a pending verify-failed
  event never appears to the owner.
- **Journey on a Strelva-owned test business with an owner who never signs
  in:**
  - receives one urgent and one morning email
  - approves one item and lets one lapse
  - receives the reminder
  - sees the lapse on the operator side
  - undoes one handled change from the report email

  Run it locally first, then in production after Jacob's yes on email.
- **Home on desktop and mobile:** empty, one item, many items, error and
  permission states, using The Mooney Firm and gldf data.

## 9. Open decisions

1. **One-tap scope.** (a) Signed links for every decision except grant,
   money and exit, which need a magic-link sign-in. (b) Signed links for
   everything. (c) Sign-in for everything. **Recommend (a).** With (c), a
   never-sign-in owner can't make any decision, which breaks assumption 6.
   [owner-entry.md](./owner-entry.md) assumes signed links. If Jacob picks
   (c), owner entry must carry Make real and launch.
2. **Who may loosen.** (a) Owner can only tighten, as the brief says. (b)
   Owner can loosen up to Strelva's default. (c) Owner can loosen anything
   above the floor, as content autonomy allows today. **Recommend (b).** It
   keeps today's "Handle routine updates" choice possible only where Strelva
   offers it. (a) takes away a choice some owners may have made. The count
   is unknown.
3. **Earned trust.** Keep the operator-set approval streak
   (`autoApproveThreshold`, which upgrades routes after N approvals) or
   retire it for explicit settings. **Recommend keeping it** as an evaluator
   input that writes a receipt on each promotion, like inquiry `promote`.
4. **Critical review replies.** Route 1–2 star replies to the owner even in
   auto mode? **Recommend yes.** Today auto mode treats every rating the
   same.
5. **Digest time and urgency.** Recommend 07:00 local time, with urgent items
   sent at once. Alternatives are one fixed time for all, or no digest at all
   (each item sent at once).
6. **Expiry numbers.** Reminders on days 3 and 7, lapse on day 14. Shared
   with [operator.md](./operator.md) §9. Decide them once.
7. **SMS.** Not in 1.0.0. Nothing sends SMS today, and adding it means a new
   provider and dependency. Revisit only if email response data shows owners
   miss urgent items.

## 10. Unknowns

**Facts we lack (each settled by a read-only check):**

- Whether `EMAIL_SENDING_ENABLED` is on in production, and which tenants
  have `reb:client-email:{tenant}` set. Reborn lists turning it on as needing
  Jacob's yes, so it is probably off. If it is off, today's review approve
  links reach nobody. Read the production env and keys read-only.
- How many `/api/approve` POSTs have happened. No counter exists. Check
  Vercel logs read-only.
- Each tenant's reply mode, content autonomy and threshold. Read the Redis
  keys from the scrubbed copy.
- Whether governed-work tables and both flags are live. The governed-work
  doc says live; Reborn says unsettled. The production snapshot
  (`scripts/workspace-target-snapshot.sql`) settles it.

**Inferences to test:**

- Owners will answer email decisions when they don't sign in (1 sign-in in
  30 days). Nothing measures this yet. The first proof is time-to-decision on
  the test business and gldf after email is on.
- Most changes can be `handle` or `strelva_reviews` without harm. If owners
  undo handled changes often, the defaults are too loose. Track undo rate
  per change kind from the first month.
- Operator minutes per business drop when routine changes stop asking the
  owner. This is unmeasured. Pair it with human-minutes-per-client (draft PR
  #205).
