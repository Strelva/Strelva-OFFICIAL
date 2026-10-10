# Prepared review approval continuity

Isolated preparation based on deployed `954f19057344dbf0cc9c10b04506071750a19c50`. No production database, deployment, provider, email, billing, DNS or client conversion writes occurred here. Strelva Agency creation and held client conversions are recorded by the root operations owner, not this patch.

## Behavior

Preserves existing, unexpired review approvals across a new conversion only when the exact original import recipient remains trusted, no owner has accepted, and permanent ownership epochs prove no intervening identity change. Legacy tokens issued after conversion are denied. Future converted review emails use HMAC tokens bound to tenant, review event, decision, workspace, trusted recipient and authority version. GET remains a confirmation page; POST enters the existing tenant event action spine. Both action guards bind event and decision and check the review-draft kind. Workspace publishing token policy is unchanged.

The new server-only RPC is read-only. A private epoch table and narrow identity/link triggers preserve revocation through trust, owner membership, verification, email change-back, unlink and relink. Initial conversion itself retains legacy eligibility. Preexisting conversions are seeded revoked because pre-install identity history cannot be proved. Unconverted tenant links retain their original recipient-unbound contract; this patch does not strengthen or change that boundary.

## Proof

- Final focused Vitest: 111 tests in seven files pass. Includes scanner-safe GET, old conversion links, new bound links, email buttons, HMAC/expiry, cross-tenant, wrong event/opposite action, malformed/unavailable/timeout authority, owner acceptance, trust version changes and action kind changes after claim.
- Final `pnpm typecheck`: pass. Earlier new-test tuple typing failure is retained as `typecheck-initial-failure.log`.
- ESLint over the ten changed/new TypeScript files: pass.
- Native PostgreSQL 18 disposable cluster: all 267 ordered migrations and the new continuity SQL test pass, including nullable retained audit links, original unconverted mail behavior, conversion identity, operator proposals, owner changes/change-back and unlink. Fictional test rows roll back; cluster is cleaned up. This proves a fresh ordered replay, not an actual live266 upgrade rehearsal.
- Independent read-only security review: three findings corrected (event/action spine binding, nullable retained link handling, unconverted future mail). No further sequential predicate blocker identified.
- Required authenticated browser command was attempted but did not start: shell redirection failed with `no space left on device`. Read-only disk check showed host100%, 285 MiB available. No Auth/app/container was started and no unrelated cleanup occurred. Browser behavior remains unproven; `browser-final.log` retains the failure.
- Exact source, lock and evidence hashes: `receipt.json`. Earlier focused/native logs remain locally available.

## Hold and next action

Deployment and all client conversions remain HOLD. An owner can still change after the read-only authority RPC returns and before Redis claim or Google dispatch. A second read detects sequential changes but cannot serialize this concurrent race. Do not request deployment approval as if this repair were complete. A separately scoped, reviewed atomic reservation/dispatch authority boundary is required, with native concurrency and provider failure/receipt proofs.

Before any eventual promotion, reconcile the forward migration `20261023200000_tenant_review_approval_continuity.sql` with the current live migration catalog (captured count266), rehearse an exact upgrade on an owned production-equivalent copy, satisfy authenticated browser/release requirements, obtain required production authorization, and install the DB helper before enabling the app. Missing RPC fails closed for review buttons/actions. Do not convert clients before the compatibility runtime and concurrency repair are ready.

The unrelated retained encrypted tenant-secret authentication failures also hold conversion and require read-only diagnosis; do not rotate or overwrite the existing secrets to force conversion. No change here resolves import completeness, account/billing reader changes, client lead workspace mutation or the broader conversion preservation contract.
