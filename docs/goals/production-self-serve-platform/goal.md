# Production Self-Serve Platform

## Objective

Turn Strelva into a production-grade self-serve platform by validating and executing the highest-leverage slices for B2C signup/onboarding, retention analytics/weekly briefs, and backup/versioning/rollback safety.

## Original Request

"Production-Grade Self-Serve & Onboarding (Highest immediate leverage): complete self-serve B2C signup -> instant subdomain site + AI agent boot; guided first-time owner journey; welcome sequence. Analytics, Usage Insights & Retention Engine: owner dashboard metrics, weekly email brief, churn predictors, product analytics. Backup, Versioning & Rollback: one-click revert, daily backups, owner-visible audit log."

## Intake Summary

- Input shape: `existing_plan`
- Audience: Jacob and local business owners using Strelva
- Authority: `requested`
- Proof type: `test`
- Completion proof: Current repo evidence proves a local business can self-serve sign up, receive an instant tenant/subdomain/site/agent boot path, complete a guided first-time owner journey, receive quick-win welcome/weekly retention surfaces, see meaningful owner metrics and audit history, and safely roll back content with verified tests or documented blockers.
- Likely misfire: GoalBuddy could ship scattered dashboard or docs polish while missing the under-10-minute self-serve activation path that changes the product from founder-heavy demo to usable platform.
- Blind spots considered: Existing branches may contain work that must be merged carefully; production credentials and external providers may block live verification; analytics and retention claims need actual event coverage rather than decorative numbers; rollback safety must cover AI autonomy risk before increasing autonomy.
- Existing plan facts:
  - Highest immediate leverage is B2C self-serve signup and guided onboarding.
  - Branches named by the user, `codex/self-serve-b2c-product` and `codex/free-site-signup-copy`, should be inspected and used if they contain useful work.
  - The target activation promise is "I can get live in <10 min."
  - Retention work should use existing Redis event queues and activity logs.
  - Weekly email brief already has queue/reporting primitives and should become beautiful and actionable.
  - Versioning/rollback is non-negotiable because AI can break things.

## Goal Kind

`existing_plan`

## Current Tranche

Validate the current repo and the named branches, choose the largest safe first product slice that materially moves the under-10-minute self-serve activation path, implement and verify it, then continue into retention analytics and rollback safety slices until a final audit proves the full original outcome or records only externally blocked production items.

## Non-Negotiable Constraints

- Preserve existing user/worktree changes; do not revert unrelated modified files.
- Use repo truth over strategy assumptions.
- Use customer language from AGENTS.md: "See what's working", "Tell the AI what to change", "people found you", and "your weekly report".
- Do not add drag-and-drop visual editing, client-facing code editing, e-commerce checkout, or tiered pricing UI.
- Keep the single-plan pricing posture unless the user explicitly changes it.
- Avoid increasing AI autonomy without rollback/audit safety.
- Do not add `Co-Authored-By` lines to commits.

## Stop Rule

Stop only when a final audit proves the full original outcome is complete.

Do not stop after planning, discovery, or Judge selection if a safe Worker task can be activated.

Do not stop after a single verified Worker package when self-serve onboarding, retention analytics, weekly briefs, and rollback safety still have safe local follow-up work. Advance to the next highest-leverage safe Worker package unless a phase, risk, rejected-verification, ambiguity, or final-completion review is due.

Do not stop because a slice needs owner input, credentials, production access, destructive operations, or policy decisions. Mark that exact slice blocked with a receipt, create the smallest safe follow-up or workaround task, and continue all local, non-destructive work that can still move the goal.

## Slice Sizing

Safe means bounded, explicit, verified, and reversible. It does not mean tiny.

A good task is the largest safe useful slice: a working onboarding step, working API path, working dashboard/retention surface, working rollback mechanism, or verified integration of existing branch work.

## Canonical Board

Machine truth lives at:

`docs/goals/production-self-serve-platform/state.yaml`

If this charter and `state.yaml` disagree, `state.yaml` wins for task status, active task, receipts, verification freshness, and completion truth.

## Run Command

```text
/goal Follow docs/goals/production-self-serve-platform/goal.md.
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
9. If safe local work remains, choose the next largest reversible Worker package and continue unless blocked.
10. Review at phase, risk, rejected-verification, ambiguity, or final-completion boundaries; do not review every small Worker by habit.
11. Finish only with a Judge/PM audit receipt that maps receipts and verification back to the original user outcome and records `full_outcome_complete: true`.
