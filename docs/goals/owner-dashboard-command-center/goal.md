# Make the Owner Dashboard Honest, Editable, and Useful

## Original Request

Considering the browser annotations, create a GoalBuddy goal and complete the PR sequence that turns the owner dashboard into a clearer command center.

## Interpreted Outcome

The owner dashboard should honestly show what can be edited, what data the AI can actually use, what changed, and what needs attention. The result should resolve the annotated product problems across Site, Sources, Reports, and Approvals without overbuilding integrations or reverting unrelated work.

## Input Shape

Existing plan with browser annotations and a requested file-board GoalBuddy setup.

## Constraints

- Preserve existing dirty work; do not revert unrelated changes.
- Use a file board only; do not create a visual board.
- Do not build OAuth for every integration.
- Prefer one real, repo-supported source path over many fake source promises.
- Keep GTM out of scope until the site editor plus one honest data source are demoable.

## Completion Proof

- GoalBuddy files exist under `docs/goals/owner-dashboard-command-center/`.
- The Site screen makes direct editing, draft save, discard, and Push clearer.
- The Site screen no longer presents the weak AI Chat tab as a primary panel.
- Sources distinguish built-in, OAuth-ready, manual/setup, unavailable, and coming-soon states honestly.
- Reports are compressed into a useful dashboard proof surface instead of relying on a giant empty page.
- Approvals are framed as a "Needs you" queue, especially when empty.
- Browser verification covers `/client/gldf/dashboard`, `/site`, `/sources`, `/reports`, and `/review`.
- Targeted tests, lint, and typecheck pass or failures are documented with blockers.

## Likely Misfire To Avoid

Treating the annotations as disconnected polish tickets. The real goal is to make the product promise believable: "See what's working. Tell the AI what to change."

## Starter Command

`/goal Follow docs/goals/owner-dashboard-command-center/goal.md.`
