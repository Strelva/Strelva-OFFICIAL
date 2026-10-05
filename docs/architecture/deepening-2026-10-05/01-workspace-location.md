# Workspace location

Status: proposed · 2026-10-05 · candidate 1 of 9 · source: architecture review

## What it is

One in-process module that owns where a person is inside the workspace: which
workspace, which section or opened work, and the detail inside it (a standing,
an assignment, an inquiry record, a tracker row, an offering). Its interface in
one sentence: parse a URL into a location, apply a named move to get the next
location and whether it is a new history entry, and encode any location as an
href. It hides the query-parameter names, the allowlists and ID formats, the
precedence rules (a standing beats `view`), the old aliases (`ongoing` and
`operations`, `access` and `agency`), the work-kind-to-tool table, which detail
a move must drop, push-versus-replace, and the return-target check that sign-in
relies on. Today that knowledge is spread across `WorkspaceApp.tsx` (29
`useState`s, 18 history writes), `WorkspaceLayout.tsx` (a second state machine,
6 history writes), `workspace-selection.ts`, `lib/workspace-location.ts`, and
about 50 hand-built `/workspace?` strings, some of them in server code.

## Language

**Workspace location**:
Where a person is inside one workspace: the workspace, the section or opened work, and any detail within it. It is a navigation hint; it never grants access.
_Avoid_: view, route, page, state, URL

**Section**:
One of the fixed destinations every workspace has: Home, Work, Ongoing, People & access, Settings, Help, Explore, and Start.
_Avoid_: view, tab, page, area

**Opened work**:
A single saved Work shown in the tool that fits its kind, or a new Work being made in that tool.
_Avoid_: selected work, horizontal view, product view

**Location detail**:
The part of a workspace location that only makes sense inside one section or opened work, such as a standing, an assignment, an inquiry record, a tracker row or an offering.
_Avoid_: embedded route params, sub-view, sub-route

**Return target**:
A workspace location that is safe to carry through sign-in and reopen afterwards. Anything that cannot be read back exactly is refused, not repaired.
_Avoid_: next, redirect, continue URL

Overloads found while naming:

- "view" means a URL key, a sidebar section (`settings`), a tool (`tracker`)
  and an alias (`ongoing`). The key stays in URLs; the word leaves the code.
- "work" means the Work section (`view=work`), a saved Work id (`work=`), and
  the app's fallback for assessment results (`View = "work"`).
- "agency" is the app's name for the People & access screen
  (`WorkspaceApp.tsx:662`), and also a workspace kind. Use People & access.
- "horizontal" (`HorizontalView`, `startHorizontal`) has no domain meaning. It
  means "a product tool that is not tracker, document or plan."
- "operations" and "ongoing" name the same place. Ongoing is the domain word.

## Scenarios

| Scenario | Today | With the module |
| --- | --- | --- |
| Explore → an offering → open one of its Work items → Back | Layout `openWork` (`WorkspaceLayout.tsx:215`) calls `onChoose` first; App `chooseWork` (`WorkspaceApp.tsx:283-286`) `replaceState`s the *current* entry, deleting `offering` and `standingId`, and only then Layout pushes (L222). Back lands on Explore without the offering. | `move` returns one push. The entry being left is never rewritten. Back shows the offering. |
| Open a website Work from the Work list, then reload or go Back | Layout maps `websites` to `view=work` (L221); App sets its view to `websites` (L281). Reload recovers through the saved-work fallback (`workspace-selection.ts:28`), but Layout's popstate (`initialSection`, L76-82) reads `view=work` as the Work section, while the plan path (`openWorkFromPlan`, L307) writes `view=websites`. Same Work, two URLs, two sidebar states. | One table maps a work kind to its tool. `openWork` encodes `view=websites&work=…` from every caller. |
| Explore → offering → Inquiries product → "Open [business]" → reload | `onOpenProduct` (L450) clears the offering in state but not in the URL. `openInquiry` (L225-236) deletes only `work` and `inquiry*`, so the URL becomes `view=inquiries&tenantId=…&offering=…`. On reload Layout's `initialOfferingId` (L91) brings the offering back. Signed out, `workspaceReturnTarget` refuses the URL (`offering` requires `view=products`, `workspace-location.ts:36`), so sign-in returns to Home. If a `standingId` is left over instead, `selectWorkspaceLocation` lets it win (`workspace-selection.ts:28`) and reload opens Ongoing. | Encoding writes only what the location holds. Leftover detail cannot exist, so no clear-lists are needed. |
| Switch workspace in the selector, then Back | `onWorkspace` (`WorkspaceApp.tsx:682`) calls `replaceWorkspaceLocation`, then `replaceState(null, …)`, wiping `history.state`. No entry is added, so Back skips to the page before the switch, in the old workspace. | `switchWorkspace` is a push. Back returns to where you were before switching. |
| Agency opens a client's Work from agency home, then Back | `openClientWork` (L431-443) uses `replaceState`, so the agency-home entry is overwritten and Back leaves it. | A push, like every other "open" move. |
| Signed-out owner taps an offering's inquiry link | `platform/offerings/definitions.ts:66` builds `view=inquiries&inquiryWorkspaceId=…`. Nothing reads `inquiryWorkspaceId`. `workspaceReturnTarget` refuses unknown keys (`workspace-location.ts:41`), so after sign-in the owner lands on Home. `products/websites/server.ts:133,141` has the same problem with `revision=`. | Server code calls `workspaceHref(move)`, which cannot emit a field the location does not have. The link must name a real detail or fail to compile. |
| Back and forward through five entries | Two popstate listeners: App (L158-166) refetches the whole snapshot on every step; Layout (L112-116) re-parses `view` with its own rules. Which one wins depends on listener order. | One listener in the browser adapter emits one location. WorkspaceApp decides whether to refetch (step 3 keeps today's behavior). |
| Read-only (delegated) member deep-linked to `view=start` or `view=tracker` | `initialStartOpen` (L86-89) opens Start without the read-only check that `openStart` applies (L273). `startTracker` checks only `workspaceExitBlocks` (L344). Rendering passes `readOnly` on, so nothing is written. | Unchanged on purpose: the location stays permission-free. The resolved location says "Start" and the render applies read-only. |

## Contradictions in the code

- `selectWorkspaceLocation` says "Resolve navigation only"
  (`workspace-selection.ts:8`), but it also decides `showAssessment` from
  workspace exit state. That is a render decision.
- `replaceWorkspaceLocation` (`lib/workspace-location.ts:75`) writes only
  `workspaceId` and `work`, and deletes `offering` as a side effect. It is a
  partial patch, not a location.
- `chooseWork` (`WorkspaceApp.tsx:268-287`) writes no `work` and no `view` to
  the URL. It depends on Layout pushing afterwards; called alone, reload loses
  the choice.
- `openOngoing` (L427) and `onAgency` (L662) change the screen without touching
  the URL; Layout's `navigate` and `openAccess` do the writing. Correctness
  depends on every caller pairing them.
- `trackerWork` is deleted by both clear functions (App L320, Layout L188).
  No code writes or reads it.
- The VIEWS allowlist has both `ongoing` and `operations`. Layout writes
  `ongoing` for operations Work (L221), App writes `operations` (L460,
  L467), and the sidebar writes `ongoing` (`StrelvaSidebar.tsx:14`).
- `app/admin/work/workspace-href.ts` is a second workspace href builder, with
  host rules of its own.
- `/api/public-continuation/import` returns a workspace `location` string in
  JSON (`route.ts:68`). That makes the URL format part of a response contract,
  so the codec must stay backward compatible.

## Interface

```ts
// src/lib/workspace-location.ts — pure, usable on server and client
export type Section = "home" | "work" | "ongoing" | "access" | "settings" | "help" | "products" | "start";
export type Tool = "assessment" | "tracker" | "document" | "plan" | "websites" | "custom-applications"
  | "onboarding" | "applications" | "scheduling" | "investigations" | "operations" | "product-learning";

export type WorkspaceLocation = {
  workspaceId: string | null;
  place:
    | { at: "section"; section: Section; offeringId?: string; templateId?: string; searchFocus?: true }
    | { at: "work"; tool: Tool | null; workId: string | null; rowId?: string } // workId null = new
    | { at: "ongoing"; standingId?: string; assignmentId?: string }
    | { at: "inquiries"; tenantId: string | null; inquiryView?: InquiryView; requestId?: string; recordId?: string };
  saveResultId?: string; // public result waiting to be saved; survives moves until cleared
};

export type Move =
  | { to: "section"; section: Section; searchFocus?: true }
  | { to: "offering"; offeringId: string | null }
  | { to: "work"; workId: string; workKind: string }   // open saved Work; tool comes from its kind
  | { to: "tool"; tool: Tool }                          // start new Work in a tool
  | { to: "saved"; workId: string }                     // new Work just saved: same tool, replace
  | { to: "standing"; standingId: string }
  | { to: "assignment"; assignmentId: string }
  | { to: "inquiries"; tenantId: string }
  | { to: "workspace"; workspaceId: string; workId?: string } // switch, or a client's Work
  | { to: "save-done" };

export function parseLocation(search: string | URLSearchParams, mode: "lenient" | "strict"): WorkspaceLocation | null;
export function encodeLocation(location: WorkspaceLocation): URLSearchParams;
export function move(from: WorkspaceLocation, m: Move): { location: WorkspaceLocation; entry: "push" | "replace" };
export function workspaceHref(to: WorkspaceLocation | Move, options?: { base?: string; workspaceId?: string }): string;
export function returnTarget(raw: string | null): string | null; // strict parse → encode; also the fixed delivery/business-new/account paths

// Needs the loaded snapshot: missing Work, default first Work, product availability, default inquiry business.
export function resolveLocation(location: WorkspaceLocation, data: LocationData, inquiry?: { tenantId: string }): ResolvedLocation;

// src/experience/workspace/useWorkspaceLocation.ts — browser adapter
export function useWorkspaceLocation(): { location: WorkspaceLocation; go(m: Move): void; href(m: Move): string };
```

Invariants: `parseLocation(encodeLocation(x), "strict")` deep-equals `x`.
`move` never yields leftover detail. The location never carries request text
(that belongs to #5) and never encodes permission. `strict` returns `null` on
any unknown key, repeated key, bad ID, or detail outside its place; `lenient`
drops those instead, because old links must still open.

Alternatives considered:

- **A navigator object with one method per transition** (`openWork`,
  `startTracker`, …). It mirrors today's 15 functions. The interface grows with
  every tool and stays as wide as its implementation, so it is shallow.
  Rejected.
- **Real App Router paths** (`/workspace/[id]/work/[workId]`). This is the
  biggest gain for server rendering, but it breaks links already sent in
  email, inbox `deepLink`s and the public-continuation response, and it splits
  one client app into route segments. Hard to reverse. The codec above makes
  this a later swap of `encodeLocation`, so it is not chosen now.
- **A reducer that also owns start context and loading** (one big
  `useReducer` for all 29 states). It absorbs #5's job and data loading, so
  location tests would need fetch fakes. Rejected. Keep the location pure and
  hand start context to #5.

## Behind the seam

- Param names, the VIEWS and INQUIRY_VIEWS allowlists, ID and UUID formats,
  and which detail is allowed under which place (today's
  `workspaceReturnTarget` ternary chain).
- Aliases on read: `view=ongoing|operations` and any `standingId` or
  `assignmentId` mean Ongoing; `view=access` means People & access. One spelling
  on write: `ongoing` for the section, `operations` only with standing or
  assignment detail, as the current tests expect.
- The work-kind → tool table. When #8 (product descriptors) lands, this table
  is read from the registry. Until then it lives here, once.
- Push-versus-replace: opens and switches push; `saved`, `save-done` and the
  post-load canonicalisation replace.
- `base` and `appBase` prefixing, and the "workspaceId from the URL, else the
  snapshot" fallback.

Adapters at the seam: (1) the browser adapter `useWorkspaceLocation`, with one
history writer and one popstate listener; (2) plain strings from `workspaceHref`
for server code (inbox `deepLink`, offering definitions, website preview
links, the admin builder, the public-continuation response) and for `<a href>`;
(3) an in-memory history in tests. That makes three real adapters, so the seam
is real.

## Tests

- Keep: every `workspaceReturnTarget` case in `workspace-location.test.ts`,
  `workspace-launch-return.test.ts`, `business-start.test.ts` and
  `workspace-template-location.test.ts`. `workspaceReturnTarget` stays as an
  alias of `returnTarget` until callers move. Cases where the input order is
  not canonical will need their expected string reordered; nothing else in
  them changes. `accountReturnTarget` and `workspaceInvitationReturnTarget` are
  untouched.
- Replace: the 4 `workspace-selection.test.ts` cases become `resolveLocation`
  cases. The `replaceWorkspaceLocation` case (L62) becomes a
  `move({to:"workspace"})` case.
- New, through the interface: a round trip for every place and detail; one
  `move` test per scenario row above; a "no leftover detail" test that runs
  each move from every place; a characterization test that runs every
  hand-built href through `workspaceHref` and checks the string is unchanged
  (the `inquiryWorkspaceId` and `revision` links fail it on purpose); and an
  adapter test with in-memory history (one popstate, one location, one write).
- Playwright: the 34 specs that hit `/workspace?` stay unchanged, because URLs
  stay compatible. Add one spec for offering → Work → Back.

## Migration steps

1. Grow `lib/workspace-location.ts` into `parseLocation`, `encodeLocation` and
   `returnTarget`, with `workspaceReturnTarget` delegating to it. Add the
   characterization tests. No behavior change. Proven locally.
2. Add `workspaceHref` and replace the hand-built strings, client first, then
   server (`inbox.ts:367`, `offerings/definitions.ts:43,66`,
   `websites/server.ts:133,141`, `admin/work/workspace-href.ts`,
   `public-continuation/import/route.ts:68`). The inquiry link needs a decision
   (see questions). The response string must not change.
3. Add `move` and `resolveLocation`. Route all 18 App writes and 6 Layout
   writes through `useWorkspaceLocation`. Delete both clear functions,
   `initialSection`, `initialStartOpen`, `initialOfferingId`, and
   `workspace-selection.ts`. Layout reads its section from the location.
   Behavior changes: the four scenarios above that are fixed.
4. Collapse to one popstate listener. Keep the refetch-on-Back for now, and
   measure before dropping it.
5. Hand the five start contexts, `planStartRequest` and `horizontalRequest` to
   #5 (PendingRequest). Point the kind → tool table at #8's registry.

No step needs a migration, env change, live email or Google write. Each step
reaches customers only through a production deploy, which needs Jacob's yes
and the release checklist. `/api/v1` and client sites are untouched; no client
repo links to `/workspace?` (checked `custom-repo-starter/`).

## Decisions worth an ADR

None yet. Keeping query parameters is the cautious default and easy to
revisit, because the codec isolates it. Moving to App Router path segments
would deserve an ADR: links already sent in email and API responses would need
permanent redirects.

## Open questions for Jacob

1. Offering inquiry links (`definitions.ts:66`) carry an `inquiryWorkspaceId`
   that the workspace has never read, so they open the default business. Should
   the link open that specific business's inquiries (a real fix that ships
   with step 2), or should it stay unchanged until inquiries move onto the
   workspace model?
2. None of the other choices here need Jacob. Push on workspace switch and
   client-Work open is a UX default we can reverse.
