# Original bringer attribution — private #284 / MO-06 preparation

This isolated work starts at `e28e1a5fcf89d43f4d3fc123a1fbceaee3bb6d00` on
`prepare/launch-attribution-20261008`. It adds migration
`20261020090033_business_attributions.sql` and proposed packet batch 15. It does
not authorize production, a switch policy, pricing, a written agreement, or a
financial attribution consumer. #284 remains open for integration and review.

## Customer contract

A currently verified, direct business owner confirms an exact original bringer
agency, a source (`signup`, `conversion`, or `referral`), and a bounded
`owner_statement` reference. The bringer may differ from today's operating
agency. `expectedProviderId` pins the actual current provider while recording;
`commandId` binds exact replay. The clock and start time come from the database.
No historic attribution is fabricated during migration, and no signup,
conversion, or referral is asserted to have occurred merely because this owner
statement was recorded. This is evidence, not a written agreement or financial
eligibility; the receipt says `financialEligibility: not_selected`.

`business_attributions` keeps the immutable opening. A successful existing
MO-18 provider completion appends a separate immutable ending, bound to the
opening's agency/source/reference/from time, the old provider, the completed
request, the exact completion receipt, and the current owner. Direct provider
ending/switching cannot strand an active attribution, even before a notice
policy is selected. A failed, premature, or stale completion makes no ending.
Old completion replay cannot close a later owner statement. No successor
attribution is inferred. Invoice evidence, splits, rates, payer selection and
financial tails retain their existing owners and code.

`GET /api/workspace/business-attributions?workspaceId=<id>` reads the separate
current operator and exact history. `POST` records the strictly bounded opening
command. Both use the existing workspace-release and provider-change flags.
Writes require verified server identity, same-origin JSON and rate limiting.
There is no new UI or public endpoint. The reader uses current verified direct
owner membership without writer locks, and works in a genuine read-only
transaction. Raw tables and inherited/helper RPCs are private; only the scoped
service-role entry points are granted.

## Native evidence

Run with the existing dependency tree and local PostgreSQL 18:

```sh
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm exec bash scripts/check-business-attributions-sql.sh
```

The owned disposable database applies the existing ordered schema, retains a
populated prior operating provider, applies 33 without inferred attribution,
and exercises exact original-bringer receipts, replay/conflict, owner/admin/
agency/cross-business/stale/verification denials, malformed source receipts,
immutable openings/endings, no-policy bypass denial, and successful MO-18
completion. The inherited joint payer/provider test also passes. The test's
zero-second window is a fictional local-only choice, never a default or an
accepted policy.

Actual concurrent sessions prove writer-first membership/verified identity
withdrawal cannot commit through an opening; withdrawal-first writers wait,
recheck, and deny. Provider completion and new opening serialize; current-owner
withdrawal cannot commit through the ending. Service-role history reads remain
READ ONLY while those writers pause. The transitive reader scan checks 1,483
public functions and finds no lock path. Empty rollback restores every prior
public function's source, signature, volatility, security configuration and
normalized ACL. Wrapper drift and populated rollback refuse; accepted receipts
remain intact. The rollback preserves the exact inherited completion function,
including a compatible earlier 31 cancellation wrapper when combined later.

A later independent review reproduced a concurrent inverse/writer defect in
the first prepared inverse: an empty check missed an uncommitted opening, and
DROP subsequently erased its committed receipt. The successor locks all three
new tables exclusively before checking emptiness. Run
`PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash scripts/check-business-attribution-rollback-races.sh`
for writer-first refusal with retained history and inverse-first exclusion of a
late writer. The first prepared source and failed runs remain historical evidence.

The populated historical workspace upgrade passed before the final exact-text
input tightening, including the existing native money/apps contracts and a
1,524-function reader scan. Final migration structure and wrapper are unchanged
by that input tightening; parent exact combined upgrade remains required.

## Verification and retained failures

Final focused Vitest: 74 passed across attribution module/API, readiness,
release staging and restore. Final typecheck and changed-file lint passed.
The full unit run before adding 33's sentinel recorded 8,739 passes, 46 skips,
and one missing-sentinel failure; the sentinel and focused readiness proof now
pass. The first focused packet run recorded the stale expected packet order;
it now includes 15 and passes. Initial native red reproduced the missing
MO-06 RPC on e28; fixture/harness failures were retained before final green.

Default Turbopack build failed because the existing node_modules symlink points
outside its root. The webpack fallback terminated at the default 4GB V8 heap
limit. Neither is claimed as a passing build. Parent requested heavy full-unit/
build reruns wait for final combined source. Logs, source hashes and preserved
SQL inventory are under the workspace's private
`.scratch/launch-completion-2026-10-08/attribution/` directory.

## Integration stop points

This branch has 298 forward migrations; pending 31/32 belong to separate lanes,
and 33 keeps all earlier SQL bytes unchanged. Batch 15 follows 12 here because
13/14 are absent on the isolated e28 base. Final convergence must merge those
reserved packet steps before 15, requalify cancellation/completion order,
current authority, exact rollback, native upgrade, full units and build, and
perform independent review. No production database, provider account, site,
DNS, billing, dependency, GitHub issue or main branch was mutated. #236's
financial tail, written-agreement and live response-window decisions remain
open. No actual conversion, live switch, payout or commercial use was proved.
