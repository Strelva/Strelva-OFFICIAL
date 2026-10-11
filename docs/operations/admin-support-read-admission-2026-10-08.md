# Human support read admission — prepared 2026-10-08

This app-only slice is based on release/security-runtime-20261007 at `3f3eac4f`. It depends on prepared migration 39's service-only `authorize_platform_operator_read(uuid,text,text)` and its fixed seventeen powers, owned by the separate platform support audit slice (`42245f9574b239f4d7442a96318eea929d349c41`). No migration or provider role policy changes belong to this slice. These are local source and test results, not deployed or production evidence.

## Contract and trusted actor

An actual human platform support read must persist an admission event before starting private data queries. The shared app helper sends only the current verified session user UUID/email and a static power. SQL 39 rechecks the current database user's verification, identity and active super-admin authority and persists a platform-scoped event. It rejects unknown powers, revoked actors and audit insertion failure. There is no synthetic `*` tenant or visitor/contact/query payload in these admission calls.

Strict admin entrypoints derive the actor with `getAuthenticatedOperatorContext`, which reads the revalidated Supabase session and active UUID-linked operator grant. SQL rechecks this even if an earlier `isSuperAdmin` check has passed. Operations internal inbox uses its existing verified session actor. Owner decision loaders use their existing `workspaceHttpActor`, after their operator guard.

Tenant read entrypoints independently derive the revalidated session user using `getSessionUser`, without depending on the operator grant still being present. They read `memberships` by that UUID and the same current tenant ID used by the original guard and data reader. A qualified ordinary membership skips platform admission. Unconfirmed ordinary members retain the original membership contract. The five permission-gated GETs pass their original required permission and use canonical `roleHasPermission` against the ordinary membership role; viewer membership does not skip auditing an owner permission bypass. No membership, an insufficient membership, missing verified support identity or revoked support authority cannot silently skip audit. The common dashboard guard uses the existing registered workspace port composition, so the tenant model does not import a workspace layer; missing runtime registration throws before private reads. The original tenant guards have no owner-email, `owner_user_id` or system-session fallback authority: their ordinary authority is current membership. Public demo dashboard and explicit nonproduction dev bypass remain their existing branches without invented human provenance.

Admission and downstream raw queries are separate transactions. The event records attempted support access, not returned rows, completeness or a transaction spanning the data reader. Failure prevents disclosure through the enumerated entrypoint; a successful event can remain when a subsequent data reader fails. Database-native atomic reader wrappers from migration 39 and the inquiry wrapper from migration 38 retain their stronger, separate contracts.

## Finite actual app inventory

The initial operator inventory is 24 admin GET handlers, 13 server pages and the shared owner-decision loader. It also includes the read-only admin agent POST, the global branch of `my-properties`, and the internal branch of the operations inbox. These static powers are grouped by the actual support job; this is not an exhaustive claim about all service-role SQL functions.

| Static power | App entrypoints (under `src/app`) |
| --- | --- |
| `admin.clients.read` | `admin/clients/[id]`, `admin/clients`, `admin`, `api/admin/agent`, `api/admin/portfolio`, `api/admin/tenants`, `api/my-properties` |
| `admin.accounts.read` | `admin/accounts`, `api/admin/accounts/[id]`, `api/admin/accounts` |
| `admin.analytics.read` | `admin/analytics` |
| `admin.audit.read` | `admin/audit`, `api/admin/audit` |
| `admin.actions.read` | `admin/actions` |
| `admin.drafts.read` | `admin/drafts`, `api/admin/drafts` |
| `admin.digests.read` | `admin/digests`, `api/admin/maintenance-digest` |
| `admin.leads.read` | `admin/leads` |
| `admin.uptime.read` | `admin/uptime` |
| `admin.ops.read` | `admin/ops`, `api/admin/mail-logs`, `api/admin/ops`, `api/admin/revalidation-status`, `api/operations/inbox` |
| `admin.pay-links.read` | `api/admin/pay-links` |
| `admin.client-leads.read` | `admin/client-leads`, `api/admin/client-leads` |
| `admin.tenant-controls.read` | `api/admin/tenants/[id]/connections`, `api/admin/tenants/[id]/crm`, `api/admin/tenants/[id]/domains`, `api/admin/tenants/[id]/members`, `api/admin/tenants/[id]/operator-settings`, `api/admin/tenants/[id]/owner-invitations`, `api/admin/tenants/[id]/release-flags`, `api/admin/tenants/[id]/reviews-intel`, `api/admin/tenants/[id]/visibility` |
| `admin.component-registry.read` | `api/admin/component-registry` |
| `admin.make-real.read` | `api/admin/make-real` |
| `admin.booking-email.read` | `api/admin/businesses/[id]/booking-email` |
| `admin.owner-decisions.read` | `admin/needs-you/data.ts` |

`admin.clients.read` additionally covers the actual human platform membership/permission bypass at the common `requireDashboardView` guard and the following 52 tenant GETs. Admission occurs after the original guard and before private reads. The inquiry workspace shared context has a GET-only admission option; POST retains its existing mutation guard.

- `api/activity`
- `api/agent/usage`
- `api/analytics`
- `api/booking/config`
- `api/booking/list`
- `api/booking/overrides`
- `api/chat`
- `api/collections/[type]`
- `api/connections/calendly`
- `api/connections/google/resources`
- `api/connections/google`
- `api/connections/instagram`
- `api/connections`
- `api/connections/yelp`
- `api/content/[section]`
- `api/content/[section]/versions`
- `api/custom-repo/dependencies`
- `api/dashboard/content-autonomy`
- `api/dashboard/goal`
- `api/dashboard/onboarding-status`
- `api/dashboard/reply-voice`
- `api/dashboard/site-audit/history`
- `api/dashboard/site-audit`
- `api/edit-preview`
- `api/events`
- `api/gbp/state`
- `api/inbox`
- `api/inquiry-workspace/records/[id]`
- `api/inquiry-workspace/records`
- `api/live-preview`
- `api/media`
- `api/newsletter/subscribers`
- `api/offboarding/status`
- `api/page-config`
- `api/publish`
- `api/queue`
- `api/reviews`
- `api/rewards/members/[email]`
- `api/rewards/members`
- `api/section-analytics`
- `api/site-snapshots`
- `api/social`
- `api/suggestions`
- `api/tenant/domains`
- `api/tenant-export/assets`
- `api/tenant-export/content`
- `api/tenant-settings`
- `api/threads/[threadId]`
- `api/threads`
- `api/weekly-brief`
- `api/workspace/owner-brand`
- `api/inquiry-workspace`

Permission-specific GETs: `tenant/domains` requires `domains:manage`; `suggestions` requires `content:write`; `offboarding/status`, `tenant-export/assets`, and `tenant-export/content` require `billing:manage`. All other listed tenant GET guards accept current tenant membership, as does the common dashboard read guard.

## Deliberate boundaries

- The operator queue's migration-39 audited context must succeed before raw source aggregation in either flag state. It already records that source read attempt; this slice does not duplicate it. The legacy admin overview takes this audited queue branch when enabled and the explicit app admission branch otherwise.
- Held inquiry and notice reads use migration 38's scope-preserving audited wrapper. They are not replaced with an unscoped admission call.
- Inquiry portfolio discovery reads only `getCurrentUserTenants` explicit memberships and rechecks each tenant. It has no global super-admin portfolio expansion; it remains an ordinary membership read.
- Offering/provider-delivery views read customer, provider or assignee scoped data. Internal status changes which acceptance UI is available; it does not grant a separate global support read here. Ordinary provider/report receipt reads use the acting-provider contract and remain unchanged.
- The normal operational inbox is already actor scoped; only its actual internal operator view takes platform admission. Member property discovery remains membership scoped; explicit local dev global discovery retains its existing nonproduction boundary.
- Make-real's admin GET admits the human operator before resolving its existing starting owner or typed service runner. The engine still reads as its legitimate owner/system actor. Direct owner and system engine readers are not forced through human super-admin admission. This admission does not claim typed system read evidence or change owner approval.
- Layouts, breadcrumbs, navigation checks, redirects, inspect-mode cookies, preview placeholder views, OAuth authorizations/callbacks, mutations and future/unreachable SQL APIs are not relabeled as support data reads.

## Proof and limitations

Focused real-helper tests prove trusted actor/static power, current denial, missing storage/invalid identity/unknown powers, admission awaited before the private lead reader, audit failure preventing data fetch, the stale-dashboard-grant race, permission-qualified versus insufficient membership, ordinary unconfirmed membership, demo/dev, member versus global properties, and scoped versus internal inbox. Route tests also preserve owner invitation/booking email typed refusal envelopes and Make-real owner/system engine actors. Domain behavior fixtures stub admission as their external permission boundary; the dedicated tests exercise the real shared helper.

Initial unupdated route fixtures failed because the new admission dependency was absent from their mocks; those failures are preserved in `/tmp/strelva-admin-admission-tests-before-updates.log`. Existing fixtures were updated without removing their original authorization/data assertions. A fresh boundary check also refused the first direct `src/lib/dashboard-auth` import of the new workspace helper; it now uses the existing app-edge registered workspace port. The original failure remains in `/tmp/strelva-admin-admission-final-boundaries.log` and the accepted boundary result is `/tmp/strelva-admin-admission-boundaries-fixed.log`. Early independent review also found and corrected missing-context and insufficient-membership audit skips before this source was accepted.

Owner invitations, booking email, release flags and Make-real retain their existing typed 403/503 catch paths. Other legacy raw routes may surface a generic framework 500 on newly detected admission failure; they fail before private reads. This slice does not establish universal API response consistency, audit transactions over downstream raw reads, typed system read provenance, provider-role policy acceptance, production application or full issue #251 closure. SQL 39 native evidence and the independent app review are required alongside this app commit.

Final local qualification: 237 tests passed across 25 affected/auth/port files, with one pre-existing skipped auth-page test (`/tmp/strelva-admin-admission-final-tests-fixed.log`). Next route type generation and TypeScript passed (`/tmp/strelva-admin-admission-types-fixed.log`), targeted ESLint passed (`/tmp/strelva-admin-admission-lint-fixed.log`), product boundaries passed without changing the baseline, and the full base-to-candidate whitespace check passed. Independent review accepted the real admission/race/permission behavior before the final commit pin; final pinned review remains the publication prerequisite.
