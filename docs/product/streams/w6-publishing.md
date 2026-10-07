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
