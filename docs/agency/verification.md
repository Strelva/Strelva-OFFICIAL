# Agency docs: source verification and remaining proof

Checked 2026-10-07 against REB revision `115448a9` on `a1/agency-docs`.
This is source inspection and documentation validation, not an executed
agency/customer journey, deployment, or production result.

Scope: #414 help center and #415 week-one onboarding. Active promise: connect
existing sites, assess them, explain the evidence, prepare improvements, retain
owner control. The complete ordinary-agency path remains blocked by the marked
dependencies. No price, email permission or publication authority is selected here.

## Task evidence

All paths below are relative to this REB checkout. The named symbols locate the
behavior even if lines move. Built means code present in this revision.

| Article / playbook task | Source checked | What the code establishes / what remains |
| --- | --- | --- |
| [Create agency](./help/create-agency.md), day 1 | [WorkspaceAccess](../../src/experience/workspace/WorkspaceAccess.tsx): `AccessPanel`, `CreateAgency`; [workspace route](../../src/app/api/workspace/route.ts): `create_agency` | Personal-workspace access view has name + create form. Signup front door and complete onboarding remain #258. |
| [Add client](./help/add-client.md), day 2 | [business entry migration](../../supabase/migrations/20260921220000_customer_business_entry.sql); [ownership migration](../../supabase/migrations/20261007110000_business_ownership.sql); [conversion migration](../../supabase/migrations/20261008160000_convert_separate_business.sql) | Business entry and operator conversion are not agency URL onboarding. URL/prospect add #259 and agency-issued invitations #262 remain unbuilt. Owner claim must not be confused with assessment handoff. |
| [Team](./help/assign-team.md), day 1 | [AgencyViews](../../src/experience/workspace/agency/AgencyViews.tsx): `AgencyTeamList` | Current Team renders members, roles and client reach. No assignment controls; #261 remains. |
| [Agency verification](./help/verify-agency.md), days 1/3/6 | [provider launch authority](../../supabase/migrations/20261007101000_provider_website_launch_authority.sql); [email sender](../../src/platform/infra/email/send.ts) | No agency-verification record/UI in this tree; search for `agency_verifications`, `agency_effect_allowed`, `agency_brand`, `agency_add_client` finds no implementation. #254/#255 add per-effect verification and provider authority. Criteria #233 remain a decision. |
| [Connect site](./help/connect-site.md), day 3 | [BusinessHome](../../src/experience/workspace/BusinessHome.tsx): `connectSiteHref`; [site page](../../src/app/workspace/site/page.tsx): `ConnectedSitesPage`; [ConnectSiteExperience](../../src/experience/connected-sites/ConnectSiteExperience.tsx): `connect`, `verify` | Exact labels, platform selection, two lines, published-site check and System link. Current management requires direct business owner/admin membership. Ordinary agency access remains #255, not a reason to grant admin. |
| Connection proof and permissions | [connected-sites route](../../src/app/api/workspace/connected-sites/route.ts); [server](../../src/products/connected-sites/server.ts): `normalizeSiteUrl`, `verifySite`, `connectedSitesReleasedFor`; [SQL](../../supabase/migrations/20261008151000_connected_sites.sql): `connected_site_assert_actor`, `confirm_connected_site_verification` | Public HTTPS URL; live-page meta token or own script key; one active verified business per host. Confirmed-email membership and release gates. |
| Script behavior | [connect.js](../../public/connect.js): `fill`, `injectLd`, `onSubmit`, `mount`, `start`, `consent`; [HTTP guard](../../src/products/connected-sites/http.ts): `resolveConnectSite` | Facts fill only marked elements; schema respects detected existing business JSON-LD; supported form capture preserves original submit. Optional capture exclusion, mounted form and consent-controlled startup. Visits/taps use session storage. Write requests need verified site + allowed Origin. No remote hosted-page editor. |
| Connection results | [WebsiteSystemPanels](../../src/experience/systems/WebsiteSystemPanels.tsx): `ConnectedSitePanel`; [workspace inquiries](../../src/experience/places/WorkspaceInquiries.tsx); [inquiries page](../../src/app/workspace/inquiries/page.tsx) | Last-30-days activity and per-site inquiries exist. Real builder install/capture not proven by this review; do not promise every form works. |
| [AI check](./help/check-ai-visibility.md), days 2/6 | [AiVisibilityPage](../../src/products/ai-visibility/AiVisibilityPage.tsx): `handleScan`; [score](../../src/products/ai-visibility/score.ts): `scoreAiVisibility`; [result](../../src/products/ai-visibility/AiVisibilityResultView.tsx) | Public single-business check, retained public share, conditional private save. Website readiness and optional single Gemini probe; partial/unavailable evidence stays visible. No monitoring activation or site mutation. |
| Private assessment | [WorkspaceLayout](../../src/experience/workspace/WorkspaceLayout.tsx): AI Visibility product action; [assessment form](../../src/products/ai-visibility/AiVisibilityAssessmentForm.tsx); [WorkspaceApp](../../src/experience/workspace/WorkspaceApp.tsx): `assess`, `recoverAssessment` | `Check a business` → `Run assessment`; saved on completion; explicit recovery for interrupted save. |
| [Batch check](./help/check-book.md), day 2 | [single-check API](../../src/app/api/ai-visibility/route.ts); issue #260 | Current form/API takes one business. CSV/paste/batch portfolio flow is issue intent, not current UI. GHL access remains #379. |
| [Branded report](./help/branded-report.md), day 4 | [brand constants](../../src/platform/infra/brand.ts); [public result](../../src/products/ai-visibility/AiVisibilityResultView.tsx); [WorkspaceAccess](../../src/experience/workspace/WorkspaceAccess.tsx): `AgencyHandoff`, `AccessHandoffOverlay`; [weekly report](../../src/app/api/cron/weekly-report/route.ts); [monthly report](../../src/app/api/cron/monthly-report/route.ts) | Existing public share and named-recipient private handoff. Handoff needs recipient sign-in and does not send mail. Current branding is Strelva; #264/#276 remain. No branded PDF or general agency report-send control verified. |
| [Push improvements](./help/push-improvements.md), day 5 | [AgencyHome](../../src/experience/workspace/AgencyHome.tsx): Library tab; [AgencyLibraryView](../../src/experience/workspace/agency/AgencyLibraryView.tsx); [agency-home](../../src/experience/workspace/agency-home.ts): `reviewAllReady`; [agency-server](../../src/experience/workspace/agency-server.ts): `reviewAllImprovements` | Existing sources and linked Versions only. Ready rows prepare; conflicts/missing accounts skip; stale revision forces reload. Review all never publishes. |
| Version authority and effects | [Version service](../../src/platform/system-versions/service.ts): `requireManage`, `publishSourceRevision`, `adopt`, `release`; [SystemPage](../../src/experience/systems/SystemPage.tsx): `VersionsPanel` | Direct owner/admin Version actor. Generic panel is lineage, without source-publish/create/conflict controls. Delegated installs/updates #325; provider website publish #263. Generic release records definition/current release, not arbitrary connected-site publication. Parked publication receipts/callers #497 remain. |
| [Email approval](./help/approve-by-email.md), day 6 | [approve route](../../src/app/api/approve/route.ts): `workspaceConfirm`; [Version adapter](../../src/platform/needs-you/sources/version-release.ts): `needsMemberActor`, `resolve`; [Needs-you release](../../src/platform/needs-you/release.ts) | GET shows confirmation; POST confirms exact revision. Changed/handled/expired links do not perform new effects. Version adapter needs a member actor: no-account flow #273 remains. Neutral agency review #249 and brand #264 remain. Client mail may be suppressed. |
| [Export](./help/export-data.md), day 7 | [WorkspaceExport](../../src/experience/workspace/WorkspaceExport.tsx): `download`; [export route](../../src/app/api/workspace-export/route.ts); [repository](../../src/platform/workspace-exports/repository.ts): `exportWorkspace`; [contract](../../src/platform/workspace-exports/contracts.ts) | Owner button calls the bounded schema-2 path, then booking enrichment. The UI's exclusion text is not proof of successful export. Known SQL/parser mismatch below blocks a completion claim. |
| Broader export / agency exit | [v3 route](../../src/app/api/workspace-export/v3/route.ts); [v3 migration](../../supabase/migrations/20261007182000_workspace_export_v3.sql); [WorkspaceExit](../../src/experience/workspace/WorkspaceExit.tsx) | v3 service has separate gate, inline/build/owner delivery, no button wired here. Current exit choices are permanent, retain obligations and do not alter billing/prove outside service stopped. Ordinary provider switch #293 and agency export/Package handoff #295 remain. |

## Known export mismatch

[Website-document migration](../../supabase/migrations/20261001120000_website_documents.sql)
replaces `export_workspace_snapshot` and always adds `websiteDocuments`,
`websiteWork` and `websiteReceipts`. The schema-2 TypeScript contract is strict
and accepts none of those top-level keys. `exportWorkspace` parses that SQL
result before enriching it with public booking grants/receipts. With the full
migration chain, source inspection predicts a rejected export even when those
arrays are empty. No SQL/Auth journey was run to prove the failure here.
The [v3 service](../../src/platform/workspace-exports/v3.ts) also calls the same
snapshot for owner requests. Its owner path is not a workaround; the operator
path skips that base snapshot and is not an ordinary agency instruction.

The SQL snapshot enforces 2,000,000 bytes before the TypeScript booking enrichment;
there is no final total-size check in that repository function. Do not repeat the
UI's 2 MB statement as a proven limit on the final enriched download. Resolve
the contract mismatch and prove both export paths under
[#479](https://github.com/Strelva/Strelva-OFFICIAL/issues/479).

## Verified issue routing

Looked up using `gh issue list -R Strelva/Strelva-OFFICIAL --label agency-1.0
--search "<title words>"`, then read the issue bodies. The numbers in the original
task shorthand do not match current titles:

- Signup: [#258](https://github.com/Strelva/Strelva-OFFICIAL/issues/258).
- URL/prospect client add: [#259](https://github.com/Strelva/Strelva-OFFICIAL/issues/259), not #263 (agency launch/publish).
- Bulk import and batch check: [#260](https://github.com/Strelva/Strelva-OFFICIAL/issues/260).
- Team/client assignment: [#261](https://github.com/Strelva/Strelva-OFFICIAL/issues/261), not #265 (sending domains).
- Agency-issued owner invitation: [#262](https://github.com/Strelva/Strelva-OFFICIAL/issues/262).
- Agency brand: [#264](https://github.com/Strelva/Strelva-OFFICIAL/issues/264), not #268 (Agency Queue).
- Per-effect verification and enforcement: [#254](https://github.com/Strelva/Strelva-OFFICIAL/issues/254), [#255](https://github.com/Strelva/Strelva-OFFICIAL/issues/255).

Additional dependencies are linked in the articles by their verified numbers:
#249 agency Needs-you review, #273 no-account Version email approval, #276 branded
check, #293 provider change/end, #295 agency export/exit, #325 delegated Version
installs/updates, #497 integrated publication receipts. Open decisions #233, #235,
#239 and #241 are not settled by these docs.

## Basis and next proof

Company ADR 0012, **Make agencies Strelva's customer on a neutral platform**
(accepted 2026-10-07), owns the neutral agency path, per-effect verification and
business ownership/exit. Execution context was read from workspace files
`.scratch/agency-1.0/exec/BRIEF.md`, `audit/A-agency-platform.md` and
`audit/F-agency-market.md`. Audits supplied leads; current code settled the steps.
These workspace-only files are not shipped as broken relative links in REB.

This task does not promote code to deployed, operated or commercially proven state.
The task continuation is this ledger and the agency README. Feed the export finding
into the canonical model reconciliation (#485) without changing shared model state
from this documentation worktree.

Validation for this docs-only change: local Markdown link targets checked;
`git diff --cached --check` clean; full staged diff read and an independent
source review completed for Versions, email approval and export/exit.
`pnpm typecheck` could not start: `next: command not found`, with no
`node_modules` in this worktree. No runtime tests, browser journey, SQL/Auth proof
or production action was performed. The docs-only proof rule in `AGENTS.md`
requires working links, a clean diff and diff review; these are the completion checks.

Before closing #414/#415:

1. Integrate each marked dependency and recheck its article against the final UI
   and permissions. Resolve the export mismatch; reconcile source authoring,
   conflict resolution and publication callers before describing their controls.
2. Follow the whole playbook with an ordinary outside-agency account and an
   owner who never signs in. Verify isolation, revoked access and expired/changed
   email decisions. Do not substitute super-admin access.
3. Use an authorized test business to prove real builder installation, form
   capture, batch results, branded report delivery, approval, publication,
   read-back and recovery. Preserve unavailable and failed results.
4. Rehearse export, provider change and permanent exit in isolated workspaces;
   show that business data remains and outgoing agency access ends as intended.
5. Record actual verification results, updated source revision and exact next
   actions. Production rollout and live effects require their separate approvals.
