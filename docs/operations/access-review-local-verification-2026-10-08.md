# Access review — private local preparation

Issue #275; frozen source `e28e1a5fcf89d43f4d3fc123a1fbceaee3bb6d00`.

The business People & access view links to a single-read review of direct members,
read-only delegations, operating assignments, agency staff assignments, provider
marks, provider seats and live agent credentials. Organization review is available
to the root's owners/admins and includes active mapped businesses only when the
actor has current direct membership there. Inaccessible businesses contribute a
count; their IDs, names and access details are not returned. Mappings never grant
review or revoke authority. There is no separate organization-unit ownership
schema in this source, so this is explicitly coverage over mapped businesses.

Members can read their business's review. Owners/admins revoke delegations and
agent credentials; only owners remove non-owner membership, operating assignments,
agency staff or provider seats. Every owner is protected, including the last
owner. Provider-of-record termination calls the existing notice protocol. A
provider seat is an access credential; ending it does not terminate the provider
relationship. Revocation and the `customer_mapping_audit` receipt commit together.

The live-token predicate checks expiry, revoked state, issuer verification/email,
current direct membership, the native agent grant's state/email/expiry and the
credential's scopes. Last use comes from the latest existing agent read/propose
event. Other access types have no reliable use ledger and show “Not recorded”.
Credential removal revokes that token; it leaves the shared native participation
grant intact. Requests already reading before revocation may finish; subsequent
token resolution denies the revoked credential. No production behavior is claimed.

## Local evidence

Commands run in the isolated worktree:

```sh
pnpm exec vitest run src/__tests__/access-review.test.ts src/__tests__/access-review-ui.test.tsx src/__tests__/access-review-routes.test.ts src/__tests__/agent-access.test.ts src/__tests__/agent-access-routes.test.ts
pnpm typecheck
pnpm exec eslint src/platform/access-review src/experience/workspace/AccessReview.tsx src/experience/workspace/preview/AccessReviewPreview.tsx src/experience/workspace/preview/access-review-fixture.ts src/app/api/workspace/access-review src/app/workspace/access-review src/app/preview/strelva/access-review src/__tests__/access-review*
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash scripts/check-access-review-sql.sh
```

The 21 unit/HTTP/UI tests, typecheck and focused lint pass. The SQL script builds
and qualifies the existing synthetic full schema, including its money/apps tail,
then applies the historical enterprise mapping migration omitted by that
hand-ordered harness before qualifying access review. An optional
`ACCESS_REVIEW_BASE_DUMP` caches only that synthetic baseline for focused retries;
the final proof used the dump created by this worktree's complete baseline run.
The default command repeats the full baseline. No production connection is used.

Native proof covers all seven categories; direct-member and organization scope;
root member/outsider/unverified denials; protected ownership; admin and owner
revoke boundaries; live/expired/revoked/orphan/mismatched issuer/native scope
withdrawal cases; native provider notice enforcement; audit insertion failure
rolling back the access change and token event; idempotent token retry; genuine
`READ ONLY` reading; and the static reader graph (1,464 routines, no reader reaches
a row lock). Two independent sessions prove duplicate revocation emits one audit
receipt and actor membership removal denies a waiting revoke.

The forward migration uses one transaction, a five-second DDL lock timeout and
schema reload notification. Injecting failure after function creation but before
ACL revocation leaves the complete public catalog unchanged. Applying the real
unused rollback also restores the exact catalog. Once receipts exist, rollback
refuses without changing the catalog or discarding the audit.

T3 preview review observed desktop at 1280px and mobile at 360px/320px, long
labels, organization coverage, member/read-only, empty, loading, error/permission
and retry states. Revoke has a 48px target and a visible 2px keyboard focus outline.
A fictional one-click revoke removed its row and announced preview-only success.
Observed document width equals viewport width at 320px and 360px.

Initial failed attempts are retained in the workspace receipt directory: omitted
mapping fixture schema, SQL operator precedence, the newer assignment identity
guard, retained unrelated notice policy and a stable-function same-statement
snapshot assertion. These were corrected and the final source was requalified.
The first dev attempt could not use the linked dependency store under Turbopack;
the existing webpack mode supplied the rendered proof. T3 had one transient
transport failure; navigation/readback succeeded on retry.

## Integration boundary and next action

The additive `20261021091000_access_review.sql` must be reviewed and applied
before code activation; the API fails closed if storage/RPCs are unavailable.
The existing workspace release gate remains in place. No dependency, production,
provider, billing, DNS, email or outside message action was performed. The source
and proof remain private. The next action is parent integration/security review
and combined candidate verification. Live authenticated use, customer acceptance
and commercial value remain unproven.
