# Inquiry message lifecycle

Status: proposed · 2026-10-05 · candidate 3 of 9 · source: architecture review

## What it is

One module that owns the life of one outbound inquiry message: an inquiry reply, a follow-up or a staff notice. It covers the attempt, the provider's answer, later provider reports, the message receipt and reconciliation. Today the same facts sit in three places: the governed event (`metadata.execution.state` in `src/lib/events.ts`), a 10-status Redis checkpoint (`delivery-store.ts`) and the responsibility receipt in the Postgres workspace. Six files each classify those statuses on their own, and they disagree. The module gives one answer to "was it sent, is it finished, may we try again". The approval workflow, the cron, the webhook and the UI all read that answer.

Message rendering stays in `delivery-message.ts`. Hydrating the inquiry and the current policy belongs to candidate #4 (InquiryWorkspace). The lifecycle takes a rendered message plus one `recheck()` callback from #4.

## Language

**Inquiry message**:
One email Strelva sends about one inquiry for one purpose. There is at most one per inquiry and purpose.
_Avoid_: delivery, notification, action, send

**Message purpose**:
Why the message exists: reply to the customer, follow-up to the customer, or staff notice.
_Avoid_: action, owner_notification (it goes to staff, not the owner)

**Message review**:
The exact rendered message, held for the responsibility sponsor's approval.
_Avoid_: approval event, change request, draft

**Approval**:
The sponsor's explicit yes to one message review. A standing approval is a responsibility rule that allows a purpose without a review.
_Avoid_: authorization, resolve, pre-authorization

**Send attempt**:
One claimed try to hand the message to the email provider.
_Avoid_: delivery, execution, claim, retry

**Accepted**:
The provider took the message and gave it an id. From then on the message counts as sent, and Strelva never offers another attempt.
_Avoid_: delivered, success, sent, verified

**Rejected**:
The message was refused before the provider took it. Only a rejected message can have another attempt.
_Avoid_: failed, bounced, suppressed

**Unknown outcome**:
An attempt may have reached the provider, but Strelva never heard back. It is treated as possibly accepted.
_Avoid_: failed, timeout, error

**Provider report**:
Later evidence about an accepted message: delivered, deferred, bounced, suppressed, failed or complained. It can come from a webhook or from a read-back.
_Avoid_: outcome, verification, webhook status

**Delivered**:
A provider report that the recipient's mail server took the message.
_Avoid_: verified, accepted, sent

**Deferred**:
A provider report that delivery is delayed and the provider is still trying. The message is accepted and not finished.
_Avoid_: failed, pending, retry

**Bounced**:
A provider report that the recipient's server refused the message for good. The message is accepted and finished undelivered.
_Avoid_: rejected, failed

**Suppressed**:
A provider report that the provider would not deliver because the address is on its suppression list. The message is accepted and finished undelivered.
_Avoid_: unconfigured, disabled (those are rejections)

**Unconfirmed**:
Accepted, but no provider report has arrived and read-back could not confirm anything yet.
_Avoid_: accepted_unverified, pending verification

**Reconciliation**:
A person or job checks what happened to an unknown outcome or a stuck receipt, then records the finding. It never sends.
_Avoid_: retry, recovery, repair

**Message receipt**:
The durable record in the business's workspace that Strelva sent this exact message on this approval.
_Avoid_: delivery receipt, responsibility receipt, provider receipt

**Lifecycle verdict**:
The single answer the module gives the approval workflow: not sent, sent, in progress, or needs reconciliation.
_Avoid_: accepted / safeToResolve / receiptPersisted / verified flags

Decision on "accepted": deferred, bounced, suppressed and provider-failed are all **accepted**. None of them allows another attempt. Deferred is accepted and still open. Bounced, suppressed, failed and complained are accepted and finished.

Overloads to retire in prose: **delivery** also names the synthetic agency preview (`src/experience/delivery/model.ts:1`, "Never used as … production delivery state"), offering provider delivery (`offering-provider-delivery*`), and the client lifecycle emails (`delivery-email-*`). **accepted** also names an `EventWorkflowAction` (`event-actions.ts:37`) and a receipt status (`delivery-approval-service.ts:716`). **suppressed** also labels a local "email unconfigured" rejection (`delivery-email.ts:37-43`). **action** names three different things: event approve/dismiss, responsibility action and message purpose.

## Status classification today

Y = yes, — = no. "Retry" means a new send attempt is allowed. Columns: approval `checkpointAccepted` (`delivery-approval-service.ts:503-513`); store `beginAttempt` terminal list (`delivery-store.ts:397-398`, memory `:696-697`); cron reply evidence for follow-up (`follow-up-cron.ts:388`); cron counts the message as sent (`:432,459`); cron sweep count (`:119`); UI closes retry (`InquiryMessageReview.tsx:27-34,183-185`); UI provider-accepted (`:156`). The UI columns use the outcome status after `outcomeFromCheckpoint` (`delivery-approval-service.ts:515-543`).

| Checkpoint status | Accepted (svc) | Terminal (store) | Retry | Cron follow-up ok | Cron "sent" | Cron count | UI closes retry | UI accepted | Should be |
|---|---|---|---|---|---|---|---|---|---|
| sending | — | reconcile | — | — | — | failed | Y (as reconciliation_required) | Y | Unknown outcome |
| unknown | — | reconcile | — | — | — | failed | Y | Y | Unknown outcome |
| accepted | Y | Y | — | Y | Y | accepted | Y | Y | Accepted, unconfirmed |
| accepted_unverified | Y | Y | — | **—** | Y | accepted | Y | Y | Accepted, unconfirmed |
| verified | Y | Y | — | Y | Y | accepted | Y | Y | Accepted, delivered (read-back) |
| delivered | Y | Y | — | Y | Y | **failed** | Y | Y | Accepted, delivered |
| deferred | Y | Y | — | — | **—** | **failed** | **—** | **—** | Accepted, open |
| bounced | Y | Y | — | — (also blocks customer after a staff-notice bounce, `:367`) | — | failed | **—** | **—** | Accepted, finished |
| suppressed | Y | Y | — | — (blocks, `:367`) | — | failed | **—** | **—** | Accepted, finished |
| failed + provider report | Y | Y | — | — (blocks) | — | failed | **—** | **—** | Accepted, finished |
| failed, retryable | — | — | Y (to `maxAttempts`) | — (blocks, `:367`) | — | failed | — | — | Rejected, retry |
| failed, not retryable | — | Y → reported as **accepted_unverified** (`delivery.ts:800`) | — | — | — | failed | — | — | Rejected, finished |

Event-side flags (`event-actions.ts:124-146,262-285`; `events.ts:90-180`): `processing` and `external_accepted` block a new claim. `failed` unblocks it, so the checkpoint is the only real barrier against a second send. `reconcileInquiryMessageReview` (`delivery-approval-service.ts:938-949`) repeats the status list a seventh time.

## Scenarios

| Scenario | Today (verified) | With the module |
|---|---|---|
| 1. Provider accepts, receipt CAS fails 3× | `persistVerifiedReceipt` returns false (`svc:658-731`). `safeToResolve=false` (`svc:885`) leads to `markExecutionExternalAccepted` (`event-actions.ts:275`); the event stays pending. The next click takes the reconcile branch (`ea:124-146`) and retries the receipt. Correct, but the logic is spread over 3 files. | Verdict `{sent, receipt:"pending"}`. `lifecycle.reconcile(key)` retries the receipt. event-actions only maps the verdict. |
| 2. Webhook arrives before the send call returns | The checkpoint is still `sending` with no provider id, so the result is `unmatched` (`reconciliation.ts:629`). The route answers 503 (`webhooks/resend/route.ts:77-80`) and Resend retries. Safe. | Same 503, by design. Acceptance and the provider index are written in one CAS, so the retry matches. |
| 3. Provider accepted, then the `markAccepted` write fails | The checkpoint stays `sending` and the provider id exists only in the lost result (`delivery.ts:857-864`). Webhooks stay unmatched until Resend gives up. Reconcile sees "not accepted" (`svc:938`), so the event stays pending forever. **The receipt and provider id are lost.** | Bounded retry of the acceptance CAS. The verdict carries `providerMessageId`, and event-actions writes it on the event as a second copy. Reconciliation can then finish from either copy. |
| 4. Deferred, then delivered | The `deferred` priority goes 1→2 (`delivery-store.ts:180-199`), which is correct. But the approval already resolved with no receipt (`svc:881-886`: `receiptPersisted` defaults to true when not verified). The later `delivered` report never writes one, because only `svc` writes receipts. The UI said "The failed attempt was recorded… Prepare a new review" (`ui:444-447`). The cron counts it as failed (`:119`). The webhook timeline records deferred as `failed` (`reconciliation.ts:673`); read-back records it as `accepted` (`delivery.ts:897`). | Deferred shows as "accepted, provider still trying". A `delivered` report runs `onReport`, which writes the owed message receipt. One timeline mapping. |
| 5. Bounced after accepted | Terminal (priority 3). The UI offers "Prepare a new review", but a new review can never send: the checkpoint key is inquiry + purpose (`delivery-store.ts:142`) and so is the Resend idempotency key (`delivery-message.ts:98,135`). It approves into "bounced" again. A dead end. | Verdict `{sent, delivery:"undeliverable"}`. The UI says what happened and offers no resend until Jacob decides Q2. |
| 6. Owner clicks approve twice | Sequential: `svc:596-600` returns the stored outcome. Concurrent: the second click sees `processing` and enters the reconcile branch. That branch runs before `claimEventAction` (`ea:124` vs `:223`) and so bypasses the action lock. If the first attempt has just been accepted, the second resolves the event. The first then gets `already_resolved`, and the owner sees "receipt needs checking" (`svc:609-617`) for a clean send. No second send. | One `send()` holds the lease. A concurrent call gets `{in_progress}`. Reconcile refuses while a lease is live. |
| 7. Cron reply races the owner's approved reply | Both use the same checkpoint key, so the `SET NX` claim lets one win. The loser gets `already_accepted`, which maps to `accepted_unverified` (`delivery.ts:800`). Or it gets `already_verified` (`:635`), after which `persistVerifiedReceipt` writes a receipt with the **owner's** body and digest. The checkpoint stores no digest (`delivery-types.ts:142-167`). The receipt is false whenever the two bodies differ, for example after a capability edit between the first send and a new review. | The checkpoint stores the digest. A different digest gets the verdict "another message already went out for this purpose" and no receipt. |
| 8. Provider times out (unknown outcome) | The send throws, giving `unknown` (`delivery-email.ts:44-45`). That becomes `markFailed(ambiguous)`, then status `unknown` (`delivery-store.ts:639`). The event gets `failed` and unblocks (`ea:237`). The next click hits the `unknown` checkpoint, which gives `reconciliation_required` (`delivery.ts:705`). No send, but nothing ever resolves it: there is no provider id to read back or match. After the 90-day TTL (`delivery-store.ts:25`) the barrier disappears. | `needs_reconciliation`, with a reconcile path that records "found accepted <id>" or "confirmed not sent". The provider lookup by tag is still unproven (Q6). |
| 9. Spam complaint after delivered | `email.complained` becomes `failed` (`reconciliation.ts:465`). Priority 3 overrides delivered, so a delivered message now shows as failed. | A complaint is its own report. The message stays delivered. |

**Double send today: no practical path.** One theoretical window exists. Redis `beginAttempt` reads the checkpoint (`delivery-store.ts:395`) before it claims (`:411`), and the claim is released in `finally` (`delivery.ts:915`). Suppose a caller reads before another caller writes `sending` (`:429`), then claims after that caller has released. It would overwrite an accepted checkpoint and send again. Resend's 24-hour idempotency key `inquiry:{id}:{purpose}` (`delivery-message.ts:98`) very likely absorbs that. The memory store has no await between check and claim, so it cannot show this race. **Lost receipt today: yes**, three paths: scenarios 3, 4 (and accepted-unverified, then delivered) and 7 (a false receipt).

## Contradictions in the code

1. The definition of accepted varies: compare the svc, store, cron, UI and classify columns above. The UI tells the owner a deferred, bounced or suppressed message is a "failed attempt" and invites a review that cannot send.
2. The cron counts `accepted_unverified` as a sent reply (`follow-up-cron.ts:459`). Its follow-up check refuses `accepted_unverified` (`:388`), so follow-up silently stops whenever read-back was unavailable.
3. `delivered` and `deferred` are counted as **failed** in sweep metrics (`:119`).
4. Deferred is written to the timeline as `failed` by the webhook (`reconciliation.ts:673`) and as `accepted` by read-back (`delivery.ts:897`).
5. "Verified" means read-back saw a delivered, opened or clicked event (`delivery-email.ts:67`). It is a delivered report, not a separate fact. Read-back checks recipient and subject, not the body (`:60-65`).
6. `already_accepted` from `beginAttempt` also covers non-retryable *rejections*. `delivery.ts:800` reports those as `accepted_unverified`.
7. The memory store dedupes the timeline by `causedByEventId` (`delivery-store.ts:855`); Redis does not (`:652-658`). Tests on the memory store prove a guarantee production lacks.
8. `markAccepted` and `markFailed` read and then write without CAS (`delivery-store.ts:436-472,632-645`). Only verify and report transitions are atomic.
9. A local "email unconfigured" result is labelled `outcome:"suppressed"` and `retryable:true` (`delivery-email.ts:37-43`). It is a rejection.
10. Cron sends under standing approval never write a message receipt. Only owner-approved and delivered sends do.

## Interface

**A. Pure transition plus store port.** `transition(state, event)` is a pure function. Stores do a domain-free compare-and-set by version. **B. Aggregate object.** `InquiryMessage.load(key)` with `approve/recordAcceptance/applyReport` methods. It is deep, but a stateful object hides the concurrency, and every method re-implements CAS. **C. Event-sourced log.** Each message appends facts (attempt_started, accepted, report…) and state is a fold over them. This gives the best audit trail and merges with the timeline. It needs a new Redis list shape, a log migration for existing checkpoints, and a CAS at attempt start anyway.

**Recommend A.** It puts every rule in one TypeScript function that can be tested as a table. The Lua shrinks to a generic CAS, so it can no longer drift from the TS. The callers' interface stays at four methods. C's audit trail mostly exists already in the timeline.

```ts
// src/products/inquiries/message-lifecycle.ts
export type MessageKey = { tenantId: string; inquiryId: string; purpose: InquiryDeliveryAction };
export type ProviderReport = { kind: "delivered" | "deferred" | "bounced" | "suppressed" | "failed" | "complained";
  eventId: string; at: string; source: "webhook" | "readback"; reason?: string };
export type MessageState =
  | { phase: "none" }
  | { phase: "rejected"; attempts: number; retryable: boolean; reason: string; digest: string }
  | { phase: "attempting"; attemptId: string; attempts: number; digest: string; startedAt: string }
  | { phase: "unknown"; attemptId: string; attempts: number; digest: string; reason: string }
  | { phase: "accepted"; attemptId: string; digest: string; acceptedAt: string; providerMessageId?: string;
      report: ProviderReport | null; complaint?: ProviderReport; receipt: "not_due" | "owed" | "persisted" };
export type LifecycleEvent =
  | { type: "attempt_started"; attemptId: string; digest: string; at: string; maxAttempts: number }
  | { type: "accepted"; attemptId: string; providerMessageId?: string; at: string; receiptDue: boolean }
  | { type: "rejected"; attemptId: string; retryable: boolean; reason: string }
  | { type: "unknown"; attemptId: string; reason: string }
  | { type: "report"; providerMessageId: string; report: ProviderReport }
  | { type: "receipt_persisted" }
  | { type: "reconciled"; finding: { accepted: true; providerMessageId?: string; at: string } | { accepted: false } };

/** Pure. The only place lifecycle rules live. Never touches I/O. */
export function transition(state: MessageState, event: LifecycleEvent):
  { ok: true; next: MessageState } | { ok: false; reason: "already_sent" | "in_progress" | "needs_reconciliation"
    | "retry_exhausted" | "attempt_mismatch" | "stale_report" | "digest_mismatch" };

/** Pure. Replaces checkpointAccepted, both terminal lists, the cron lists and the UI sets. */
export function classify(state: MessageState): { accepted: boolean | "unknown"; finished: boolean;
  retryAllowed: boolean; delivery: "none" | "awaiting" | "deferred" | "delivered" | "undeliverable";
  ownerHeadline: "sent" | "delivered" | "still_trying" | "undeliverable" | "not_sent" | "check_needed" };

export type LifecycleVerdict =
  | { kind: "not_sent"; retryAllowed: boolean; reason: string }
  | { kind: "sent"; receipt: "persisted" | "not_due" | "owed"; delivery: ReturnType<typeof classify>["delivery"];
      providerMessageId?: string; acceptedAt: string }
  | { kind: "needs_reconciliation"; reason: string; providerMessageId?: string }
  | { kind: "in_progress" };

export interface InquiryMessageLifecycle {
  /** Claims, rechecks once, sends at most once per key, records acceptance before anything else. */
  send(input: { key: MessageKey; message: InquiryDeliveryMessage; digest: string;
    approval: InquiryDeliveryApproval | { standing: true; responsibilityId: string };
    recheck: () => Promise<{ allowed: true } | { allowed: false; reason: string }>;  // from #4
    receipt?: MessageReceiptRequest }): Promise<LifecycleVerdict>;
  report(input: { tenantId: string; providerMessageId: string; report: ProviderReport }):
    Promise<"applied" | "ignored" | "unmatched">;   // unmatched → webhook 503
  reconcile(key: MessageKey, finding?: LifecycleEvent & { type: "reconciled" }): Promise<LifecycleVerdict>;
  read(key: MessageKey): Promise<{ state: MessageState; class: ReturnType<typeof classify> }>;
}
export function createInquiryMessageLifecycle(deps: { store: CheckpointStore; transport: EmailTransport;
  receipts: MessageReceiptWriter; now: () => Date }): InquiryMessageLifecycle;
```

event-actions maps the verdict in a single switch. `sent` + `persisted|not_due` resolves approved. `sent` + `owed` or `needs_reconciliation` marks `external_accepted` (with the provider id) and stays pending. `not_sent` finishes as failed. `in_progress` reports `action_in_progress`. This replaces the four booleans. The reconcile branch at `event-actions.ts:124-146` becomes `lifecycle.reconcile`, behind the same action lock. `approveInquiryMessageReview` stops importing `@/lib/event-actions`. The message-review route calls `resolveEventAction`, then `lifecycle.read`, which removes the cycle.

## Behind the seam

- **CheckpointStore.** `read(key) → {state, version}`; `compareAndSet(key, expectedVersion, next, indexes)`; `lease/release`; `reserveBudget`; `findByProviderMessageId`; `appendTimeline(dedupeBy)`. Adapters: Redis (Lua) and memory. These are two real adapters, so the seam is real. **Lua sync:** the only stateful Lua left is a generic script, about 8 lines: "if stored.version == ARGV.expected then SET state and index keys, return new else return current". The budget and lease scripts are unchanged. `report()` runs read → `transition` → CAS, with up to 3 rereads on conflict. Two webhooks racing each other converge, because `transition` is order-insensitive for reports (keep the priority rule plus newest-at). Attempt start becomes one CAS from the version that was read. That closes the `beginAttempt` window. Stored JSON keeps `status` and the `reb:inquiry-delivery:*` keys (frozen names). New fields `version` and `digest` are additive. A `fromStored` function maps the 10 old statuses into phases.
- **EmailTransport.** `send` and `readback`. Adapters: Resend (`delivery-email.ts`) and a fake. A read-back result becomes a `report` event with `source:"readback"`.
- **MessageReceiptWriter.** Writes the message receipt via the workspace CAS. After #4 lands, this is `ws.commit`.
- **ApprovalEvents** stays outside. Governed events are event-actions' concern. The lifecycle never imports `@/lib/events`.
- **Folded in:** `getPolicy`, `getResponsibilityGate` and `getFollowUpRecheck` become one `recheck()` that the caller supplies. #4 builds it, once per request.

## Tests

- **Survive:** `inquiry-reconciliation.test.ts` and `inquiry-resend-webhook*.test.ts` (signature, matching, 503). The store race tests in `inquiry-delivery-store.test.ts` survive as CAS-conflict tests. `inquiry-message-review-ui.test.ts` survives, with new cases.
- **Replaced:** the `@/products/inquiries` wholesale mock (`event-actions.test.ts:41-46`) becomes a fake lifecycle that returns verdicts. The `resolveAction` stub in `inquiry-delivery-approval.test.ts` goes away because the cycle is gone. The third JS copy of the Lua in the fake `redis.eval` (`inquiry-delivery-store.test.ts:42-46`) goes too.
- **New:** (1) A full state × event table for `transition`, about 7 phases × 7 events, with every cell asserted. (2) `classify` snapshot against the "Should be" column above. (3) An in-memory scenario suite for 2–9 above, each asserting the fake transport's `send` count ≤ 1, plus a property test with random interleavings of two `send` calls and N reports, asserting exactly one send. (4) **Lua that actually runs.** CI has no Redis (`docs/operations/testing-and-ci.md:159`) and the repo only has `@upstash/redis` (REST). Add an opt-in `pnpm check:inquiry-lua`, like `check:workspace-sql`. It starts `redis-server --port 0` (present at `/opt/homebrew/bin`) and drives a `RedisLike` adapter over `redis-cli EVAL` through `execFile`, with no new npm dependency. It runs the CAS, budget, lease and event-claim scripts, including two concurrent CAS writers. Local proof only.

## Migration steps

0. **Standalone UI fix.** In `InquiryMessageReview.tsx`, treat any outcome with `acceptedAt`/`providerMessageId`, or status `deferred|bounced|suppressed`, as provider-accepted: add them to `COMPLETION_STATUSES` and to the `:156` list. Replace "The failed attempt was recorded… Prepare a new review" for them with copy that says no resend is possible. Add cases to `inquiry-message-review-ui.test.ts` and check desktop and mobile. Shipping it needs Jacob's yes (production deploy).
1. Add `classify` and `fromStored` over today's checkpoint shape. Switch `checkpointAccepted`, both terminal lists, `reconcileInquiryMessageReview`, cron `classify` and the UI to it. Keep the cron's fail-closed follow-up rule behind its own predicate until Q3 is answered.
2. Land `check:inquiry-lua` against the **current** 7 scripts before changing any.
3. Add `digest` and `version` to new checkpoints (additive). Refuse a receipt when the digest differs (fixes scenario 7).
4. Add `transition` and the generic CAS script. Move the Redis and memory adapters onto it. Make attempt start atomic. Delete the TS/Lua priority copies.
5. Return `LifecycleVerdict` to event-actions. Delete the four booleans and the dynamic import cycle.
6. Write the owed receipt when a `delivered` report follows resolution (scenario 4). Record the provider id on the event (scenario 3).
7. Production deploy: **Jacob's yes**, with the release checklist. No database migration and no env change. Any live-email check of real bounce, deferred or complaint webhooks also needs **Jacob's yes**.

## Decisions worth an ADR

**One message per inquiry and purpose; accepted is final, including deferred, bounced and suppressed.** It is hard to reverse: the checkpoint key and the Resend idempotency key both encode it, and allowing a resend after a bounce needs a per-message identity, a new key scheme and a migration of live checkpoints. It is surprising: an owner who fixes a bad address still cannot resend. There is a real trade-off: zero risk of a duplicate customer email against recovering from a bad address. Record it once Jacob answers Q2.

## Open questions for Jacob

1. **Deferred:** should the owner see "The provider is still trying; nothing to do", with no action and an update when it lands or bounces? Or should it be a warning that asks them to act?
2. **After a bounce or suppression,** may a corrected message ever be sent for the same inquiry and purpose? Today never: the UI invites it, but the system refuses.
3. **Should an accepted but unconfirmed reply allow the automatic follow-up?** Today it silently blocks follow-up (`follow-up-cron.ts:388`).
4. Should a spam complaint after delivery count as failed?
5. Do messages sent under a standing approval owe a message receipt?
6. Is reconciling an unknown outcome by looking up the provider (by `strelva_inquiry_id` tag) acceptable, or is it manual-only? The Resend lookup capability is unverified.
