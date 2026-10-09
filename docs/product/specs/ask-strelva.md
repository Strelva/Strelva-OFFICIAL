# Ask Strelva in the workspace

> **Changed by ADR 0013 / decisions 1–2 and 8.** Text typed before work exists is an ask;
> asked-for finite work is a Request, and a Request sent to an agency is not accepted until
> scope and deadline are agreed. Answers and receipts name whoever acted; agency names carry
> "Runs on Strelva". Client work entered on behalf of an owner must use the ordinary agency
> path. Engineering must reconcile the existing operator/member permission and owner-email
> entry paths with that boundary; naming a different actor alone grants no access.

Status: implemented locally on `w6/owner-ask`, October 7, 2026. Not
migrated or deployed; all release flags off. Proof and remaining stop points
are in [the stream handoff](../streams/w6-owner-ask.md).

The workspace route, 18-tool catalog, per-call authority, managed Requests,
streamed receipts and saved conversations are built. Ask now hands drafts to
the real Needs you policy and durable source adapters. Business facts use a
typed, revision-pinned draft store; inquiry replies preserve the exact authored
copy through the existing message approval, send receipt and read-back path.
Ask never approves or performs an outside write. A failed decision sync reports
the saved draft honestly and leaves it pending. Operators can record an owner
ask by email or phone; the owner still decides.

Possibilities use the existing Postgres repository and native website builder.
Ask can prepare a real informational page set, with copy awaiting owner review,
or add a booking page to an unchanged published native website using that
site's existing inquiry and booking grants. Try renders the actual pinned
document; booking tests use configured times and local callbacks, discard
visitor inputs and create no reservation. Reviewed candidates become Ready,
and Make real preserves the native work identity. Revoked connections or
changed revisions refuse publication.

With the Inquiries release on, Ask can also compare one follow-up rule on an
existing live Inquiries System: timing, attempts and complete wording that
names Strelva. It rehearses the rule in isolation, shows the full message in
Try, and returns to Exploring if the native configuration changes.

Changes to a projected managed System without a durable baseline remain
Requests for Strelva to prepare. So do new booking services, new-site booking
bindings, custom flows and unsupported rebuilds. The existing booking effect
publishes a scheduling grant; the inquiry effect requires a prepared,
tenant-specific request/change. Ask has no tool to create that new inquiry
binding or infer a service's duration and schedule. It preserves the person's
words in an Asked Request and does not invent the missing authority. Managed
work remains a Request by default, as required by behavior 7.
Model calls retain tokens and measured/estimated/unknown cost. An optional
per-business daily log warning adds no billing, plan allowance or email send.

Not proven: real model/provider quality and latency, authenticated admin-host
journeys on an isolated Auth stack, live mail, publication/read-back/undo on a
Strelva-owned business, actual cost per turn or owner adoption. Old tenant chat
threads are retained on the legacy operator surface and are not copied.
The Mooney example's newly introduced booking service is therefore not fully
implemented by Ask: an operator must prepare its service and grants first.
The existing-service booking alternative is implemented and tested locally.

Ask Strelva is the one way in. A person in a business workspace says what they
want in plain words. Strelva answers, drafts a change, opens a Possibility, or
files a Request. It never decides what belongs to the owner.

## 1. The moment

The Mooney Firm adds estate-planning consults. Two ways this arrives:

- **The owner is signed in** on the firm's admin host and opens attymooney.com
  in the workspace. They type: "We now do estate planning consults. Add it and
  let people book one."
- **The owner never signs in** (the common case: 1 sign-in in 30 days). They
   email their agency. For Strelva's own agency, that reply lands at `REPLY_TO_EMAIL` or
  `hello@strelva.com` (`src/lib/email/send.ts`). A team member of the business's agency opens the
  Mooney workspace and types the same sentence into Ask Strelva, marked as
  asked by the owner by email.

In this example, Acme Marketing serves the firm through the ordinary agency
path. Ask Strelva returns:

1. Answers what it read: the firm's services today, from the business record.
2. Drafts one change: "Estate planning consult" added to the firm's services.
   The website reads services from the record, so the site change follows.
3. Opens a Possibility beside the site: **Consult booking · Draft**, a working
   booking flow the owner can open and try.
4. Says plainly what happens next: "Adding a service changes what your site
   says you offer. That needs your yes. I sent it to Needs you." The draft
   is not live.

The owner gets one email with the change and a one-tap Approve / Not yet. They
tap Approve. Acme Marketing publishes, reads it back, and the receipt appears in
**What changed**: "Acme Marketing added Estate planning consult to attymooney.com", with
"Runs on Strelva" credit. Automatic platform work instead names Strelva.
The booking Possibility waits until someone opens it and chooses **Make real**.

## 2. In the model

- Ask Strelva is not a fifth noun. It is the verb surface over the four nouns
  and the two places. Every answer it gives is about a **System**, a
  **Connection**, a **Possibility**, a **Version**, a **Request**, **Running**
  or the **business record**.
- It always works in one workspace, and usually on one System (the page it was
  opened from, or the one it resolves from the sentence).
- It produces exactly four kinds of result:
  - **Answer**: reads only. No record changes.
  - **Draft a change**: a proposed change to a System or the business record.
    The [Needs you policy](./needs-you.md) decides whether Strelva does it
    and reports it, or the owner decides.
  - **Open a Possibility**: a working alternative beside a System. Make real
    runs later through the same approvals.
  - **Create a Request**: finite work with an end, for Strelva to do. It
    enters Requests at **Asked**.
- Connections limit what it can do. Acting on Google Business needs an *acts*
  Connection with a granted account. Knowing about a Connection grants nothing.

## 3. What it does at 1.0.0

Behaviors, each testable.

1. **One route.** `POST /api/workspace/ask` takes a workspace id, an optional
   System id, and the conversation. It streams text, cards and a final result
   contract in the same line protocol `/api/agent` uses today (`__TOOL__`,
   `__CARD__`, `__RESULT__`), so one chat component renders both.
2. **Resolution.** Every request resolves session user → workspace membership
   → System → link → tenant (section 4). A website System with no active link
   answers "This site isn't connected to this workspace" and offers a Request.
3. **Per-call permission.** Every tool call re-checks authority right before it
   runs, not only at the start of the turn.
4. **Answers.** For each System below, Ask Strelva answers from live records
   and says where the answer came from ("From your business record, updated
   Oct 3").
5. **Drafts through Needs you.** Every write tool produces a proposed change and
   hands it to the Needs you policy. Ask Strelva never publishes, sends or
   writes outside on its own authority.
6. **No approvals in chat.** "Yes, publish it" in the conversation does not
   approve. Strelva answers with a link to the Needs you item. The owner
   approves there or from the email link. This keeps an approval tied to the
   exact change and out of reach of text injected through reviews, inquiries
   or site content.
7. **Managed default.** In a workspace with a managed relationship (an active
   `tenant_workspace_links` row, or `serviceRelationship: "managed_client"` in
   `src/platform/relationships`), "build a new website", "redo the site" or
   "add a booking page" become a **Request to Strelva** by default. No special
   wording like "hire Strelva" is needed. Self-making is offered second, and
   only where the owner can make Systems. This closes audit P1 #7
   (`docs/operations/reborn-integration-audit-2026-10-05.md`).
8. **Possibilities.** When the ask is bigger than an edit (a new flow, a new
   page set, a rebuild), Strelva opens a Possibility instead of drafting a
   direct edit. It says what the Possibility pins and that nothing live
   changed.
9. **Requests.** When Strelva cannot do it with its tools (custom-only features
   like cart or checkout, a new internal tool, a design change), it files a
   Request with the person's words, the System, and what it already read. It
   never claims the work is accepted. Scope and deadline are agreed later.
10. **Refusals** (section 4) answer in one sentence with the reason and the
    next step. A refusal is never silent.
11. **Receipts.** Every Ask turn that changed a record lists, item by item,
    what was drafted, queued, opened or filed, with ids. Nothing is described
    as done until it is.
12. **Words.** Screens and replies say "Strelva". They never say AI, agent,
    automation, workflow or task. Today's failure line "trouble reaching the
    AI" in `src/app/api/agent/route.ts` and activity text like "AI saved a
    reply" change.
13. **One model-call helper** carries every model call, including Ask Strelva's,
    and logs tokens and cost per call (section 5).
14. **Asked on behalf.** An operator can ask in a client workspace and mark the
    turn "asked by the owner by email" or "by phone". The Request or draft
    records that origin. The owner's decision still goes to the owner.

### What it can do per System

"Today" names the existing tool. "New" means no tool does it yet.

| System | Answer | Draft a change | Open a Possibility | Create a Request |
| --- | --- | --- | --- | --- |
| **Website** | Pages, sections, media, blog/video/product entries, traffic, recent changes, health, domain (today: read tools) | Copy and section edits, v2 page patches, show/hide and reorder, undo, add an image, draft an entry (today) | A new section or page set; a rebuild alternative where the rebuild flag is on (decision 3 in the brief) | Custom-only features from the site manifest (cart, checkout, rewards, email popup, chat); design changes; a new site |
| **Google Business** (an *acts* Connection) | Reviews, listing state (today) | Post, photo, review reply (today) | — | Connecting Google is the owner's grant, so it becomes a Needs you item, not a Request |
| **Business record** | Hours, services, people, contacts | Fact changes: hours, services, closures (New; replaces `update_business_hours` writing Google directly) | — | — |
| **Inquiries** | Recent and unanswered inquiries, spam held (New, read-only over `src/products/inquiries`) | A reply draft through the inquiry message review policy (New; only with `STRELVA_INQUIRIES_RELEASE` on) | A follow-up rule alternative | A new intake form |
| **Bookings** | Hours, services, upcoming count (New) | Hours and services through the business record | A booking flow (the Mooney example) | A booking page set up |
| **Newsletter, store, rewards, wellness** | Subscriber count, statuses (today) | Newsletter draft, always owner-approved before send (today) | — | Anything else |
| **Internal tools** | — | — (building is agency or Strelva only, Reborn §4) | — | A new tool or a change to one |

## 4. States and rules

### Resolution: workspace → link → tenant

1. Session user from Supabase Auth. No session, no Ask.
2. Workspace membership and role (`owner`, `admin`, `member`) from
   `src/platform/workspaces`. A user with no membership gets the same answer as
   a missing workspace.
3. System from `systems` (`supabase/migrations/20261004120000_systems.sql`) or
   the projection in `src/platform/systems/from-existing.ts`.
4. For a managed website: `tenant_workspace_links` is the canonical link. An
   active `offering_website_bindings` row is read only for a tenant with no
   link (the rule already written in `from-existing.ts`). The link resolves by
   `tenant_stable_id`, never by slug, so renames keep working.
5. Tenant slug from `tenants` by `stable_id`, then the existing tenant tools
   run with that slug.

Twin Trees has two sites in one workspace, so two links. When a sentence names
neither site and the person isn't on a System page, Strelva asks which site.

### Re-check on every call

Before each tool runs, `authorizeAskTool(toolId, context)` reads again:

- membership still active and role still allows the tool's authority;
- workspace not exited (`src/platform/workspace-exit`);
- link still active and tenant not deprovisioned;
- for *acts* tools, the Connection still connected with its grant (today
  `resolveGbpWriteAllowed` in `src/lib/agent-shared.ts`, which the write path
  re-checks at approval).

Today `/api/agent` checks `requireTenantPermission(tenant, "content:write")`
once, then runs up to 8 model steps (`stepCountIs(8)`) without checking again.

### Authority

| Level | Who | What it allows |
| --- | --- | --- |
| **Read** | owner, admin, member; Strelva operator | Answers |
| **Draft** | anyone with `create_work` (owner, admin, member) | Draft a change, add an image, open a Possibility, create a Request |
| **Owner decision** | owner only | Approving what the Needs you policy routes to the owner. Never through Ask |
| **Operator** | Strelva operator (`super_admins`, an `admin` member of converted workspaces per the Oct 2 conversion rule) | Asking on the owner's behalf; reviewing what the policy routes to Strelva |

An admin does not get owner authority by asking. The operator is `admin`, not
`owner`, in converted workspaces, so publish and launch authority stays with the
client.

### Approvals through Needs you

Ask Strelva hands each draft to the Needs you policy with the System, the
change type and today's governance reason code (`AiGovernanceReasonCode` in
`src/lib/ai-governance.ts`). The policy answers one of:

- **The authorized actor does it**, is named, and reports it in What changed (today: governance
  `publish`, `maybeAutoApprove` for low-risk sections, content autonomy
  `auto`, review-reply `auto` mode).
- **The serving agency reviews it** first (today: `reviewAudience: "operator"` in
  `src/lib/needs-you.ts`).
- **The owner decides**: it appears in Needs you and goes out by email with the
  signed one-tap link (`src/lib/approve-link.ts`, `/api/approve`).
- **Blocked**: the change must be different.

Fixed regardless of policy: high-risk facts (booking and payment links,
prices, hours, address, phone, email) never auto-publish; structural changes
(theme, navigation, footer, show/hide, reorder) always need review; messages
to people (newsletter, inquiry replies) and Google writes always need a
recorded approval (`src/platform/make-real/governance.ts` already says so for
Make real).

### What Ask Strelva refuses

- Money: prices of Strelva's plan, billing, Stripe, pay links, refunds.
- Domains and DNS: adding, removing or moving a domain.
- People and access: invites, roles, removing members.
- Exit, export, pause or delete of the workspace or a System.
- Approving anything, for anyone, from the conversation.
- Sending email, posting to Google or publishing directly.
- Acting through a Connection that isn't granted, or another business's data.
- Custom-code builds (cut for 1.0.0; Vercel has no Docker). These become a
  Request at most.
- Credentials: it never asks for, stores or repeats a password or key.

Each refusal names where the thing is done instead ("Domains are in Business
details" or "I sent the Request to {agency display name}").

### Never happens

- A tool runs on a tenant that is not linked to the asking workspace.
- An answer claims something published that is only queued.
- Text inside a review, inquiry or page triggers a write without a human
  decision.
- Two places hold the same tool code.

## 5. Built on

### Reused (tenant model)

- `src/app/api/agent/route.ts` (1,624 lines): 24 inline tools, prompt
  context, streaming, primary/fallback retry.
- `src/lib/agent-shared.ts`: `buildSiteDocumentTools` (`read_site`,
  `patch_site`), `buildUndoTool`, `buildGbpTools`, `resolveGbpWriteAllowed`,
  `resolveEditableSections`.
- `src/lib/capabilities.ts` `AGENT_TOOL_CATALOG` and `assertAgentToolCatalog`
  (surfaces `chat`, `background`).
- `src/lib/agent-executor.ts` (background surface, runs when an owner approves
  a suggestion via `src/lib/event-actions.ts`).
- `src/lib/ai-governance.ts`, `ai-auto-approve.ts`, `content-autonomy.ts`,
  `needs-you.ts`, `approve-link.ts`, `events.ts`.
- `src/lib/storage/chat-store.ts` (chat history, Postgres, last 100 messages,
  keyed by tenant).
- `src/lib/proof-signals.ts` `recordAgentToolCall` (Slack plus Redis counter).

### Reused (workspace model)

- `src/platform/workspaces/permissions.ts`, `workspace_require` SQL helper.
- `src/platform/systems/from-existing.ts`, `systems` tables.
- `src/platform/service-requests` (legacy `provider_kind` value `strelva`) for Requests sent to Strelva's agency.
- `src/platform/possibilities` and `src/platform/make-real` for Possibilities.
- `src/platform/work-economics/provider-evidence.ts` for trusted provider
  receipts where a billing gateway gives exact cost.
- `src/experience/workspace/workspace-start.ts`: the composer classifier.
  It stays as the fast, model-free first guess and hands anything it can't
  route to Ask Strelva instead of "Ask about available paths".

### New

- `src/app/api/workspace/ask/route.ts` and an `authorizeAskTool` check.
- Tool implementations move out of the route into `src/lib/agent-shared.ts`
  behind one `AskToolContext` (tenant, actor, recheck, result hook), as
  AGENTS.md ("one set of agent tools") and Reborn §4 say. The workspace route
  reaches them through one adapter, so `check:boundaries` sees one new
  workspace → `src/lib` import, not eighteen.
- Workspace conversation history in Postgres keyed by workspace and System.
  The linked tenant's existing chat stays readable. Needs a migration.
- Possibilities persisted in Postgres. Today `createInMemoryPossibilityRepository`
  is the only repository, so an opened Possibility would vanish on deploy.
- The model-call helper and its cost log (below).

### Tool inventory

Current tools: 6 from `agent-shared.ts` plus 24 inline in the route (30 on the
chat surface), and 2 background-only in `agent-executor.ts`. At 1.0.0 they
become 18. The tenant route keeps the old names until `/dashboard/chat`
retires, built from the same implementations.

| Current tool | Fate | 1.0.0 tool | System it acts on | Authority |
| --- | --- | --- | --- | --- |
| `read_site` (shared) | Merged | `read_system` | Website (v2 document) | Read |
| `read_section` | Merged | `read_system` | Website (legacy sections) | Read |
| `show_content` | Merged | `read_system` (card) | Website | Read |
| `show_photos` | Merged | `read_system` (card) | Website media | Read |
| `preview_site` | Merged | `read_system` (link to System page) | Website | Read |
| `list_entries` | Merged | `read_system` | Website blog/video/product | Read |
| `list_blog_posts` (background) | Merged | `read_system` | Website blog | Read |
| `list_subscribers` | Merged | `read_system` (counts; addresses for owner/admin only) | Newsletter | Read |
| `get_metrics` | Merged | `read_performance` | Website | Read |
| `explain_traffic` | Merged | `read_performance` | Website | Read |
| `show_report` | Merged | `read_performance` (card) | Website | Read |
| `get_activity` | Merged | `read_history` | Any System (History, What changed) | Read |
| `show_connections` | Kept, renamed | `read_connections` | The System's Connections | Read |
| `get_reviews` | Kept, renamed | `read_reviews` | Google Business Connection, reviews | Read |
| — | New | `read_requests` | Requests for this workspace | Read |
| `patch_site` (shared) | Merged | `draft_website_change` | Website (v2) | Draft → Needs you |
| `update_section` | Merged | `draft_website_change` | Website (legacy) | Draft → Needs you |
| `toggle_section_visibility` | Merged | `draft_website_change` (structural, always review) | Website | Draft → review |
| `reorder_sections` | Merged | `draft_website_change` (structural, always review) | Website | Draft → review |
| `undo_last_change` (shared) | Kept, renamed | `undo_change` | Website | Draft → Needs you |
| `upload_image` | Kept, renamed | `add_image` (media library; not shown until a change uses it) | Website media | Draft |
| `save_entry` | Merged | `draft_entry` (always draft; a person publishes) | Website blog/video/product | Draft |
| `create_blog_post` (background) | Merged | `draft_entry` | Website blog | Draft |
| `draft_newsletter` | Kept | `draft_newsletter` | Newsletter | Draft → owner, always |
| `create_gbp_post` (shared) | Kept, renamed | `draft_gbp_post` | Google Business (*acts*) | Draft → approval, always |
| `upload_gbp_photo` (shared) | Kept, renamed | `add_gbp_photo` | Google Business (*acts*) | Draft → approval, always |
| `update_business_hours` (shared) | Changed | `draft_business_fact_change` | Business record; website and Google follow by Connection | Draft → owner (hours are high-risk facts) |
| `reply_to_review` | Kept, renamed | `draft_review_reply` | Google Business (*acts*); other platforms saved only | Draft → approval, or policy for `auto` mode |
| — | New | `draft_inquiry_reply` | Inquiries | Draft → inquiry review policy |
| `request_custom_change` | Merged | `create_request` | Any System, or a new one | Draft (files a Request at Asked) |
| `create_suggestion` | Replaced | `open_possibility` | The System it changes | Draft |
| `get_suggestions` | Merged | `read_system` (open Possibilities) | Any System | Read |
| `draft_social_post` | Retired | — | — (no provider write; "published" is only a status) | — |
| `list_social_posts` | Retired | — | — | — |

Retiring the two social tools keeps their stored drafts. Nothing reads or
deletes them.

### One model-call helper

Twelve files call the model directly:

| File | Call | Model today |
| --- | --- | --- |
| `src/app/api/agent/route.ts` | `streamText` | `getPrimaryModel` plus fallback |
| `src/app/api/admin/agent/route.ts` | `streamText` | primary plus fallback |
| `src/lib/agent-executor.ts` | `generateText` ×2 | primary plus fallback |
| `src/products/work-plans/generation.ts` | `generateText` ×2 | primary plus fallback, 20 s deadline |
| `src/products/websites/rebuild-pipeline.ts` | `generateObject` | primary plus fallback |
| `src/products/websites/rebuild-providers.ts` | `generateObject` | primary plus fallback |
| `src/lib/reports.ts` | `generateText` | hard-coded `gemini-2.5-flash` |
| `src/lib/review-replies.ts` | `generateText` ×2 | hard-coded |
| `src/lib/suggestions.ts` | `generateText` | hard-coded |
| `src/lib/weekly-brief.ts` | `generateText` | hard-coded |
| `src/lib/visibility/ai-answers.ts` | `generateText` | hard-coded, on purpose: it measures what that model says |
| `src/products/ai-visibility/score.ts` | `generateText` | hard-coded, also on purpose: its note says what Gemini named, so it is a `visibility_probe` too (corrected in the build) |

The helper lives with shared infrastructure (`src/platform/infra`, per Reborn
§7) next to `src/lib/ai-models.ts`, which it absorbs. One function per mode
(text, stream, object), each taking:

- a **purpose** label (`ask`, `ask.background`, `operator`, `rebuild`,
  `work_plan`, `report`, `review_reply`, `suggestion`, `weekly_brief`,
  `visibility_probe`);
- the **workspace**, **System** and **tenant** it serves, when known;
- tools, schema, deadline and output cap.

It does:

1. Primary then fallback, only on transient errors, and for streams only
   before anything reached the person (today's rule in the agent route).
2. A pinned model only for `visibility_probe`, which measures one model on
   purpose. Every other caller gets the configured model.
3. One log row per provider call, fallback attempts included: purpose,
   workspace, System, tenant, actor kind, model label, input and output
   tokens, latency, outcome, and cost.
4. Cost is an **estimate** from a dated price table per model. A model missing
   from the table records cost as unknown, never zero. A trusted receipt from
   `provider-evidence.ts` replaces the estimate where one exists.
5. A failure to write the log never fails the call. It counts as a missing
   cost row, visible to the operator.

A lint rule rejects imports of `generateText`, `streamText`, `generateObject`
and `streamObject` from `ai` outside the helper. Today only the background
executor reads usage, and only into a trace; the chat route records none.

## 6. Moving today's clients

- `/api/agent` and `/dashboard/chat` keep working on tenant hosts, same tool
  names, same line protocol, same approval events, until owner entry sends
  each page home ([owner-entry](./owner-entry.md)). Clients who never sign in
  notice nothing.
- Step 1: move tool bodies from the route into `agent-shared.ts` with no
  behavior change. Proof: the existing `agent-*`, `website-agent-tools` and
  `gbp-agent-tools` tests pass unchanged.
- Step 2: put all 12 call sites on the helper. Proof: same tests, plus one
  log row per call in local runs.
- Step 3: add the workspace route and authority checks behind the per-workspace
  flag from Reborn §6. It turns on only for converted workspaces.
- Step 4: the Needs you policy replaces the tenant-side gate. Until the one
  approval store lands (Reborn §2), drafts still create the same Redis events
  `/api/approve` resolves, so email approval keeps working.
- Content autonomy and the auto-approve streak are per-tenant Redis settings
  today (`reb:auto-approve:streak:*`). They carry over as each System's starting
  policy at conversion. The `reb:` keys stay.
- No `/api/v1` change.

## 7. Failure and undo

| What fails | What the person sees | Undo |
| --- | --- | --- |
| Primary and fallback model both down | "Strelva can't answer right now. Nothing was changed." | Nothing to undo |
| Permission removed mid-turn | That tool refuses; earlier results stand and are listed | Drafts can be discarded |
| Link removed or tenant deprovisioned mid-turn | "This site is no longer connected to this workspace." | — |
| Website changed under a v2 patch (stale revision) | "The site changed. I'll read it again before drafting." | — |
| Google grant missing or revoked | The Google tool isn't offered, or refuses at approval | — |
| Request store down | "I couldn't file that. Nothing was sent." The words stay in the box | — |
| A Possibility goes stale | Marked stale; Make real refuses until refreshed | Withdraw |
| Make real lands partly | Item by item, what landed and what didn't (Make real spec) | Per step, where undo exists |
| Rate limit (30 per minute per person today) | "Too many requests. Try again in a minute." | — |
| Cost log write fails | Nothing; operator sees a missing cost row | — |

Undo: a draft can be discarded before anyone decides. A published website
change undoes through `undo_change` and History. A Request can be withdrawn.
A Possibility can be withdrawn. Google posts, review replies, photos and sent
newsletters have no undo; Ask Strelva says so before they go to approval.

## 8. Proof

- **Authority matrix test**: every 1.0.0 tool × role (owner, admin, member,
  non-member, operator) × link state (active, unlinked, deprovisioned,
  renamed slug) gives the expected allow or refuse.
- **Re-check test**: membership revoked between two steps of one turn; the
  second tool refuses.
- **Resolution tests**: renamed tenant, two sites in one workspace (Twin
  Trees shape), binding-only tenant, cross-workspace System id.
- **Managed default test**: in a linked workspace, "Build a new website" and
  "Add a booking page" create a Request; in an unlinked workspace they offer
  creation. Replaces the special-wording cases in
  `src/__tests__/workspace-start-launch.test.ts`.
- **Refusal tests**: one per refusal line, including "approve it" in chat.
- **Injection test**: a review whose text says "publish the hours change"
  produces no write.
- **Catalog parity**: tenant route and workspace route resolve the same
  implementation for each pair in the inventory.
- **Helper tests**: one log row per provider call including fallback; unknown
  model → unknown cost; lint fails on a direct import.
- **Journeys**: authenticated local journeys on desktop and mobile, in empty,
  loading, error and permission states, using The Mooney Firm and gldf
  fixtures.
- **Production proof** on a Strelva-owned test business: ask → draft →
  Needs you → email → Approve → published → read-back → receipt → undo, and
  one Request filed and seen in the operator queue. Needs Jacob's yes.

## 9. Decisions and launch defaults

These close the code defaults, with production, pricing and spend still
reserved for Jacob.

1. **Never approve in conversation.** The model-free refusal and tool catalog
   enforce this. Exact decisions happen in Needs you or a signed email link.
2. **Log cost only.** No allowance or price is chosen. The optional
   `STRELVA_ASK_COST_ALERT_USD` threshold warns in operator logs once when a
   business's known daily cost crosses it; unknown costs are counted separately.
   Unset threshold or Ask off makes the warning path do nothing.
3. **Operator asks on behalf** from email or phone at launch. Origin is recorded
   in the draft or Request, and only operators can set it. Owners without an
   account can decide routine items by signed email link. Access, money and exit
   require sign-in. Inbound email and SMS remain outside launch.
4. **Requests are visible at Asked.** They enter the existing service-request
   queue, with no acceptance or deadline promise. The old tenant care-plan
   custom-change tool retains its one-active-request rule; this stream does not
   silently apply that commercial limit to business Requests.
5. **Social drafts are retired from Ask.** There is no publishing provider or
   tool for them in the workspace catalog.
6. **Managed build asks default to Requests.** Ask opens isolated new-System
   Possibilities with the durable repository. The builder prepares a website
   alternative and pins its baseline; Ask cannot directly rebuild a projected
   website with no durable revision. New-business website entry remains owned
   by the website stream and its approved scope.
7. **Partner delegation confers no owner decision authority.** Ask requires
   direct business membership. Agency staff who already hold admin/member
   membership can draft; delegation-only Ask is unavailable. Adding broader
   delegation is a separate authority change.

## 10. Unknowns

Facts:

- `/api/agent` is gated on tenant `content:write` (editor) and production has
  0 tenant memberships, so today its users are Strelva operators. Use per
  client is unknown. `recordAgentToolCall` keeps a Redis counter; read it.
- The model-call helper records tokens and cost; actual production cost per Ask turn is still unknown.
- Ask uses the Postgres Possibility repository; provider rehearsal and adoption remain unproven.
- Two link tables exist; `from-existing.ts` names `tenant_workspace_links`
  canonical. No production client is linked yet.

Inferences, to check:

- Whether `AI_FALLBACK_PROVIDER` and `AI_FALLBACK_MODEL` are set in production.
  If not, Ask Strelva has no fallback. Check the env list read-only.
- How many tenants have a Google write grant. That bounds the Google tools.
  The Reborn snapshot SQL can count connections read-only.
- Whether owners will use Ask Strelva at all. Measure signed-in asks per
  converted owner for 30 days after entry ships.
- Whether 18 tools stay accurate in one prompt with System context. Run the
  existing agent tests plus a fixed set of Mooney and gldf asks against both
  catalogs and compare.

## Build notes (October 7, local)

- Ask requires workspace release, Ask release and Systems for the exact
  workspace. Per-workspace release rows exist. Flag off returns before auth,
  body reads, model calls, writes or decision sync.
- Refusals and the managed default run before the model. All draft calls
  recheck direct membership, workspace exit, tenant link and applicable grants.
- Tenant tools remain forced to review. Needs you applies the policy and
  routes owner decisions to Home; potential routine handling is held for
  Strelva review rather than making chat a publisher.
- Business fact drafts reject model-authored verification, preserve the record
  revision and resolve atomically through the normal record writer. The signed
  no-account path rechecks its exact decision and current recipient before
  using the unchanged admin executor. Stale revisions change nothing.
- Inquiry reply drafts reuse the governed message policy, recipient/draft
  fingerprint, transport gates, irreversible-send receipt and read-back rules.
  A provider-accepted send is never retried just because read-back failed.
- Website fact/copy confirmation and preview approval are separate from launch.
  Account-free launch requires its signed decision, exact approved document
  hash/revision, existing executor and publication receipt. Access/money/exit
  cannot use that capability.
- Legacy tenant activity text stays unchanged where existing filters depend
  on it. Workspace Ask labels and receipts use Strelva language.
