# Deepening review, 2026-10-05

Nine proposals to replace shallow modules with deep ones, each with its domain
language, edge-case scenarios checked against the code, a recommended
interface, tests and migration steps. Status: proposed. No source code changed.
Everything here was proven by reading code locally; nothing was run in a
browser or against production.

Terms are merged into [GLOSSARY.md](../../../GLOSSARY.md), which defers to the
[product ontology](../product-ontology.md). Two decisions were promoted into
their owning docs: no staff bypass in [auth-tenancy](../auth-tenancy.md), and
message finality and the currentness rule in the
[inquiry spec](../../capabilities/inquiries/inquiry-first-product-spec-2026-09-11.md).

## The nine

| # | Note | Deepened module | Strength |
| --- | --- | --- | --- |
| 1 | [Workspace location](./01-workspace-location.md) | One pure location codec + `move()`; one history adapter | Strong |
| 2 | [Workspace records](./02-product-work-store.md) | Kind-scoped record handle, Postgres + memory adapters | Strong |
| 3 | [Inquiry message lifecycle](./03-inquiry-message-lifecycle.md) | Pure `transition`/`classify`, one verdict to event-actions | Strong |
| 4 | [Inquiry workspace](./04-inquiry-workspace.md) | One hydration of inquiry + engine; one intake operation | Strong |
| 5 | [Start request](./05-pending-request.md) | Small store with `edit`/`commit`/`clear`/`spend` | Strong |
| 6 | [Workspace permissions (client)](./06-workspace-capabilities.md) | Server-projected permissions on the snapshot | Worth exploring |
| 7 | [Workspace route](./07-workspace-route.md) | Declarative `workspaceRoute({ read, actions })` | Worth exploring |
| 8 | [System kind registry](./08-product-descriptor.md) | Browser-safe kinds table + server and view facet maps | Worth exploring |
| 9 | [Workspace authority](./09-workspace-authority.md) | Role→permission table shared with #6; SQL parity | Strong (was Speculative) |

## Names settled in the merge

Some notes were written before the glossary merge. Where a note and the
glossary disagree, the glossary wins.

| Term in a note | Glossary term | Why |
| --- | --- | --- |
| pending request, intent, start context | Start request | `pendingRequest` already names an assessment attempt |
| route (start destination) | Start route | "route" alone collides with HTTP routes |
| product work, saved work, bounded work | Workspace record | Work is finite; a website draft isn't |
| owning product | Owning kind | "product" now means Offering |
| inquiry capability | Inquiry intake | A Capability of the inquiry kind (ontology) |
| capability version | Capability Version | Ontology term; Revision only counts changes to a workspace record |
| workspace capabilities | Workspace permission | capability, standing, authority, allowance are taken |
| product, executable, horizontal | System kind (proposed) | product means Offering; overlaps the ontology's Capability until ADR 0011 is accepted |

## Defects found

Verified by re-reading the code:

- The operational inbox loads the first 500 rows of five tables across all
  workspaces with no filter or ordering, then filters in memory. Past 500
  rows, real assignments drop out (`src/products/operations/inbox.ts:90-94`,
  `:312-318`).
- After a deferred, bounced or suppressed send, the review screen tells the
  owner to prepare a new review, which can never send
  (`src/experience/inquiries/InquiryMessageReview.tsx:26-33`, `:156`).
- Owner approval requires a form status of `live`; intake and the follow-up
  cron accept `live_unverified` too (`delivery-approval-service.ts:233` vs
  `follow-up-cron.ts:113`).
- The Layout and the App map a work item to different views
  (`WorkspaceLayout.tsx:221` vs `WorkspaceApp.tsx:281`).
- A shared business home says only owners can make changes; admins and members
  can (`BusinessHome.tsx:95`).

Traced by the review agents, not re-verified line by line:

- A second review for the same inquiry and purpose resolves as already sent and
  records a receipt for a message that was never sent (note 3).
- If the provider accepts but the acceptance write fails, the provider id is
  lost and the approval stays pending forever (`delivery.ts:857-864`).
- A delivered report that arrives after the approval resolved never writes a
  receipt (`delivery-approval-service.ts:881-886`).
- Product-learning create shows a generic store error after workspace exit
  instead of "stopped" (note 2).
- Choosing the applications start route loses the request on reload
  (`WorkspaceLayout.tsx:312` → `WorkspaceApp.tsx:421` →
  `WorkPlanExperience.tsx:99`).
- An old routed request can prefill a later blank document in the same tab
  (note 5).
- Back from an offering's work loses the offering (note 1).
- The work-plan runner accepts an applications revision the applications domain
  rejects, so a step can pass recheck and fail at perform
  (`native-execution.ts:156-162` vs `applications/domain.ts:176-183`).
- A stale intake never queues a receipt repair (`receive.ts:261,265`).
- Two workspace routes read JSON with no size cap; onboarding upload reads the
  whole form before its size check (note 7).
- Six service-role writes are checked only in TypeScript: calendar connection,
  calendar receipts, revoke delegation, revoke handoff, create handoff, save
  work. All six checks are correct today (note 9).

No double-send path was found beyond a narrow window the provider idempotency
key very likely absorbs (note 3).

## Corrections to the architecture review

- The two wrong access labels in `WorkspaceApp.tsx:601,721` change nothing on
  screen: `normalizeWorkspaceWork` returns early when the server already
  attached the assessment (`result.ts:228`). The gap is on the server, where
  `presentWorkspaceWork` defaults to `owned`.
- There are about 50 hand-built `/workspace?` links, not 10, several
  server-side and one inside a JSON response.
- Several counts drifted by one or two; each note lists its corrections.

## Order

1. Fixes that need no migration, each its own change: review-screen status
   lists and copy, the two permission copy lines, scoped inbox queries,
   product-learning exit mapping, body caps, the applications-route reload.
2. Workspace location (#1) with the front-end half of the System kind registry
   (#8), then Start request (#5).
3. The shared role→permission table (#9, #6), then the workspace route adapter
   (#7).
4. Workspace records in TypeScript over the existing functions (#2 steps 1-5).
5. Inquiry workspace (#4), then the inquiry message lifecycle (#3).

Needs Jacob's yes: SQL functions and migrations (#2 step 6, #9 steps 4-5), the
`pg` dev dependency, every production deploy, and any change on the live
inquiry email path.

## Questions for Jacob

1. May an owner approve a reply while the published form is `live_unverified`?
   Automatic follow-ups already send in that state. Recommended: yes, one rule.
2. After a republish, inquiries captured on the older revision can't get any
   message. Bind them to the captured revision, to current routing, or mark
   them "handle outside Strelva"?
3. After a bounce or suppression, may a corrected message ever be sent for the
   same inquiry and purpose? What should the owner see for deferred?
4. After a workspace stops, may people still edit existing documents, trackers
   and onboarding cases? The database allows it; the app assumes not.
5. While businesses leave the tenant model, which role governs a business:
   the tenant role or the workspace role? Today a workspace owner can install
   offerings but gets a 403 on inquiries for the same business.
6. Is ADR 0011 firm enough to name code after System? Are ongoing checks and
   delegated work Systems the business owns, or Work Strelva does?
7. Should a plain member set up ongoing work and custom apps? The UI blocks
   it; the server doesn't.
8. Delegated read: every member of the agency, or named people?
9. Should a start request survive sign-out or follow a person to another
   device?
10. OK to add `pg` as a dev dependency for one contract suite across both
    record adapters?
