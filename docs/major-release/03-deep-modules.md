# 03 — Deep module responsibilities and contracts

Status: proposed bounded consolidation over existing implementations. Contract names below describe intended interfaces; they are not existing exported APIs unless explicitly identified.

`MOD-01` A module earns its boundary by containing policy, orchestration and failure handling behind a small set of meaningful operations. Routes retain HTTP/session validation; product modules own product rules; repositories own durable transitions. Presentation cannot compensate for missing server authority. Do not extract a general plugin runtime or move everything into `StrelvaShell`.

## Module map

| Module | Small interface | Contains | Does not own | Source starting point |
| --- | --- | --- | --- | --- |
| Assessment | Prepare, read, save, export, recover, describe supported actions | Typed method/input, execution, evidence projection, retained-result copy and recovery | A combined score, arbitrary jobs, Website publishing | `src/products/ai-visibility/`, `src/products/website-audit/`, `src/platform/workspaces/operations.ts` |
| Website | Inspect, select content, prepare change, execute authorized change, inspect/restore version | Existing content/media/collections, capability checks, preview, governance, publication and verification | New visual editor, client commerce, generic company runtime | `src/components/dashboard/`, `src/lib/event-actions.ts`, `src/lib/agent-shared.ts` |
| Access | Describe access, create supported handoff, inspect/accept, revoke | Addressed recipient, membership/delegation resolution, copy semantics, product permission adapters | Universal role table, payer logic, implicit agency grants | `src/platform/workspaces/repository.ts`, `src/lib/auth.ts` |
| Customers | List authorized customers, read customer, list authorized resources | Scoped joins, assignments, provenance, partial availability and links | Global CRM clone, resource ownership transfer, financial authority | New repository/read adapter; reuse `src/lib/accounts.ts` only for authorized operator facts |
| Performance | Read condition for period, read dated report | Period/source consistency, freshness and provenance, explicit source failures | New scanner/scorer or causal business claims | `src/app/dashboard/analytics/page.tsx`, `reports/page.tsx`, `src/lib/scan.ts` |
| Service | Read accessible agreement/payer/support summary | Safe projection of actual commercial evidence | Checkout, entitlement engine, inferred service | Existing tenant/account billing and relationship adapters |
| Home Finder adapter | Read installation, read readiness, list/read safe receipts, obtain preview link | REB actor/resource mapping and typed IDX response validation | MLS data authority, buyer content, retry engine or configuration execution | New server adapter, separate IDX management contract |
| Operator customer view | Find customer, inspect evidence, open domain action | Existing CRM/account/service joins and typed attention items | A new universal executor or customer-facing admin privileges | `src/app/admin/`, current operator libraries |

This is a responsibility map over existing capability, not eight new engines or navigation destinations. The person works with a result, Website, customer or Home Finder; access and service appear where needed. Add only minimal explicit customer/resource mappings, not a universal organization engine. The Performance and operator read models can be delivered incrementally. Their existing routes remain usable while consolidation is evaluated. No folder rename by itself satisfies `MOD-01`. The per-object simplicity tests are in specification 07.

## Assessment contract

`MOD-02` Use a discriminated result contract for the two supported methods. Common presentation receives resource identity, method/version, title, status, evidence time, ownership/access, supported actions and a product-owned payload renderer. It must not detect handoff by checking whether an AI payload happens to be present.

```ts
// Proposed contract outline; product payloads retain their existing schemas.
type AssessmentKind = "ai_visibility" | "website_audit";
type AssessmentAction = "save" | "export" | "recover" | "handoff";
type AssessmentView = {
  kind: AssessmentKind;
  resultId: string;
  workspaceId?: string;
  subject: { name: string; url?: string };
  observedAt: string;
  availability: "available" | "partial" | "unavailable";
  access: "public" | "owned" | "member" | "delegated_read";
  actions: Partial<Record<AssessmentAction, { allowed: boolean; reason?: string }>>;
  // The discriminated product payload is validated and rendered by its product.
};
```

Methods retain their separate inputs, findings, scales, costs and source limitations. A user explicitly selects scope; selecting one method must not execute the other. Common controls do not require identical visualizations or exports. Preserve [the canonical scanner](../../src/lib/scan.ts) and [scan store](../../src/lib/scan-store.ts); Website Audit consumes them. Preserve public retained result stores and private-copy checks. A private result never gains a public bearer URL as a side effect of consolidation.

`MOD-03` A bounded `recoverAssessment(actor, workspaceId, operationId)` hides `operationRequest`'s RPC protocol from the route. It validates the product, reconstructs product input and completes the existing lease/checkpoint flow. The route keeps origin, session, size/schema and release checks. Current recovery applies to the supported AI Visibility assessment execution; it must not imply all result kinds are runnable through that path. Website Audit saving is a retained report copy, not a new audit execution.

Preserve actor binding, direct membership, two-minute leases, three execution attempts and the 100 incomplete-operation safeguard. A running lease is pending, a ready checkpoint completes without provider re-execution, and a completed operation reopens the same saved result. Before-checkpoint interruption can repeat read-only checks and consumes the existing provider budget. A deleted saved-result pointer does not revive execution. These limits are safeguards, not commercial allowances. No background recovery worker is introduced.

## Website contract

`MOD-04` Keep the site and selected object explicit while composing content, media, collections, branding, history and Ask Strelva. Direct structured controls remain available for precise edits and bulk collection work. A common change operation must accept the exact tenant and supported object/action, validate against current capability/schema, enforce permission and governance, and return a typed proposal or execution outcome. Existing product paths may remain behind the interface; do not create a second publisher to make callers look uniform.

`MOD-05` The shared governed executor remains [event-actions](../../src/lib/event-actions.ts), with [AI governance](../../src/lib/ai-governance.ts) and shared [agent tools](../../src/lib/agent-shared.ts). Preserve domain-specific outcomes: proposed, approval required, dismissed, execution failed, provider accepted, verification failed and verified live. These are a presentation mapping over authoritative states, not a new event store.

Before approval, show exact affected fields/copy/destination and resource. Once a non-idempotent provider accepts, resolve that approval. Read-back failure produces verification-failure evidence and an inspection/recovery path; it must not reopen the original approval for retry. Review-reply `auto` mode preserves its existing explicit opt-in, delay and recheck. Restoration uses the domain's supported version/approval contract, never an invented universal Undo.

## Access and Customers contracts

`MOD-06` Access returns a resource-scoped projection: owner, actor's allowed operations, active grants visible to that actor, supported handoff/copy behavior and bounded errors. Extract duplicated handoff/dialog/request state from `WorkspaceApp` after parity. Preserve invitation token handling and recipient verification. The existing tuple `scope: ["work:read"]` remains exact; do not widen it into a generic writable grant.

`MOD-07` Customers provides `listCustomers(actor, organization, query, cursor)` and `readCustomer(actor, organization, customerId)`. Both authorize on the server before enumerating rows. The detail response includes only authorized resource references and explicit per-source availability. A count must not reveal unassigned resources. Search is bounded to authorized data, cursors are scope-bound, and stable IDs own links. Shared names/domains are display facts, not joins.

Resource reads use the product's adapter. Failure to fetch a Website or IDX summary produces an unavailable item/source; failure to prove access produces no object detail. An organization with no customers gets an empty state only after a successful authorized read. Multiple customers/sites and one customer with two agencies must not cause duplicated authority or merged histories.

## Performance, Service and operator contracts

`MOD-08` Performance returns the selected site, exact time range/time zone, source timestamps, measured values and unavailable reasons. Today and Analytics consume the same relevant period semantics; a dated Report preserves its original content and evidence period. Website condition is read from the existing scan path. Do not invent a composite health/visibility/reputation score or recompute historical recaps from current data.

`MOD-09` Service is a read projection with provenance. It may state an accepted responsibility only when its authoritative agreement/product source establishes that fact. Unsupported account-level billing fields remain absent/unknown. The interface can open existing payer-authorized settings; it cannot create a second subscription or commercial source.

`MOD-10` Operator consolidation joins current customer/site/contact/service/billing/access evidence. Queues retain typed inspectors and domain actions. A prospect can exist without a tenant, an account can group sites, and a payment link can exist without a subscription. Missing joins are explicit. Keep portfolio bulk controls where useful, but never make a unified list imply identical bulk-approval behavior.

## Errors, compatibility and proof of depth

`MOD-11` Modules distinguish invalid input, unauthenticated, forbidden, unavailable object, conflict, in-progress, rate/budget limit, source unavailable and accepted-but-unverified outcomes where applicable. Routes map them to their existing HTTP contract. Preserve inputs and context across recoverable errors. Return bounded safe errors; logs may use correlation IDs but never provider secrets or buyer content.

`MOD-12` Measure consolidation by removing actual caller orchestration: routes no longer reconstruct product recovery; common workspace code no longer probes payload type to infer access; Website direct and conversation actions share the same domain operation; Customers never orchestrates raw IDX/provider access in the browser. Typecheck, focused behavior tests and source dependency review must prove this. Counted lines or fewer destinations are insufficient.

Acceptance: `AC-01`, `AC-03`, `AC-04`, `AC-07`, `AC-08`, `AC-12` in [specification 07](./07-delivery-and-decisions.md).
