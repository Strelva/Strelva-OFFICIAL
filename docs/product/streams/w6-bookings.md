# Wave 6 bookings handoff

Branch: `w6/bookings`. Worktree: `REB-w6-bookings`. Local code only; no production access, provider sends, pushes, PRs or merges authorized.

## Resume objective

Complete bookings launch requirements (record hours/services, buffers, confirmations, reminders, one store and pause), plus the read-only daily parity cron. The adopted booking spec includes agent bookings; finish the saved API/customer-confirmation work without dependencies. Preserve visitor behavior with switches off and all email gates.

Saved checkpoints: `6dcf299d`, `2a9fa730`. They add parity, native access/agent APIs/MCP, update messages, calendar mirror, inquiry offers and booking settings. These were unverified checkpoints, not completion claims.

## Current evidence and next action

Resumed October 7. Branch clean. Prior logs show interrupted checks: booking view and unrelated billing tests timed out. The SQL runner references agent-booking coverage; verify the existing `tests/booking-agent-schema.sql` and add missing TypeScript coverage. Inspect request clocks versus Needs you and owner notice delivery before full verification. No new live-system claims.

## Verification

Pending this resumed run: targeted booking and Needs you tests; typecheck, lint, boundaries, full tests, SQL, custom-repo compatibility and build. Actual results will replace this section.

## Production boundary

All new switches default off. Migrations in `20261010130000`–`20261010134000` are local only, with rollback SQL. Production needs explicit authorization for migrations, backfill, daily parity collection and seven consecutive passing days before reads flip, flags, email, and calendar grants. Google/Microsoft access and delivered email remain unproven. No dependencies added.

## Pending coordinator review

Reconcile implementation evidence into the canonical product model and reevaluate dependent capability/vault records after integration; this implementation stream is restricted to its own worktree. No offer, price, adoption or economics claim changes here.
