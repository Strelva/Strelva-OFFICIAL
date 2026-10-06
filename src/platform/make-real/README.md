# Make real

Make real turns a Ready Possibility into live Systems, one step at a time:
stage candidates, perform outside effects, switch live revision pointers,
connect, then run the declared operating checks. Each step records its own
outcome. Nothing is atomic across providers, and the activation says so.

The step log can now live in Postgres: `createSupabaseActivationRepository`
(`supabase-repository.ts`) stores each activation as `operations/activation`
saved work through the RPCs in `20261007155000_make_real_activations.sql`
(local only, not applied anywhere else). Nothing uses it in a live path yet:
the route below and every proof still use `createInMemoryActivationRepository`
and isolated fake providers.

The workspace reaches it through one route, `POST /api/workspace/systems/make-real`
(owners only), which runs `sandbox.ts`: an in-memory copy of the affected
Systems, isolated adapters only (`assertIsolated` refuses a live one), and a
stop before the first step that would switch a live System or call a
provider. The customer sees `describeActivation()` for that run and the
outside effects that are not connected. Nothing it does reaches a provider,
the SystemStore or a live site.

## One owner approval per plan (Needs you)

With `STRELVA_NEEDS_YOU_RELEASE` on, a Ready Possibility opens one Needs you
item (`src/platform/needs-you/sources/make-real.ts`), bound to the plan
fingerprint (`planFingerprint`: every effect's fingerprint, change, Connection
and introduced System of the candidate revision). That item is the approval
record: `needsYouMakeRealApprovals` reads it as a `make_real_plan` subject.
Approving it (Home, the email link, or the System page's Make it live, which
now decides the same item) starts Make real with the item as the approval for
every effect; each effect's own fingerprint must sit inside the plan
(`approvalProblem`), and `planApprovalAuthority` lets `system.activate` and
`site.publish` run only while the record still approves this plan. Off, the
route runs as before. The run itself is still the isolated sandbox.

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
real must run on it, not beside it. This note records the gap, the plan and
what has been built so far (end of this section).

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

### What was built (October 6, 2026) and what wasn't

Steps 1 and 2 were built beside `update_work_responsibility`, not inside it.
That RPC is already wrapped by the standing-execution migration (renamed to
`update_work_responsibility_unchecked`, plus a claim lock and trigger), and
every live responsibility payload depends on its checks. So
`20261007155000_make_real_activations.sql` adds its own RPCs for the
`operations/activation` resource kind and leaves responsibilities untouched:

- `create_make_real_activation`, `save_make_real_activation`,
  `read_make_real_activation`. Service role only, security definer, actor
  rechecked on every call. A verified direct owner or admin of the customer
  workspace writes; any direct member reads. Agencies are refused for now,
  because an activation can touch every System in the business and agency
  scope is per saved work.
- The same rules as responsibilities, plus Make real's own. Compare-and-set
  on `revision`. History grows by exactly one event, written by the caller
  (so approvers and reconcilers other than the starter can write). A step's
  identity never changes. A completed step never changes, except that a
  `rollback_step` event may move it to `restored` (internal step) or
  `compensated` (accepted effect), or record why it couldn't be undone.
  Restored and compensated are final. An accepted effect keeps its receipt and
  read-back. `unknown` leaves only through `reconcile`. No step starts after
  rollback begins. `rolled_back` needs no step running or unknown, and
  `made_real` needs every step completed and every check passed. Both are
  closed.
- A guard trigger refuses any other write to an activation row, including the
  generic `save_workspace_work`. The existing workspace-exit guard still
  applies: no new activation and no step start after a completed exit.

Step 3 was built as a repository swap rather than an `ExecutionAdapter`.
`createSupabaseActivationRepository(actor, db?)` implements
`ActivationRepository`, so `createMakeReal` keeps its API. It's bound to one
actor, and maps stale revisions to `WorkspaceConflictError`, access to
`WorkspaceAccessError` and rule violations to `WorkspaceStoreError`.

Proof (local only): `tests/make-real-activations-schema.sql`, and
`src/__tests__/make-real-activation-repository.test.ts`. That test runs the
real runner (made real, and roll back with compensation) through the real
RPCs on the `check:workspace-sql` cluster, and gets the same step log as the
in-memory repository.

Still not done:

- No live caller. `/api/workspace/systems/make-real` stays on the in-memory
  sandbox, and nothing constructs the Postgres repository outside tests.
- The migration hasn't been applied to any shared database. That needs
  Jacob's yes.
- Step 4: `due_workspace_work` doesn't pick up `in_progress` activations, so
  an interrupted activation resumes only when someone calls `resume`.
- The runner isn't an `ExecutionAdapter`, and leases aren't the
  work-execution engine's leases.
- Step 5: the in-memory repository is still exported, because the sandbox
  uses it.
- Workspace screens that treat every `operations` row as a responsibility
  (for example `WorkspaceOngoing`) would mis-open an activation row. Filter
  on `resourceKind` before activations reach a live workspace.

Until a live caller uses the Postgres repository, an activation doesn't
survive a process restart.

### Live Make real (October 6, 2026, branch `w2/systems-live`, local only)

- `live-adapters.ts`: five live `EffectAdapter`s, each wrapping the write
  path that owns the change (hosted website launch, `applySectionUpdate`,
  inquiry publication, booking grant, app release), each serving only
  effects that name its `channel` and checking its own
  `make_real_live:<channel>` flag in `ready` (off: the step Waits, never
  attempted). `createWaitingAdapter` holds Google until it can write.
- `approvals.ts`: one plan approval (`make_real_plan`, fingerprint over
  every change, introduction, connection and effect of the candidate),
  read from Needs you by workspace (`createNeedsYouApprovalRecords`). The
  per-effect check stays inside it.
- `live.ts`: the durable service (`createLiveMakeRealService`) over the
  Postgres possibility and activation stores; authority is the approval,
  re-read before every step; `resumeDue` for the workspace-work cron;
  `liveReadyPlan` / `startLiveApproved`, which feed the one `make_real`
  Needs you source (`src/platform/needs-you/sources/make-real.ts`, wired in
  `systems-sources.ts`). Integration (Oct 6): there is no second adapter.
  Isolated rebuild plans and live stored plans share that source, its
  `<possibility>@<revision>` item ids, one plan fingerprint (baseline
  revisions included) and one approval reader (`createNeedsYouApprovalRecords`).
- `live-server.ts`: the server bindings, `readLiveReadyPlans` and
  `startLiveMakeReal` for that source, `listDueActivations`
  (`due_make_real_activations_for_service`) and `activationRunner` /
  `activationStarter` for operator routes.
- Steps 3-5 above: the runner still isn't an `ExecutionAdapter`. Approval
  starts an activation as the approving owner. Resume, run, reconcile and
  roll back (the workspace-work cron and the operator tools) run as
  Strelva (system) for a business Strelva runs: one logged `make_real_resume`
  session per business (`src/platform/needs-you/service-actor.ts`, migration
  `20261009100000`), each action logged before it runs, the owner staying
  approver of record. Elsewhere they run as the starter, as before.
  The in-memory repository is still exported for the sandbox.
