# Make real

Make real turns a Ready Possibility into live Systems, one step at a time:
stage candidates, perform outside effects, switch live revision pointers,
connect, then run the declared operating checks. Each step records its own
outcome. Nothing is atomic across providers, and the activation says so.

Today the step log is in memory (`createInMemoryActivationRepository`). Every
proof runs against isolated fake providers. Nothing here is wired to a route.

## Rules the runner enforces

- An approval is a record, not a string. `ApprovalRecordsPort` resolves an
  approval id to an approved decision for this business, possibility, candidate
  revision and effect fingerprint. `createGovernedWorkApprovalRecords` reads it
  from the governed-work queue. Start and `approve()` check the record, and the
  runner reads it again right before the effect runs. Calendar, message and
  payment effects always need an approval. Publish goes through
  `src/lib/ai-governance.ts`, which judges both `publish.data` and the
  `request` that is actually sent.
- Idempotency keys come from (business, possibility, candidate revision, pinned
  baselines, step, epoch) and never from the activation id. A restart reuses
  the key of anything whose outcome was never settled. The epoch moves only
  when a rollback restored or compensated that step.
- An outcome of `unknown` is never replayed. Rollback restores and compensates
  what it can, but it can't finish while any step is `unknown`. The activation
  shows `needsReconciliation` until someone with the step's authority
  reconciles it with evidence. After that, rollback is run again to finish.
- An accepted write whose read-back fails stays completed. It is never retried.
- Authority is checked again before every step, and before approve, reconcile
  and rollback.

## Decision: one execution engine (October 5, 2026)

`src/platform/work-execution` already persists step progress in Postgres. Make
real must run on it, not beside it. This note records the gap and the plan. The
port isn't built yet.

**What work-execution provides**
(`engine.ts`, `runtime.ts`, `repository.ts`, `update_work_responsibility` in
`20260912160000_work_responsibilities.sql`):

- A responsibility row in `saved_product_work` with leased steps and
  `dependsOn` ordering.
- Outcomes `unknown` and `accepted` (accepted is final), plus
  reconcile-with-evidence and a retry limit of 3.
- Compare-and-set on `revision`, with server-side checks that a completed or
  accepted step never changes and that history only grows.
- Authority checked again before the claim and before the command
  (`ExecutionAdapter.recheck`).
- Due-work scheduling (`due_workspace_work`) and a heartbeat-registered cron.

**What Make real adds**

- Effect adapters with `find`/`readBack`/`compensate`, and an idempotent replay
  when the provider dedupes by key.
- Per-candidate deterministic keys, and epochs that span activations.
- Rollback. It needs a completed step to move to `restored` or `compensated`,
  and it waits on `unknown` steps.
- Possibility pinning: baseline compare-and-set on activate, and the
  stale-baseline return to Exploring.
- Approval records and governance gates for each effect.
- Operating checks before `made_real`.

**Why there's no adapter today.** `update_work_responsibility` checks the
payload against the responsibility shape:

- Only owner-run.
- History kinds limited to approve…outcome.
- Step statuses limited to pending…unknown.
- A completed step can never change.

Make real's log needs `blocked`, `restored` and `compensated`, a
`rollback_*` history, and actors other than the owner. A thin TypeScript
adapter can't store it through that RPC without a migration. A migration needs
Jacob's yes.

**Plan**

1. Add a work-execution step outcome for undo. One migration extends
   `update_work_responsibility` to allow `completed → restored|compensated`,
   only when the history event is `rollback_step`. Accepted effects keep their
   result.
2. Add an `operations/activation` resource kind on `saved_product_work`,
   checked by the same RPC. The current-revision compare-and-set and
   history-only-grows checks are reused unchanged.
3. Replace `ActivationRepository` with an `ExecutionStore`-backed repository.
   `createMakeReal` keeps its API. Its `runNext` becomes an `ExecutionAdapter`
   whose `recheck` is the current `gate()` and whose `perform` is the current
   `perform()`.
4. Let `due_workspace_work` pick up `in_progress` activations so resume runs
   from the existing cron. No second cron.
5. Delete the in-memory repository from production exports and keep it for
   tests only.

Until step 3, an activation doesn't survive a process restart.
