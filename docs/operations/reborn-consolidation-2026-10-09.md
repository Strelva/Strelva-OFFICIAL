# Reviewed Reborn consolidation — October 9, 2026

Jacob requested a common Reborn integration before `main` and selected all reviewed
Reborn work. This record owns source disposition, not release acceptance.

## Included source

- Published Reborn integration `4afd7c28649362c4a793da55327adee408de4a9f`.
- Reviewed language/actor checkpoint `7e933fa64ac8600a00bd30340eb7793ca115bb17`,
  merged into local `integrate/reborn-1.0` as `dccd26c7c`.
- Accepted private integration `bb90f8555c2030aab349470c168fdee2776da7a5`, preserving
  its newer code and source-only qualification limits.

The isolated reconciliation branch is `integrate/reborn-consolidated-20261009`.
After combined verification the intended common local branch is
`integrate/reborn-1.0`. Original branches remain available; no history rewrite,
branch deletion, `main` merge, push or deployment belongs to this consolidation.

Branch-tip counts and non-equivalent commit IDs do not establish missing work.
The existing convergence audit records reviewed adaptations already incorporated:
Google `0caec9302`, native Ask `b16a2e5a0`, Home Finder `39e27a71e`, booking
`bc43f09fe`, creator `d057d7496`, and Needs you `922e06cc4`/`d9a395498` are
ancestors of the private checkpoint. Re-merging their older branches would restore
superseded behavior. The workspace evidence is under
`.scratch/full-model-completion-2026-10-09/source-convergence-audit/`.

## Reconciliation decisions

Keep ordinary agency-only new requests, exact named recipients/assigned operators,
application edit restrictions, website uncertain-write recovery, source authority,
immutable command identity and provider-of-record reads from the newer integration.
Apply approved audience/agency words, History/release distinction, recorded actors,
neutral missing attribution and What changed. Supplemental filtered History receipts
require Undo review; existing server-computed Undo states remain authoritative.

Keep the product-owned website MCP adapter and explicit platform port, streamed
body limits, UTF-8 handling and telemetry-failure behavior. `/api/v1` is unchanged
from the private checkpoint. Stored provider keys, RPC names and deployed contracts
retain compatibility.

All SQL paths and bytes match the private checkpoint: 354 forward migrations.
Older MCP definitions named `20261020090031–33` and their rollbacks are identical to
current `20261021131000`, `20261021131100`, `20261021131200`; exclude the older
filenames, whose numeric prefixes now identify different canonical migrations.
Retain the current SQL tests and runner references. No database was changed.

Remove the restored obsolete `agency-draft-contracts.ts` implementation. The current
`agency-application-draft-contracts.ts` is its sole schema owner. Repair missed
rename references without changing checks, wire shapes or permissions. Update
copy-based assertions while retaining behavioral guards.

## Still isolated

Held complete runtime union `6627dfc6b`, neutral-creator `45a2dcd3d`, and Google
`d3a82de81` are not promoted. Source-reviewed rewards1910, portable1910,
root359-inventory and non-Google1870 dependency packets remain with their owning
integration until complete source/runtime composition is accepted. Their reviews
accept specific contracts and do not approve whole branches. Lock-timeout1850,
grantability1860, retention1880 and managed-installer work retain their holds.

## Verification boundaries

Combined unit, type, lint, boundary, ontology, client-contract and rendered UI
receipts are recorded by the coordinator in workspace
`.scratch/domain-language-2026-10-09/REBORN-CONSOLIDATION.md`, alongside retained
first-attempt failures. Logs are local evidence and not claims of hosted behavior.
Client checks must use the actual sibling checkout root; missing siblings stay
explicitly skipped. Browser fixtures do not establish actual Auth or provider use.

The historical354 local PostgreSQL replay belongs to its exact original SQL/source
profile. SQL equality preserves its applicability to the migration inventory; it
is not fresh combined application/Auth/native qualification. Action-time actor
snapshots, the bounded200-row attribution read, managed-target rights, native
application cases, provider operation and full release retain their existing limits.

## Authorized publication and cleanup

After combined verification, Jacob authorized publishing the union as
`reborn-1.0`, deleting incorporated inactive branches and closing superseded
pull requests. This canonical name replaces `integrate/reborn-1.0` for new work.
The original consolidation limits above describe that earlier phase; this later
authorization permits publication and bounded cleanup, not promotion to `main`.

The nightly workflow in this source now defaults to `reborn-1.0`. Its scheduled
definition on `main` still reads `reborn`, so the legacy remote remains a
compatibility reference until that routing update reaches `main`. Active security
repairs, dirty/occupied worktrees, held proposals and unique source are preserved.
Exact expected-SHA inventories, deletion receipts and PR dispositions live in
workspace `.scratch/domain-language-2026-10-09/`. Deleted branch tips remain
reachable from the canonical reviewed source; no worktree directories are removed.

## Publication receipt

Canonical `reborn-1.0` was published at `4c301c8e371b45fa1258beff334944d9626e98c3`.
[Draft next-release PR #616](https://github.com/Strelva/Strelva-OFFICIAL/pull/616)
targets `main`. The publication and receipt edits leave the tested `src` tree
`435ba7e567fcd478e7a9a40cb2fe1e7236990636` unchanged. Normal pre-push typecheck
passed after reusing dependencies with byte-identical package and lock manifests;
the initial missing-dependency failure remains recorded.

Cleanup deleted 118 local and 50 remote incorporated branch refs, including the
old remote `integrate/reborn-1.0`. The common local branch was renamed, and six
completed worktrees owned by this consolidation were detached at their preserved
commits; their directories and proof artifacts remain. Remote deletions used
expected-SHA leases, local deletion required ancestry and current-tip checks.

Closed source-superseded PRs:

- [#609 MCP body cap](https://github.com/Strelva/Strelva-OFFICIAL/pull/609): streamed
  30,000-byte cap, cancellation and tests retained; fatal UTF-8 decoding and
  telemetry-failure coverage also present.
- [#545 tenant RLS](https://github.com/Strelva/Strelva-OFFICIAL/pull/545): forward
  and inverse SQL byte-identical; current inventory adds duplicate-version refusal
  and retains the later append-only audit boundary. Closure is not evidence of
  production migration application or completed remediation.

Keep #614, #615, #608, #607 and #606 open: digest rendering, provider-health
routing/schema, dual-store backfill guards and limiter-outage behavior include
repairs absent from this candidate. Keep #201, #202 and #102: alternative request
flow, Home composition and block-editor implementations are not incorporated or
explicitly retired. Keep #204, #206 and #207: newer native publisher/declaration
work does not establish whole legacy-PR equivalence; unique route/qualification
behavior and dated evidence remain. Source comparison alone does not authorize
retiring those alternatives. No retained PR was retargeted or merged.

The legacy `reborn` stays unchanged at `42d5f7025bab8385fb969bd992832261eda3ba81`:
its tip is not an ancestor of the candidate, and `main`'s nightly definition still
reads it. `origin/main` remains `2dd3453a5e8ae5493c86a57a428a6f71f32f30c1`.
No private integration/model checkout, provider, production or customer state was
changed. Apply the canonical nightly routing only with later `main` promotion.

## Next action

Use `reborn-1.0` as the common next-release branch. Leave
`main` and the other integration owner's private checkout/canonical model untouched.
Give that owner the exact combined source and retained failure receipts for final
native/Auth/managed-target qualification before promotion or rollout.
