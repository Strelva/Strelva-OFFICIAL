# Inquiry workspace

Status: proposed · 2026-10-05 · candidate 4 of 9 · source: architecture review

## What it is

One module that opens a business's inquiry workspace once and answers, for every caller, "what is this inquiry and may we act on it right now?" Today six callers answer that question themselves. Each one joins the Redis lead, the Postgres workspace snapshot, record overlays, and published record changes in its own way. The callers are the leads route, booking intake, the follow-up cron, message approval, the owner surface, and capture repair. They disagree on one rule that gates outbound email (see Contradictions).

The module has two entry points. `openInquiryWorkspace` gives an opened snapshot with `currentInquiry(id)` and `commit(mutate)`. `receiveInquiry` is the one intake path for the website form and the booking page. Redis leads stay the customer record authority (`docs/architecture/persistence-boundaries.md:33`). No data moves.

## Language

**Inquiry**:
One customer's request to a business, received through a published inquiry form or booking page, together with its handling status and assignee.
_Avoid_: lead (the storage record), submission (the delivery payload), record

**Lead**:
The stored copy of the customer's own words and contact details. It is the authority for customer fields and never holds handling decisions.
_Avoid_: inquiry, contact, CRM record

**Inquiry capability**:
A business's inquiry intake, meaning its form, routing, follow-up and responsibility, as one System in the ADR 0011 sense. Its identity survives every republish.
_Avoid_: offering, installation, form, System (until ADR 0011 is accepted)

**Revision**:
One numbered, published definition of an inquiry capability. Every inquiry remembers the revision it was captured on.
_Avoid_: Version (ADR 0011 reserves it for context, not time), capability version in prose

**Live intent**:
The owner meant this revision to be on the website. It holds whether or not the read-back has confirmed it yet.
_Avoid_: live (alone), verified, published

**Current inquiry**:
An inquiry that is still open, whose capability has live intent, and whose captured revision is the live one. Only a current inquiry can receive governed messages.
_Avoid_: fresh, valid, active

**Inquiry workspace**:
The revisioned store of one business's inquiry capabilities, revisions, receipts and record changes. It is not the business Workspace and it holds no customer fields.
_Avoid_: workspace (alone), snapshot, state

**Record change**:
A published, undoable change to an inquiry's status or assignee. It is the authority for handling decisions.
_Avoid_: overlay, bulk update, patch

**Receipt**:
Durable evidence that the business recorded an inquiry or acted on it.
_Avoid_: evidence row, timeline stub

**Intake outcome**:
The single answer a visitor-facing entry point gets for one submission: accepted, duplicate, pending, stopped, changed, missing, invalid, or unavailable.
_Avoid_: capture result, evidence status

## Scenarios

| Scenario | Today (verified file:line) | With the module |
| --- | --- | --- |
| 1. Lead captured on revision 3, capability republished as revision 4 | New posts on revision 3 get 409 (`v1/leads/[tenant]/route.ts:179`). Existing revision 3 leads: the cron drops them silently (`follow-up-cron.ts:114`). Approval throws `inquiry_changed`, "Refresh before preparing" (`delivery-approval-service.ts:234`), and refreshing can never fix it. The owner surface still lists them (`record-projection.ts:49`). | `currentInquiry(id)` returns `{ current:false, reason:"revision_changed", captured:3, live:4 }`. Every caller sees the same answer, and the UI can say why. The open question is what should happen next. |
| 2. Capability goes `live_unverified` after provider acceptance | The storefront serves it (`storefront.ts:7`). Receive accepts it (`receive.ts:260`). The cron sends follow-ups (`follow-up-cron.ts:113`). Approval refuses with `inquiry_changed` (`delivery-approval-service.ts:234`). | One rule: live intent, meaning `live` or `live_unverified`. Approval and the cron agree. |
| 3. Redis lead exists, Postgres receipt write fails | Receive queues a repair (`receive.ts:329`). The route returns 503 although the lead is durable (`route.ts:251`). Booking says "could not be recorded" (`public-booking.ts:428`). The visitor retries and gets a 200 duplicate. Discovery re-finds it within the last 500 leads (`reconciliation.ts:320`, `REPAIR_KEEP=500`). | `receiveInquiry` returns `unavailable { retained:true }` and enqueues the repair itself. The route still maps it to 503, so the contract is unchanged. Booking reads the same outcome. |
| 4. Assignee changed | "Assign to me" writes a record change (`server.ts:811` → `inquiry-engine-pattern.ts:153`). Reads resolve record change, then overlay, then default (`record-projection.ts:14`). Approval's `recordFromLead` drops `assigneeId` (`delivery-approval-primitives.ts:177-187`). Overlays have no production writer. | One projection supplies status and assignee to every caller. A record change wins and the overlay is a read-only fallback. |
| 5. Two writers CAS-conflict | Receive retries 3× (`receive.ts:240`). The approval receipt retries 3× but reuses the old overlay status and lead (`delivery-approval-service.ts:667,681`). Publication does one CAS and returns the conflict (`publication.ts:47,123`). | `commit(mutate)` reopens, rehydrates (overlays included), reruns `mutate` and retries with one bounded policy. Callers write no loops. |
| 6. PII-free stub needed for cron evaluation | `stateForReceive` stubs every inquiry as `status:"new"` (`receive.ts:128-138`). The cron's responsibility check runs on those stubs (`receive.ts:56`, called at `follow-up-cron.ts:320`). Approval splices in the real record (`delivery-approval-service.ts:304-306`). The two stub builders pick the revision differently: live, then previous live, then draft (`receive.ts:121`), versus live or 1 (`record-projection.ts:79`). | One hydration path. Stubs appear only when the leads port is unavailable, marked `fieldsAvailable:false`, with one rule for picking the revision. |
| 7. Booking-page vs leads-route intake; workspace exits mid-capture | The route checks exit again after capture and returns 409 (`route.ts:219-233`). Booking does not (`public-booking-server.ts:182-225`), so it writes a receipt after the exit. A duplicate with no lead body gets 200 on the route (`route.ts:253`) and an error from booking (`public-booking-server.ts:213`). | `receiveInquiry` owns the exit check before and after capture, duplicates, and the version check. Both entry points get the same outcome. |
| 8. Revision changes between the route's check and the receipt write → 202 pending | The route returns `{ok,pending}` 202 (`route.ts:249`). The receive path returns `stale` without queueing a repair (`receive.ts:261,265`). Recovery depends on the 500-lead discovery sweep. Booking ignores `stale` and returns success (`public-booking-server.ts:224`). | Outcome `pending`, with the repair enqueued explicitly. Booking sees `pending` too. |
| 9. Fields rejected after Redis capture | The route returns 400 (`route.ts:250`) while the lead stays in Redis. Repair later marks it `rejected` and drops it without a counter (`reconciliation.ts:403-405`). Fields are validated 3 times: `route.ts:186`, `receive.ts:270`, `inquiry-engine-operations.ts:858`. | Fields are validated once before capture. After capture, a rejection is `unavailable { retained:true }`, counted and visible. |

## Contradictions in the code

1. **The currentness rule.** `live | live_unverified` appears in `storefront.ts:7`, `receive.ts:260` and `follow-up-cron.ts:113`. Only `delivery-approval-service.ts:234` requires `live`. The engine's own `receiveInquiry` checks no status at all when given a capability id (`inquiry-engine-operations.ts:854`).
   **Decision: live intent (`live | live_unverified`) plus an exact revision match plus an open inquiry.** Four reasons:
   - The storefront already serves the `live_unverified` revision, so visitors submit against it.
   - AGENTS.md: "Once a provider accepts a write, the approval is done; if the read-back fails, record that separately."
   - The architecture review §4 says the same (`docs/capabilities/inquiries/inquiry-first-architecture-security-review-2026-09-11.md:34`).
   - ADR 0011 rule 5: "Draft, Live and Paused are intent; health is separate."

   A `live`-only rule would block every inquiry after each publish until verification. If verification never succeeds, it blocks them forever. This loosens a gate on an outbound-email path, so Jacob confirms it (Q1).
2. Overlays are documented as storing "handling status and assignment" (`persistence-boundaries.md:34`). Production writes both as record changes. `upsertInquiryRecordOverlay` (`server.ts:126`) has no non-test caller. Overlays are read in 5 places.
3. Three lead→record builders disagree:
   - `projectedInquiryRecords` keeps the assignee, accepts a revision only if ≥1, and takes the business from `capabilities[0]` (`record-projection.ts:47-52`).
   - `recordFromLead` drops the assignee, accepts a revision of 0 through `??`, and takes the business from the capability (`delivery-approval-primitives.ts:179-181`).
   - `placeholderInquiryRecords` builds stubs with no fields.
4. Two submission builders disagree. `inquiryFromLead` sets the routing and follow-up template with `??` (`delivery-approval-primitives.ts:213-214`). `inquirySubmissionFromLead` sets neither (`delivery.ts:212`). The cron fills them in itself with `||` and `??` and adds `businessName` (`follow-up-cron.ts:236-239`).
5. Responsibility selection differs. Approval takes the newest by `updatedAt` (`delivery-approval-service.ts:218-220`). The cron and `receive.ts:57` take the first `find` (`follow-up-cron.ts:304`).
6. `statusFromState` (`delivery-approval-primitives.ts:153`) is a verbatim copy of `recordedInquiryStatus` (`record-projection.ts:5`).
7. The business id defaults differ:
   - `readInquiryWorkspace`: tenant id (`server.ts:87`)
   - Reconciliation: tenant id (`reconciliation.ts:322`)
   - Route: stable id, else tenant (`route.ts:162`)
   - Cron: stable id, else tenant (`follow-up-cron.ts:178`)
8. A route comment says "reconciliation can record the receipt" (`route.ts:246-248`). The stale path never enqueues one. It relies on bounded discovery.
9. 409 means both "form changed" and "workspace stopped" (`route.ts:171,180,226`). The starter shows "This form changed. Reload it" for both (`custom-repo-starter/inquiry-client.ts:79`).

## Interface

Three designs were compared:

- **A. Opened session.** Open once per request and read many inquiries from one snapshot. `commit` retries internally. This gives the most leverage: the cron reads 500 inquiries with one hydration.
- **B. Per-inquiry command.** `withCurrentInquiry(scope, id, fn)` reloads on every call. The interface is smaller, but the cron pays N loads, the owner surface needs a second list operation anyway, and approval's 3 `buildContext` calls stay 3 reads.
- **C. Separate read model and writer.** `InquiryReadModel.load()` plus `InquiryWriter.commit()`. The read model stays pure, but every writer has to rehydrate the same way. That is the duplication we are removing.

**Recommendation: A, with intake as a sibling function.**

```ts
export interface InquiryScope { tenantId: string; businessId: string }

export type Currentness =
  | { current: true; definition: InquiryCapabilityDefinition; responsibility: ResponsibilityPolicy | null }
  | { current: false; reason: "capability_missing" | "not_live" | "revision_changed" | "inquiry_closed" | "workspace_exited";
      capturedRevision: number | null; liveRevision: number | null };

export interface CurrentInquiry {
  record: InquiryRecord;               // status + assignee from record changes, then overlay
  submission: InquiryDeliverySubmission; // one builder; routing/follow-up from the captured revision
  currentness: Currentness;
  fieldsAvailable: boolean;            // false = PII-free stub (leads port unavailable)
}

export interface InquiryWorkspace {
  readonly scope: InquiryScope;
  readonly revision: number;
  currentInquiry(id: string): Promise<CurrentInquiry | null>;
  inquiries(limit?: number): Promise<{ records: CurrentInquiry[]; recordsAvailable: boolean }>;
  evaluate(id: string, action: ResponsibilityAction, messageBody: string, at: string): ResponsibilityEvaluation | null;
  /** mutate must be pure over engine state; provider calls happen outside. */
  commit<T>(mutate: (engine: InquiryEngine) => T, opts: { actorId: string }):
    Promise<{ status: "committed"; value: T; revision: number } | { status: "conflict" } | { status: "unavailable"; reason: string }>;
}

export function openInquiryWorkspace(scope: InquiryScope, ports?: Partial<InquiryPorts>):
  Promise<InquiryWorkspace | { status: "unavailable"; reason: string }>;

export type IntakeOutcome =
  | { status: "accepted"; inquiryId: string }
  | { status: "duplicate"; inquiryId: string | null }
  | { status: "pending"; inquiryId: string }      // retained; receipt deferred to repair
  | { status: "stopped" }                          // workspace exited (before or after capture)
  | { status: "changed" } | { status: "missing" }  // pre-capture revision mismatch / no live form
  | { status: "invalid"; reason: string }
  | { status: "unavailable"; reason: string; retained: boolean };

export function receiveInquiry(input: {
  tenantId: string; capabilityId: string; revision: number;
  fields: Record<string, string>; contact: { name: string; email?: string; message?: string };
  source: "inquiry-capability" | "public-booking";
}, ports?: Partial<InquiryPorts>): Promise<IntakeOutcome>;
```

`changed` and `missing` are added to the six requested outcomes because the v1 contract already tells 409 apart from 404. The leads route keeps its exact responses:

| Outcome | Response |
| --- | --- |
| accepted | 200 `{ok}` |
| duplicate | 200 `{ok,duplicate}` |
| pending | 202 `{ok,pending}` |
| stopped | 409 with the exit code |
| changed | 409 |
| missing | 404 |
| invalid | 400 |
| unavailable | 503 |

Booking maps `stopped | changed | missing | invalid | unavailable` to its existing `PublicBookingError`s.

## Behind the seam

- **`InquiryPorts`**:
  - `repository`: the existing `InquiryRepository`. There are already two adapters, `InMemoryInquiryRepository` (`repository.ts:522`) and `PostgresInquiryRepository` (`repository.ts:685`), so this is a real seam.
  - `leads`: new, `{ capture, byId, recent }`. One adapter wraps `@/lib/leads` (Redis). The other is in memory. `recent` returns `null` when Redis is missing, never `[]`.
  - `repairs`: `InquiryCaptureRepairStore`, which already has Redis and memory adapters.
  - `workspaceExit` and `now`.
- **Hydration.** One function, snapshot + leads + overlays → engine state. It replaces `stateForReceive` and `stateForEngine` (`server.ts:582`), plus `projectedInquiryRecords`, `placeholderInquiryRecords`, `recordFromLead`, `statusFromState`, and the splice at `delivery-approval-service.ts:304-306,681-683`.
- **Currentness.** One function, the rule above. Responsibility is always the newest by `updatedAt`.
- **CAS.** `commit` is the only `compareAndSwap` caller apart from publication claims. It retries 3 attempts in total, today's value.
- **Intake.** The sequence: rate limit and spam stay in the route; the module runs exit check → snapshot → live-intent form → validate once → `leads.capture` → exit check again → receipt through `commit` → repair enqueue on `stale` or `unavailable`.
- **Hand-offs.** Message rendering, routes, and outbound delivery states belong to candidate #3 (InquiryMessage lifecycle). Approval keeps `buildContext` but builds it from `ws.currentInquiry(id)`. Hydration happens once per request instead of 3× (authorize `:908`, execute `:749`, recheck `:797`, driven by `event-actions.ts:263,270`).

## Tests

- **Survive unchanged:** `inquiry-engine`, `inquiry-repository`, `inquiry-storefront`, `inquiry-publication`, `inquiry-workspace-exit`, plus the `pnpm check:workspace-sql` checks.
- **Replaced:**
  - `inquiry-public-submit.test.ts` (6 `vi.mock`s): one route-mapping table test with a fake `receiveInquiry`, plus an intake outcome table on the module with memory ports.
  - `inquiry-delivery-server.test.ts:26` `vi.mock("@/lib/leads")`: memory leads port.
  - Approval `getLead` deps: leads port.
  - `inquiry-receive.test.ts`: rewritten as `receiveInquiry` cases.
  - `inquiry-reconciliation` and `inquiry-follow-up-sweep`: pass ports instead of `leads` and `getLead` options.
- **New:**
  1. **One fixture, every caller.** Lead on revision 3 with an assignee record change. Capability at revision 3, `live_unverified`. Cron, approval context, owner surface and repair all see the same record, assignee and currentness. Republish as revision 4 and all of them flip to `revision_changed`.
  2. **CAS.** Memory repo forces one conflict. `mutate` runs twice, the second time on the fresh revision, and overlay status is reread.
  3. **Intake outcome table** over both sources: exit before and after capture, duplicate with and without a lead body, stale after capture → `pending` plus a queued repair, snapshot failure → `unavailable{retained:true}`.
  4. **Leads port down.** Stubs carry `fieldsAvailable:false`, and nothing renders as an empty inbox.

## Migration steps

1. Add the `LeadsPort` with Redis and memory adapters. Add characterization tests that pin today's three builders and two stub paths, so each difference gets decided out loud. No behavior change.
2. Add the hydration and currentness functions. Point `record-projection.ts` and `delivery-approval-primitives.ts` at them, and delete `statusFromState`.
3. Add `openInquiryWorkspace`. Port the owner surface (`server.ts`), then the cron, then approval. **Approval adopting live intent changes outbound-email eligibility: Jacob's yes on the rule (Q1) before merge.**
4. Add `commit`. Port `recordInquiryEvidence` and `persistVerifiedReceipt`. Publication keeps its single-attempt CAS, because claim ordering owns it.
5. Add `receiveInquiry`. Port the leads route behind the exact mapping table. Run contract tests and `pnpm check:custom-repos`. Then port booking. This changes booking behavior on exit after capture, on duplicates without a lead body, and on stale. Write it up in the PR.
6. Delete `stateForReceive`'s external uses, `recordFromLead`, `inquiryFromLead`, the cron's submission patching, and the dead `upsertInquiryRecordOverlay` export.
7. **Jacob's yes:** every production deploy. No migration, no env change, no `/api/v1` shape change. `STRELVA_INQUIRIES_RELEASE` stays off until its own checklist passes.

## Decisions worth an ADR

**Currentness is live intent plus an exact captured revision. Verification health never gates handling.** It is hard to reverse, because it decides which customers get email. A reader seeing `live_unverified` pass a gate for human-approved sends would be surprised. And it was a real trade-off against `live`-only, which is safer per send but blocks every inquiry after each publish. Record it once Jacob answers Q1.

## Open questions for Jacob

1. **Approved sends on `live_unverified`.** Should an owner-approved reply be allowed while the published form is accepted but not yet verified? The cron already sends automated follow-ups in that state. I recommend yes, and one rule for both.
2. **Inquiries captured on an older revision.** After a republish, today they can never get an approved reply or an automated follow-up. They stay visible, but no button works. Options:
   - Bind messages to the captured revision, as repair already does.
   - Bind them to the current routing.
   - Mark them "handle outside Strelva."
3. **Record overlays.** The table has no production writer. Keep it as a read fallback, or retire it with a migration later?
4. **409 for a stopped workspace.** Should the starter get a distinct message? That would be additive: same 409, but the client reads `code`.
