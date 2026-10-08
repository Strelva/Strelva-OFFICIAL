# Platform support read audit — October 8, 2026

Prepared for #251 on `fix/platform-support-read-audit-20261008`, based on
`3f3eac4f`. This is local source work. No migration, deployment, provider write
or production data operation is authorized by this record.

## Current finding and repair

The original X9 audit applies to six platform-wide support readers. The
current application also calls five companion operator readers with the same
logging gap, so this repair covers eleven:

| Reader | Application owner | Original scope |
| --- | --- | --- |
| `read_catalog_tool_notice_failures` | `src/platform/catalog-reports/tool-notices.ts` | C5–C8/C13 |
| `read_catalog_tool_contact_conflicts` | `src/platform/catalog-reports/tool-history.ts` | C5–C8/C13 |
| `read_catalog_report_failures` | `src/platform/catalog-reports/operator-source.ts` | C5–C8/C13 |
| `read_operator_google_uncertainty` | `src/platform/operator-queue/store.ts` | A6 |
| `read_operator_queue_context_v2` | `src/platform/operator-queue/store.ts` | A10 |
| `read_effort_businesses` | `src/platform/business-effort/repository.ts` | R3 |
| `read_business_effort` | `src/platform/business-effort/repository.ts` | Companion ledger read from `/admin/work` and `/admin/clients/[id]` |
| `read_outside_write_receipts` | `src/platform/operator-queue/store.ts` | Companion receipt helper exported for operator consumers |
| `read_google_listing_readback_failures` | `src/platform/operator-queue/store.ts` | Legacy queue receipt source |
| `read_google_listing_readback_failures_v2` | `src/platform/operator-queue/store.ts` | Release-on queue receipt source |
| `read_operator_queue_context` | `src/platform/operator-queue/store.ts` | Flag-off legacy queue context |

The catalog IDs were originally grouped; this table does not invent an exact
individual C5–C8 mapping. Their active operator checks existed, but these
application reads recorded no attributed access. ADR 0012 requires platform
support powers to be separate and logged.

The eleven application compositions now call service-only, actor-bound
wrappers. The original six use the three-argument source wrapper; the five
companions use a separate typed detail wrapper with unchanged date, nullable
filter, limit validation and clamping behavior. It checks
the signed-in actor's verified identity and current unrevoked super-admin
grant, holds them through the transaction, appends an access event and calls
one statically selected reader. Audit failure releases no result and never
falls back to the original reader. Failure of the audited queue context stops
before any remaining service-role source read.

The new private `platform_operator_read_audit` records only event UUID, actor
UUID, the allowlisted reader or admission-power name, global `platform` scope
and timestamp.
It has no tenant wildcard, business scope fiction, email or result payload.
Direct table access is revoked from browser/service roles. Triggers refuse
UPDATE, DELETE and TRUNCATE, including a direct privileged request. The actor
UUID is retained after account deletion without a user foreign key blocking
deletion. No retention duration, customer disclosure policy or support-purpose
selection has been chosen here.

Migration `20261020090039` is an independent proposed batch 18 reservation.
Batch 17 belongs to the separate inquiry/operator audit repair; its source
integration is tracked separately. This branch does not copy or depend on that
unqualified source. The eleven pure-reader bodies, signatures and ACLs are
unchanged, including the intentional READ ONLY snapshot contract.

Initial installation, reapply and inverse refuse dangerous inherited role
paths, including NOINHERIT SET/ADMIN reachability, table/column grants,
reachable owners, SUPER/CREATEROLE and browser helper/wrapper execution.
They never rewrite unrelated roles. Private installed fingerprints guard the
audit schema, owners, ACLs, RLS, columns/defaults, constraints/indexes/triggers
and exact source/detail/admission/helper signatures and definitions. Reapply accepts only the
captured enabled or disabled wrapper contract.

## App admission lane

The service-only `authorize_platform_operator_read(uuid,text,text)` supports
seventeen fixed app admission powers: `admin.clients.read`,
`admin.accounts.read`, `admin.analytics.read`, `admin.audit.read`,
`admin.actions.read`, `admin.drafts.read`, `admin.digests.read`,
`admin.leads.read`, `admin.uptime.read`, `admin.ops.read`,
`admin.pay-links.read`, `admin.client-leads.read`,
`admin.tenant-controls.read`, `admin.component-registry.read`,
`admin.make-real.read`, `admin.booking-email.read` and
`admin.owner-decisions.read`. These names record admitted support read
attempts, without result payloads. This lane uses the same private current-actor
and append helper; browsers cannot invoke it or the helper.

The separate app-admission patch owns callers and their trusted session
identity. This standalone branch prepares that RPC and proves its native
behavior; it does not claim that those seventeen app edges are already
composed here. Admission commits before the separate downstream read. It
therefore proves an admitted read attempt, not atomic disclosure of a result.
The eleven SQL reader wrappers are atomic with their underlying read.
Queue context, in both flag states, admits the remaining queue-source read
attempt before `readAllSources`; no duplicate source-level admission is added.
Ordinary member/provider repositories are outside this platform-support lane.

## Rollout and inverse

The migration must precede deployment of the application calls. Without its
wrappers the eleven composed paths fail closed; there is no source-data fallback.
Both forward and inverse are atomic and notify PostgREST to reload its schema.
The inverse disables all three public entrypoint execute grants and retains the audit table,
events and immutable protections. Reapply preserves all events and restores
only the reviewed audited entrypoints.

The flag-off legacy `read_operator_queue_context` application path is now
admitted through the typed detail wrapper and fails closed on an audit error.
The eleven original service-role RPCs remain available for their existing
pure-reader consumers, with unchanged READ ONLY semantics. This repair proves
audited composition of their application paths; it does not claim universal
SQL-read logging or removal of every platform operator power. Future support
callers must use the appropriate audited wrapper or fixed app admission lane.
The separate app-admission patch and this source must be integrated and
qualified before claiming coverage of those seventeen app edges.

Two original findings are superseded in current source: migration
`20261014112000` changed `read_catalog_report_receipts` and
`read_strelva_handled` from ambient super-admin access to the business's
verified acting-provider seat. They are not classified here as remaining
platform-wide support reads. Inquiry reads/backfill, provider neutrality and
other platform operator powers retain their separate work and evidence.

## Local proof and continuation

Native fixtures exercise actual service/browser roles, current revoked and
unverified actors, mismatched identity, static source selection, same reader
results, global access without customer memberships, immutability, forced
audit failure and account deletion. Shared SQL checks qualify actual inverse
and reapply with committed fictional access rows, compare retained rows and
pure-reader definitions/ACLs, and refuse catalog and inherited role drift.
Application tests exercise all eleven wrapper calls and no-data/no-fallback
failure behavior, including stopping the remaining queue sources.

Failure history is retained as a scope boundary: the first role helper was
defined after a SQL fingerprint's regprocedure reference and failed first
install. It now precedes that fingerprint. The reader scanner also treated
quoted wrapper signatures in metadata queries as executing the wrapper's row
locks. Metadata now uses exact namespace/name/argument-type lookup; the global
scanner was not suppressed. Editing the migration while an earlier upgrade
was running caused its exact reapply drift check to refuse; final checks use
the frozen migration and pinned manifest. A fresh historical-schema deletion
probe also exposed its preexisting restrictive super-admin FK. The proof now
removes that authority row first, then verifies the new audit table neither
blocks account deletion nor loses the retained actor UUID.

The frozen source passed these checks locally. SQL commands used PostgreSQL 18
from `/opt/homebrew/opt/postgresql@18/bin` and disposable local databases.

| Command | Result |
| --- | --- |
| `bash scripts/check-agency-workflow-sql.sh` | Passed ordered native schema and expanded eleven-reader/seventeen-admission fixtures |
| `pnpm check:workspace-sql` | Passed fresh schema and shared audit checks |
| `pnpm check:workspace-upgrade` | Passed ordered upgrade, READ ONLY reader scan and shared audit checks |
| `pnpm exec tsx scripts/check-release-safety-batch8.ts --current-tail` | Passed complete current inventory, 51 corrective tails and two permission-recovery rounds |
| Focused Vitest suites for platform audit, business effort, catalog reports, queue projection, source completeness, listing readback and receipts | 90 tests across seven files passed |
| `pnpm typecheck`, scoped ESLint, `pnpm check:boundaries`, `git diff --check` | Passed |

An independent reviewer also ran the expanded native fixture and six app
suites (89 tests), with no remaining blocker in the three entrypoints, private
actor helper, role guards or preserving inverse.

The final local current-tail receipt is
`output/release-safety/batch8-1791499211866/runtime-recovery-receipt.json` in this
worktree, SHA-256
`f65c140831952ad01e526048d0433fa8f6a6fda8668facb0c4d5ab2c8d92383d`.
It pins this forward migration to
`7bcd8d8a942a591136584f20282ed327c68668b136035fcbb598b52dd96a69ff`,
matches the proposed manifest, and records exact catalog and public-row
preservation across recovery. The inverse is pinned to
`882a103455fa27e8d5249f5416e324b8401cbbb20a24f38944299a1bf35aa6a6`.
This receipt is local permission-recovery evidence; it exercises no hosted
delivery, provider effect or production deployment.

Next: independently review this local commit,
integrate with the separate #528, inquiry/operator and portfolio repairs, then
qualify the exact combined source and reconcile the proposed manifest. Any
production application remains a separate explicitly authorized action.
