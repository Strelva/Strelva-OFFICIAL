# REB Full Completion

## Objective

Prepare and execute a GoalBuddy-driven product completion tranche for the `reb` repository, using `advance-product-version` during the goal run to diagnose the actual product surface and finish the core customer-facing product experience.

## Original Request

"lets run goals for us to focus on getting fto full cpmpletion and consider advance-product-version"

## Intake Summary

- Input shape: `vague`
- Audience: Jacob / Scaffold Web customers
- Authority: `requested`
- Proof type: `artifact`
- Completion proof: Final audit proves the customer-facing and operator-facing product flows are complete enough for real product use, with implemented slices verified by tests/build/browser or documented blockers.
- Likely misfire: GoalBuddy could produce a generic roadmap or scattered fixes instead of driving verified, product-relevant completion work.
- Blind spots considered: Product completion target is selected; success proof defaults to end-to-end customer and operator use; launch ops, pure technical cleanup, and growth features are secondary unless they block product completion.
- Existing plan facts: Use `advance-product-version` as a required product-operator lens during `/goal`; use a local live GoalBuddy board.

## Goal Kind

`open_ended`

## Current Tranche

Inspect the real product during `/goal`, identify what is incomplete in the core customer-facing experience, choose successive safe verified implementation slices, and keep advancing until a final audit proves the product-completion outcome is met.

## Non-Negotiable Constraints

- Do not perform product diagnosis or implementation during `$goal-prep`.
- During `/goal`, read the repo before making product judgment.
- During `/goal`, use `advance-product-version` as a strategic lens and preserve repo truth over strategy guesses.
- Avoid generic roadmap work; select wedge-moving verified slices.
- Preserve user changes and do not revert unrelated work.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if the user asked for working software or automation and a safe Worker task can be activated.

Do not stop after a single verified Worker slice when the broader owner outcome still has safe local follow-up slices. After each slice audit, advance the board to the next highest-leverage safe Worker task and continue.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal toward the full outcome.

## Canonical Board

Machine truth lives at:

`docs/goals/reb-full-completion/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/reb-full-completion/goal.md.
```

## PM Loop

On every `/goal` continuation:

1. Read this charter.
2. Read `state.yaml`.
3. Run the bundled GoalBuddy update checker when available and mention a newer version without blocking.
4. Re-check the intake: original request, input shape, authority, proof, blind spots, existing plan facts, and likely misfire.
5. Work only on the active board task.
6. Assign Scout, Judge, Worker, or PM according to the task.
7. Write a compact task receipt.
8. Update the board.
9. If Judge selected a safe Worker task with `allowed_files`, `verify`, and `stop_if`, activate it and continue unless blocked.
10. If a problem, suggestion, or follow-up should become a repo artifact, create an approved issue/PR or ask the operator whether to create one.
11. Treat a slice audit as a checkpoint, not completion, unless it explicitly proves the full original outcome is complete.
12. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.

Issue and PR handoffs are supporting artifacts. `state.yaml` remains authoritative, and every external artifact decision must be recorded in a task receipt.
