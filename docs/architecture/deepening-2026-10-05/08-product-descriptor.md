# System kind registry

Status: proposed · 2026-10-05 · candidate 8 of 9 · source: architecture review

## What it is

Strelva can make and run a handful of things for a business: a website, a
schedule, a private application, a document, a tracker, an ongoing check. Today
nothing in the code says that list once. Each layer keeps its own copy of the
ids, labels and branches, and adding one more kind means touching about 35
places in 16 files. Two of those lists don't share a single id.

This module is one record per **System kind**, with an id type every layer
derives from. It's in-process: plain data and functions, no I/O. Candidates #1
(WorkspaceLocation), #5 (PendingRequest) and #2 (product work store) read their
view, route and persistence tables from it.

## Language

**System**:
A thing a business has made in Strelva and keeps using, such as its website, a schedule or a private application. It keeps its identity while its content and behaviour change.
_Avoid_: product, project, installation, app (as the general noun)

**System kind**:
A type of System that Strelva knows how to make and run, such as a website, a schedule or a document. A System has exactly one kind for its whole life.
_Avoid_: product, executable, horizontal, native product, capability, tool

**Capability**:
One action Strelva may take on a System, with its authority, cost limit and proof of result declared before it runs.
_Avoid_: operation, executable, adapter, command (for the declared action), skill

**Entrance**:
The way a Capability gets started: from a reviewed work plan, from ongoing delegated work, on a schedule, or by a person acting directly.
_Avoid_: trigger, channel, surface, source

**Offering**:
A specific promise that packages one or more System kinds with completed work or ongoing help, with explicit limits and provider commitments. It's how kinds are sold. It isn't what the customer navigates.
_Avoid_: product, plan, catalog entry, SKU

## Term map

| Code term (where) | Canonical term |
| --- | --- |
| `WorkspaceExecutableId` / `WORKSPACE_EXECUTABLES` (`platform/products/executables.ts`) | System kind |
| `HorizontalView` (`workspace-selection.ts`), `?view=` slug | the System kind's view slug. Implementation-only |
| `productId` on saved work and `WorkspaceWork` | System kind id. The wire and column name stays `productId` because it's persisted |
| `ProductId` / `ProductDefinition` / `PRODUCT_CATALOG` (`catalog.ts`) | Offering (promise, release posture, distribution). Not a System kind |
| `ProductOperation` (catalog) | an Offering's described action. Implementation-only, not a Capability |
| `WorkspaceProduct` (snapshot `products[]`) | availability of an Offering *or* a System kind. It mixes both, so split it |
| `ExecutableCapabilityDefinition`, `capabilityId`, `step.operation` (`server/capabilities.ts`, runner) | Capability (matches ADR 0007's "capability definition") |
| `adapterKey`, `ExecutableCapabilityAdapter` | implementation-only (the seam a kind fills) |
| `family` (capability) | implementation-only and redundant. Delete it (`"managed-websites"` ≠ `productId: "websites"`) |
| `CapabilityEntrance` (`planner`/`runner`/`schedule`/`api`/`contextual`/`event`) | Entrance |
| native output, `nativeProductId` (`work-plans/native-output.ts`) | a plan output that creates a System. "Native" is implementation-only |
| `InquiryCapabilityDefinition`, inquiry `capabilityId` | a System of kind inquiries (its form, rules, follow-up). *Not* a Capability. Rename |
| `WorkspaceStartOutcome: "Capability"` (start copy) | UI copy only. Avoid the word on screen |
| "working capabilities" (AGENTS.md prose), #6's "workspace capabilities" | System kinds. #6 is renaming its term to avoid this collision |
| Installation (CONTEXT.md), application `install` | internal binding of a reusable source into a business (ADR 0011). Not the descriptor |
| `resourceKind` | implementation-only (the saved record's shape inside a kind) |
| plan tier (`lib/billing-plans.ts`) | Offering packaging. Never a field on a System kind |

**Why "System kind" and not product, capability or Offering.** ADR 0011 makes
System the customer noun and demotes Offerings and installations to "packaging
and internal binding." A registry called *products* reinstates packaging as the
organizing noun, and the code already uses "product" for two disjoint things.
"Capability" is taken: ADR 0007 (accepted) and `platform/capabilities` use it
for one qualified action. A System is an instance ("attymooney.com"); the
registry describes the *type*, so "System kind." The name holds if Jacob never
puts "System" on screen. ADR 0011 leaves that open on purpose.

One honest wrinkle: `operations` (delegated work), `work_plans` and
`product-learning` open in the same workspace slots but aren't Systems. They're
Work, or internal R&D. The registry keeps them, marked `nature: "work" | "internal"`,
so the view and route tables stay complete. See the open questions.

## Where ids are enumerated today

Re-verified 2026-10-05. To add a horizontal kind (say `invoices`), you edit:

| File | Sites | What |
| --- | --- | --- |
| `lib/workspace-location.ts` L8 | 1 | `VIEWS` allowlist |
| `experience/workspace/workspace-selection.ts` L4–5 | 2 | `HorizontalView` union + `isHorizontalView` array |
| `experience/workspace/workspace-discovery.ts` L10 | 1 | `CONSUMER_PRODUCT_IDS` |
| `experience/workspace/work-label.ts` L9–22 | 1 | `productId:resourceKind` → label |
| `experience/workspace/result.ts` L120 | 1 | `horizontalKinds` productId → resourceKind |
| `experience/workspace/workspace-start.ts` | 8 | `WorkspaceStartRoute` L3, continue label L97–108, `PRODUCT_FOR_ROUTE` L112, `AVAILABLE_PRODUCT_ROUTES` L122, `ROUTE_COPY` L124, patterns ~L170, `ROUTE_ORDER` L185, `partsFor` L245 |
| `experience/workspace/WorkspaceIntent.tsx` L10 | 1 | `ROUTES` |
| `experience/workspace/WorkspaceLayout.tsx` | 5 | L61, L336, L362, L386, L398 six-id unions/chains |
| `experience/workspace/WorkspaceApp.tsx` | 3 | L281/L307 productId→view chain, L651 `workingTitle`, L737–756 render switch |
| `platform/products/executables.ts` | 2 | union + array |
| `server/capabilities.ts` L159–466 | 3 | definition(s), `EXECUTABLE_CAPABILITY_DEFINITIONS`, `…_QUALIFICATIONS` |
| `products/operations/native-execution.ts` | 2 | adapter map L102–293, `allowanceUnit` L275–283 |
| `products/work-plans/native-output.ts` L82–124 | 1 | if/else per `adapterKey` (only if plans can create it) |
| `app/api/bounded-work/route.ts` L8–9 | 2 | `productId` enum + `services` map |
| `platform/work-economics/types.ts` L21 | 1 | `JOB_ECONOMICS_PRODUCTS` (if metered) |
| `products/operations/sweep.ts` L7 | 1 | `DueWork.productId` (if scheduled) |

That's about 35 sites in 16 files, 23 of them front end. None is
type-checked against another: none of the front-end unions imports
`WorkspaceExecutableId`, which only `app/api/workspace/route.ts` uses.
`catalog.ts` lists a seventh, disjoint set of six Offerings.

## Scenarios

1. **Add `invoices`.** Today: the 35 edits above, and forgetting one fails
   silently. Leave out `WorkspaceIntent` `ROUTES` and the continuation gets
   dropped. Leave out `VIEWS` and the sign-in return is rejected. After: one
   entry in `kinds.ts`, one server facet, one view component. The compiler
   flags any missing facet.
2. **Rename a view slug** (`investigations` → `checks`). Old links and sign-in
   returns carry the old slug. The descriptor holds `view` plus
   `formerViews: ["investigations"]`, and #1's location parser accepts both,
   emitting only the new one. The persisted `productId` never changes.
3. **A kind leaves a plan tier.** Nothing in code connects tiers to kinds today.
   Tiers live on the tenant in `billing-plans.ts`, and AGENTS.md says tiers are
   packaging, not flags. The descriptor stays unchanged. The Offering changes,
   and availability comes from authoritative entitlement at the route, never
   from the registry.
4. **A Capability from a work plan.** The `planner` entrance goes through
   `native-output.ts`, which picks a branch by `adapterKey` string. After: the
   kind's server facet provides `planOutputs[capabilityId]`.
5. **The same Capability from delegated work.** The `runner` entrance goes
   through `native-execution.ts`: prepare/inspect/recheck/perform, plus
   hard-coded branches for `investigations.run` and `websites.draft` inside
   the generic `perform`. After: the facet's `outcome()` shapes the step result.
6. **The same change from the UI.** It skips the registry entirely:
   `bounded-work/route.ts` calls `products/*/server` directly. `api` and
   `contextual` are declared on every Capability and passed by no caller. The
   descriptor makes that explicit: `directRoute` names the product functions,
   and a test asserts they're the same functions the adapters call.
7. **From an agent.** No agent path calls the Capability registry today
   (`lib/agent-shared.ts` has its own tools). Once one does, it's a new Entrance
   on existing Capabilities, not a new registry.
8. **Applications changes its revision model** (say, splitting records from
   design). Today you edit `domain.ts` *and* the copy in `native-execution.ts`
   L148–166, which has already drifted (below). After: the adapter's recheck
   calls a pure `assertCommandFresh(state, command)` exported by the domain, so
   there's one place to change.

## Contradictions in the code

- **Two "product" id sets with zero overlap.** `ProductId` (ai_visibility,
  managed_presence, domain_monitoring, homefinder, documents, tracker) vs
  `WorkspaceExecutableId` (websites, onboarding, applications, scheduling,
  investigations, operations). `app/api/workspace/route.ts` L230–243 concats
  both, plus a hard-coded `inquiries`, into one `products: {id: string}[]`.
- **Spelling.** productId `documents` vs view `document`. `work_plans` vs view
  `plan`. `inquiries` vs economics `inquiry`. Start route `website` (managed
  site) vs `websites`. Kebab case (`custom-applications`) next to snake case
  (`work_plans`). Capability ids `create_application` vs `application.command`.
- **Display names.** Investigations: "Ongoing checks" / "Ongoing check" /
  "Saved checks". Operations: "Delegated work" / "Ongoing work". Scheduling:
  "Scheduling" / "Reservations" / "Schedule".
- **Membership.** `custom-applications` and `product-learning` are in `VIEWS`
  and `HorizontalView`, but not in executables, `ROUTES`, start or discovery.
  `CONSUMER_PRODUCT_IDS` includes `homefinder`; catalog `listConsumerProducts`
  excludes it. Same word, different set. `allowanceUnit` covers 4 of 10
  Capabilities. `schedule.command` meters nothing.
- **Applications revision rules, re-derived and looser.** `native-execution.ts`
  L156–162 accepts `expectedRevision` if it equals *either* the aggregate
  revision *or* the candidate design revision. `domain.ts`
  `assertLegacyApplicationRevision` L176–183 requires the aggregate
  (`legacyRevision`, = `payload.revision`) exactly, and checks design revision
  only when no aggregate is sent. The recheck also falls back to
  `records.length` for `recordsRevision`. So the risk runs one way: a step
  passes recheck, then fails at perform with a generic conflict.
- **Tracker and documents recheck by running the whole command.** `recheck`
  calls `applyTrackerCommand` / `changeDocument` and discards the result, then
  `perform` runs it again through `server.ts`. That's consistent with the
  domain, but freshness is implied by "it didn't throw." No freshness function
  is named.
- **Dead or misfiled fields.** Executables' `availability: "release_gated"` is
  always overwritten to `"available"` (route L237–240). `website.draft` sits
  under `productId: "websites"`, but its authority is `same_tenant` and its
  resource is `managed_website`. It belongs to the managed-website Offering.

## Interface

Three designs compared:

- **A. One object per kind, all facets inline.** Most locality, but facets hold server functions, so any client import pulls server code into the bundle. Rejected.
- **B. Shared id, split facets.** Browser-safe data keyed by `SystemKindId`, plus a `server-only` facet map and a client view map, each `satisfies` an exhaustive record. Three files per kind; the compiler enforces completeness. **Recommended.**
- **C. Codegen from a manifest.** Adds a build step and likely a dependency, and gains nothing `const` + `satisfies` doesn't. Rejected.

```ts
// src/platform/system-kinds/kinds.ts — browser-safe: data only, no imports from products/*/server
export type SystemKindNature = "system" | "work" | "internal";
export interface SystemKindDescriptor {
  nature: SystemKindNature;
  view: string;                       // ?view= slug, unique; never derived from the id
  formerViews?: readonly string[];    // accepted on read, never emitted
  name: string;                       // one name; workingTitle and labels derive from it
  savedLabel: string;
  resourceKinds: readonly [primary: string, ...others: string[]];
  start?: { route: string; continueLabel: string; title: string; summary: string;
            outcome: "Capability" | "Responsibility"; pattern?: RegExp; weight?: number; order: number };
  operatorOnly?: boolean;
}
export const SYSTEM_KINDS = { websites: {...}, onboarding: {...}, applications: {...},
  scheduling: {...}, investigations: {...}, operations: {...}, "custom-applications": {...},
  "product-learning": {...}, tracker: {...}, documents: {...}, work_plans: {...}, inquiries: {...},
} as const satisfies Record<string, SystemKindDescriptor>;
export type SystemKindId = keyof typeof SYSTEM_KINDS;
export function isSystemKindId(value: unknown): value is SystemKindId;
export function systemKindForView(view: string): SystemKindId | null;   // honours formerViews
export function viewForWork(work: { productId: string; resourceKind: string }): string | null;
export function labelForWork(work: { productId: string; resourceKind: string }): string | null;

// src/platform/system-kinds/server.ts
import "server-only";
export interface SystemKindServerFacet {
  capabilities: readonly ExecutableCapabilityDefinition[];          // all with productId === this id
  adapters: readonly ExecutableCapabilityAdapter[];                 // runner entrance
  planOutputs?: Readonly<Record<string /*capabilityId*/, PlanOutputBuilder>>;  // planner entrance
  directRoute?: { create; read; command; run? };                    // person entrance (bounded-work)
  allowanceUnits?: Readonly<Record<string /*capabilityId*/, WorkAllowanceUnitKind>>;
  outcome?(capabilityId: string, result: unknown, step: StepInput): StepOutcome | null;
}
export const SYSTEM_KIND_SERVERS = {...} satisfies Record<SystemKindId, SystemKindServerFacet | null>;
export function capabilityRegistry(): CapabilityRegistry;   // built from all facets
export function adapterMap(): CapabilityAdapterMap;

// src/experience/workspace/system-kind-views.tsx — "use client"
export const SYSTEM_KIND_VIEWS = {...} satisfies Record<SystemKindId, ComponentType<SystemKindViewProps> | null>;
```

Invariants. The data file imports nothing from `products/*/server`, `lib/supabase*`
or `server/*`, and a lint rule plus test enforce that. Ids and the persisted
`productId` never change; views can be renamed only through `formerViews`.
The registry doesn't grant access. Release gates, membership and entitlement
stay in the executing route, as `catalog.ts` already promises. `catalog.ts`
stays as the Offering catalog and may reference `SystemKindId`s, never the
reverse.

## Tests

- **Exhaustiveness:** every `SystemKindId` has a server entry and a view entry (types plus runtime key equality). Every `WorkspaceExecutableId` is an id. Every Capability's `productId` is an id, and its `adapterKey` has exactly one adapter or plan-output builder. Views and resource-kind pairs are unique.
- **Location round-trip:** for every view and `formerViews` slug, `workspaceReturnTarget("/workspace?view=" + view)` returns a canonical target, and `selectWorkspaceLocation` resolves it to that kind.
- **Runner with a fake kind:** a fake descriptor whose adapter records calls. Assert prepare → inspect → recheck → perform, that a recheck failure leaves no effect, and that `outcome()` replaces the investigations/websites branches.
- **Freshness parity:** each applications command kind × stale revision is rejected by both `assertCommandFresh` and the runner recheck. This pins the drift above.
- **Bundle split:** a static test that the data file's import graph contains no `server-only` module.

## Migration steps

1. Add `kinds.ts` with the twelve ids, data copied verbatim, plus the exhaustiveness test. No callers change yet.
2. Point the front-end lists at it, one per PR (`VIEWS`, `HorizontalView`, `ROUTES`, `CONSUMER_PRODUCT_IDS`, work-label, result.ts, start maps, Layout unions). Pick one display name per kind (needs Jacob).
3. Replace the WorkspaceApp render switch with `SYSTEM_KIND_VIEWS`.
4. Add the server facets. Build the Capability registry and adapter map from them. Move the `allowanceUnit`, native-output and bounded-work `services` tables in.
5. Export `assertCommandFresh` from `applications/domain.ts` and call it in recheck. Name freshness functions for tracker and documents.
6. Derive `WORKSPACE_EXECUTABLES` from `nature === "system"` kinds and drop its dead `availability`. Split `WorkspaceProduct` into Offerings and kinds.
7. Delete `family`. Move `website.draft` to the managed-website path, or document why it stays.

Nothing here touches `/api/v1`, `reb:` keys, persisted `productId` values or
migrations.

## Decisions worth an ADR

Yes, one. **"Code names the things a business runs System kinds; 'product'
means an Offering; 'capability' means one qualified action."** It's hard to
reverse (it spreads through types, docs and #1/#2/#5/#6), surprising without
context (the folder is `src/products`, and AGENTS.md says "working
capabilities"), and a real trade-off against keeping "product" everywhere. It
should cite ADR 0007 for Capability and ADR 0011 for System, and follow 0011's
acceptance.

## Open questions for Jacob

1. Do you accept ADR 0011 enough to name code after "System"? If 0011 might be
   reversed, the fallback name is "kind" alone, and the registry shape doesn't
   change.
2. Are ongoing checks (investigations) a System the business owns, or Work
   Strelva does? And is delegated work (`operations`) ever a System? That
   decides `nature`, and whether they show in Home under ADR 0011.
3. One customer-facing name per kind: "Ongoing checks" or "Saved checks",
   "Delegated work" or "Ongoing work", "Scheduling" or "Reservations"?
4. Is the managed website (`managed_presence`, tenant model) the same System
   kind as the new `websites`, with two implementations? AGENTS.md implies yes.
   That decides whether `website.draft` moves.
