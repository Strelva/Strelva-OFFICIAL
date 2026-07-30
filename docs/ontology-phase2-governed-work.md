# Ontology Phase 2 — governed-work tables

Status: **LIVE in production.** The migration is applied, both flags are on in prod, and
the repository uses the typed `getSupabase()` client directly — not the old untyped shim.
`database.types.ts` was regenerated at the #8 cutover so the compiler enforces the schema.
The hand-authored domain types in `src/lib/governed-work/types.ts` and the `governedWorkDb()`
untyped shim described further below are **gone**; the repository now uses `Row<"proposals">`
/ `Insert<"proposals">` etc. from the generated types.

See `AGENTS.md` "Governed-work Postgres mirror" for the current runtime state. This document
explains the design decisions and lifecycle model; treat it as the authoritative design record,
not a status source.

## Why

Today the governed-work lifecycle — an AI/admin proposes a change, the owner approves or
dismisses it, the system performs an external write, and that write succeeds/verifies/fails —
lives entirely in Redis as a single `UnifiedEvent` blob (`src/lib/events.ts`), mutated in
place through `src/lib/event-actions.ts`. Postgres `unified_events` is a **non-authoritative
mirror** (`docs/persistence-boundaries.md`, row "Event and approval queue"). The whole
lifecycle is squashed into one row + a `metadata.execution` sub-object.

Phase 2a normalizes that one blob into four typed tables so a later increment can make
Postgres the authority. The initial increment laid the schema + the TS types + the repository.
Subsequent increments wired the dual-write shadow, the read flip, and the reconcile cron.
Redis remains authoritative; see the "cutover" section below for current status.

## Lifecycle

```
proposal ──(decision: approved)──▶ execution_attempt ──▶ outcome
    │                                                       │
    └──(decision: dismissed)── terminal                     └─ success gates resolution;
                                                               verified is the read-back
```

- **proposal** — a governed change was proposed (the `UnifiedEvent` while `status='pending'`).
- **decision** — the owner/operator approved or dismissed it (`claimEventAction`).
- **execution_attempt** — an approval triggered an attempt to perform the external write
  (post to Google, send newsletter, publish review reply). Non-idempotent, so attempts are
  tracked with an `idempotency_key` (the Redis `attemptId` / `processing` reconciliation marker).
- **outcome** — the terminal result. `success` = the provider accepted the write (this is
  what gates resolution — see "resolve on success, not verified" below). `verified` = the
  separate read-back confirmation.

## Field → table mapping

Every field of the current `UnifiedEvent` (`src/lib/types.ts`) and its
`metadata.execution` marker maps to a column in the new model:

| UnifiedEvent field / marker | New location | Notes |
|---|---|---|
| `id` (`evt_*` / `sug_*`) | `proposals.id` (text PK) | Kept as the app text id, not a fresh uuid, so a shadow row is keyed 1:1 to its Redis event for parity checks. |
| `tenantId` | `proposals.tenant_id` | FK → `tenants(id)`, tenant-scoped like every other table. |
| `source` | `proposals.source` | Collapsed to `ai` / `admin` / `system` (the governance-relevant actors). |
| `type` | `proposals.entity_type` | The event kind: `content_update`, `review`, `newsletter_draft`, `change_request`, … |
| `metadata.kind` | `proposals.kind` | e.g. `gbp_post_draft`, `gbp_hours_draft`, `review_reply_draft`. |
| `title` | `proposals.title` | |
| `body` | `proposals.body` | |
| `metadata` (execution-driving) | `proposals.payload` (jsonb) | The full metadata blob that drives the external write (summary, ctaUrl, hours, reviewId, …). |
| `status` | `proposals.status` | `pending`/`approved`/`dismissed` mirror Redis; `executed`/`failed` are new terminals the outcome adds. `auto_approved` events map to a proposal already `approved` with a system decision. |
| `createdAt` | `proposals.created_at` | |
| `resolvedAt` | `decisions.decided_at` | Resolution time becomes the decision timestamp. |
| `claimEventAction(action, …)` | `decisions.action` | `approved` / `dismissed`. |
| `claimEventAction(…, actor)` | `decisions.actor` | The `user` / `system` actor from the claim. |
| `metadata.execution.attemptId` | `execution_attempts.idempotency_key` | The crash-surviving reconciliation marker. |
| `metadata.execution.state` (`processing`/`completed`/`failed`) | `execution_attempts.status` (`running`/`succeeded`/`failed`) | State rename for the normalized model. |
| (implicit single attempt) | `execution_attempts.attempt_no` | Redis carries one attempt; the table admits retries explicitly. |
| `metadata.execution.startedAt` | `execution_attempts.started_at` | |
| `metadata.execution.finishedAt` | `execution_attempts.finished_at` | |
| provider ack (e.g. created post id) | `execution_attempts.provider_receipt` (jsonb) | Not first-class in Redis today; captured here. |
| write accepted (`result.success` / `published`) | `outcomes.success` | The resolution gate. |
| read-back (`verified`; `change_verified` / `change_verify_failed`) | `outcomes.verified` | A true `success` with false `verified` is the `change_verify_failed` signal. |
| `metadata.execution.reason` / failure detail | `outcomes.detail` | |

### Resolve on `success`, not `verified`

The external writes are non-idempotent (a re-posted GBP update or review reply duplicates),
so `event-actions.ts` gates resolution on the write being *accepted* (`success`/`published`),
not on the read-back (`verified`). The schema preserves that distinction: `outcomes.success`
is the gate; `outcomes.verified` is a separate nullable column. A `success && !verified`
outcome is exactly the `change_verify_failed` case — the write happened, the confirmation
didn't — so the two are never collapsed into one boolean.

## Files in this increment (as shipped)

- `supabase/migrations/20260714210000_governed_work_tables.sql` — the four tables + indexes +
  CHECK constraints + tenant-scoped RLS. **Applied to production.**
- `src/lib/governed-work/types.ts` — camelCase domain types + status unions. *(The hand-authored
  row types and `governedWorkDb()` untyped shim from earlier drafts are gone; the repository
  now uses the generated `Row<"proposals">` / `Insert<"proposals">` types from `database.types.ts`.)*
- `src/lib/governed-work/repository.ts` — the live repository (`insertProposal`, `getProposal`,
  `recordDecision`, `startExecutionAttempt`, `finishExecutionAttempt`, `recordOutcome`, and the
  full set of read-flip helpers). Uses the typed `getSupabase()` client directly.
- `src/lib/governed-work/shadow.ts` — best-effort write orchestrator (gated by
  `GOVERNED_WORK_DUAL_WRITE`; no-op when flag is off).
- `src/lib/governed-work/read.ts` — `proposalToEvent` reverse-mapper for the read flip (gated
  by `GOVERNED_WORK_READ_PG` in `events.ts`; falls back to Redis on any reconstruction miss).
- `src/lib/governed-work/reconcile.ts` — `governed-work-reconcile` cron (every 6h): re-asserts
  every governed Redis event has a current Postgres row; inserts missing rows + re-syncs stale
  statuses; Slack-alerts on non-zero drift.

### Types are now generated (not hand-authored)

`database.types.ts` was regenerated after the migration was applied. The repository uses
`Row<"proposals">` / `Insert<"proposals">` etc. from the generated types. The old
`governedWorkDb()` untyped shim and the parallel hand-written row types have been deleted.
The `governedWorkDb()` call pattern described in earlier drafts of this doc is no longer
present in the codebase.

## #8 cutover — completed steps and current state

Steps 1–4 are done. Step 5 (full Postgres authority) is deliberately NOT done — the hybrid
is the chosen architecture. Current production state:

1. ~~**Apply the migration**~~ Done. `database.types.ts` regenerated.
2. ~~**Dual-write, shadowing Redis.**~~ Done. `GOVERNED_WORK_DUAL_WRITE` is LIVE in prod.
   Every `addEvent`/`claimEventAction`/`resolveEvent`/`finishEventAction` also writes the
   corresponding Postgres row via `shadow.ts`.
3. ~~**Verify parity.**~~ Done. `scripts/governed-work-parity.ts` confirmed 97/97. Gap #3
   (custom `change_request` workflow states) closed 2026-07-15 via `shadowChangeRequestWorkflow`.
4. ~~**Flip reads.**~~ Done. `GOVERNED_WORK_READ_PG` is LIVE in prod. `getEvents`/`getEvent`
   hydrate governed events from Postgres via the `proposalToEvent` reverse-mapper in `read.ts`;
   a reconstruction miss falls back to the Redis event.
5. **Flip authority** (make Postgres the gating write) — **deliberately NOT done.** The hybrid
   Redis-primary + PG-mirror is the chosen architecture. Writes stay Redis-primary; PG is a
   guaranteed-complete durable mirror against the 90-day Redis TTL, maintained by the
   `governed-work-reconcile` cron (every 6h).

**Membership/status-filtering/index/ordering stay Redis-authoritative** — `getOpenChangeRequest`
and `getQueueCount` read Redis so they can't be corrupted by a shadow gap. The "Event and
approval queue" row in `docs/persistence-boundaries.md` stands: **Redis is authoritative,
Postgres is a verified durable mirror.**

### Known issues / TODO

- **Audit finding [HIGH][bug]**: `google-meta:${t}` (used by `gbp-management.ts` and
  `gbp-replies.ts`) is not in `authoritativePatterns` in `src/lib/tenant-rename.ts` — GBP
  writes silently fail after a tenant rename because the key is classified as a cache but
  isn't regenerated from Postgres. Also missing: `review-replies:recent:${t}`,
  `reb:review-nudge-sent:${t}`, `reb:order-review-request-sent:${t}:*`, and
  `reb:review-reply-declined:${t}:*` (the declined-reply veto is 180 days durable).
  Fix: add all four patterns to `authoritativePatterns` and update the completeness unit test.
- **Audit finding [MEDIUM][tech-debt]**: `database.types.ts` may drift from applied migrations.
  A CI check (`find supabase/migrations -newer src/lib/db/database.types.ts`) would catch this.
