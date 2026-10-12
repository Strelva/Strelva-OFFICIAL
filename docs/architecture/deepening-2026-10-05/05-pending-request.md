# Start request

Status: proposed · 2026-10-05 · candidate 5 of 9 · source: architecture review

## What it is

A person types "Organize supplier onboarding requirements" on Home, picks
Onboarding on New, reloads, and the onboarding product opens with that sentence
already in it. Today that sentence travels through three records and seven
channels: a per-keystroke draft in browser storage, a second `:continuation`
record with its own route list, Layout state (`requestText`, `requestRoute`,
`requestCurrent`, `startDraft`), six hand-reset slots in `WorkspaceApp`, a
separate `helpRequest` for Help, and a copy-pasted merge in four products.
Seven commits on 2026-09-22 each patched one path through that web.

The proposal: one module owns the words a person writes before any work exists,
from first keystroke to the moment a product saves work from them. Callers say
`edit`, `commit(route)`, `clear`; products ask `useRequestFor(route)`. Storage,
hydration timing, scope keys, route checks and precedence live behind the seam.

This is the input side of ADR 0011's **Make** verb. It is not Work, not a
service request, and grants no authority.

The candidate was called "pending request". That name is taken: `pendingRequest`
in `WorkspaceApp.tsx:91` is an in-flight assessment attempt id, and
`useWorkspaceRequest` is the HTTP transport. The canonical name below is
**Start request**.

## Language

**Start request**:
The words a person writes to say what they want Strelva to make happen, before any work exists. It is request data only and never permission to run, share or publish anything.
_Avoid_: pending request, intent, prompt, continuation, start context, retained request

**Draft**:
A start request while the person is still writing it and has not aimed it at anything.
_Avoid_: request draft (as a separate record), composer text, seed

**Routed request**:
A start request the person has aimed at one route, waiting for that product to open new work with it.
_Avoid_: continuation, start context, horizontal request, plan start request

**Route**:
A destination a start request can be aimed at, such as a document, a work plan, onboarding or Help.
_Avoid_: view, product id (when the destination is meant), start route

**Spent request**:
A routed request whose product has saved work from it; from then on the Work carries the words and the start request is gone.
_Avoid_: consumed intent, used draft

**Cleared request**:
A start request the person explicitly emptied. It stays empty and never comes back from an older copy.
_Avoid_: reset, discarded draft

**Service request**:
A start request sent to a human provider through Help. It is not an accepted job until scope and deadline are agreed.
_Avoid_: job, ticket, provider commitment (until accepted)

Relationships: one person + one workspace has at most one start request. A
start request becomes Work only through a product save; a routed request to
Help becomes a service request, which becomes a provider commitment only on
acceptance. A public continuation (signed-out result imported at sign-in,
`lib/public-continuation.ts`) lands as saved Work, so it is not a start request.

## Scenarios

| Scenario | Fix commit | Today (verified) | With the module |
| --- | --- | --- | --- |
| Pick a route on New, go Home, edit, continue | 23730a2a, d9646d2a, 98520228 | Composer wrote only storage; Layout `requestText` kept the routed text and won in `WorkspaceIntent.tsx:36`. Fixed by threading `onEdited(value)` Composer→`BusinessHome.tsx:98`→`rememberRequest` (`WorkspaceLayout.tsx:427`). | `edit()` un-routes the request. No callback chain. |
| Edit on New, navigate away and back | c4070ad8 | `WorkspaceStart` kept its own copy; now `onChange`→`onDraftChange` (`WorkspaceStart.tsx:179`), and `openStart` re-reads storage (`WorkspaceLayout.tsx:273`). | Composer reads `draft` from the module; there is no second copy to go stale. |
| Edit after a proposal is shown | e2481bfe, 9cd72961 | `setPlan(null)` on change (`WorkspaceStart.tsx:179`); test `workspace-composer-continuity.test.tsx:25`. | Unchanged; the proposal stays local to Start. |
| Clear the composer, navigate back | d32d445b | `""` fell through to the retained record and resurrected it. Patched with a `current` flag (`WorkspaceIntent.tsx:36`, `WorkspaceLayout.tsx:97,256`). | `clear()` writes a cleared state; precedence row 5. |
| Product mounts before storage is read | d32d445b | rAF restore (`WorkspaceIntent.tsx:22-35`); each of four products hand-gates on `!intent.ready` (`DocumentExperience.tsx:36`, `WorkPlanExperience.tsx:98`, `OnboardingWorkspaceExperience.tsx:9`, `BoundedWorkExperience.tsx:84`). | `useRequestFor` returns `loading` on the server snapshot only, then a synchronous read. No rAF. |
| Native product reached into the shell | e2481bfe, 9cd72961, d32d445b | `products/onboarding` imported `useWorkspaceIntent`; moved to a wrapper, which first used any route's text, then gained a route check. | Products receive text via one hook in the experience layer; `src/products` never imports it. |
| Reload mid-start | none | `startDraft` starts `""` (`WorkspaceLayout.tsx:98`); Composer restores text after hydration (`WorkspaceComposer.tsx:35-42`) but the proposal is not rebuilt. | Start reads `draft` synchronously; proposal can be rebuilt on first render. |
| Choose "applications", reload the plan | none (live gap) | Continuation stored with route `applications` (`WorkspaceLayout.tsx:312`), but `startHorizontal` sends it to the plan view (`WorkspaceApp.tsx:421`) and the plan matches only `"plan"` (`WorkPlanExperience.tsx:99`). After reload the request is gone. Code-traced, not browser-run. | Route aliases live in one table; `applications` resolves to the plan route. |
| Switch workspace with a draft | none | Keys are per actor+workspace (`request-draft.ts:10`); Layout is keyed by workspace (`WorkspaceApp.tsx:650`); switch resets 4 of 6 slots by hand (`WorkspaceApp.tsx:682`; not `assessmentStartContext` or `horizontalRequest`). | Scope change swaps records; no slots to reset. Draft returns when you switch back. |
| Same session, second "New document" after saving one | none (live gap) | `:continuation` is never removed except at sign-out (`WorkspaceSignOutButton.tsx:34`), so a later blank document can prefill the old routed text (`DocumentExperience.tsx:37`). Code-traced. | Saving work spends the request (row 6). |
| Two tabs | none | Session storage is per tab; a duplicated tab copies the draft. | Same. The module adds no cross-tab sync. |
| Sign-in round-trip from a public page | n/a | Handled by the server-side public continuation cookie; start requests are wiped on sign-out. | Out of scope; `forget()` replaces `clearRequestDrafts`. |

## Contradictions in the code

1. **Two route lists that disagree.** `WorkspaceIntent.tsx:10` allows `start`
   and `plan`; `WorkspaceStartRoute` (`workspace-start.ts:3`) has neither. They
   are not duplicates: the first is a superset. Hand the list to candidate #8.
2. **Opposite precedence.** `WorkspaceIntent` prefers memory over storage;
   `openStart` and `startProduct` prefer storage over memory
   (`readRequestDraft(...) || requestText`, `WorkspaceLayout.tsx:273,389`). If a
   storage write fails, the stale stored text wins.
3. **The `applications` route is rewritten to the plan view but stored as
   `applications`** (scenario above).
4. **Nothing ever spends a routed request.** `retainRequestIntent` only sets.
5. **Two identical callbacks.** Composer fires `onChange` and `onEdited` on
   every keystroke (`WorkspaceComposer.tsx:58-59`). Each Home keystroke writes
   storage three times (Composer, then `rememberRequest` writes both records).
6. **Inconsistent gates.** Onboarding skips on `initialCaseId`, the others on
   `workId`; BoundedWork matches `intent.route === productId`, Plan matches
   `"plan"`, Document matches `"document"`.
7. **Help is a seventh channel** (`helpRequest`, `WorkspaceLayout.tsx:107`).
8. **`BusinessHome.tsx:98` computes the draft key itself**, duplicating
   `WorkspaceLayout.tsx:100`.
9. **Name collision**: `pendingRequest` already means an assessment attempt id.

## Interface

Designed three ways:

- **A. React context + hooks only.** Familiar, but logic lives in a provider,
  tests need React, and hydration still needs an effect.
- **B. Text in the URL** (`?request=`). Survives reload and share for free, but
  puts private business text in history, logs and referrers, and caps length.
  Rejected for the text. The route can ride the URL via candidate #1.
- **C. A small store with `subscribe`, plus a thin hook adapter.** Logic is
  plain TypeScript, tests need no DOM, `useSyncExternalStore` gives a real
  `loading` server snapshot. **Recommended.**

```ts
export type RequestRoute = WorkspaceStartRoute | "plan";   // list owned by #8
export interface RequestScope { actorEmail: string; workspaceId: string }
export type RequestFor =
  | { status: "loading" }
  | { status: "none" }
  | { status: "ready"; text: string };

export interface StartRequestStore {
  draft(): string;                       // what the composer shows
  edit(text: string): void;              // every keystroke; un-routes
  commit(route: RequestRoute): void;     // aims the current text at route
  clear(): void;                         // explicit; never resurrects
  spend(route: RequestRoute): void;      // product saved work from it
  requestFor(route: RequestRoute): RequestFor;
  subscribe(listener: () => void): () => void;
}
export function createStartRequestStore(scope: RequestScope, storage: RequestStorage): StartRequestStore;
export function forgetStartRequests(storage: RequestStorage): void; // sign-out

// React adapter
export function StartRequestProvider(p: { scope: RequestScope; storage?: RequestStorage; children: ReactNode }): JSX.Element;
export function useStartRequestDraft(): { text: string; edit(t: string): void; clear(): void; durable: boolean };
export function useStartRequestActions(): { commit(r: RequestRoute): void; spend(r: RequestRoute): void };
export function useRequestFor(route: RequestRoute, opts?: { existingWork?: boolean }): RequestFor;
```

Navigation stays out: `continueStart` becomes "commit route, then navigate"
(candidate #1). Route-specific choices (business, site, tracker template,
included parts) travel with the location, not with the text.

Precedence for `requestFor(route)`:

| # | Situation | Result |
| --- | --- | --- |
| 1 | Product is showing existing work (`existingWork`) | `none` |
| 2 | Server render / before the first client read | `loading` |
| 3 | Committed to this route (after alias, e.g. `applications`→`plan`) | `ready` with the text |
| 4 | Committed to another route, or a draft not committed | `none` |
| 5 | Cleared | `none`, including after reload |
| 6 | Spent | `none` |
| 7 | Other actor or workspace | `none` (separate record) |
| 8 | Record corrupt, oversized, wrong version or unknown route | `none` |
| 9 | Storage unavailable | rows 3-6 from memory; lost on reload; `durable: false` |

Memory and storage never compete: storage is read once per scope, then memory
is a write-through copy. That deletes contradiction 2.

## Behind the seam

- `RequestStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">`.
  Two adapters: `sessionStorage` and an in-memory map (tests, blocked storage).
- One record per scope under the existing `strelva:request-draft:` prefix, so
  sign-out clearing keeps working: `{ version: 2, text, route | null, state:
  "draft" | "routed" | "cleared" | "spent" }`, text capped at 3,000 characters.
- On first read, migrate the v1 draft and `:continuation` records into one v2
  record (routed if the two texts match, draft otherwise), then delete them.
- Route aliases and the allowlist come from one table (from #8 when it lands).

## Tests

- **Survive:** `workspace-composer-continuity.test.tsx` (stale proposal, IME
  composing); the "native output retry" block of `request-continuity-ui.test.tsx`
  (unrelated to this module); `website-request-draft.test.ts`; the browser specs
  `illustrated-home.spec.ts:63-78` and `self-service-library.spec.ts`.
- **Replaced:** the three "native request restoration" tests
  (`request-continuity-ui.test.tsx:28-59`) become store tests.
- **New, store (no DOM):** one test per precedence row; v1→v2 migration;
  `edit` after `commit` un-routes; scope isolation; `forget` removes all scopes.
- **New, provider with in-memory storage:** edit on Home → commit `document` →
  unmount → remount → `useRequestFor("document")` is ready; clear → remount →
  none; switch scope → none → switch back → draft returns; `applications`
  resolves for the plan; save → spent.
- **New, browser:** Home → Start → choose route → reload → product shows the
  text; then edit on Home → continue → product shows the new text. Today's
  specs cover Home → Start → plan without reload or edit-after-route.

## Migration steps

Each step ships alone and keeps behaviour.

1. Add the store, adapters and tests. Unused.
2. Re-implement `WorkspaceIntent` / `useWorkspaceIntent` on top of the store;
   four products unchanged. Fixes the `applications` alias.
3. Composer takes `edit`/`clear` from the hook; drop `draftKey`, `onChange`,
   `onEdited`, `onDraftChange`, `rememberRequest`, `startDraft`.
4. Replace the four product merges with `useRequestFor`; delete
   `planStartRequest`, `horizontalRequest` and the `.request` reads of the
   context slots in `WorkspaceApp`.
5. Call `spend` from each product's first save. Fold `helpRequest` in.
6. Delete `WorkspaceIntent.tsx`, the v1 readers and `ROUTES`, one release later.

## Decisions worth an ADR

**Start requests stay in the browser tab and never reach the server until a
product saves work.** Hard to reverse (once stored server-side it carries
retention and access duties), surprising (a draft does not follow you to your
phone), and a real trade-off (privacy and zero retention against cross-device
continuity). Record it only if Jacob confirms the first open question.

## Open questions for Jacob

1. Should an unsent start request follow a person across devices or past
   sign-out? Today it dies with the tab and is wiped at sign-out.
2. After a product saves work from a routed request, should the words be spent
   (proposed), or stay so "make another like this" starts pre-filled?
3. Switching workspace keeps each workspace's draft for when you return. Keep
   that, or clear it on switch?
4. When a routed request becomes a service request in Help, is it spent at send
   or at provider acceptance?
