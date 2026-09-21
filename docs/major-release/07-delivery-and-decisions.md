# 07 — Implementation, deletion, acceptance and decisions

Status: proposed implementation sequence and executable acceptance plan. Existing working code stays usable until its replacement proves parity. Simple functionality with deep modules governs every slice.

## Prioritized implementation

| Slice | Priority and dependency | Concrete deliverable | Exit evidence |
| --- | --- | --- | --- |
| IMP-01 | P0; independent of layout decisions | Repair frozen dependency installation/security and verification scripts; preserve user fixtures; inventory exact baseline | Clean locked install, relevant audit closure, accurate hosted/local gates; `AC-13` |
| IMP-02 | P0; before deleting navigation | Type/helper extraction and verified obsolete component cleanup only | Active shell sign-out/mobile/history/discovery behavior preserved; `AC-12` |
| IMP-03 | P0; existing product scope | Typed Assessment result/actions, bounded recovery operation, cohesive Access controls | Public/private/result/recovery/handoff success and denial paths; `AC-01`–`AC-04` |
| IMP-04 | P0; `DEC-01` reviewed composition | Website contextual controls using current editor and governed operations | Actual editor/approval/history journeys, not fixture-only shell proof; `AC-07/08` |
| IMP-05 | P0 for Enterprise minimum; `DEC-02/03` | Minimal customer/resource assignments and repository/API, safe IDX management-read contract | Scoped read and negative tests in both repositories; `AC-05/06/09/10` |
| IMP-06 | P0; IMP-05 and reviewed interface | Customers/detail and Home Finder overview/readiness/delivery views; direct customer/brokerage and operator counterparts | Useful populated/empty/unavailable/revoked states, T3 role journeys; `AC-05/06/11` |
| IMP-07 | P1; narrow existing-authority work | Performance/service/operator read-model consistency where required by changed views | Period/provenance/unknown-commercial-state parity; `AC-08/10` |
| IMP-08 | P0 before public release; `DEC-10/11` | Marketing claim/entry compatibility, chosen version, release receipt, migration/config/rollback artifacts | Complete `AC-13`–`AC-15`; authorization still required for live actions |

P0 means required for the proposed release composition, not authorization or a time estimate. Independent work can be prepared without unresolved decisions: contracts, fixtures, tests, dependency repairs and reversible composition. If a consequential choice remains unresolved, prepare the exact alternatives and affected implementation; do not quietly choose a broader grant, commercial promise or product direction.

Full team administration, new commercial checkout, arbitrary agency Website writes, Website Audit handoff, installation transfer and self-service activation remain deferred. If release pressure requires a smaller composition, return that scope choice to Jacob. Keep unfinished capability gated with truthful availability; do not replace working behavior with a placeholder or delete its tests to claim completion.

## Simplicity checks

| User object/action | What the person should need to understand | Complexity contained beneath | Reject the change if |
| --- | --- | --- | --- |
| Assess a business/site | Choose scope, supply input, inspect/save result | Product methods, budgets, provenance, retention and recovery | Two scorers become one unexplained score or a generic workflow builder |
| Change a Website | Select the object, specify change, review consequence, inspect result | Schemas, assets, governance, publishing and verification | Precision requires chat, repeated context entry or a second publisher |
| Share an assessment | Copy to addressed customer; optional read grant is explicit | Recipient validation, transactional copy, delegation and revocation | Copy/ownership/access are conflated or users must learn internal records |
| Open a customer | Select customer, then relevant authorized resource | Assignments, resource associations, native permission and safe joins | Internal account/workspace/install IDs become required user choices |
| Inspect Home Finder | Preview, see missing readiness, see delivery state | Provider rules, configuration, signed listings, encrypted jobs and receipts | Management becomes a CRM, setup wizard with unapproved writes, or raw data viewer |
| Understand service | Read actual agreed responsibility and whom to contact | Payer/support/agreement provenance and permissions | Relationship labels are a pricing or access engine |

These are a few user-facing objects/actions, not instructions to create six top-level pages. The internal responsibility map in specification 03 is a refactoring map over existing capability, not eight greenfield engines.

## Exact conditional deletion plan

Source references were rechecked September 8. No source or data deletion is performed by this specification. Before each deletion run a fresh full-repository reference search, inspect imports/string-based tests/docs and review the complete diff.

| ID | Exact target | Why it can be removed | Required companion change and proof |
| --- | --- | --- | --- |
| DEL-01 | `src/experience/workspace/WorkspaceSidebar.tsx`, including `CollapsedWorkspaceSidebar` | No active UI consumer found; active frame is WorkspaceLayout/StrelvaShell | Replace source-file assertions in `src/__tests__/app-frame-contract.test.ts` with active-shell sign-out coverage; prove mobile navigation and sign-out |
| DEL-02 | `src/components/dashboard/HistorySidebar.tsx` | No active render consumer found, but it exports active `Thread` type | Move `Thread` to a neutral conversation contract and update `ManagedNavigation.tsx`; preserve thread selection/history/deletion behavior |
| DEL-03 | `src/components/dashboard/MobileNav.tsx` | Old phone bar has no active render consumer found | Remove its implementation-only `src/__tests__/mobile-nav-pick.test.ts` after active mobile navigation, focus and approvals coverage exists; do not touch `AdminMobileNav.tsx` |
| DEL-04 | Obsolete `WorkspaceProductDiscovery` JSX export in `src/experience/workspace/WorkspaceProductDiscovery.tsx` | Its render consumer is old WorkspaceSidebar plus render tests | Preserve/relocate `discoveryProducts`, `sameAppHref`, `ManagedWorkSummary` and required types; update `WorkspaceLayout.tsx` and `workspace-product-discovery.test.ts`; retain URL allowlist and active discovery coverage |
| DEL-05 | Duplicate result-action and access orchestration in `src/experience/workspace/WorkspaceApp.tsx`, and low-level recovery orchestration in `src/app/api/workspace/route.ts` | Proposed removal after the new bounded contracts own the same behavior | Identify exact functions/branches in the implementation PR; migrate callers and preserve HTTP/auth/input checks; no wholesale component/route deletion |
| DEL-06 | CSS selectors exclusively owned by DEL-01–04 | Conditional after selectors are enumerated and references are absent | Produce exact selector list in the implementation diff; retain shared `workspace-layout.module.css`; rendered regression proof |
| DEL-07 | Current documentation statements presenting retired navigation as active | Prevent dead alternatives guiding future work | Update active maps/links; retain dated historical receipts as history; no removal of inconvenient failure evidence |

Protected targets include PropertySwitcher (active in ConversationShell), ProductShell, WorkspaceRequest, WorkspaceSignIn, active preview fixtures, active discovery helpers, AppFrame/StrelvaShell, AdminMobileNav and managed specialized controls. Do not delete Home/Explore because their composition is unresolved. Do not delete Performance/operator routes as “duplicates.”

Never delete saved results, tenant/customer records, historical agreements, migrations, public retained-result routes, compatibility redirects, API v1, Redis authority, provider gates or legacy Sanity image resolution through this cleanup. This is a code-consolidation plan with no data deletion.

## Traceable acceptance matrix

Each row is a release test scenario, not a statement that it currently passes. Use meaningful tests at the owning boundary, then rendered journey checks. “Existing” names are starting suites; new Enterprise/IDX suites must be added with the implementation. Record scope and evidence per `OPS-13`.

| ID | Requirements | Execute and assert | Evidence location/start |
| --- | --- | --- | --- |
| AC-01 | REL-01/02/09; MOD-01/02/12; UI-01–03 | Run each diagnostic independently; assert only selected method executes, inputs/evidence/version remain distinct, no combined score, partial/unavailable result honest; save/export/reopen controls appropriate | Existing AI Visibility, Website Audit and workspace presentation tests; T3 S-01–06 |
| AC-02 | AUTH-01/02/05; OPS-04/06; UI-02/10 | Confirmed person A opens own workspace; unconfirmed/signed-out B denied; change workspace/customer/tenant IDs and prove no payload/count leakage; switch context mid-fetch and reject stale result | `workspace-routes`, `workspace-account-page`, `account-page`, `workspace-location`; real-session preview acceptance |
| AC-03 | AUTH-05–08; MOD-06; UI-10 | Wrong/expired/revoked handoff denied; accept without grant creates private copy only; separate with-grant acceptance exposes only `work:read`; revoke preserves copy/source and other grants; repeated/concurrent acceptance yields one copy/grant; Audit handoff unavailable | `workspaces-foundation`, workspace route/SQL tests, `workspace-release.spec.ts`; new concurrent database case |
| AC-04 | MOD-03/11; OPS-02; UI-10 | Interrupt before checkpoint, after checkpoint and after commit; recover as same actor; ready/completed never reruns provider; wrong actor denied; active lease pending; attempt/input conflicts bounded; saved-result deletion does not restart | `workspace-operations`, `tests/workspace-recovery-schema.sql`, workspace browser recovery journey |
| AC-05 | REL-03/04; AUTH-03/04/06; MOD-07; UI-03 | Create two fictional agencies, assigned/unassigned people and a customer with two resources; list/search/detail returns only scoped resources; revoke assignment mid-session; unavailable store is not empty; name/domain collision never joins | New customer repository/API/SQL tests; T3 S-08–11 direct and agency personas |
| AC-06 | AUTH-05; HF-03–06; OPS-05 | Substitute another installation/request ID/cursor; authorization fails before protected read; forge/mismatch IDX response scope; reject schema and timeout; inspect browser/network/logs for raw receipt/destination/buyer/credential fields; list pagination stays scoped | New REB adapter and IDX management contract tests; T3 H-01–03 |
| AC-07 | REL-05; MOD-04/05/12; UI-04/05 | Owner opens exact site, edits supported text/image, prepares exact change, approves when permitted and reopens history; deny read-only/other tenant; provider accepts then read-back fails and original approval cannot execute again | Existing event/action/governance/tenant tests plus actual editor journey; `shared-frame.spec.ts` only proves frame subset |
| AC-08 | MOD-08–10; UI-04/07 | Select period and compare overview/analytics; open dated recap after source change and prove unchanged history; unavailable metric remains unavailable; operator customer with missing payer/service join shows unknown | Focused performance/report/account tests; T3 W-07/O-01–07 |
| AC-09 | HF-01/02/07/08/12 | Demo is explicitly synthetic; missing provider/origin/store/worker proof prevents live claim; config `live` without verified operation is insufficient; read access offers no activation/destination write; storage target meets single-writer requirement | IDX startup/installation tests, new readiness tests; operator H/O review |
| AC-10 | AUTH-09; MOD-09; REL-05/07/08; HF-05/11 | Agency resource reader cannot read payer details; no agreement produces no price/managed promise; preserve grandfathered/one-off rules; content purge/receipt expiry remain native and no REB copy extends them | Existing billing/account tests; IDX retention tests; new safe projection tests |
| AC-11 | UI-06/09–12; HF-09/10 | At desktop/mobile use preview search/detail/inquiry and assert no persistence/send; in controlled authorized live-mode fixtures test stale inventory, invalid listing token, missing consent, duplicate submit, provider failure and signed delivery/bounce events | IDX focused tests/e2e/build; T3 buyer embed and management states; real delivery remains separate AC-15 |
| AC-12 | MOD-12; UI-01/04/05; DEL-01–07 | Search confirms obsolete render imports gone; helper/type contracts survive; sign-out/site switch/thread history/mobile approvals work; keyboard focus/return and cold dev rendering pass | `app-frame-contract`, active discovery tests, `shared-frame.spec.ts`, T3 desktop/mobile |
| AC-13 | OPS-07–10/13; REL-06 | Clean frozen install and selected security gate pass; full appropriate checks incl. SQL/contract/changed sibling pass; hosted non-draft run actually contains browser checks; fixture file preserved; no test exclusions conceal changed paths | Hosted CI link, clean-install receipt, exact local command results and migration hashes |
| AC-14 | UI-02/08; OPS-07/12/14; REL-10 | Open old diagnostic/report/auth/managed/custom-host/payment/operator links with query context; inspect marketing claims; use release gate off/on in controlled preview; exercise rollback to compatible artifact without losing new durable records | Route/contract/marketing tests; authorized preview browser matrix and rollback rehearsal |
| AC-15 | REL-06/08; HF-08–12; OPS-10–14 | After exact authorization, verify target schema/service-role paths, confirmed owner/agency/customer sessions, no-access boundaries and existing-client continuity; for any claimed live IDX installation verify provider rights, origin, backups/worker and consented delivered receipt | Production release receipt with timestamp/commit/environment; never substituted by mocks/local build |

All changed views in specification 04 receive applicable loaded, empty, loading, error, permission and narrow-screen checks. Accessibility and simplicity in `UI-09–12` are cross-cutting acceptance, not a final screenshot-only pass. Tests must exercise actual domain behavior; do not add tests that only mirror new component internals.

## Consequential decisions register

Jacob owns these decisions. Recommendations below are explicit proposals; implementation may prepare interfaces and fixtures without converting them into accepted policy.

| ID | Decision and proposed minimum | Consequence if different | Blocks |
| --- | --- | --- | --- |
| DEC-01 | Exact shared composition: retain current frame, introduce Customers only in permitted organization context, keep object controls contextual | Different Home/Explore or Website composition changes navigation and browser tasks; no authority change implied | Final UI implementation/review; contracts can proceed |
| DEC-02 | Customer/resource identity stewardship and source: additive explicit mappings with provenance, initially operator-reviewed | Automatic import/merge or a new organization authority requires broader data migration and reconciliation | Persistent Customers/installation association |
| DEC-03 | Enterprise assignment/admin visibility: explicitly scoped member/resource reads; no automatic all-customer grant | Broad admin access changes confidentiality and revocation policy | New authorization behavior; fixtures can compare |
| DEC-04 | Enterprise qualification, selected product scope, free/paid allowance and price | Requires authoritative agreement/payer/entitlement and commercial UI beyond this baseline | New paid/Enterprise availability claims |
| DEC-05 | Agency/customer payer and support duties; retain actual existing agreements until selected | Direct billing/support or pass-through fees changes operations and customer disclosures | New contracts and service promises |
| DEC-06 | Who can request/approve installation changes or transfers and what customer consent means | Adds mutations, ownership verification, audit, recovery and possible credential/routing change | Installation write/transfer UI, not read minimum |
| DEC-07 | Home Finder pilot relationship to Enterprise and direct brokerage sales | The old agency-first offer cannot silently become direct availability or a new Enterprise price | Commercial/activation claims; safe preview can proceed |
| DEC-08 | Add Website Audit handoff or independent new/regrant controls? Proposed: defer | Requires product payload acceptance/rendering, grants and transaction tests beyond existing AI handoff | Only those new mutations |
| DEC-09 | New account/organization closure, export and retention promise | Requires privacy/deletion procedures covering workspace operations, product records and mandatory receipts | New public promise/self-service controls; existing behavior preserved |
| DEC-10 | Exact public launch narrative/first-use composition and treatment of old Operations pages | Marketing claims/redirect destinations and available-product presentation change | Final public copy and launch composition |
| DEC-11 | Release version, cohort, timing and whether Home Finder ships preview-only | Determines version files, release claims and acceptance subset; does not waive security/isolation gates | Release receipt and deployment request |

Reversible defaults do not require another product decision: reuse current tokens/primitives; keep existing routes; choose typed adapters over raw payloads; use bounded pagination/no-store; preserve ownership and product-specific failure semantics; move dead-code types/helpers before deletion. Do not ask Jacob to choose internal filenames, component extraction order or other routine implementation mechanics.

The specification package is complete when its files, links, requirement IDs, source claims and full diff are reviewed. The release is complete only when its selected implementation scope satisfies the acceptance matrix and the separately authorized production evidence matches what is claimed.
