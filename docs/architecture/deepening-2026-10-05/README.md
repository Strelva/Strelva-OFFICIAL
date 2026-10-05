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

## Defects found and fixed

Each fix landed with a test that failed before it. Proven locally on branch
`fix/deepening-2026-10-05`; nothing is deployed.

| Defect | Fix |
| --- | --- |
| Operational inbox read the first 500 rows of five tables across every workspace | Queries only the actor's assignments, then related rows by id |
| Review screen invited a new review after deferred, bounced or suppressed sends | One shared classifier; accepted messages never offer another review |
| Approval required `live`; intake and the cron accepted `live_unverified` | One currentness rule (`currentness.ts`) used by all three |
| Layout and App mapped a work item to different views | One `viewForWork` |
| "Only owners can make changes" and "a workspace you own" copy | Copy names the real read-only reason |
| A second review could record a receipt for a message never sent | Checkpoints store the sent message digest; mismatches are refused |
| Provider id lost when the acceptance write failed | Bounded retries plus a second copy on the approval event for repair |
| A delivered report after the approval resolved wrote no receipt | The webhook writes the owed receipt once |
| Product-learning create showed a store error after workspace exit | Maps to the stopped-workspace message |
| Applications start route lost its request on reload | One alias table for routed requests |
| Old routed requests prefilled later blank work | Requests are spent when a product saves work |
| Back from an offering's work lost the offering | Leaving an entry never rewrites it |
| Runner recheck accepted applications revisions the domain rejects | Recheck calls the domain's own check |
| Stale intake never queued a receipt repair | Queues the repair |
| Approval, cron and intake chose different responsibilities | One selector: newest created |
| Unbounded JSON bodies and late upload size checks | Bounded reads; oversized bodies return 413 |
| Session lookup outside error handling crashed with 500 | Returns 503 |
| Missing Referrer-Policy on 11 routes | Header set |
| Server labelled a member's new assessment as owned | Same work-access rule as reads |
| Six service-role writes checked only in TypeScript | Eight SQL-checked RPCs with locked membership reads; **migrations not applied** |

Not fixed: inquiries captured on an older capability version still can't
receive messages (question 2 below); `listOperationalExceptions` (operator only)
still reads unfiltered rows; tracker requests are not spent on save.

## Corrections to the architecture review

- The two wrong access labels in `WorkspaceApp.tsx:601,721` change nothing on
  screen: `normalizeWorkspaceWork` returns early when the server already
  attached the assessment (`result.ts:228`). The gap is on the server, where
  `presentWorkspaceWork` defaults to `owned`.
- There are about 50 hand-built `/workspace?` links, not 10, several
  server-side and one inside a JSON response.
- Several counts drifted by one or two; each note lists its corrections.

## Order (for the larger refactors)

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
