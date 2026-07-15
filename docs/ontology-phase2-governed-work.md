# Ontology Phase 2 — governed-work tables

Status: **additive foundation, NOT wired, migration NOT applied.** Authority for the
governed-work lifecycle STAYS in Redis in this increment. This document describes the
schema laid down by `supabase/migrations/20260714210000_governed_work_tables.sql` and the
staged cutover (increment #8) that would eventually move approval authority off Redis. No
behavior changes here.

## Why

Today the governed-work lifecycle — an AI/admin proposes a change, the owner approves or
dismisses it, the system performs an external write, and that write succeeds/verifies/fails —
lives entirely in Redis as a single `UnifiedEvent` blob (`src/lib/events.ts`), mutated in
place through `src/lib/event-actions.ts`. Postgres `unified_events` is a **non-authoritative
mirror** (`docs/persistence-boundaries.md`, row "Event and approval queue"). The whole
lifecycle is squashed into one row + a `metadata.execution` sub-object.

Phase 2a normalizes that one blob into four typed tables so a later increment can make
Postgres the authority. This increment only lays the schema + the TS types + an unused
repository. It moves no authority and changes no read path.

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

## Files in this increment

- `supabase/migrations/20260714210000_governed_work_tables.sql` — the four tables + indexes +
  CHECK constraints + tenant-scoped RLS. **Authored, not applied.**
- `src/lib/governed-work/types.ts` — hand-authored camelCase domain types + status unions.
- `src/lib/governed-work/repository.ts` — additive, **unused** best-effort repository
  (`insertProposal`, `getProposal`, `recordDecision`, `startExecutionAttempt`,
  `finishExecutionAttempt`, `recordOutcome`).

### Why the types are hand-authored (not generated)

`src/lib/db/database.types.ts` is generated from the **applied** schema. This migration is
deliberately unapplied, so the generated `Database` type has no knowledge of these tables. The
domain types in `types.ts` are therefore hand-written, and the repository reaches the tables
through an explicitly-untyped view of the service-role client (`governedWorkDb()` casts away
the `Database` generic) with hand mappers re-imposing type safety. When the migration is
applied at the cutover, regenerate `database.types.ts`
(`supabase gen types typescript --project-id <ref>`), delete `governedWorkDb()` and the
raw-row mappers, and switch to typed `Row<"proposals">` / `Insert<"proposals">` access.

## #8 cutover plan (LATER — not this increment)

Authority moves only when the production read path moves (`docs/persistence-boundaries.md`:
"A Postgres mirror does not become authoritative until its read path is deliberately cut
over"). The staged plan:

1. **Apply the migration** to the database and regenerate `database.types.ts`.
2. **Dual-write, shadowing Redis.** Wire the repository into `addEvent` / `claimEventAction` /
   `resolveEvent` / `finishEventAction` so every Redis mutation also writes the matching
   `proposal` / `decision` / `execution_attempt` / `outcome` row. Redis stays authoritative;
   the tables are a shadow. Gated behind a flag like the existing `DUAL_WRITE_PG`.
3. **Verify parity.** Run a reconciliation that diffs the shadow tables against the Redis
   events over a soak window until they match 1:1 (the text `proposals.id` keying makes this a
   direct join). Fix any lifecycle gaps found.
4. **Flip reads.** Point the dashboard queue, `getOpenChangeRequest` gate, and weekly-brief
   reads at Postgres. Redis still receives writes as the fallback during the flip.
5. **Flip authority.** Make the Postgres write the gating one (the action claim + resolution
   become Postgres transactions); Redis demotes to a cache/mirror. Update
   `docs/persistence-boundaries.md`, the failure semantics, and the tests in the SAME change —
   never on the strength of a shadow write alone.

Until step 5, the "Event and approval queue" row in `docs/persistence-boundaries.md` stands:
**Redis is authoritative, Postgres is a mirror.**
