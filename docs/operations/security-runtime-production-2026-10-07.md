# Security/runtime and bounded agency production release — October 7, 2026

Status: deployed. Canonical `https://app.strelva.com` was independently verified
at 03:51:35 UTC October 8 (October 7 in Buffalo) against the exact final artifact.

## Source and authorized scope

- App source: `954f19057344dbf0cc9c10b04506071750a19c50`, clean isolated
  `release/security-runtime-20261007` checkout; tracked tree identical to repair
  source `b27fe156`. Existing dirty main and customer checkouts were preserved.
- Final artifact: `dpl_9k1j1sG8ioAGVeYr6WAAZZvKzBmP`,
  https://strelva-admin-ja1lq1l9v-strelva.vercel.app. Next.js 16.3.8.
- Target: Vercel `strelva/strelva-admin`, project
  `prj_AzaQBS8jM9E5RVgHuMWnQju0GIxb`; Supabase `zthifbnrtsirdekzzlxs`.
- Prior live/recovery artifact: `dpl_9ViM5iWeCepPiio8k3AZ5NFwKFPx`, source
  `2dd3453a5e8ae5493c86a57a428a6f71f32f30c1`. Preserve the immutable artifact.
- Existing `STRELVA_WORKSPACE_RELEASE=1` was preserved. Exactly two production
  flags were added as `1`: `STRELVA_AGENCY_ADD_CLIENT_RELEASE` and
  `STRELVA_WEBSITE_REBUILD_RELEASE`. All 65 existing environment records remained
  byte-identical. No other release/model/provider/mail configuration changed.

Jacob authorized completing and deploying the four security/runtime repairs,
then explicitly coordinated this combined agency release with one DB writer and
one final promotion. Marketing, client deployments, DNS, billing, provider writes
and email campaigns were outside this release.

## Four repairs

Readers use snapshot authorization without writer locks; mutations retain
revocation locks. Valid staffed seats retain current website read access.
Owner decisions bind assignment lifetime, source, action, recipient and revision,
then recheck authority at reservation and effect. Native application/Version
signed links require sign-in until atomic owner-session mutation exists.

Inquiry retention removes expired detached leads and dependent visitor copies;
orphan copies receive the 365-day deadline. Active/attached business evidence
remains. Event insertion and teardown serialize correctly; minimization receipts
retain aggregate evidence without recoverable visitor payloads.

Provider compensation has durable exclusive claims and explicit failed/unknown
outcomes. Ambiguous provider undo never automatically repeats. Runtime recovery
revokes reviewed RPC permissions while retaining forward schema, customer rows,
receipts and later security repairs. It is not schema reversal or whole-API shutdown.

## Production database receipt

Initial hosted history 86 became exact 266: the rehearsed 178-file security sequence,
then only `151110_website_owner_agency_publish` and
`191000_actor_rpc_service_boundary`. Retired, unshipped `151200` was removed from
source and never applied. No history repair or default-derived ACL grant was used.

The original 85-file recovery scope retains 238 signatures, SHA256
`f1e114b822cc0b8148fce74dc3d8a38181da827c133c9baa70e8b582fed04469`,
with 188 currently executable service RPCs. All seven stronger 181310 owner
function definitions still match their saved fingerprints. All three supplied-actor
RPCs deny anonymous/authenticated execution and allow service execution. The
earlier restored-dump ACL finding is historical; fresh hosted checks were already
closed before 191, which adds explicit drift protection.

Each migration/history insertion was atomic, with 3s lock and 120s statement
budgets. Unknown outcomes stop for exact prefix reconciliation. At the scope
checkpoint, hosted locale ordering differed from the local C ordering; the
transaction refused. Two verification ORDER BY expressions were corrected to
COLLATE C after exact-set proof. Migration bytes, history and scope were unchanged.
No destructive rollback or production runtime disable/re-enable was performed.

Private journals and readbacks live under
`~/.strelva-prod-ops/security-runtime-20261007/` and
`/private/tmp/security-agency-production-final-readonly.json`. Original plan SHA
`037b742d6909ad6f8a582d568e266e5a11d17f96a76e63e360134601d33612f1`;
supplemental plan SHA
`4bea67ee5b1fc3ad7b033662911095146ddc7350a10f3f9686fcb6cb8fd5438f`.
Both journals are finished with no inflight migration.

## Qualification

Final source passes 8,505 unit tests (46 skipped), typecheck, lint, boundaries and
ontology. Hosted production build is READY. Final import-boundary repair moves
unchanged pinned public fetching and URL safety into shared infrastructure;
legacy entry points remain. Full units and source gates passed again afterward.
Production audit has zero high/critical findings; six existing moderate
Sentry/OpenTelemetry findings remain. Next.js/Sharp and the restricted CJS
sanitizer loading failures were repaired; failed artifacts remain recorded.

Fresh actual-PUBLIC dump restore on PostgreSQL qualifies final 266 in the exact
180-pending hosted order. 113 customer source table projections are unchanged;
exactly two guarded bootstrap security seeds are retired and retained in the
private source dump. Both recovery rounds disable 188 scoped service RPCs,
preserve legacy behavior and restore the exact secured catalog. Six SQL probes,
14 compensation tests, actor ACL rollback/reapply/refusals and all seven successor
owner-body checks pass. The restore excludes managed Auth/storage/platform
relations and uses a declared Auth shim; it is not full hosted disaster recovery.

The final agency SQL fixture proves anonymous seat-only owner admission is NULL
without effects, while genuine verified-owner membership retains assigned-provider
binding, native approval/publication/receipt and before/after-reservation mandate
revocation denial. Historical 151200 seat-only positives are off the final gate.
The real local Auth/browser journey passes 1/1 in 27.5s, with no retry or skip and
nine desktop/390px screenshots. It proves signed-in owner claim, exact approval,
explicit named-agency consent, denials, accepted publication and receipt replay.
AI partial/failure and unavailable public HTTPS readback are displayed honestly.

Existing client compatibility has `1`96 passing repository contracts. Actual
PostgREST checks cover 56 authorized GET/POST equivalents, 84 denials, eight
helper ACL denials and both writer/revocation race orders. Paired old/candidate
Auth/Postgres/Redis journeys preserve enabled and disabled workspace contracts.
Final hosted and canonical availability results are recorded below.

## Public-delivery and operating limits

New-site origin defaults to `<tenant>.strelva.com`: production has no
`NEXT_PUBLIC_SITES_ROOT_DOMAIN`. Both 1.1.1.1 and 8.8.8.8 return NXDOMAIN for the
qualification hostname. There is no existing `/sites/<tenant>` renderer fallback.
An accepted database revision and receipt therefore do not establish a live
public website. Public delivery remains unavailable/unqualified; DNS/domain work
remains open under #243/#322. No DNS or client-domain write was made.

This release does not prove full 1.0 acceptance, adoption, economics, a real provider
undo, live customer login, Auth mail delivery, paid transaction or scheduled
retention execution. Hosted metadata listed no backups and PITR disabled.
Preserve the immutable old app and forward database; never restore the old whole
DB over newly accepted customer work. Canonical PRODUCT_MODEL reconciliation
remains an explicit unapplied delta because the main checkout is dirty.

## Final availability and closure

Promotion command completed successfully; Vercel alias API resolves
`app.strelva.com` to `dpl_9k1j1sG8ioAGVeYr6WAAZZvKzBmP`.
Hosted and canonical checks pass: sign-in/health 200, unsigned workspace/cron 401,
invalid-tenant lead 400, unsigned agency-add/rebuild 307 to sign-in. All 60 public
client GETs return 200 and exact pre-release body hashes, both staged and live.
Desktop 1280 and mobile 390 sign-in screenshots were inspected: assets load 200,
no console errors. No Vercel runtime error logs were returned for these requests.
Unsigned redirect checks establish the authentication gate, not authenticated
production publication. The new flag values were independently exported as `1`;
the temporary export was removed without changing configuration.

`/private/tmp/security-agency-final-release-receipt.json` pins 14 proof hashes.
The signed-in agency journey is local evidence; its six-file, behavior-preserving
fetch relocation is qualified by repeated full units and final hosted source gates.

Reader #252 and inquiry-retention #538 receive deployed evidence; owner-recipient
#524 is closed after this rollout. Agency owns #259 bounded add-client closure
and #534/#560 release evidence. Broader #245/#255/#263 remain open; #528 remains
open for its unmet service-role append-only audit requirement. Public website
routing/delivery#243/#322 remain open. No full 1.0 completion is claimed.
