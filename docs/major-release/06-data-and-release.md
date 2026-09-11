# 06 — Data, APIs and release operations

Status: requirements for implementation and release preparation. Existing source is local evidence. Production workspace migration/authentication acceptance, reproducible hosted CI and dependency security remain open gates.

## Data authority and minimal additions

`OPS-01` Follow [persistence boundaries](../persistence-boundaries.md). Postgres owns identity, tenant configuration, domains, content, collections, drafts, audit and activity. Workspace tables/operations are Postgres-backed but require the release migrations and acceptance. Redis remains authoritative for the listed operational domains, including approvals, dashboard conversation threads, provider connections, pay links, CRM and live operator accounts. A mirror or unused table does not change authority.

Add only the customer/resource/assignment/installation mapping needed for authorized Enterprise reads. Each new table must have immutable IDs, explicit ownership/scope, foreign keys where the authority is local, validated external references otherwise, timestamps/version, revocation state, provenance and audit. Migrations must specify uniqueness, duplicate behavior, deletion/retention behavior, concurrent mutation rules and indexes for scoped lookup. Do not create a universal organization/CRM platform. Preserve `WorkspaceKind = personal | agency | customer`; Enterprise is a separate relationship fact.

`OPS-02` Keep existing saved work private and product-validated. Public reports remain their own retained sources; save creates an explicit private copy from the server. No browser-supplied result payload or lead fields enter that copy. Preserve current workspace recovery retention: completion clears redundant checkpoint payload, retains operation identity/pointer for deduplication, workspace deletion cascades operations, and deleting saved work does not reactivate an operation. There is currently no time-based operation purge; a new public retention promise requires `DEC-09` and implementation.

`OPS-03` Do not bulk associate customer names, domains, tenant slugs, payer accounts or existing agency workspaces automatically. Prepare a reconciliation file/report with exact source identifiers, proposed associations, evidence, conflicts and owner for each unresolved mapping. Apply only reviewed mappings through a scoped repository operation. Do not copy private product data into that report. An orphan/missing mapping fails closed and appears as an operator reconciliation item; it never exposes a fallback customer.

## API and authentication

`OPS-04` Preserve existing `/api/workspace` contracts and request-level gating in [proxy.ts](../../src/proxy.ts). Supabase Auth is the only identity provider. Workspace and Enterprise reads require a confirmed session; account verification must not use a local managed-dashboard bypass. Private responses use `Cache-Control: private, no-store` and bounded error bodies. Preserve existing same-origin, JSON/content-type, body-size, schema and rate-limit checks for mutations. Validate redirects/return URLs and preserve requested result context across authentication without accepting open redirects.

`OPS-05` New Customers and Home Finder reads may be separate endpoints or additions behind existing routes; keep their public interface small. The implementation PR must publish exact request/response schemas and routes. Required semantics:

| Operation | Input | Successful output | Failure behavior |
| --- | --- | --- | --- |
| List Customers | Selected organization, bounded query/cursor | Only authorized summaries and scope-bound next cursor | 401 no session; bounded 403/404 for inaccessible scope; 503 source unavailable |
| Customer detail | Organization and customer relationship ID | Authorized resource references plus per-source availability | No cross-scope existence/details; partial source failure distinct from empty |
| Installation detail | Organization/customer/installation reference | Validated safe summary/readiness | Mapping mismatch fails before IDX fetch; timeout/schema mismatch unavailable |
| Delivery list/detail | Authorized installation plus cursor/reference | Only `DeliverySummary`/page contract from specification 05 | No raw receipt fallback; wrong installation reference rejected |
| Existing recovery | Workspace and operation ID | Same saved result or typed pending/conflict | Actor binding, no duplicate checkpoint execution, bounded attempt/budget error |

Use stable machine error codes for new contracts with safe human copy; existing clients retain their current `{ error: string }` semantics unless additively extended. Select consistent 403/404 behavior to avoid private object enumeration. Lists must bound query length/page size and prevent authorization leakage through totals, cursors, filters or timing-sensitive resource discovery. Do not use a client-provided tenant header as trusted authority.

`OPS-06` Application authorization and RLS tests both matter. Service-role repositories must prove membership/scope before protected operations. Recheck live grants before a write or long-running result response. All new administrative mapping mutations require operation-specific permission and an audit record; no arbitrary JSON patch or global service-token endpoint exposed to the browser. IDX service credentials live in the product's server secret boundary; REB provider secrets use [crypto/secrets.ts](../../src/lib/crypto/secrets.ts).

## Compatibility

`OPS-07` Preserve `/api/v1/*`, `reb:` keys, `x-reb-*` headers, and existing `REB_*`/`SCAFFOLD_*` contract symbols. This release does not require a storefront breaking change. Any discovered need must use an additive v1 change or a separately versioned family and coordinated consumers. Run contract tests plus `pnpm check:custom-repos` for contract-impacting changes. Client-specific presentation/commerce stays in client repositories; repeated client behavior starts in `custom-repo-starter/`.

Preserve all routes in specification 04, including public reports, managed/custom-host fallbacks, sign-in/callback, delivery/payment links and operator compatibility entries. Marketing redirects must retain path/query and remain pointed at the intended product origin. New URLs must encode sufficient context to restore and authorize the same object. The browser never generates a cross-host Website link from an untrusted payload; use the existing tenant URL authority.

## Security and build prerequisites

`OPS-08` Repair reproducible installation before claiming release readiness: the inherited pnpm 9 override/lockfile mismatch blocks frozen installation in hosted CI. Resolve manifest/lock/package-manager compatibility in a reviewed change and prove a clean install with the selected supported toolchain. Remediate dependency security findings with affected-path evidence and patched locked versions; do not suppress audits or weaken checks to obtain green status. Fix generated-output lint handling at the configuration boundary rather than deleting user files or ignoring product source.

`OPS-09` Repair verification scripts before relying on their names. `scripts/check-ci.sh` is not currently equivalent to all hosted checks, and its fixture copy/trap can overwrite/remove `dev-tenants.json`. Run only after preserving user fixtures and changing it to isolated or restore-safe behavior. Inventory hosted coverage/audit/build/SQL/public/workspace/browser gates explicitly. `scripts/check-release-one.sh` covers an older focused subset; add relevant account, entry, recovery, Website Audit, shared-frame and Enterprise/IDX contract checks. The CI workflow must demonstrably execute the required non-draft browser jobs; do not assume marking a draft ready triggers them when `ready_for_review` is not explicitly configured.

## Migration sequence

`OPS-10` Prepare, review and test this expand-first sequence. Production application is a separate authorized action.

1. Record exact app/marketing/IDX commits, migration hashes, target environment and current release flags. Take read-only schema/config evidence without printing credentials.
2. Verify [workspace migration](../../supabase/migrations/20260905190000_release_one_workspaces.sql) then [recovery migration](../../supabase/migrations/20260908120000_workspace_result_recovery.sql) on an isolated PostgreSQL cluster; test functions, privileges, RLS and app service-role paths. Confirm the actual target's applied migrations and PostgREST availability.
3. Prepare additive customer/resource mapping migration, constraints and scoped repository operations selected under `DEC-02/03`. Test invalid references, duplicate/concurrent operations, revocation, removed membership and unavailable stores. No destructive tenant/account conversion.
4. Regenerate database types only against the intended schema after application is verified. Prove older compatible application reads still operate with expanded schema and gate closed.
5. Load only reviewed mappings through the verified operation. Reconcile counts/identities against the source report and inspect representative direct user, agency and brokerage scopes.
6. Deploy the authorized compatible application while release exposure remains gated; verify actual confirmed sessions and old managed routes before staged activation. New environment values require a new authorized production deployment, not a redeploy assumption.

The workspace release gate remains `STRELVA_WORKSPACE_RELEASE`; development previews keep their existing separate guard. If Enterprise/IDX exposure needs additional rollout control, define its exact independent server gate in the implementation PR; never infer live availability from the workspace gate or a catalog entry. Existing customers must retain working managed routes if new workspace storage is unavailable.

## Observability and failure recovery

`OPS-11` Record structured operation evidence: correlation ID, actor reference, workspace/customer/resource scope where needed, operation name, schema/source version, outcome, timestamp, latency, denied-scope reason class and downstream error class. Avoid result content, buyer data, credentials, token-bearing URLs and private destination emails. Retention and operator access to logs must be explicit. Product audit/receipt stores remain authoritative; logs are diagnostic evidence.

Observe auth-denial changes, schema/permission errors, workspace recovery conflicts/attempt exhaustion, unavailable customer/IDX reads, provider acceptance versus verification, worker freshness/purge failure, and compatibility route errors. Each alert/runbook identifies the owner, first safe read, stop condition and recovery operation. Use existing cron declarations/authentication/heartbeat registration for any new REB cron; this baseline does not require one. IDX's worker remains product-owned.

`OPS-12` Prepare rollback before activation: prior compatible artifact, release-gate action, configuration identity, schema compatibility, data verification and responsible operator. Prefer disabling the new exposure and restoring a compatible application over dropping expanded schema. Do not delete workspaces, saved results, customer mappings, migrations or inquiry evidence as rollback. Revoked grants stay revoked; accepted provider writes stay resolved. A roll-forward repair may be required for durable state; prepare it explicitly. Stopping new IDX intake does not erase or reroute accepted jobs, which retain their native worker/retention obligations.

## Required evidence and release receipt

`OPS-13` For code changes run the narrow success/failure tests plus `pnpm typecheck`; broaden for affected boundaries. Release verification includes lint, full unit tests, build, boundary/ontology checks, isolated workspace SQL, applicable contract/custom-repo checks, public and owner/operator smoke, account/workspace/recovery/shared-frame tests, new Enterprise/IDX tests and each changed sibling repository's gates. Run SQL locally with `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH npm run check:workspace-sql`; this creates an isolated cluster and does not migrate production.

The session reports local unit/build/type/SQL and targeted browser passes. They are useful baseline receipts, not fresh acceptance for code proposed here. Hosted clean-install CI, dependency security, real confirmed production sessions and target workspace schema availability remain separate. Record exact command, commit, environment, synthetic versus real data, result and limitations for every gate. T3 browser checks in `UI-12` are required for user-facing changes; build output is not a substitute.

`OPS-14` The final prepared release receipt lists selected version, app/marketing/IDX commit identities, migration/configuration diff, scope enabled/disabled, passing checks and links, unresolved decisions, live-provider prerequisites, rollback plan and exact requested production action. Follow [VERSIONING.md](../../VERSIONING.md): REB and marketing package versions, marketing npm lock and changelog headings stay aligned; IDX remains independently versioned. Deployment, migration, environment changes, live messages/email, billing, provider/domain changes and repairs require explicit authority for the exact action. After authorized rollout, record production evidence separately from local and preview results.
