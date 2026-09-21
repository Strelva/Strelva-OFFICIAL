# Deep modules: proposed release scope

Updated direction: Jacob subsequently placed agencies within Enterprise and
included selected Home Finder access in interface preparation. The
[Enterprise/customer specification](./enterprise-customer-interface-spec.md)
supersedes this document's recommendation to defer Customers. The deletion
reference findings below remain useful; no deletions have been performed.

Status: concrete scope recommendation for Jacob. No product deletion, migration,
or implementation is authorized by this document. The request was to determine
what to build and remove; this document records that determination for review.

The scope assumes the upcoming release remains public diagnostics, private saved
results, bounded agency assessment handoff, and existing managed website service
inside the common interface. Broader agency website management, new paid product
terms, and general-purpose execution would change this scope.

## Decision

Deepen three existing areas: Assessment, Website, and Access. Reuse the common
frame, durable workspace storage, assessment recovery, scanner, and governed
action executor. Do not build five new engines or reorganize the whole company
around new navigation before release.

“Today” means the proposed immediate implementation scope, not a verified estimate
that every change and release gate fits in one calendar day. Functional
consolidation and deployment readiness are separate requirements.

## 1. Assessment: common interface, explicit product methods

User interface: identify the business/site, select the supported assessment,
inspect its evidence, save or export, and reopen. Keep direct diagnostic URLs.

Build by extending the two existing product implementations:

- Common result controls and an explicit typed presentation contract for both
  AI Visibility and Website Audit. Preserve their own findings and visualizations.
- Supported-operation declarations consumed by presentation and enforced by the
  server. Use actual capability checks, not the presence of an AI-specific payload
  as a proxy for handoff support.
- Product-owned assessment recovery. Move the workspace route's low-level read,
  product check, and input reconstruction behind a bounded recovery operation.
- One discoverable assessment entry that explains the two scopes. No combined
  score, compulsory combined scan, or additional provider requests.

Remove after parity: duplicate result-control orchestration and AI-specific
assumptions in common workspace presentation. Do not remove either scorer, the
canonical scanner, public retention stores, result routes, or private-copy checks.

Done: both assessment types remain readable/saveable; sign-in preserves the result;
unavailable evidence stays unavailable; recovery does not repeat a checkpointed
assessment; public access does not become workspace ownership. Existing exports
retain their behavior. The route keeps HTTP/session/CSRF validation.

Evidence: [workspace route](../src/app/api/workspace/route.ts),
[result contracts](../src/experience/workspace/contracts.ts),
[presentation](../src/experience/workspace/result.ts),
[recovery](../src/platform/workspaces/operations.ts).

## 2. Website: consolidate control of the existing object

User interface: open the website, inspect it, choose relevant content/media or a
supported change, see proposed versus published state, inspect history.

Build a bounded composition around existing website controls:

- Keep website identity, selection, contextual controls, and Ask Strelva consistent
  in one active website frame.
- Treat content, media, brand information, collections and history as contextual
  website modes. Preserve specialized editing and bulk controls.
- Reuse the existing governed execution path for consequential changes; direct
  controls and conversation must not implement competing publish logic.
- Consolidate superseded navigation and test the actual client interface.

This release slice is not a new editor, page builder, generic Website service,
or a rewrite of every legacy storage caller. Only move orchestration behind a
module boundary when it eliminates actual duplicate responsibility. Preserve the
current site subnavigation until an alternative proves equivalent usability.

Remove now after dependency cleanup: the superseded dashboard sidebar and mobile
navigation implementations listed below. Remove additional active controls only
after the replacement supports the same authorized operations.

Done: a managed client can select the correct website, use the existing editor and
conversation, inspect/approve a supported change, and reopen history on desktop
and mobile. Fixture placeholder pages prove only the frame; they cannot satisfy
editor and publishing acceptance.

Evidence: [active frame](../src/components/dashboard/ConversationShell.tsx),
[active navigation](../src/components/dashboard/ManagedNavigation.tsx),
[website modes](../src/components/dashboard/SectionSubNav.tsx),
[governed actions](../src/lib/event-actions.ts).

## 3. Access: consistent controls, unchanged authority

User interface: see ownership and current access; hand a supported assessment to
a customer; accept a copy; explicitly allow or revoke agency read access.

Build by extracting the current sharing/handoff presentation from WorkspaceApp
into a cohesive access interface using the existing repository operations. Account
remains personal identity. Website membership keeps its current domain policy.
Common visual controls need not imply one authorization model.

Current release scope is specifically AI Visibility handoff. The API rejects a
handoff when the presented work has no AI payload, and the acceptance view renders
AiVisibilityAssessmentResult directly. Website Audit handoff is not implemented.
Make that limitation explicit in capability checks and UI; adding it is an
additional feature, not cosmetic consolidation.

Do not build an agency application or full Customers module today. Agency users
use the common interface with their own workspace and the existing explicit
handoff/delegation controls. Team assignment, customer portfolios, agency billing,
and delegated website writes need their own scope and policy decisions.

Remove after parity: embedded duplicate access-state handling from the main
workspace component. Preserve customer-owned copies, delegation records,
revocation, recipient validation, invitation recovery, and read-only behavior.

Done: wrong-recipient acceptance fails; repeated acceptance does not duplicate a
copy; accepting without agency access does not grant it; revocation removes only
the grant; website access is never inferred from agency or payment status.

Evidence: [workspace implementation](../src/experience/workspace/WorkspaceApp.tsx),
[workspace repository](../src/platform/workspaces/repository.ts).

## Exact deletion candidates

These are source-reference findings, not completed deletions. Recheck references
at implementation time and remove in the same change as their replacements.

| Target | Finding | Required companion change |
| --- | --- | --- |
| `src/experience/workspace/WorkspaceSidebar.tsx` | No active UI consumer found; superseded by WorkspaceLayout/StrelvaShell. | Update `app-frame-contract.test.ts`, which still reads this file, to verify sign-out in the active shell. |
| `src/components/dashboard/HistorySidebar.tsx` | Old component has no active render consumer found. | Move its `Thread` type to an appropriate shared conversation contract; ManagedNavigation imports it. Preserve active conversation history/deletion behavior. |
| `src/components/dashboard/MobileNav.tsx` | Old phone navigation has no active render consumer found. | Retire `mobile-nav-pick.test.ts` with it; retain browser coverage of active mobile navigation, focus, and approvals. This does not refer to AdminMobileNav. |
| Obsolete `WorkspaceProductDiscovery` JSX in its current file | Used by old WorkspaceSidebar and render tests; active WorkspaceLayout imports its helpers/types. | Preserve or relocate `discoveryProducts`, `sameAppHref`, and types; update tests to cover active discovery and URL safety. Do not delete the entire file blindly. |
| CSS used exclusively by removed components | Candidate only; ownership not yet enumerated. | Check every selector reference. `workspace-layout.module.css` is shared with active views and must not be deleted wholesale. |
| Current docs that name the old sidebar/mobile bar as active | Stale implementation description. | Update active docs; retain dated historical evidence as history. |

Do not delete PropertySwitcher: ConversationShell uses it. Do not delete
ProductShell, WorkspaceRequest, WorkspaceSignIn, preview fixtures, or active
discovery helpers: they have current consumers.

## Defer rather than delete

- Performance consolidation: retain Today, Analytics and Reports; later introduce
  a coherent read model before considering fewer destinations.
- Customer operations: retain Clients, Accounts, Leads, Pay links and portfolio
  queues. They expose changing financial/service facts and are not disposable
  duplicate screens.
- Home/Explore navigation: reviewable design choices, not dead functionality.
  Do not remove active entry points before testing a replacement.
- Home Finder and other candidate products: no new implementation or deletion
  from the ecosystem. Whether to show a not-yet-available entry is a separate
  launch composition decision.

Never delete saved results, tenant records, historical agreements, migrations,
compatibility redirects, API v1 routes, operational stores, or provider gates as
part of interface cleanup. This plan contains no data deletion.

## Immediate execution and release proof

1. Repair package-manager/lockfile reproducibility and dependency security so
   canonical checks can run. Fix generated-output lint exclusions. These are
   previously observed blockers, not freshly rerun findings in this review.
2. Remove verified obsolete navigation with its type/test dependencies. Verify
   sign-out, website switching, mobile navigation and conversation history.
3. Consolidate Assessment and Access contracts/controls, then the bounded Website
   composition. Keep each change independently reviewable and behavior-preserving
   except where the reviewed interface explicitly changes.
4. Run focused success/failure tests, typecheck, workspace SQL, applicable contract
   checks and production build; obtain green hosted CI. Include result entry,
   recovery and shared-frame browser checks explicitly in release acceptance.
5. Review realistic desktop/mobile journeys in T3. Existing managed-client behavior
   needs real authorized acceptance, not just a fictional frame screenshot.
6. Prepare exact migrations/configuration/deployment and obtain the production
   authority required by AGENTS.md. The workspace remains gated until acceptance.

If release pressure forces a cut, defer an unfinished consolidation as a complete
unit. Do not delete its working interface, weaken its tests, or replace it with a
placeholder to claim a smaller product. A broad refactor is not inherently a
release prerequisite; dependency, isolation, persistence and acceptance failures are.
