# W6 stream: journeys

Status: in progress (round 4, Oct 7 2026). Branch `w6/journeys`, based on `integrate/reborn-1.0` @ 7b7b4d3f.

## Goal
The 1.0 signed-in journeys run and pass locally, end to end, against a disposable local Supabase, with flags on and with flags off. One command: `pnpm check:journeys`.

## Where it stands
- `scripts/check-journeys.sh` exists (`pnpm check:journeys`). It starts a loopback Supabase (CLI 2.117.0 via npx, unique project id, free ports), applies every migration, runs `next dev` on a free port with all email gates off, then runs the flags-on spec set and the flags-off spec set and checks both against required spec counts (`scripts/check-launch-browser-results.mjs` profiles `journeys-on` / `journeys-off`).
- First flags-on run (09:52, before checkpoint 3): 3 passed, 7 failed. Fixes for several of those are in checkpoint 3 and not yet verified.

## Baseline on integrate/reborn-1.0
Pending.

## Next action
Rerun `pnpm check:journeys --reuse <kept stack dir>` with flags on, triage each failure as product bug vs spec/harness bug.
