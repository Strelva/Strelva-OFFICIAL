# Wave 6 owner entry and Ask Strelva

Branch: `w6/owner-ask`. Worktree: `REB-w6-owner-ask`. Local only; all release flags remain off. No production, provider writes, owner invites, dependency changes, push, PR or merge authorized.

## Resumption

Resumed October 7 from checkpoint commits `de25bac0` and `f37cc8d9`. The checkpoints contain the seven remaining dashboard dispositions (content, sources, health, ownership, members, store and Settings retained), owner email destination adapter, magic-link invitation claim, account-free Needs you decisions, website approval/launch delegation, business-record drafts, inquiry-authored replies and Ask cost alerts. These were unverified checkpoints.

Active objective: finish the owner-entry and Ask launch requirements, verify flags-off preservation and failure paths, update both spec statuses and commit passing pieces.

## Verification in progress

Round 5 resumed the saved checkpoints without changing other worktrees. Initial
`pnpm test --maxWorkers=2` passed: 694 files, 6,372 tests; one file and 37 tests
skipped (98.74s). Targeted Ask authority/history/draft checks passed 498/498;
owner invitation entry checks passed 64/64; receipt failure checks passed 42/42.
`pnpm typecheck` passed. Final checks must be repeated after the current changes.

Independent read-only reviews found and are closing: credentials persisted
before refusal, stale subscriber roles, inactive/renamed tenant authority,
Ask owner-recipient mutation, pending owner invitations for existing members,
long-copy omission and authenticated-only preview links for account-free owners,
and summary-only Possibility candidates. Authority fixes are committed as
`1889e582`; executable candidates and signed read-only preview are in progress.

Failures preserved: initial SQL reached the signed fact-draft resolver and found
a missing pair of parentheses around a CASE expression (fixed, rerun pending).
Lint found JSX inside store/member try/catch (fixed). First build inherited a
non-standard NODE_ENV, compiled and typechecked but failed prerendering; rerun
uses explicit NODE_ENV=production. No production or provider calls were made.

Earlier checkpoint failures retained in `.scratch-w6-focused.log` and `.scratch-w6-test.log`: authored inquiry reply execution, outdated disposition assertions, migration sentinel coverage and a booking-store timeout. Prior boundary and lint checks passed; earlier full test/build runs were interrupted. New results will replace this section with exact command output and remaining failures.

## Coordination

Agency-operator owns the owner-recipient rule. Existing changes to coordination files are additive adapters/registrations: `src/lib/workspace-ports.ts`, `src/server/workspace-ports.ts`, `src/platform/needs-you/server.ts`, `src/platform/release-flags/resolve.ts`, `src/app/api/admin/tenants/[id]/lifecycle-email/route.ts`, and `scripts/check-workspace-sql.sh`. Final handoff will list each exact delta.

## Production proof remains outstanding

Apply additive migrations only after approval; supply isolated preview credentials; prove authenticated client-host entry/rollback and ask → draft → Needs you → signed email decision → outside effect → read-back → receipt → undo on a Strelva-owned test business. Real recipients, provider credentials, delivery and adoption are unproven. Owners' invites remain deferred. No local pass proves production readiness.
