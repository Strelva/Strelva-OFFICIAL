# Security/runtime production release — October 7, 2026

Status: staged app qualified; production migration sequence in progress. This
receipt must be completed with the final migration journal and canonical alias
before being treated as deployed evidence.

## Authorized scope and source

Jacob requested the four security/runtime issues be finished, then explicitly
requested deployment and issue repair. This release targets only the Strelva app
and its existing Supabase project. Marketing, client deployments, DNS, billing,
provider writes and email campaigns are outside this release.

- App source: `97bcf8cbf3082b76d3a9709aa1576ff1aa41f39e`, clean isolated
  `release/security-runtime-20261007` checkout. Runtime source is identical to
  `2ab23eb2687afe4255e3d08e2dbeafdcf149ce80` in the repair checkout.
- Vercel: team `strelva`, project `strelva-admin`, project ID
  `prj_AzaQBS8jM9E5RVgHuMWnQju0GIxb`.
- Qualified staged artifact: `dpl_CKSypGmztykDLY8r8aFi8xYCeYEN`,
  `https://strelva-admin-hjqoc61hc-strelva.vercel.app`.
- Prior live and recovery artifact: `dpl_9ViM5iWeCepPiio8k3AZ5NFwKFPx`, source
  `2dd3453a5e8ae5493c86a57a428a6f71f32f30c1`, refreshed READY before promotion.
  Preserve the immutable artifact; rebuilding a source is a weaker recovery path.
- Supabase: `zthifbnrtsirdekzzlxs`. Fresh inspection found 86 applied migrations,
  14 tenants, 12 active tenants, one workspace and 114 public tables.
- Existing workspace release was verified enabled through its exact unsigned
  `/api/workspace` 401 JSON response. Existing configuration and secret values
  remain in Vercel. No new feature flag or commercial entitlement was activated.

## Four repairs

Readers use snapshot authorization without writer locks; valid staffed provider
seat website readers retain the current website authority contract. Mutations
keep revocation locks. Owner decisions bind their exact assignment lifetime,
source, action, recipient and revision, then recheck authority at mutation.
Native application and Version signed links require sign-in until atomic owner
session enforcement exists.

Inquiry retention removes expired detached leads and dependent visitor copies;
orphan copies receive the established 365-day deadline. Active/attached business
evidence remains. Concurrent event insertion and teardown serialize correctly.
Minimization receipts preserve aggregate evidence, not recoverable visitor data.

Provider compensation uses durable exclusive claims and explicit failed/unknown
outcomes. Ambiguous provider undo is never automatically repeated. Runtime
recovery revokes reviewed RPC permissions while retaining forward schema,
customer rows, receipts and later security repairs. It is not schema reversal.

## Qualification and recovery

The current integrated source passes 8,451 unit tests (46 skipped), typecheck,
lint, production build, full SQL and upgrade gates, boundaries and ontology.
All 196 available client repository contracts pass. Actual final-schema
PostgREST checks cover 56 authorized GET/POST equivalents, 84 expected denials,
eight browser/private-helper denials and both writer/revocation orders.

Old `2dd3453a` and candidate `adfe0c2e` use the same isolated real
Postgres/Auth/Redis stores. Workspace enabled: each passes three frozen cases
covering client contracts, retained owner app records, onboarding and invitation
acceptance/revocation. Disabled: each passes the legacy case and refuses workspace
routes. No retries, skips or flaky outcomes. Final dependency changes preserve
this application/SQL logic; 20 sanitizer checks and all 8,451 unit tests pass again.

Fresh private production schema/data/roles dumps were restored to an isolated
PostgreSQL target with actual public owners and ACLs. All 178 pending migrations
pass in the exact production order. All customer source projections are retained;
the sole populated original relation retired is exactly two validated bootstrap
security seeds, which remain in the private source dump. Two recovery rounds
revoke all 188 scoped active service RPCs, preserve legacy behavior and restore
the exact secured catalog. Current compensation, owner effects and retention
SQL proofs pass on the restored source.

The prepared history has 264 pinned forwards: prerequisites, the original 85-file
scope, then remaining current corrections. Recovery baseline is captured before
pending ordinal 56; scope immediately after ordinal 140. Scope must contain
238 signatures, SHA256
`f1e114b822cc0b8148fce74dc3d8a38181da827c133c9baa70e8b582fed04469`,
and initially 189 executable service RPCs. Later security retirement removes one.
Each migration and its exact history are committed atomically with a 3-second
lock timeout and 120-second statement timeout. Unknown outcomes stop; resumption
requires the exact prior prefix and immutable journal. No destructive rollback
is run automatically. The original and faster Management API transports preserve
the same SQL, guards, history checks, exclusive lock and resume logic.

Private operator evidence lives under
`~/.strelva-prod-ops/dumps/security-runtime-20261007/`,
`~/.strelva-prod-ops/rehearsals/security-runtime-20261007-5/` and
`~/.strelva-prod-ops/security-runtime-20261007/`. Keep these private; their data is
not a distributable fixture. Local proof log hashes and earlier failed build/test
receipts remain under `output/security-runtime-2026-10-07/` and private temporary
release logs. The restore harness is
[`check-restored-production-security-runtime.ts`](../../scripts/check-restored-production-security-runtime.ts).

## Release blockers repaired

Next.js and Sharp were patched to 16.3.8 and 0.35.5. Production audit has zero
high/critical findings; six existing moderate Sentry/OpenTelemetry findings remain.

Hosted testing reproduced a native sanitizer loading failure even though the
local Node 26 build passed. Vercel accepts the native package trace after explicit
symlink CSS aliases are removed. Its restricted serverless module loader requires
a scoped `isomorphic-dompurify@2.36.0 > jsdom` 26.1.0 override. DOMPurify remains
3.4.16; the independent test-environment jsdom stays 29.1.1. The exact disabled
require-ESM reproduction and sanitizer security checks pass. Earlier failed
staged artifacts are preserved as failures, not promoted.

Final staged checks: health/sign-in 200, unsigned workspace/cron 401, invalid
lead 400; all 60 public client API reads return 200 with identical pre-release
body hashes. No staged error logs were returned for these requests.

## Remaining proof boundary

This is an app/security rollout, not evidence of full public 1.0 acceptance or
customer adoption. No real provider undo, live customer login, Auth mail delivery,
paid transaction or new agency journey is asserted. The dump restore excludes
managed Auth/storage/platform relations and uses a declared Auth shim; it does
not establish full hosted disaster recovery. Hosted backup metadata still listed
no backup and PITR disabled. Preserve the immutable old app and forward database;
never restore the whole old database over newly accepted customer work.

Final hosted migration count, scope/fingerprints, canonical alias and post-release
availability must be recorded here before closing the deployment.
