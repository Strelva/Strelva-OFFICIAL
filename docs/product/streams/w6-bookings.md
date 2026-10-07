# Wave 6 bookings handoff

Branch: `w6/bookings`. Worktree: `REB-w6-bookings`. Local code only; no production access, provider sends, pushes, PRs or merges authorized.

## Resume objective

Complete bookings launch requirements (record hours/services, buffers, confirmations, reminders, one store and pause), plus the read-only daily parity cron. The adopted booking spec includes agent bookings; finish the saved API/customer-confirmation work without dependencies. Preserve visitor behavior with switches off and all email gates.

Saved checkpoints: `6dcf299d`, `2a9fa730`, `f02e7904`. They add parity, native access/agent APIs/MCP, update messages, calendar mirror, inquiry offers and booking settings. These were unverified checkpoints, not completion claims.

## Current evidence and next action

Resumed October 7. Saved native/agent SQL coverage exists and is now wired into the runner. Fixed same-origin manage test, both global email gates plus tenant suppression on new customer/owner paths, and request clocks versus generic Needs you reminders. Immediate urgent request delivery uses the signed Needs you approval surface. Inquiry capture now returns safe next-time proposals, and the existing approval/delivery path includes those same proposals. Portable React/static clients accept the additive response; old responses remain unchanged. Owner confirmation notices link to the workspace, never customer bearer tokens. Narrow Google scopes and provider-specific disconnect behavior have local tests. Public ReserveAction is gated.

Focused new gate/settings/Needs you tests: 27 passed. Broader targeted run: 288 passed, 14 skipped, one booking-view dynamic import timed out under host load (no assertion failure). Lint and boundaries passed. Full tests running; readiness sentinel coverage found missing entries for new Wave 6 tables, being corrected. Two full SQL attempts stopped in the pre-existing authority concurrency harness before booking migrations: first missed its 0.6-second hold, second missed the lock during the same short hold. Preserve both failures and lengthen the hold without weakening its assertions. Remaining: native/legacy management parity and reschedule request age, full SQL/test/type/build/custom-repo checks, rendered desktop/mobile evidence, final commits and status.

No production/provider calls. Round 4 missing-table count fix preserved from integration. Read-only migration/flag rollout remains coordinator work.

## Verification

Pending this resumed run: targeted booking and Needs you tests; typecheck, lint, boundaries, full tests, SQL, custom-repo compatibility and build. Actual results will replace this section.

## Production boundary

All new switches default off. Migrations in `20261010130000`–`20261010134000` are local only, with rollback SQL. Production needs explicit authorization for migrations, backfill, daily parity collection and seven consecutive passing days before reads flip, flags, email, and calendar grants. Google/Microsoft access and delivered email remain unproven. No dependencies added.

## Pending coordinator review

Reconcile implementation evidence into the canonical product model and reevaluate dependent capability/vault records after integration; this implementation stream is restricted to its own worktree. No offer, price, adoption or economics claim changes here.
