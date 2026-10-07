# Wave 6 publishing handoff

Branch: `w6/publishing`. Worktree: `REB-w6-publishing`.
Scope: finish Publishing launch behavior locally. No production calls, sends,
deployment, push or PR. No new dependency. Newsletter delivery remains disabled.

## Continuation (2026-10-07, round 3)

Resumed checkpoints `f6701269` and `f4c3dc18`; no tracked edits on arrival.
Existing work: workspace Google controls/drafts/receipts/reply changes;
blog and collection compose/review inside website Systems; immutable approved
newsletter issues with sending paused; owner authority; signed sessionless
Google reconnect; optional record-to-Google approval policy.

Current objective: fix layer crossings, complete failure/flags-off proof,
verify rendered publishing states, run required checks and commit passing pieces.
Initial resumed typecheck passed. Saved boundary run failed on product entry
imports and new workspace-to-tenant imports. Saved full test run was interrupted
and has no completed result; its timeouts are not passing evidence.

Active bet: reuse tenant stores and the existing Needs you/event executor,
with source-specific receipts; no sixth approval store and no live-site changes
while publishing is off. Google API access remains an external prerequisite.

## Flags and production boundaries

- `STRELVA_PUBLISHING_RELEASE`: default off, plus workspace release row.
- `STRELVA_RECORD_GOOGLE_APPROVAL_POLICY`: default off, plus workspace row.
- `STRELVA_PUBLISHING_NOTICES_SEND`: default off; requires both global email
  gates and the tenant `reb:client-email` override, and publishing release.
- Newsletter approved issues are `sending_paused`; compose/approval sends nothing.
- Existing `STRELVA_GOOGLE_BINDINGS`, Systems, workspace, Needs you releases
  remain prerequisite switches. No switch is enabled by this stream.

## Migrations prepared, unapplied

- `20261010140000_google_listing_controls.sql`
- `20261010141000_publishing_release_flags.sql`
- `20261010142000_workspace_publishing_content.sql`
- `20261010143000_publishing_reconnect.sql`

Each has a rollback file in `supabase/migrations`. Existing publishing binding
migration `20261007170000` remains prerequisite. SQL proof pending resumed run.

## Release packet additions / remaining proof

Apply additive migrations only with Jacob's authorization. Verify encryption,
Google OAuth production status, scopes, API approval/quota, and binding copy on
a Strelva-owned test business. Enable flags deliberately; policy activation is
a separate owner-consent decision. Newsletter sending stays off. No new cron:
reconnect notices extend the existing hourly Needs you chase.

Required final check results, item-by-item acceptance evidence, and browser
proof will be appended here before completion. No A claim yet. Real Google,
real mail, migrations applied, token fallback clocks and production behavior
remain unproven. Strategic overhang/vault review belongs to the integrating
coordinator; this delegated stream supplies implementation evidence only.

## Completed passing piece: integration repair

Local `pnpm typecheck` exit 0; targeted publishing/reconnect/Google/receipt/
newsletter run: 11 files, 92 tests passed. `pnpm check:boundaries` exit 0,
204 baselined workspace-to-tenant imports, unchanged baseline. Shared event
contract and collection validators now live in infrastructure; tenant compatibility
entries retain their API. App-edge tenant store ports preserve one store and
avoid new workspace imports of `src/lib`. Fixed shared select API use,
checkpoint test types, and per-location/per-kind record command identities.
Local SQL run exit 0, including publication/receipt atomicity, immutable issues,
reconnect security and replay. Full lint/checks and remaining launch gaps follow.

## Round 4 passing piece: record facts and honest Google outcomes

Rebased onto `integrate/reborn-1.0` including `864474fe`; no readiness changes
in this stream. Added owner-only record facts UI and API for weekly/holiday
hours and website URL, preserving untouched facts. Default policy prepares
separate Google approvals. Activated policy requires the visible consent
copy and records each location's result after the record commits. Clears of
phone/description/website are exact Google patches; retrying an already approved
draft does not write again. Google acceptance with failed read-back stays
unconfirmed, never a claimed confirmed write. Poll reads now persist quota-zero
access health. Issued newsletter outputs keep their System after audience zero.

Targeted run: 14 files, 102 tests passed (6.66s). Typecheck exit 0; targeted
ESLint exit 0. The preceding attempts found and fixed a test mock tuple typing
error and a React ref read during preview render; those failed logs remain in
`.scratch/w6-publishing/`. Browser observed a saved record with one successful
Google double and one access-pending double, with distinct results. Final full
checks and expanded browser proof still pending.

## Round 5 passing pieces (2026-10-07)

`14c5377e` recovers accepted content/issue receipts before mutable content,
System pause or business exit checks. Authorization and receipt scope remain
checked. SQL proves replay preserves later content, accepts paused/stopped
recovery and rejects another System's receipt. Content tests: 7/7 pass. Full
isolated workspace SQL exit 0 (`content-recovery-sql.log`). No new migration:
the unapplied `20261010142000` includes this repair.

Google approval and tenant reply receipts now belong to the approval, not its
temporary execution attempt. A durable rejection permits an explicitly approved
retry through a deterministic chain of failed receipts; accepted or uncertain
receipts block another dispatch, including when event-marker storage fails.
Undo remains tied to its original receipt. Reply edits carry a command identity,
so a new owner instruction can restore identical text after withdrawal.

Removing hours prepares an exact Google clear. Record propagation distinguishes
unapplied from unknown results and preserves each location's outcome. Approved
newsletter history survives both a zero audience and a failed subscriber read;
an unreadable audience is never reported as zero. Fixed publishing client entry
imports, the reconnect migration sentinel, and the release-flag test inventory.
The missing-table probe fixes from `864474fe` remain intact.

Latest targeted checks: 97 tests across six publishing/readiness/flags files;
36 Google execution/service tests including undo uncertainty. Typecheck and
targeted ESLint exit 0. Browser proof: 44 local fictional desktop/mobile states
and journeys at 1280/390 px; empty/loading/error/read-only, Google access pending,
pause/disconnect, record partial failure, blog review/publication receipt,
newsletter approved/sending paused, and keyboard focus. No horizontal overflow
or page errors. HTTP doubles and SQL tests do not prove real auth/provider use.
Evidence: `.scratch/w6-publishing/ui-evidence-round5.json` and screenshots.

Initial full suite: 4 failed, 6270 passed, 37 skipped. Two stale checks were fixed
(reconnect sentinel and flags inventory); two cold-import timeouts passed
in isolation (10/10). Initial boundary run caught three product entry imports,
now corrected; baseline remains 204. Initial typecheck caught test literal/tuple
typing and an action query-string narrowing issue, now corrected. Browser's
first error-form attempt ran before hydration; rerun waited for hydration and
passed. All failed logs remain in `.scratch/w6-publishing/`. Full suite rerun
with two workers and final build are running/pending; no full green claim yet.

Integration base: `864474fe`. The shared integration branch moved while this
stream ran; don't interpret a two-dot diff against its new tip as this stream's
changes. Use the merge base and cherry-pick the stream commits. No other
worktree, shared release packet, production, live provider or client was touched.

## Final verification — local, round 5

All commands ran in this worktree. Application checks used a clean subprocess
environment with no provider/database credentials. Tests kept their existing
skip conditions and five-second timeout; the full suite used two workers to
avoid concurrent cold-import contention. Build is a local production-mode
artifact, not a deployed or enabled release.

| Required check | Actual final result | Log under `.scratch/w6-publishing/` |
| --- | --- | --- |
| `pnpm typecheck` | Exit 0, route types generated; no TypeScript errors | `typecheck-release-round5.log` |
| `pnpm lint` | Exit 0; generated database-types size note only | `lint-release-round5-fixed.log` |
| `pnpm check:boundaries` | Exit 0; baseline 204 workspace-to-tenant imports in 93 files, 46 older boundary imports | `boundaries-release-round5.log` |
| `pnpm test --maxWorkers=2` | Exit 0; 695 files passed, 1 skipped; 6277 tests passed, 37 skipped; 80.79 s | `test-release-round5.log` |
| `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql` | Exit 0; all workspace/inquiry SQL checks in isolated throwaway clusters, including content/reconnect security and recovery | `content-recovery-sql.log` |
| `pnpm check:custom-repos` | Exit 0; 196/196 | `custom-repos-round5-final.log` |
| `pnpm build` | Exit 0; optimized build compiled, typechecked and generated its pages | `build-release-round5.log` |
| Rendered UI | 44 desktop/mobile states and journeys, 1280/390 px; keyboard focus, no horizontal overflow or page errors | `browser-round5-fixed.log`, `ui-evidence-round5.json` |
| Docs | 96 local link targets exist; diff read; `git diff --check` clean | This receipt |

Failure history remains available. The second full suite passed 6276 tests but
timed out in the first legacy approval-link cold import. That test now isolates
the unrelated workspace execution graph; its confirm-only, HMAC, expiry,
tenant scope and idempotency cases still run, with 21/21 related tests passing.
The final full suite above is green. A later full lint caught CommonJS imports
in the local browser helper; converted the helper to ESM and reran full lint.
No timeout, skip, coverage floor or product behavior was weakened to get green.
The shared Croki browser became unavailable after initial interactive checks;
the installed local headless browser finished the state matrix. No browser or
dependency was installed.

## Launch acceptance and exact remaining limits

The [publishing spec's Wave 6 status](../../capabilities/publishing/publishing-spec-2026-10-06.md#wave-6-implementation-status-2026-10-07)
maps section 3 items 1–15 to code and tests. Built: listing controls and health,
shared reviews/replies, owner edit/withdraw/undo, revision-bound record drafts,
optional disclosed combined approval, posts and pacing, collection compose/
publication/restore, immutable paused newsletter issues, owner-bound sessionless
reconnect, gated Needs you notices, and recovery across partial failure.

**Not an A for the complete launch specification.** These are code/product
limits, separate from the successful local verification:

- Workspace newsletter approvals issue a permanent paused snapshot. There is
  no executor to send that snapshot; no switch in this stream enables it.
  The tested legacy newsletter sender remains available under its existing
  gates. Completing launch item 12 requires connecting immutable issue
  delivery to that sender with durable per-batch acceptance/retry receipts.
- Google/content authoring still needs a linked tenant. Native businesses
  with no linked tenant need a workspace-owned provider/content target before
  those paths can operate. Existing converted tenants have the local paths.
- Multiple Google locations are independent projected Systems. This stream
  does not create Version lineage between them. The integrating Systems stream
  must reconcile this requirement; do not infer it from two listing cards.

Production-only proof is also unfinished: migration application/upgrade and
rollback rehearsal against the actual release schema; binding copy and scope
counts; encryption key and OAuth signing/configuration; Google API quota and
OAuth verification; an eligible Strelva-owned test profile; real writes,
read-back/undo and live mail; authenticated client parity for 14 days and zero
Redis fallback for the final seven. No production claim is made.

## Release packet steps / next action

1. Integrate the stream commits onto the current shared branch and rerun its
   combined checks. Keep the publishing, record policy and notices flags off.
2. Resolve the three code/product limits above. Newsletter sending stays paused
   until immutable issue delivery and its acceptance receipts are built and
   reviewed. Combined record/Google consent remains a separate Jacob decision.
3. Prepare the exact migration/rollback and environment plan, then request
   Jacob's approval for production. Apply the four assigned migrations only
   after their account-binding/Systems/Needs you prerequisites. No new cron;
   the existing hourly Needs you chase owns notices and reconnect episodes.
4. Verify Google project access, OAuth/scopes, encryption, owner recipients,
   token copy and real provider journeys on a Strelva-owned test business.
   Any environment changes require a new production deployment and the release
   checklist. Enable notices only deliberately with both global email gates
   and the tenant override; silent rollout is the default.
5. Complete the client parity/fallback clocks before widening rollout.

Strategic model, overhang and both vault reviews remain with the integrating
coordinator. This handoff supplies the local implementation delta, verification
and limits; it grants no production, messaging or commercial authority.

Implementation history on `w6/publishing` (base `864474fe`):
`66578b86`, `9ffad9a9`, `4be804bc`, `44ae0b01`, `c163ec96`,
`14c5377e`, `078f9538`, `e2d0bc7d`. The interruption checkpoints are retained;
the final documentation receipt is the branch-tip commit. No push, PR or merge.
