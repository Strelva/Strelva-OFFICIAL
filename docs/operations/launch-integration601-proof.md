# Private launch integration #601 — October 8, 2026

This candidate reconciles exact prepared `1902c15c09a65d0e79431d33021559be76c8e261`
(base `cdf5c31a10085b949c2ab25045f0d5dd4d270cb6`) onto current documentation/source
`e9ac136f9a0eecf362421c4046a333f0c20496fd`. The current deployed release remains
`954f19057344dbf0cc9c10b04506071750a19c50`, with 266 applied migrations. Private
branch: `prepare/launch-integration-601-20261008`; checkout:
`/private/tmp/strelva-launch-integration601-20261008`. Nothing was pushed, merged
into main, deployed, published, billed, sent or provisioned.

## Reconciliation and preserved history

The local merge had 15 conflict entries. Current trusted-owner, staffed-provider,
retention, writer-lock and private ACL successors were retained; prepared money,
agent and package additions were combined separately. Both Needs you source kinds
remain. Historical SQL/security bodies were not relaxed to satisfy prepared tests.

The prepared agent inquiry version collided with deployed operator approvals.
All 31 unapplied forward migrations were moved, in their original relative order,
to `20261020090000`–`20261020090030`. Thirteen companion rollbacks moved with them.
The original prepared branch was untouched. [Migration map](launch-integration601-migrations.json)
records every rename. Existing 266 forward migrations and all 450 preexisting
migration/support/rollback files remain byte-identical to `e9ac136f`; the
[hash inventory](launch-integration601-deployed-migration-hashes.json) records them.
Retired `20261015120000` remains absent from the forward inventory.

Historical packet entries 0–11 retain their pinned bytes. A separately proposed
batch 12 pins the new 31-file tail and companion hashes. Offline staging rejects
missing files, duplicate versions, wrong history and digest drift. Restore ordering
places this tail after the full existing release and its service ACL supplements.
No packet step authorizes deployment.

All 42 original local issue bodies are retained, independently hashed in the
[acceptance inventory](launch-integration601-acceptances.json). The existing acceptance
ledger owns their commercial/provider exceptions; local passing tests do not close
those GitHub gates.

## Actual integration repairs

The new bundle draft authority originally patched the old membership-only guard.
It now extends the current staffed provider-seat check only for the exact transient
website draft at revision zero. Its rollback restores the stronger current guard.
Package reader wrappers are removed and restored in order when rehearsing earlier
snapshot-authority migrations. Exact full-catalog comparisons include writer bodies,
ACLs, volatility and security configuration.

Payer provenance now freezes `payer_kind` beside immutable account, line, payer,
customer, subscription, item, charge, currency and period. In line with ADR 0012,
an agency-paid wholesale line earns no agency attribution row. Native regression
proves replay, retained creator royalty/refund loss and preserved business-paid
agency attribution. No percentage, fee, tail, aggregate cap or proration policy was
selected. Missing agreements still produce pinned zero rows; credit lines remain
policy-gated.

The calendar compatibility rollback now restores the exact deployed guard rather
than the older prepared function. Native fixtures use current chosen/staffed agency
authority. Historical runners include the previously omitted deployed private-helper
ACL migration; recreated functions were not granted browser access to make tests pass.

## Verification on the combined candidate

| Proof | Observed result |
| --- | --- |
| Full unit suite | 923 files passed, 2 skipped; 8,693 tests passed, 46 skipped |
| Typecheck, lint, production build | Passed |
| Product boundaries, ontology | Passed |
| Actual nine client checkouts | 196/196 compatibility checks passed; no client files changed |
| Agency native journey, all ordered migrations | Passed on 297 migrations: add client, seat-only draft, exact owner approval/publish/readback, isolation, revocation, stale revisions and replay |
| Full hand-ordered workspace SQL rehearsal | Passed, preserving owner/retention/provider rollback refusals, then all combined contracts |
| Full populated historical upgrade | Passed, then combined money/apps contracts and 1,519-function read-only call graph scan |
| Genuine READ ONLY authority | Current readers plus package, payer and money exports passed authorized results and denial controls |
| Creator populated upgrade | Actual native records/releases/receipts retained through forward/rollback/reapply |
| Creator ordered rollback | Retained reviewer policy refused rollback; empty ordered rollback restored baseline routine hashes; reapply passed |
| Payer races | Writer-first locks prevent demotion through acceptance; demotion-first cap/job/transition commands deny |
| Creator races | Four actual Version writes serialize with grant, agency role, owner role and delegation withdrawal; subsequent writes deny |
| Connect races | Exactly one concurrent recovery reservation and one immutable review conclusion succeed |
| Wholesale regression | No agency share on agency-paid wholesale; creator/loss receipts retained; business-paid attribution preserved |
| Existing browser Version journey | 7/7 passed: desktop/mobile review, native preview, keyboard/touch sizing, loading/error/empty/read-only/missing-account states |
| Historical release safety | Passed offline inventory/staging, original batch forward/rollback/reapply, ACL checks, dump/restore and guarded recovery |

Commands use existing frozen-lockfile dependencies and local PostgreSQL 18 unix
sockets. The browser is a development-only fictional preview; it proves rendered
components, not authenticated adoption or provider operation. All 46 unit skips and
both skipped suites remain explicit. No new dependency was added.

Logs, including failed runs, are retained privately under workspace
`.scratch/launch-completion-2026-10-08/integration601-proof/`, with SHA256 entries
in `logs.json`. The first combined run failed units/typecheck and native bundle
migration. Additional failed rehearsals exposed: stale packet/sentinel inventory;
package wrapper order; missing historical ACL fixture prerequisite; reused fixture
IDs; incorrect count of preexisting disconnect receipts; stale creator race email;
and ordered rollback of later money/calendar readers. These were repaired and
rerun. The transient new packet label collided with historical batch 10 during
preparation; it was corrected to 12 before the passing inventory checks. Every
historical packet entry remains intact. No failure was converted to a skip.

## Remaining gates

Independent seam review is pending. This branch does not include the parallel
October 8 website-origin/recent-auth changes. A selected converged release source
still needs its final authenticated journey and native/compatibility proof. Current
production truth and all deployment gates remain unchanged.

No real Stripe profile/KYC/fee/settlement/refund/payout proof, assistant authorization,
public hosted-site DNS/TLS, Sandbox SDK/image/runtime/billing, published directory,
commercial support drill, price acceptance or customer adoption was performed.
#232/#235/#236/#237/#240/#323/#324/#311 and policy/provider gates remain open.
No production dump was fetched or restored in this integration lane; the dump/restore
listed above is the existing historical disposable release-safety rehearsal.

Next: independently review this exact local candidate, then reconcile the chosen
website/recent-auth source in an isolated checkout and rerun affected gates. Tracker
ownership remains with the tracker lane; no GitHub issue was written here.
