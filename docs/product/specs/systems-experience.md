# Systems Home, the System page, Possibilities and Make real

> **Changed by ADR 0013 / decision 1.** Every receipt names whoever acted. Agency work
> shows its display name and "Runs on Strelva"; automatic platform effects and
> reconciliation name Strelva. "Strelva handled" remains the place name, label open
> (D-label), behind one constant. Past restorable states are History; Versions are
> adaptations to another context, never past states.

Status: draft spec, 2026-10-06. Not approved. Wave 2 (branch
`w2/systems-live`, local only, nothing applied or turned on anywhere) built:
Possibilities in Postgres with the stale rule in the same transaction, the
90-day idle withdraw and signed 14-day Try it links; adoption of each
converted tenant's website and inquiry Systems at revision 1; observed
revisions from tenant content edits; deprovision pausing stored Systems; five
live Make real channel adapters (hosted website, website sections, inquiry
form, booking page, internal app) behind `make_real_live:<channel>` flags,
one plan approval keyed by workspace through the one `make_real` Needs you
source (merged on `integrate/reborn-1.0` with the decisions-wiring source:
live stored plans and isolated rebuild plans share one adapter, item id,
fingerprint and approval reader; `src/platform/needs-you/systems-sources.ts`),
durable activations resumed by the workspace-work cron, partly live steps in
the operator queue, operator resume/reconcile/roll back, and the Home and
System page gaps (History, Make real in progress, Strelva handled receipts,
no empty panels, paused copy). Not built: History Restore (no undo action
from History yet), Needs you for this System on the System page, the
"form-delivers" operating check (fails honestly, so a rebuild with
inquiries never reads Made real without an operator), Google as a live
channel (it waits), and every per-channel production proof in section 8.

Built locally on `w2/decisions-wiring` (2026-10-06), behind
`STRELVA_NEEDS_YOU_RELEASE`: behavior 21 (one Needs you item and one approval
record per Make real plan, each effect inside the plan fingerprint) and the
approval half of 22 (`planApprovalAuthority` rechecks the record before
activation and every publish step). Make real still runs on the isolated
sandbox.

Built locally on `w3/decision-gaps` (2026-10-06): the service-actor half of
22. The workspace-work cron and the operator's resume, reconcile and roll back
run under Strelva (system) for a business Strelva runs (one logged
`make_real_resume` session per business, `20261009100000`), falling back to
the starter elsewhere; each action is logged before it runs, the history event
says "Resumed by Strelva (system)", and the owner stays approver of record
(the activation's approval is unchanged and rechecked before every step). An
activation whose starter left is no longer stranded. Home shows one Make real
item when a stored live plan and an isolated plan come from the same rebuild
(the live plan wins; `sourceRebuild`).

This spec covers what a business sees of its Systems: Home, the System page,
Possibilities, and Make real with real outside effects. It also covers the
storage underneath: the System registry, System identity across tenants and
saved work, Possibilities in Postgres, durable Make real, and how
`STRELVA_SYSTEMS_RELEASE` turns on one workspace at a time.

It follows [product-model.md](../product-model.md) and uses every Oct 6
working default listed there. Needs you, receipts and one-tap email links come
from [needs-you](./needs-you.md). Per-workspace flags come from
[owner-entry](./owner-entry.md). Google writes come from the
[publishing spec](../../capabilities/publishing/publishing-spec-2026-10-06.md).
Versions come from [agency-and-versions](./agency-and-versions.md). This spec
doesn't restate them.

Code read on branch `reborn-1.0-model`: `src/platform/{systems,possibilities,make-real,system-health}`,
`src/experience/systems`, `src/experience/workspace/BusinessHome.tsx`,
`src/app/api/workspace/route.ts`, `src/app/api/workspace/systems/make-real/route.ts`,
`supabase/migrations/20261004120000_systems.sql` and the publish paths cited in
section 5.

## 1. The moment

**The Mooney Firm gets consult booking** (illustrative; the firm has not asked
for this). It is the walk-through in `CONTEXT.md` "Product model", done end to end.

Strelva builds a consult-booking page beside attymooney.com's contact form. It
runs on its own test data. Nothing live changes. The firm's owner never signs
in. The morning email says: "Strelva built consult booking for attymooney.com.
Try it. Make it live?" It has three links: **Try it** (a signed preview),
**Make it live** and **Not yet**.

The owner taps Try it, books a fake consult, and sees "Test booking, nobody was
told." Then the owner taps Make it live and confirms. Strelva runs Make real:

1. Consult booking becomes a Live System.
2. The booking page appears on attymooney.com.
3. The firm's Google listing should get the booking link.

The first two land. The third waits, because Google hasn't approved Strelva's
API access yet. The owner gets one email: "Consult booking is live on
attymooney.com. Not on Google yet: Google hasn't approved Strelva's access.
Strelva will add it when it does. Nothing else changed." The parts that landed
stay. Under **Strelva handled** there are two receipts, each with **Undo**.

Jacob opens Home as an operator. Needs you is empty, so it isn't shown. The
cards read "attymooney.com · Live · Working", "Consult booking · Live ·
Working" and "The Mooney Firm on Google · Live · Waiting on Google". **In
progress** has one line: "Making consult booking live: 3 of 4 done".

## 2. In the model

- **Home** is the business's front page. It is not a noun. It shows Needs
  you, the Systems, Strelva handled and In progress.
- **The System page** is one **System**. The real thing (the site, the inbox,
  the calendar, the tool) gets most of the space. **Connections**,
  **Possibilities**, **Versions** and **History** sit beside it, and only when
  there is something to show.
- **A Possibility** is a working alternative pinned to the System revisions it
  changes. It may change several Systems and introduce new ones. It runs on
  its own data and never touches live state (ADR 0011 rule 3).
- **Make real** is a change like any other. Per needs-you, it routes as
  `system.change_live`, or `system.go_live` when it brings a System from
  Draft to Live. If any part routes to the owner, the whole thing waits for
  the owner. Each outside effect is one step with its own result.
- **Requests** and **Running** stay their own nouns. A Request can produce a
  Possibility ("build us consult booking"). Running can watch a System. Make
  real in progress shows under In progress next to Requests. It is not a
  Request.
- **Business record**: Systems read it through `read` Connections. A
  Possibility never copies it. It pins the revision it read.

## 3. What it does at 1.0.0

### Home

1. **Needs you is first, and only when something is waiting.** Its items,
   order, email and one-tap actions are as defined in needs-you behavior 13.
   A Ready Possibility waiting for the owner is a Needs you item. It names
   the Systems it changes and links to the side-by-side compare.
2. **Systems by their own names.** Each card shows the name
   ("attymooney.com"), a small kind label, the lifecycle (Draft, Live or
   Paused) and a health word (Working, Something is off, Not working,
   Unknown). These are `LIFECYCLE_LABEL` and `HEALTH_LABEL` in
   `src/experience/systems/model.ts`. A card whose health is not Working adds
   one sentence, its worst reason ("Calendar disconnected").
3. **Card order.** Not working first, then Something is off, then Live,
   Draft and Paused. Ties sort by name. Unknown health never sorts above
   Live, because an unchecked System isn't an alarm.
4. **Card hints.** A card can add "1 possibility ready", "Making live: 2 of
   4" or "Partly live". It never adds a count of empty things.
5. **Strelva handled** lists the last 7 days of receipts (needs-you
   behavior 14). Today the section shows Requests whose stage is `done`
   (`BusinessHome.tsx`, `handled = requestRows.filter(row => row.stage ===
   "done")`). The receipt feed replaces that.
6. **In progress** lists open Requests and every Make real that is running
   or partly live, each as one line with its step count.
7. **Files and results** (audits, reports, plans) stay below, as today.
8. **No partial lists.** While Systems load, nothing is listed (this exists
   today). If the read fails, Home says "Your systems could not be loaded
   just now. Nothing about them has changed." (this also exists today).

### The System page

9. **The thing first.** The surface takes the main column. This is
   `SystemSurface` in `SystemPage.tsx`: the live site in a sandboxed frame,
   the inquiry inbox, the bookings or app view, the document.
10. **A header with plain marks.** The name, the kind, a lifecycle pill, a
    health sentence and "Run by Strelva". Actions: Visit site (websites),
    Ask for a change, and Make real when an owner is viewing a Ready
    Possibility.
11. **Context only when there is some.** Today the Connections, Possibilities
    and Versions panels always render, even with "Nothing else is connected
    to it yet" or "It runs in one context today". At 1.0.0 an empty panel
    isn't drawn. The page shows these blocks, in this order, each only when
    it has content:
    - **Needs you for this System**: the same items as Home, filtered.
    - **Make real in progress or partly live**: the per-step result (section 4).
    - **Possibilities**: each with Compare (websites), Try it, and Make real
      or "Waiting for the owner".
    - **Connections**: anything disconnected or stale shows in full. Connected
      ones fold into one line, "Works with 4 things", which opens the list.
      Each Connection says what it reads, acts on or appears in, and its
      source of truth.
    - **Versions**: where else this System runs (agency-and-versions behavior 20).
    - **History**: the last 5 changes, with Restore wherever undo exists.
12. **Nothing to show is one line.** When no block has content, the page
    shows one link under the surface: "Ask what else attymooney.com could
    become." There are no empty headings.
13. **History is new.** No History block exists today. It merges three
    sources: the System's revisions (`system_revisions`), its native releases
    (website document revisions, application releases, content versions), and
    Strelva handled receipts for this System. It is newest first. A row reads
    "Acme Marketing published the rebuilt site · Oct 9 · Restore", with
    "Runs on Strelva" credit; a platform publication instead names Strelva. Restore uses the
    native undo path and routes through needs-you behavior 15. It is never
    called "Version".
14. **Paused says what keeps working.** "Paused. Bookings already made are
    kept." Health still shows. This is ADR 0011 rule 5, and
    `transition_system_lifecycle` already pauses a booking System's schedule
    in the same transaction.

### Possibilities

15. **Possibilities are stored in Postgres** (section 5). An opened Possibility
    survives deploys and restarts. Today `createInMemoryPossibilityRepository`
    is the only repository, and a rebuild Possibility is rebuilt from saved
    work on every `GET /api/workspace` (`prepareRebuildPossibilities` in
    `src/experience/systems/server.ts`).
16. **Who opens one.** Strelva (an operator, Ask Strelva's `open_possibility`
    or the rebuild pipeline). An agency can open one on work it was assigned.
    Owners and members ask Strelva to open one. Owners don't build at 1.0.0
    (systems-catalog default).
17. **Owner-visible states**:
    - **Exploring**: being built or checked.
    - **Ready**: rehearsed on the current candidate, every baseline current,
      every extraction conflict resolved. `markReady` already enforces all
      three.
    - **Waiting for you**: Ready, with an open Needs you item.
    - **Making it live**: an activation is running.
    - **Partly live**: the activation needs attention.
    - **Made real**: closed, and it moves to History.
    - **Withdrawn**: closed.

    "Waiting for you", "Making it live" and "Partly live" are derived. They
    are not stored statuses.
18. **Stale is automatic.** When a pinned System's current revision moves,
    every open Possibility pinning it goes back to Exploring in the same
    transaction, with the reason "attymooney.com changed since this was
    built." This applies whatever moved it: a direct edit, another Make real,
    or a restore. Any Needs you item for it closes with "This changed since
    we emailed you."
19. **Try it without signing in.** The email carries a signed, expiring
    preview link bound to {workspace, possibility, candidate revision}. The
    page is noindex and shows only the candidate. Submissions are marked as
    tests, go nowhere, and say so. A new candidate revision kills old links.
20. **Isolated data stays isolated.** Test bookings, test inquiries and app
    records made while exploring are never carried into live records by Make
    real.

### Make real

21. **The owner decides once per plan.** A Ready Possibility produces one
    Needs you item. Approving it creates one approval record. Its fingerprint
    covers every declared effect, connection and introduced System for that
    candidate revision. Today approvals are per effect (`effectApprovalSubject`
    in `approvals.ts`). The per-effect check stays: each effect's fingerprint
    must sit inside the plan fingerprint.
22. **Strelva runs it, not the owner's browser.** Today the route is owner
    only and runs in the request (`make-real/route.ts`). At 1.0.0 the
    approval starts a durable activation under Strelva's service actor. The
    `AuthorityPort` allows `system.activate` and each `site.publish` step only
    while the owner's approval record still resolves as approved. It checks
    again before every step, as the runner already does.
23. **Real effects at 1.0.0** (section 5 has the adapters):
    - website publish (hosted documents, and content sections on tenant sites)
    - inquiry form publication
    - booking page publish
    - internal app release
    - Google listing changes, handed to the publishing path

    Calendar writes, messages and payments stay isolated-only. A Possibility
    that declares one can be explored. Make real lists that step as "Not
    connected" and doesn't start it. The sandbox already does this.
24. **Order guarantees "live unchanged until effects land."** `planActivation`
    stages candidates, then runs outside effects, then switches live
    pointers, then connects, then verifies. No live pointer switches until
    every effect it depends on has been accepted.
25. **Operating checks are real.** "The site serves every carried-over page"
    uses the website health read-back (`checkWebsiteHealth`). "A test message
    arrives in Inquiries" sends a submission flagged as a test, which is
    excluded from records, owner notices and outcome counts. A Possibility
    is Made real only when every check passes.
26. **Result after Make real, item by item** (section 4). It is shown on the
    System page and in In progress. It goes to the owner by email only when
    it settles or when the owner has to act.
27. **Receipts.** Every accepted effect writes a Strelva handled receipt with
    the System, a sentence, the provider reference, the read-back result and
    an undo state. Each activation writes one summary receipt. An isolated
    receipt (`adapterMode: "isolated"`, provider ref `isolated-…`) is never
    shown as a real change.

## 4. States and rules

**Activation status** (`src/platform/make-real/contracts.ts`) and what the
owner reads:

| Stored | Owner sees |
| --- | --- |
| `in_progress` | "Making consult booking live: 2 of 4 done" |
| `needs_attention`, nothing switched, no effect accepted | "Nothing changed yet. Strelva is on it." |
| `needs_attention`, something landed | "Partly live", then the list |
| `made_real` | "Live." Each check that passed |
| `rolled_back` | "Undone." Then the list of what already happened and can't be undone |

**Step states**, one line each, using the stored `stepStatus`:

| Stored | Owner line | Meaning |
| --- | --- | --- |
| `completed` with read-back confirmed | Done | Provider accepted it and Strelva saw it |
| `completed` with read-back failed | Done, not yet confirmed | Accepted. Never retried (AGENTS.md outside writes); routes as `verify.failed` |
| `blocked` | Waiting: reason, and who unblocks it | Not attempted. Safe to resume |
| `failed` | Didn't happen: reason | Refused with no effect. Safe to retry, 3 attempts max |
| `unknown` | Not sure yet. Strelva is checking | Never replayed. Reconciled only with provider lookup or operator evidence |
| `restored` / `compensated` | Undone | Internal pointer restored, or provider object cancelled |
| accepted and `irreversible` | Can't be undone, with why | Listed in `cannotUndo` |
| `pending` | Not started | — |

**The partial-failure contract** (ADR 0011 left this open):

1. What landed stays. There is no automatic rollback.
2. Strelva never says "done" while any step is `unknown`. Rollback can't
   finish while one is unknown (`describeActivation` already says this).
3. A partly live activation goes to the operator queue at once
   ([operator](./operator.md)). The operator either fixes the cause and
   resumes, reconciles an unknown step with evidence, or rolls back.
4. Resume needs no new owner approval while the candidate revision and plan
   fingerprint are unchanged. Any candidate change ends the activation.
5. Rolling back restores the state the owner last approved, so it is handled
   (needs-you behavior 15). The owner is told by receipt. A compensation that
   is itself a new outside write (a Google change) routes as
   `undo_needs_review`.
6. The owner gets an email only (a) when the fix is theirs
   (`health.owner_action`: reconnect Google, change DNS at the registrar), or
   (b) when the activation settles: made real, rolled back, or still partly
   live after 7 days.
7. After `made_real`, the whole activation can't be rolled back (`runner.ts`
   refuses this). Undo is per System, from History.

**Authority:**

| Action | Owner | Member | Agency (assigned) | Strelva operator |
| --- | --- | --- | --- | --- |
| See Systems, health, Possibilities | Yes | Yes | Assigned only (`system_actor_scope`) | Yes |
| Use the surface (take a booking, answer an inquiry) | Yes | Yes | Assigned only | Yes |
| Open or revise a Possibility | Asks Strelva | Asks Strelva | Yes | Yes |
| Mark Ready | No | No | No | Yes, after rehearsal |
| Approve Make real | Yes, one tap | No | No | No, except a `strelva_reviews` route |
| Resume, reconcile, roll back | No | No | No | Yes, with a receipt |
| Restore from History | Through needs-you policy | No | No | Through needs-you policy |
| Pause or go live | `owner_decides` | No | No | Never decides for the owner |

**Never:**

- A Possibility writes to a live System or calls a live provider. `rehearsePossibility`
  refuses a live adapter.
- An isolated result reads as a live change.
- Make real changes a domain or DNS.
- Make real claims atomicity across providers.
- An issued output (a sent reply, an accepted proposal) is rewritten. The
  `system_output_guard` trigger already enforces this.
- One System id crosses a business boundary.

## 5. Built on

**Reused as is:**

- The System spine: `src/platform/systems` and
  `supabase/migrations/20261004120000_systems.sql`. It has `systems`,
  `system_revisions`, `system_outputs` and `system_connections`, RLS on, every
  grant revoked, and service-role RPCs that recheck the actor. The guards
  cover identity, lifecycle, revisions and connection cycles. It is local
  only. Not applied anywhere in production.
- The projection: `listBusinessSystems` = stored Systems plus existing things
  not yet stored (`from-existing.ts`). Health: `src/platform/system-health`.
- The Possibility engine (`possibilities/engine.ts`) and the Make real runner
  (`make-real/runner.ts`, `plan.ts`, `view.ts`, `approvals.ts`,
  `governance.ts`). Their rules stay.
- The UI: `BusinessHome.tsx`, `SystemList.tsx`, `SystemPage.tsx`, `model.ts`.

**System identity (how it works today):**

- `id = system_origin_id(workspace, origin_kind, origin_ref)`. It is
  deterministic, so a projected System and its stored row share one id before
  and after adoption.
- Origins: `saved_work` (`saved_product_work.id`), `tenant`
  (`tenants.stable_id`, never the slug), and `inquiry_workspace`.
- What came first keeps the identity. A managed site rebuilt natively keeps
  its tenant-derived id. A native-first site keeps its work-derived id after
  it reserves its own hosted tenant (`hostedTenantReserved`).
- `tenant_workspace_links` is the one link. `offering_website_bindings` is
  read only for a tenant with no link (product-model problem 5).

**Gaps in identity this spec closes:**

1. **Adoption.** Each converted client's website and inquiry Systems are
   stored at conversion: create, then record revision 1, then go live. A
   stored System needs a revision before Live, and a Possibility needs a
   revision to pin. Revision 1's `implementation` names the native pointer:
   - `website_document` with `<workId>@<revision>` and its content hash
     (hosted sites)
   - `tenant_content` with `<stable_id>@<content_versions id>` (tenant sites)
   - `application_release` with `<workId>@v<n>`
   - `schedule` with `<workId>@<payload revision>`
   - `inquiry_config` with `<inquiry_workspace_id>@<change id>`

   Everything else is adopted on its first write.
2. **Native edits must move the pin.** Tenant content edits
   (`src/lib/apply-section-update.ts`, `setContent`, `appendVersion`) don't
   record System revisions, so a pin can't see them. Recommended fix: the
   live reader reads each kind's native current pointer. If it differs from
   the System's current revision, it records an "observed" revision. The
   stale rule then fires.
3. **New origin kinds.** `system_origin_kinds()` needs three more:
   `google_location` (the publishing spec's listing System), `newsletter`
   (keyed by tenant stable_id) and `connected_site`, if connected sites ship
   (open decision 3 in product-model). This is a migration change.
4. **Tenant-side bookings** (e.g. rohlax wellness) aren't projected. They
   become a System when the bookings spec moves them to one store.
5. **Lifecycle drift.** Once a System is stored, its lifecycle wins over the
   projection. `src/lib/deprovision.ts` and tenant deactivation must pause the
   stored System, or the card says Live for a dead site.

**New:**

- **`system_possibilities`**, next to `systems.sql`:
  - Tables:
    - `system_possibilities`: `id uuid`, `business_workspace_id`, `status`,
      `revision`, `candidate_revision`, `source_ref` (unique; for example a
      rebuild work id), `body jsonb` checked against `possibilitySchema`, and
      `activation_id`.
    - `system_possibility_pins(possibility_id, system_id, revision_id)`.
    - `system_possibility_events`, append-only. It replaces the 1000-entry
      `history` array.
  - Every write is a compare-and-set on `revision`, made through
    actor-checked RPCs that reuse `system_actor_scope`.
  - `record_system_revision` and `set_system_current_revision` return every
    pinned open Possibility to Exploring in the same transaction.
  - It replaces `PossibilityRepository` behind its existing interface.
  - Saved rebuilds are backfilled as rows. Their id is no longer the
    `website-rebuild:<workId>` string.
- **Durable activations.** This is the plan in
  `src/platform/make-real/README.md`:
  - Extend `update_work_responsibility` for `restored`/`compensated` and
    `rollback_*` history.
  - Add an `operations/activation` resource kind.
  - Back `ActivationRepository` with the execution store.
  - Resume from the existing `due_workspace_work` cron.
  - Keep `createInMemoryActivationRepository` for tests only.
- **Live effect adapters.** Each implements `EffectAdapter` (`perform`,
  `find`, `readBack`, `compensate`) over the path that owns the write today.
  None is a second write path.

  | Channel | Wraps | Read-back | Undo |
  | --- | --- | --- | --- |
  | Hosted website | `websiteRebuildService.launch`: `documents.publish`, receipt `strelva-hosted` | `checkWebsiteHealth` | Earlier revision as a new candidate (`undo_needs_review`) |
  | Tenant content section | `applySectionUpdate`, gated by `decideAiContentGovernance` | Read the section back | Restore the previous content state from History |
  | Inquiry form | `executeInquiryPublication`, `inquiry_publication_claims` | Claim `accepted` vs `verification_failed` | Publish the previous config. Received inquiries are kept |
  | Booking page | `publish_public_website_booking_grant` | Read the grant back | `revoke_public_website_booking_grant`. Existing bookings are kept |
  | Internal app | `publishApplication` | Current release | `rollbackApplication` (`rollback_application_release`) |
  | Google listing | A change handed to the listing System's publishing path (approval, receipt, read-back are its own) | The publishing receipt | As the publishing spec says. Posts and replies have no delete today: `not_undoable` |

  `DeclaredEffect` gets a `channel` field that picks the adapter. It is part
  of the fingerprint. The effect kind stays `publish` with scope `site.publish`.
- **Approvals keyed by workspace.** `createGovernedWorkApprovalRecords`
  resolves a business through `businessForTenant(event.tenantId)`. A business
  with no tenant can't approve. The one approval store (needs-you) has to key
  by workspace.
- **Routes:**
  - `GET` a Possibility and its compare.
  - The signed preview.
  - Make real status, resume, reconcile and roll back (operator).

  Approval itself is the needs-you link. `POST /api/workspace/systems/make-real`
  stays as the isolated run until the live flag is on for that workspace.

**Retires:**

- The sandbox as the production path. `sandbox.ts` stays for exploring and tests.
- `makeRealSummary`'s "ran on an isolated copy" copy, once live effects are on.
- Always-drawn empty panels.
- "Strelva handled = done Requests".

**Tenant model vs workspace model.** The System registry, Possibilities and
activations are workspace-model only. Tenants are reached through `origin`
and adapters. Nothing writes a `tenants` row, a `reb:` key or `/api/v1`.

## 6. Moving today's clients

Production has 0 workspaces (Reborn page). Systems are a view over converted
workspaces, so no client sees a change until its workspace is on.

1. **Apply `20261004120000_systems.sql`.** It is additive and has no grants.
   It isn't on the Reborn "Needs Jacob's yes" list yet and should be added.
   Then apply the Possibilities migration and the work-execution extension.
   Each needs its own yes.
2. **Per-workspace flag.** This uses owner-entry's `workspace_release_flags`
   and its layering: env unset or `0` is the kill switch, `workspace` means
   on where the row says so, and `1` means everywhere. Systems has two keys:
   - `systems`: Home, the System page, Possibilities, and isolated Make real.
   - `make_real_live:<channel>`: one per effect channel.
3. **The operator tool refuses `systems` = `on` unless:**
   - the workspace is converted and linked;
   - every linked tenant shows exactly one website System, with no
     duplicates (a reconciliation check);
   - the website and inquiry Systems are adopted with revision 1;
   - an operator has viewed it in the `operators` state.

   It refuses `make_real_live:<channel>` unless:
   - activations are durable;
   - Possibilities are in Postgres;
   - the owner recipient resolves and client email is on for that business;
   - that channel's adapter is proven on the Strelva-owned test business.
4. **Order:** the Strelva-owned test business, then gldf (`operators`, then
   `on`), then the rest. Each client's first `on` needs a server-recorded
   approval from a different active operator, bound to that workspace, flag
   and reason (owner-entry table).
5. **Turning it off** renders the pre-Systems workspace (this exists today).
   Stored rows stay. An activation already running keeps settling from the
   cron, so no step is left `running`. No new Make real starts.

Clients who never sign in notice nothing until a Needs you email arrives.
That needs client email on for them (needs-you, steps 3 and 4).

## 7. Failure and undo

| Failure | What the person sees | Recovery |
| --- | --- | --- |
| Systems read fails | "Your systems could not be loaded just now. Nothing about them has changed." | Reload. The operator sees the error |
| A projected and a stored System disagree | One card. The stored row wins (`mergeBusinessSystems`) | Reconciliation check before turn-on |
| A pinned System changes while Ready | "attymooney.com changed since this was built." The email link refuses | Strelva refreshes the candidate and asks again |
| Owner taps Make it live on an old link | "This changed since we emailed you" | Latest item in the next email |
| An effect is refused | "Didn't happen: reason." Live unchanged if before the switch | Operator fixes and resumes |
| A provider timeout after the send | "Not sure yet. Strelva is checking" | `find` by idempotency key, or operator evidence. Never replayed |
| Accepted, read-back fails | "Done, not yet confirmed" | `verify.failed` to the operator. Not retried |
| Google not approved or disconnected | "Waiting: Google hasn't approved Strelva's access" | Resumes when the publishing path can write |
| Operating check fails | "Live, but a check failed: …" Not marked Made real | Operator fixes or rolls back |
| Process restarts mid-step | Nothing new | Resume reconciles `running` steps before anything else (`resume` in `runner.ts`) |
| Owner wants it gone after Made real | History: Restore per System | Native undo per channel (table in section 5) |

What can't be undone, and says so: Google posts and replies, sent messages,
and any effect whose adapter has no `compensate`.

## 8. Proof

- **Tests that exist and must keep passing:**
  - `systems-invariants`
  - `systems-from-existing`
  - `systems-store-contract`
  - `systems-supabase-store`
  - `possibilities-make-real`
  - `make-real-guards`
  - `systems-make-real-route`
  - `systems-projection`
  - `systems-experience`
  - `systems-runtime`
  - `system-health`
  - the `system-versions-*` set
  - `pnpm check:workspace-sql` (runs `tests/systems-schema.sql`)
  - `tests/systems-experience-ui.spec.ts`
- **New SQL tests** in `pnpm check:workspace-sql`:
  - Possibility compare-and-set, and cross-business denial
  - agency scope
  - the stale trigger on both revision RPCs
  - the new origin kinds keeping ids stable
  - an observed revision firing stale
- **Durability:**
  - Kill the worker after `perform` and before the checkpoint. Resume finds
    the accepted write and doesn't repeat it.
  - An `unknown` step is never replayed.
  - The epoch moves only after an undo.
- **Per channel, on the Strelva-owned test business in production:**
  - one Make real that lands, reads back and writes a receipt;
  - one undo;
  - one refused effect with live unchanged.
- **The moment as a journey.** Tested with an owner who never signs in:
  - preview link, then approve link, then partly live (Google waiting);
  - one email that matches the screen;
  - two receipts;
  - operator resume.
- **UI journeys (Playwright):**
  - The Home order.
  - Empty panels absent.
  - History restore.
  - Paused copy.
  - Member and agency views: no Make real.
- **Turn-on proof for each client:** the reconciliation output and one
  screenshot, attached to the flag change receipt.

## 9. Open decisions

Each recommendation is the working default (product-model, Oct 6). None of
them authorizes a production step.

1. **The heading over the cards.**
   - Options: (a) "Systems"; (b) no noun, with the cards directly under
     Needs you and the page titled with the business name; (c) "What
     Strelva runs for you".
   - Recommend (b). It is one constant, `SYSTEMS_LABEL`. "All systems and
     files" becomes "Everything".
2. **Approval granularity.**
   - Options: (a) one approval per plan; (b) one per effect.
   - Recommend (a). Owners who never sign in won't answer four emails.
     Calendar, message and payment effects aren't live at 1.0.0 anyway.
3. **Automatic rollback on partial failure.**
   - Options: (a) never; (b) after N days.
   - Recommend (a). A half-rolled-back state is worse than a named partial
     one. The operator decides.
4. **Undo after Made real.**
   - Options: (a) per System from History; (b) one-tap undo of the whole
     activation.
   - Recommend (a) at 1.0.0. (b) would need reverse plans the runner refuses
     today.
5. **Where Possibilities live.**
   - Options: (a) their own tables next to `systems.sql`; (b) a
     `saved_product_work` resource kind.
   - Recommend (a). The stale rule belongs in the same transaction as the
     revision pointer.
6. **Idle Possibilities.**
   - Recommend Strelva withdraws one after 90 days without activity, with a
     receipt. Alternative: keep them forever and let the operator queue list
     them.
7. **Rebuilds of custom-repo sites.** Publishing a rebuild serves it at
   `<tenant>.strelva.com`. The client's domain still points at its own repo
   (inference from `rebuild-service.ts` `launch`).
   - Recommend the domain move is not a Make real step. The result lists it
     as "Not done by Strelva: point greatlakesdriedfruit.com at the new
     site", and it is Jacob's yes per client. If the website-entry decision
     picks connected sites, this case shrinks.
8. **Moving a System between businesses.** The id hashes the workspace, so
   splitting or merging Twin Trees changes the System id.
   - Recommend no moves at 1.0.0. Settle Twin Trees with the owner before
     conversion (agency-and-versions decision).
9. **Signed previews without sign-in.** Recommend yes, expiring with the
   needs-you link life (14 days).
10. **A separate live flag per channel.** Recommend yes. It lets Systems
    Home ship before any live effect.

**Under the working assumptions:**

- Assumption 1 (new businesses through the same path): a new business has
  no tenant. Its Systems are `saved_work` origin. Nothing here changes
  except the website entry.
- Open decision 3 (website entry):
  - Paste-URL rebuild makes the rebuild Possibility the first thing a new
    business sees.
  - Connected sites add the `connected_site` origin and limit Possibilities
    to sections. The spec holds either way.
- Assumption 2 (no partner agencies): agency rights above apply to Strelva only.

## 10. Unknowns

**Facts, from code reading:**

- Possibilities and activations are in memory.
- Every adapter is isolated.
- The route is owner-only and synchronous.
- `systems.sql` is unapplied in production.
- No History block exists.
- Empty panels render.
- Home's Strelva handled shows done Requests.

**Inferences to check:**

- **Whether attymooney.com's repo can show a Strelva booking page.**
  `public_website_booking_grants` binds a booking to a tenant site, but
  whether a custom repo renders it is not shown in code here. Check: read
  the client repo for a bookings call.
- **Which native pointer matches what visitors see on a custom-repo site.**
  Is it `content_versions`, `site_snapshots`, or neither, because the repo's
  own code renders? Check one client: change a section, then diff.
- **Whether today's rebuild preview needs a sign-in.** Check
  `previewHref` from a signed-out browser.

**Not known, and blocking specific channels:**

- Google API approval and the consent-screen state (product-model problem 9).
  This blocks the Google channel.
- Whether client email works in production (problem 3). This blocks every
  Make real for owners who never sign in.

**Not measured:**

- Whether owners understand "Try it / Make it live" without explanation.
- Operator minutes per Make real.
- How often a Make real ends partly live.

Measure on the test business and gldf before the next client.
