# Workspace route adapter

Status: proposed · 2026-10-05 · candidate 7 of 9 · source: architecture review

## What it is

Every cookie-authenticated workspace route does the same six things before any
product code runs: check the workspace release, find the verified actor, reject
cross-site writes, read a bounded JSON body, send private JSON headers, and turn
domain errors into status codes. Today 60 route files do this in at least five
different ways, through four parallel helper modules
(`src/platform/workspaces/http.ts`, `src/platform/work-context/http.ts`,
`src/platform/agent-access/http.ts`, `src/app/api/work-allowances/http.ts`) and
28 local `json()` helpers.

The proposal is one deep module, `workspaceRoute(spec)`, that owns all six
concerns. A route declares its query schema, its actions, and its handlers, and
nothing else. `src/app/api/bounded-work/route.ts` is already 80% of this shape.
`src/platform/work-context/http.ts` (`workAuthorityRoute`) already is a route
factory, just a private one with its own inline actor and body reader.

Dependencies are in-process (zod, `Request`/`Response`) plus `getSessionUser`,
which tests already stub. No port is needed.

## Language

Most of this candidate is plumbing, so it adds three terms. Everything else
(origin, content type, body limit) is ordinary HTTP and stays out of the glossary.

**Verified actor**:
A signed-in person whose email address is confirmed. Only a verified actor can
read or change workspace work.
_Avoid_: user, session user, current user

**Workspace release**:
The switch that decides whether workspace capabilities exist in an environment at
all. When it is closed, no workspace work is offered or accepted.
_Avoid_: feature flag, beta, rollout

**Workspace write**:
A request that changes workspace work. It must come directly from Strelva, never
from another site acting with the person's sign-in.
_Avoid_: mutation, POST

## Route inventory

235 route files under `src/app/api`. 56 call `workspaceReleaseEnabled` directly;
4 more are gated through a helper (`work-context`, `work-participation` via
`platform/work-context/http.ts:20`; `websites/[workId]/preview` and `/export` via
`websites/candidate-http.ts:9`). That is 60 gated routes. Three are not
cookie-session routes and stay out: `cron/workspace-work` (cron),
`public-continuation` (public CORS intake from strelva.com), and
`agent-access/work/[workId]` (bearer token, correctly has no origin guard).

Legend: **H** = imports the shared helper, **i** = hand-rolled inline,
**–** = missing, **n/a** = does not apply.

| Group (count) | Routes | Actor | Write guard | Body read | Headers | Error map |
|---|---|---|---|---|---|---|
| A. All shared (16) | bounded-work, operations, operational-assignments, workspace-exit, workspace-export, workspace-invitations (+revoke, accept/[token]), agency-application-draft-access, agency-website-draft-access, agency-applications, workspace/calendar-{connections, events, availability}, calendar oauth/[provider], workspace/public-bookings | H | H | H | H | H (invitations/accept adds local) |
| B. Shared actor, own errors (14) | apps/[workId] (+access), custom-applications (5 files), websites (3 files), websites preview + export (via `candidate-http.ts`), workspace/businesses, calendar oauth callback | H | H | H | i (apps, custom-apps) | i (product errors) |
| C. Shared body, inline rest (5) | offerings, offerings/provider-delivery, offerings/websites, service-requests (+delivery) | i | i | H | i | i |
| D. Fully hand-rolled (8) | documents, product-learning, tracker, work-plans, work-plans/execute, work-economics, work-economics/payer-transition, workspace | i | i | i (7 `getReader` loops; payer-transition none) | i, Referrer-Policy **–** on documents, product-learning, tracker | i |
| E. Unbounded body (3) | onboarding, onboarding/upload, public-continuation/import | i | i | **–** (`request.json()` / `formData()`) | i, Referrer-Policy **–** | i |
| F. Read-only, inline actor (5) | customers (3), operations/inbox, onboarding/file | i | n/a (file GET has its own) | n/a | i | i (customers: coded shape) |
| G. Parallel helper modules (6) | work-allowances (3) via `work-allowances/http.ts`; work-context, work-participation via `workAuthorityRoute`; agent-access (session) | i (in helper) | i (in helper) | i (in helper) | i, Referrer-Policy **–** except allowances | i |

Corrected counts (route.ts files only):

| Claim in the review | Verified | Note |
|---|---|---|
| 57 call `workspaceReleaseEnabled` | 56 route files + `candidate-http.ts` | 60 gated in total, see above |
| 23 inline `email_confirmed_at` | 22 route files | the 23rd is `work-allowances/http.ts`; `work-context/http.ts` is a 24th copy outside `src/app/api` |
| 29 import `workspaceHttpActor` | 28 route files | 29th is `candidate-http.ts` |
| 21 inline origin/sec-fetch check | 20 route files | +1 in `work-allowances/http.ts`, +1 in `work-context/http.ts` |
| 22 use `workspaceWriteGuard` | 22 | correct |
| 10 hand-rolled `getReader()` | 8 gated routes | 9th is `webhooks/resend` (not workspace), 10th `work-allowances/http.ts` |
| 9 local `const json =` | **28** gated routes define a local `json()` | the grep missed `function json(` |
| 16 map Access/Conflict errors themselves | 15 route files; **30** define a local `failed`/`failure` | |

## Scenarios

| Scenario | Today | With the adapter |
|---|---|---|
| Unconfirmed email posts a document | `documents/route.ts:10-13` local `actor()` returns null, 401. 24 copies of this check exist; `customers/route.ts:45` also regex-checks the email, the rest do not. | One derivation. Handler never runs. 401. |
| Cross-site POST | `documents/route.ts:30` 403. `public-continuation/import/route.ts:14-24` accepts a missing Origin when `Sec-Fetch-Site: same-origin`; the 22 `workspaceWriteGuard` routes reject a missing Origin. Two policies. | One policy (exact Origin match, reject `cross-site`), checked before the body is read. |
| Oversized body | `documents/route.ts:44` 413 at 400 KB. `workspace/route.ts:98` 400 at 12 KB. `readWorkspaceBody` (`http.ts:20`) 400. `work-context/http.ts:44` 413. **`onboarding/route.ts:84` and `public-continuation/import/route.ts:51` have no cap.** `onboarding/upload/route.ts:37` buffers the whole form before the 2 MB check at `products/onboarding/server.ts:298`. | Every route declares `maxBytes`. Always 413, reader cancelled. Multipart gets a declared-length precheck. |
| `WorkspaceConflictError` from workspace exit | `workspace-exit/route.ts:29` to `workspaceHttpFailure`, 409 with the domain message. `documents/route.ts:16` and `workspace/route.ts:71` replace the message with fixed copy. | Base table maps the kind to 409; a route can override the message per kind. |
| Release closed | 56 routes return 503 with about six different messages. `public-continuation/route.ts:58` checks origin first; `customers/route.ts:71` adds a second flag. | Release check is always first. `release` option for extra flags. |
| Route forgets a header | `documents/route.ts:9` omits Referrer-Policy. So do tracker, product-learning, onboarding (3), agent-access (2 via `platform/agent-access/http.ts:5`), work-context and work-participation (`work-context/http.ts:6`). | The adapter writes every response, including passthrough `Response` objects. A route cannot forget. |
| Session lookup throws | `operations/inbox/route.ts:25`, `onboarding/file/route.ts:52`, `onboarding/route.ts:49,73`, `workspace-exit/route.ts:9,23` call the actor outside `try`. Supabase down means an unhandled 500. | Actor lookup sits inside the adapter's error boundary. 503 JSON. |
| Product error by name | `workspace/route.ts:69,72,77` match `error.name` strings for audit and AI-visibility errors. A renamed class silently becomes 503. | Route `errors` hook until candidate #2 gives domain errors a kind; then the hook goes away. |

Security-relevant gaps (flag): `onboarding/route.ts:84` and
`public-continuation/import/route.ts:51` read unbounded JSON from an
authenticated caller; only the platform's request limit stops them.
`onboarding/upload/route.ts:37` buffers before checking size. Referrer-Policy is
missing on 11 routes; that is low risk on JSON responses. No cookie-session
workspace write route is missing its origin guard.

## Rules that live in routes today

| Rule | Where now | Where it should go |
|---|---|---|
| Only super-admins see product-learning work | `workspace/route.ts:221-222` | `listWork` in the workspace authority (candidate #9), or an `internal` visibility on the product descriptor (#8). Same family: `tracker/route.ts:31,60` and `operations/inbox/route.ts:31` super-admin checks. |
| Tracker handoff shows a bounded read-only preview | `workspace/route.ts:142-155` | `products/tracker` owns its addressed presentation; descriptor (#8) exposes it. |
| Which products support handoff | `workspace/route.ts:157-160` | Product descriptor (#8). |
| Managed-presence listing shape is re-validated | `workspace/route.ts:116-133` (`productId === "managed_presence"` at 130) | `products/managed-presence/server` returns its validated contract; the route stops parsing it. |
| Executable products shown as available; inquiries only when flagged | `workspace/route.ts:168`, `:229-239` | `platform/products` registry. |
| Creator owns application maintenance | injected at `bounded-work/route.ts:28` and `products/work-plans/native-output.ts:88`; enforced at `products/applications/server.ts:95`; already derived at `:141` for from-source | `createWorkspaceApplication` derives it from the actor and stops accepting it as input. Both injections disappear. |
| 60 writes per minute per person | `workspace/route.ts:274`, only here | Adapter option `rateLimit`, available to every route. |

## Interface

Three designs considered.

1. **Declarative route (recommended).** `workspaceRoute({ read, actions })`.
   Routes declare zod schemas and handlers; the adapter owns order, limits,
   headers, and errors. One entry point, high leverage, and a route cannot skip a
   step. Thin spot: downloads, HTML previews, and OAuth redirects need a
   passthrough `Response`.
2. **Middleware chain.** `pipe(release(), actor(), writeGuard(), body(20_000),
   parse(schema))(handler)`. Flexible, but each route still assembles the chain,
   so a route can still leave out a step or put them in the wrong order. Shallow.
3. **Keep the helpers, enforce with lint.** Ban `getSessionUser`,
   `sec-fetch-site`, and `getReader` in gated routes. Cheapest, but the 30 error
   tables, 28 `json()` helpers, and the ordering bugs stay.

Recommendation: 1, with a ratchet test from 3 so new routes can't go around it.

```ts
// src/platform/workspaces/route.ts
export type VerifiedActor = { userId: string; verifiedEmail: string };
export type ErrorKind = "invalid" | "access" | "missing" | "conflict" | "precondition" | "limited" | "unavailable";
export type RouteFailure = { kind: ErrorKind; message?: string; code?: string };
type Ctx<P> = { request: Request; url: URL; params: P };
type Result = unknown | Response | { status: 201; body: unknown };

type Action<S extends z.ZodObject<any>, P> = {
  input: S;                                   // adapter adds { action: literal } and .strict()
  run(actor: VerifiedActor, input: z.infer<S>, ctx: Ctx<P>): Promise<Result>;
};

export interface WorkspaceRouteSpec<P = {}, Q extends z.ZodTypeAny = z.ZodTypeAny,
  A extends Record<string, Action<any, P>> = {}> {
  release?: () => boolean;                    // default workspaceReleaseEnabled; ANDed, never replaced
  read?: { query: Q; sameOriginOnly?: boolean; run(actor: VerifiedActor, query: z.infer<Q>, ctx: Ctx<P>): Promise<Result> };
  actions?: A;                                // POST body: { action: keyof A, ...fields }
  remove?: { query: z.ZodTypeAny; run(actor: VerifiedActor, query: unknown, ctx: Ctx<P>): Promise<Result> }; // DELETE, write-guarded
  maxBytes?: number;                          // default 20_000; always 413 when exceeded
  rateLimit?: { key: string; limit: number; windowMs: number };
  messages?: Partial<Record<ErrorKind | "signedOut" | "released", string>>;
  errors?: (error: unknown) => RouteFailure | undefined;   // product errors until #2 lands
}

export function workspaceRoute<P, Q extends z.ZodTypeAny, A extends Record<string, Action<any, P>>>(
  spec: WorkspaceRouteSpec<P, Q, A>,
): { GET?: (r: Request, c: { params: Promise<P> }) => Promise<Response>;
     POST?: (r: Request, c: { params: Promise<P> }) => Promise<Response>;
     DELETE?: (r: Request, c: { params: Promise<P> }) => Promise<Response> };
```

Order the adapter guarantees on every write: release, origin, content type,
actor, rate limit, bounded read, parse, dispatch, headers. Reads: release,
optional same-origin, actor, parse query, dispatch, headers. Every response,
including a returned `Response`, gets `Cache-Control: private, no-store`,
`X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer`.

`bounded-work/route.ts` after:

```ts
export const { GET, POST } = workspaceRoute({
  read: { query: z.object({ productId, workId: z.string().uuid() }),
          run: (actor, q) => services[q.productId].read(actor, q.workId) },
  actions: {
    create:      { input: z.object({ productId, workspaceId: uuid, input: z.record(z.string(), z.unknown()) }),
                   run: async (a, i) => created(await services[i.productId].create(a, i.workspaceId, i.input)) },
    from_source: { input: z.object({ productId: z.literal("applications"), workspaceId: uuid, sourceWorkId: uuid }),
                   run: async (a, i) => created(await createWorkspaceApplicationFromSource(a, i.workspaceId, i.sourceWorkId)) },
    command:     { input: z.object({ productId, workId: uuid, command: z.unknown() }),
                   run: (a, i) => services[i.productId].command(a, i.workId, i.command) },
    run:         { input: z.object({ productId: z.literal("investigations"), workId: uuid, command: z.unknown() }),
                   run: (a, i) => runWorkspaceInvestigation(a, i.workId, i.command) },
  },
});
```

The `run` action's 422 branch (`bounded-work/route.ts:31`) becomes a schema
rule, so a wrong product is a 400. That is a small client-visible change.

## Tests

- **One adapter suite** (`src/__tests__/workspace-route.test.ts`), table-driven
  against a toy spec: release closed gives 503 for GET, POST, DELETE; unconfirmed
  or signed-out gives 401 and the handler never runs; missing or foreign Origin,
  or `cross-site`, gives 403 before the body is touched; wrong content type gives
  415; a chunked body with no Content-Length over the limit gives 413 and cancels
  the reader; malformed JSON, unknown action, or extra keys give 400; each error
  kind maps to its status; a thrown session lookup gives 503 JSON; the rate limit
  gives 429; all three headers are on every response, passthrough included.
- **A ratchet test** walks `src/app/api` and fails when a gated route imports
  `getSessionUser`, or contains `sec-fetch-site`, `getReader`,
  `request.json()`, or a local `json(`. It starts with an allowlist of
  unmigrated files that may only shrink.
- **Per-route tests shrink to dispatch and product errors.**
  `documents-route.test.ts` drops its unconfirmed-actor and cross-origin cases and
  keeps the conflict mapping. Guard and actor assertions also go from the 15
  suites that carry them today: business-entry, offering, offering-websites,
  offering-provider-delivery, product-learning, public-continuation,
  workspace-exit, onboarding, payer-transition, calendar-events,
  calendar-connections, websites, website-connections, service-request,
  public-booking-admin. Plus `work-authority-routes` and `allowance-routes`.
- `route-handlers.test.ts` is **not** affected: it covers tenant dashboard and
  admin routes, none of them workspace routes.

## Migration steps

Each step ships alone and keeps `/api/v1` untouched.

1. Add `src/platform/workspaces/route.ts` and its suite. Rebuild the five
   `workspaces/http.ts` helpers on top of it so group A is unchanged.
2. Group A (16 routes). Mechanical. **Client-visible:** oversized body goes from
   400 to 413 for the `readWorkspaceBody` routes.
3. `bounded-work`, with maintenance ownership moved into
   `createWorkspaceApplication`; delete the injection in `native-output.ts:88`.
4. `documents`: gains Referrer-Policy; keeps its copy via `messages`.
5. Groups B and C (19): product error tables move into the `errors` hook.
6. Group D minus `workspace` (7): drop the hand-rolled readers.
7. Onboarding (3): **adds a body cap where there was none.** Upload gets a
   declared-length precheck; the file GET uses `read.sameOriginOnly`.
8. Group G: fold `workAuthorityRoute` and `work-allowances/http.ts` in; delete
   both helper modules. Agent-access session route moves; the bearer route stays.
9. `workspace/route.ts` last, after #8 and #9 take its product rules; the rate
   limit becomes an option.
10. Customers (3) and `operations/inbox`: customers returns
    `{ error: { code, message } }`, a different shape. Keep it with a per-route
    option or move everyone to it (open question 1).
11. Turn the ratchet allowlist down to the three excluded routes.

## Decisions worth an ADR

None. The adapter can be reversed one route at a time. The origin rule (exact
Origin match, a missing Origin is rejected) belongs in
`docs/architecture/auth-tenancy.md`, not an ADR.

## Open questions for Jacob

1. **Error contract.** Customers already returns `{ error: { code, message } }`;
   every other workspace route returns `{ error: "text" }`. Agents and partner
   tools will read these routes. Do we move all workspace routes to the coded
   shape now, while there are no outside consumers?
2. **Who sees internal R&D work.** Product-learning and tracker experiments are
   hidden by super-admin status. Should that stay a Strelva-staff rule, or become
   a workspace membership (an internal workspace) that agencies could have later?
3. **Error copy.** 30 routes carry their own wording. Keep the per-route voice,
   or converge on one set of messages?
