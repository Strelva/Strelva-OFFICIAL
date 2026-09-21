# Strelva v2 production-completion evaluation

Date: 2026-09-18
Evaluator: independent release review
Scope: the eight proposed PRDs in `../.scratch/strelvav2-experience/issues/`, `docs/strelvav2-definition-of-done.md`, the acceptance ledger, and current source and focused tests
Environment reviewed: local working tree only

## Reading this evaluation

The verdict and per-PRD tables below are the initial September 18 baseline,
retained so findings remain traceable. Later sections record resolved findings
and their limits. For the current work queue, use [todo.md](../../todo.md);
for dated implementation proof, use the [acceptance ledger](../../docs/strelvav2-horizontal-acceptance.md).
Public brief continuity, invitations, the native application journey, internal
provider delivery and nonmember payer acceptance now have additional local
connected proof. That progress does not establish production activation,
Mooney's Outlook/ADR receipt, account closure or actual customer value.

## Baseline verdict

Strelva v2 is not ready for a production or customer-value completion claim. The repository contains substantial local product behavior, including durable native applications, scoped collaboration, zero-cost operational assignments, budget admission, standing work, offering installations, agency projections, personal-agent tokens, and a ten-stage internal learning state machine. The missing work is concentrated at the joins between those capabilities and at several product and commercial boundaries.

The following are release blockers for the proposed full product:

1. A public result, draft, or selected opportunity does not have connected proof that it survives account creation and opens the same business and work. Existing public continuity is browser-local preview behavior; the callback preserves a safe relative destination but does not itself transfer retained work.
2. Invitation and account lifecycle behavior is incomplete against PRD 01: new identity, existing member, wrong account, retry idempotence, revoked access, account closure, and business-owned-history preservation do not have one connected Auth and database acceptance journey.
3. The staff-application offering must pass installation through a rendered owner destination and a rendered staff destination. The ledger records that the prior setup test asserted the URL while the destination rendered “This saved result is unavailable.” Source now creates `/workspace?workspaceId=...&work=<application>` and `/apps/<application>` links, but the repaired join has not been accepted.
4. Economics admits and holds bounded work, but it does not close known provider cost from a trusted receipt, synchronize entitlement or subscription state, or implement the required payer/plan transition, exit, export, retention, and unresolved-hold behavior.
5. Provider-requested delivery lacks the complete request, provider acceptance, assignment, execution, verification, customer review, and next-responsibility chain. A request remains correctly distinct from acceptance, but no connected provider acceptance path completes the PRD.
6. The custom-application container build is an isolated build check. It is not joined to customer authorization, accepted budget, application releases, installation, deployment ownership, rollback, or maintenance.
7. The learning implementation stores and advances the ten stages, but the release contract requires one traceable project through R1–R10, including contrary evidence, a rejected idea, an independently reviewed build, observed outcome, and a changed decision. Live interviews, cohorts, frontier trials, and post-launch customer outcomes remain external evidence, not implemented proof.
8. Full local acceptance still requires Jacob's end-to-end decision and the documented joined browser, Auth/API, SQL, schema-upgrade, and release gates. `STRELVA_WORKSPACE_RELEASE` is opt-in, background work remains gated, and no production deployment or environment activation is authorized.

UI polish can remain last. Usability, permission clarity, focus behavior, mobile reachability, and honest loading, error, denial, and recovery states remain functional acceptance requirements.

## Status language

- **Pass in source** means current implementation and a focused test exercise the consequential boundary. It is still local evidence.
- **Proof gap** means implementation appears present, but the required user journey has not been joined or independently observed.
- **Implementation gap** means the required behavior is absent, disconnected, or deliberately disabled.
- **Decision required** means the PRD leaves a product or commercial rule open. Engineering must not invent it.
- **External evidence required** means local fixtures cannot establish the claim.

## PRD 01: entry and account continuity

| ID | Mandatory observable acceptance | Current evidence | Evaluation and next action |
| --- | --- | --- | --- |
| ENTRY-01 | Public session supports discovery, example mode, preview, context correction, dismiss/Undo, and an honest unsupported-help path. | The sibling marketing work and ledger report desktop/phone preview coverage and tab-local draft continuity. REB owns only the continuation boundary. | **Proof gap.** Recheck the sibling implementation at the committed version. Public preview evidence does not prove account transfer or private membership. |
| ENTRY-02 | “Save my progress” states exactly what is retained; cancel changes nothing; successful sign-in reopens the exact selected result. | `src/app/auth/callback/route.ts` sanitizes `next` and returns to a supported relative workspace/account route. Sign-in and sign-up accept bounded workspace destinations. | **Implementation/proof gap.** No opaque server-side continuation joins marketing state, files, business context, and the authenticated account. Build that handoff, declare expiry and retention, then test one actual signup. |
| ENTRY-03 | A person with several personal, agency, and customer contexts sees the active identity, role, and business and can switch without moving ownership. | Shared workspace summaries, sidebar, agency view, and account view exist; focused workspace/account tests cover projections. | **Proof gap.** Run connected Auth with at least three contexts and assert the active context before and after switching, refresh, and a stale response from the prior context. |
| ENTRY-04 | Back, refresh, saved direct link, and a second tab preserve exact work; inaccessible work never substitutes another result. | `src/lib/workspace-location.ts`, `WorkspaceApp`, and direct `/apps/[workId]` paths encode selected work; fixture browser tests cover portions. | **Proof gap.** Use real Auth/Postgres and two businesses. Remove access in a second session and confirm every open tab reaches a named denial rather than fallback work. |
| ENTRY-05 | Employee, collaborator, agency, and staff entrances expose only their intended scope. | Connected tests exist for application use, contributions, tracker handoff, agency delegation, operational assignment, and staff/operator separation. | **Partial pass.** Preserve those separate cases, then add one entrance matrix that asserts no owner navigation or unrelated records for each direct link. |
| ENTRY-06 | Mobile navigation works by keyboard at 320 px and returns to exact direct work without overflow. | Fixture browser journeys cover mobile drawer behavior and several direct-work surfaces. | **Proof gap.** Repeat on the joined account/application path after ENTRY-02 is implemented. |
| ENTRY-07 | New and existing identities accept the intended invitation once; wrong-account, unconfirmed-email, pending, expired, and revoked states disclose no private work. | Managed-website invite lookup and account routing exist. `src/app/no-access/page.tsx` provides recovery copy. Callback unit tests cover safe nested return handling. | **Implementation/proof gap.** Create an isolated Auth/SQL invitation lifecycle test. Assert membership count, business count, exact identity, retry idempotence, wrong-account recovery, and no private names before verification. |
| ENTRY-08 | Leaving a business or closing a personal account explains and preserves business-owned history according to selected rules. | No complete customer exit flow was found. | **Decision and implementation gap.** Select leave, account closure, ownership transfer, retention, and export rules before building the confirmation and recovery paths. |

Open choices that block the final contract: primary first value, anonymous continuation retention and expiry, and any branded-address destination. These choices do not block safe callback work or invitation correctness.

## PRD 02: business workspace, discovery, and mixed work

| ID | Mandatory observable acceptance | Current evidence | Evaluation and next action |
| --- | --- | --- | --- |
| SPACE-01 | Home shows real attention, active work, results, and honest empty/partial/unavailable states for the selected business. | `workspace-home.ts`, `BusinessHome.tsx`, preview fixtures, and workspace route tests project saved state without invented activity. | **Proof gap.** Render realistic empty, populated, partial, and store-failure states with real Auth/Postgres. Human review remains required. |
| SPACE-02 | Every supported saved work type opens its native surface. | `WorkspaceApp.tsx` dispatches trackers, documents, plans, applications, scheduling, investigations, operations, and learning. | **Release blocker.** The ledger's observed installed-app handoff failure must be rerun through the rendered destination. Check every supported kind for a useful native view, not only a URL. |
| SPACE-03, SPACE-04 | New accepts supported inputs, preserves original wording, exposes editable assumptions, and separates unsupported work. | `WorkspaceStart`, discovery routing, work-plan creation, and tests cover paraphrases and application/document preparation. | **Partial pass.** File upload and existing-work starts, equivalent wording, one necessary clarification, and an honest unsupported/help continuation need a connected browser acceptance case. |
| SPACE-05 | Search is current-business and permission scoped and identifies object kind/state. | No complete shared Search surface and connected isolation journey was established in this review. | **Implementation gap.** Implement or identify the actual customer Search surface, then test unrelated-business exclusion and revoked membership at the API and browser boundary. |
| SPACE-06 | Explore separates availability, installability, allowance, provider request, connection, and reopening. | `WorkspaceOfferings.tsx`, offering definitions, installations, and website bindings expose these distinctions. | **Partial pass.** Only staff application and managed website are installable; inquiry intake is explicitly disabled. Run actual install/reopen/retire with the rendered destination. |
| SPACE-07 | Contextual Help preserves work through preparation, cancellation, failure, and return without implying accepted service. | Copy and request concepts exist, but no complete contextual support lifecycle was found. | **Implementation/proof gap.** Define the supported help action and response expectation, then test preservation and return. |
| SPACE-08 | Mixed Work supports findability, common identity/history, native actions, and missing/retired/inaccessible recovery. | Shared work projections and native reopen mappings exist. | **Partial pass.** Search/filter/order/grouping and the full retired/moved recovery set are not accepted. The grouping choice remains open. |
| SPACE-09, SPACE-10, SPACE-11 | Business settings work without a website; authorized website assignment is explicit and idempotent; website controls remain in the tenant context. | Settings tests and `tests/offering-websites-authenticated-local.spec.ts` cover owner/admin success, member and cross-business denial, native destinations, and retry. | **Pass locally** for the tested assignment boundary. Recheck with the current source in the integrated gate. This does not prove domains, certificates, or live providers. |
| SPACE-11A, SPACE-11B, SPACE-11C | Business facts expose source/freshness/conflict; connection and domain handoffs expose real native states and never imply write authority or liveness. | Work-context records source/freshness/conflict. Managed website links retain the tenant boundary. | **Implementation/proof gap.** No joined customer journey covers corrections, provider grant details, connection test/freshness/reconnect/disconnect, and domain verification/certificate/failure/removal. |
| SPACE-12, SPACE-13 | Denied, loading, partial, unavailable, mobile, and keyboard states preserve scope and recovery. | Several fixtures and focused route tests cover these states. | **Proof gap.** Inspect the actual connected surfaces at 320 px and 390 px after functional joins are complete. |

Open choices: Home ordering, first-value path, mixed-work grouping, and when ambiguity requires a question. These require Jacob's judgment; current behavior should remain honest and reversible.

## PRD 03: creation, use, change, and recovery

| ID | Mandatory observable acceptance | Current evidence | Evaluation and next action |
| --- | --- | --- | --- |
| WORK-01, WORK-02 | A supported goal creates one scoped proposal, result, and idempotent receipt; unsupported work has no effect. | Work-plan and output execution services have structured outputs, capability versions, and idempotent persistence tests. | **Partial pass.** Join goal entry to one durable application and reopen it after response loss. |
| WORK-03 | Website requests remain governed drafts/evidence until the existing website approval path accepts them. | `prepareWebsiteRequestDraft` and existing governance boundaries avoid direct publication. | **Proof gap.** Exercise a request through actual tenant governance and denial. No live write is authorized. |
| WORK-04 | Custom work shows isolated build/test/release boundaries and cannot serve before explicit release. | Fixed-part native applications enforce rehearse/install/publish. `scripts/check-custom-application-build.ts` creates a separate restricted container build. | **Implementation gap.** The container build is disconnected from the customer work item, budget, release, installation, deployment owner, and rollback. Do not count it as delivered custom-app capability. |
| WORK-05, WORK-06, WORK-07, WORK-08 | Verified staff use only a granted release; candidate changes leave live use intact; stale publication fails; rollback preserves later records. | `tests/application-use-authenticated-local.spec.ts` exercises verified staff submission, interruption, owner revision, exact review, publication, rollback, retained records, and revocation. | **Pass locally** for the native application lifecycle. The prerequisite recipient account and lack of invitation email remain explicit limits. |
| WORK-09 | Lost response preserves inputs and resolves retry to the same proposal/output. | Idempotency exists at native stores and execution receipts. | **Proof gap.** Interrupt the browser/API response after persistence for request, output, and install, then assert one identity and useful recovery. |
| WORK-10 | Document and grouped tracker Undo preserve later changes. | Focused document/tracker revision and Undo tests exist, including connected tracker coordination. | **Pass locally** for current native types; rerun narrow cases in the integration gate. |
| WORK-11 | Schedule and investigation retain exact local trigger/source evidence without claiming provider connection. | Native local scheduling and saved-source investigations exist. | **Pass in source; proof limited.** These are local records and saved workspace sources, not live calendars or arbitrary systems. |
| WORK-12 | Accepted provider write plus failed read-back closes replay and creates reconciliation evidence. | The general execution runtime distinguishes accepted/unknown effects, and inquiry SQL prior art covers failed read-back. | **Proof gap by provider.** Execute this at the highest supported provider boundary. A generic runtime test does not prove each provider adapter obeys the rule. |

## PRD 04: ongoing work and economics

| ID | Mandatory observable acceptance | Current evidence | Evaluation and next action |
| --- | --- | --- | --- |
| RUN-01, RUN-02, RUN-03 | Approved standing policy creates finite, idempotent runs; pause, cancel, expiry, revocation, and leave stop future admission/effects. | Standing responsibility and scheduler tests cover approval, Run now, pause, duplicate trigger, lost terminal receipt recovery, and zero-cost accounting. | **Partial pass.** Leave behavior is unimplemented and production background dispatch remains off. |
| RUN-04, RUN-05, RUN-06 | Lost response, accepted-unverified effect, and unknown cost retain a hold and never replay the effect. | `executeBudgetedAction`, reconciliation, execution receipts, and failure tests distinguish no-effect, unknown, verification-failed, and held states. | **Pass in source for native/local execution; proof gap for live provider actions.** Add one joined failure test at the selected provider adapter. |
| RUN-07 | Provider help remains pending until explicit acceptance. | Offering responsibility and copy distinguish provider-requested work from acceptance. | **Implementation gap.** No complete provider acceptance state transition or delivery assignment was found. |
| RUN-08, RUN-09, RUN-10 | Planner requires explicit funding; concurrent jobs cannot exceed the cap; outcomes settle distinctly; Strelva retries do not charge the customer. | Planner budget panel, economics service/runtime, allowances, SQL, and focused tests cover cap admission, holds, concurrency, and retry exclusion. | **Partial pass.** Provider-reported known cost is not reconciled from a trusted receipt. |
| RUN-11 | Failed accounting after native effect preserves the execution receipt and never reruns the native action. | Runtime and reconciliation logic treats the native receipt as authoritative. | **Pass in source; execute the injected settlement-failure case in the focused gate.** |
| RUN-12, RUN-13 | Pay link and allowance do not imply subscription; gldf and rohlax retain grandfathered agreements. | Compatibility rules and billing code keep one-off pay links distinct. | **Pass as a guard, not as a new commercial flow.** Verify neither workspace activation nor allowance projection mutates these agreements. |
| RUN-14, RUN-15, RUN-16 | Responsibility retirement, payer/plan transition, export, and revocation preserve history, records, terms, and unresolved holds. | Revocation and retained work history exist in individual domains. | **Decision and implementation gap.** No joined payer transition or export/exit workflow was found. Select effective-boundary, pending-work, handover, and export rules first. |
| RUN-17, RUN-18 | Limit warnings, extra-cost approval, stop/resume, plan failure/cancel effects, and separate export/handover/retention/deletion choices are visible. | Budget holds and some stop states exist. | **Decision and implementation gap.** Pricing, plan synchronization, retention, deletion entitlement, and exit obligations are open. |

## PRD 05: collaboration, agency, assignments, and personal agents

The PRD does not assign case IDs, so this evaluation defines stable IDs `COLLAB-01` through `COLLAB-08` without changing its requirements.

| ID | Mandatory observable acceptance | Current evidence | Evaluation and next action |
| --- | --- | --- | --- |
| COLLAB-01 | Owner grants exact read/propose scope; recipient contributes against a base revision; owner accepts or rejects; stale and duplicate submissions are safe. | Participation service, connected contribution test, SQL revision checks, and agent proposal idempotency cover these states. | **Pass locally** for bounded contribution. Acceptance records a decision and does not silently edit the native artifact. |
| COLLAB-02 | Expiry and revocation stop later reads/actions while preserving attributable history. | Participation, handoff, application, agent-token, and operational-assignment services recheck access. | **Partial pass.** Run one joined revoked-token read/propose denial through the public token API, not only service tests and management UI. |
| COLLAB-03 | Agency Attention loads only explicitly delegated client work, identifies partial failures, opens exact client context, and survives return navigation. | `agency-home.ts` filters exact delegated IDs, rechecks each workspace, exposes failures, and caps loads at eight. Browser/fixture tests cover agency home. | **Pass for current bounded model.** More than eight clients has only an omitted count; the larger-agency model remains undecided. |
| COLLAB-04 | Agency handoff acceptance, replacement, and revocation preserve customer ownership and prevent later access. | `tests/tracker-handoff-authenticated-local.spec.ts` covers recipient-bound handoff, new customer business, replacement, delegation, and revocation. | **Pass locally** for tracker handoff. Cross-client write delegation and maintenance/service acceptance remain absent. |
| COLLAB-05 | Accepted operational assignment executes exact zero-cost scope as the assignee; outsider, pre-acceptance, expiry, revocation, and owner-only commands are denied. | `tests/operational-assignments-authenticated-local.spec.ts` performs an actual document edit, checks attribution, revokes before the next step, and forces expiry before effect. | **Pass locally.** The deliberate zero-cost/native-only restriction means paid and external-provider assignments are not supported. |
| COLLAB-06 | Personal-agent secret appears once, is bound to exact work/read-propose scope, is attributable, idempotent, and stops after revocation. | Agent-access service hashes tokens and rechecks issuer membership plus the linked native grant; UI fixture covers issuance/switch/revoke/failure. | **Proof gap.** Add real token endpoint read/propose/revoke/read-denied coverage with isolated Auth/Postgres. Current product is a REST token, not a Claude, Codex, or MCP connector. |
| COLLAB-07 | Customer request, owner approval, provider acceptance, actor, payer, and sponsor remain distinct. | Types and individual services preserve these identities. | **Implementation/proof gap.** No complete delivery chain renders all of them together. |
| COLLAB-08 | Mobile, keyboard, long-name, loading, empty, store-failure, and denial states remain usable across changed collaboration surfaces. | Individual fixture tests cover subsets. | **Proof gap.** Run after the functional delivery join; visual polish is not required. |

## PRD 06: offerings, delivery, reuse, learning, and broad product scope

The PRD does not assign case IDs, so this evaluation defines stable IDs `OFFER-01` through `OFFER-10`.

| ID | Mandatory observable acceptance | Current evidence | Evaluation and next action |
| --- | --- | --- | --- |
| OFFER-01 | Owner lists versioned definitions and sees truthful availability, requirements, responsibility, limits, and surfaces. | Offering definitions and `WorkspaceOfferings` expose these fields. | **Pass in source.** The catalog is small: staff requests and managed website are the usable entries; inquiry setup is disabled. |
| OFFER-02 | Allowed installation is idempotent, business scoped, release gated, reopenable, configurable, and retireable with history. | Offering service/store/SQL and tests cover ownership, idempotency, release validation, configuration, activation, and retirement. | **Release blocker at the UI join.** Run installation through the rendered app destination and back to offering state. |
| OFFER-03 | Wrong business, unreleased app, revoked binding, stale revision, conflicting key, and unavailable storage fail safely. | Focused service, route, SQL, and website-binding tests cover these failures. | **Pass locally** for command boundaries; retain a rendered recovery case. |
| OFFER-04 | Provider delivery visibly proceeds through request, scope, acceptance, assignment, execution, verification, customer review, and handoff. | Separate request, assignment, execution, and review primitives exist. | **Implementation gap.** There is no joined provider acceptance and delivery record. This is a mandatory capability, not polish. |
| OFFER-05 | Staff/provider sees only accepted assignment context; ordinary staff cannot reach restricted administration. | Operator and operational-assignment boundaries separate customer work from admin. | **Partial pass.** Add the full delivery-chain entrance after OFFER-04 exists. |
| OFFER-06 | Reuse across two businesses preserves separate data, secrets, grants, configuration, pinned release, local changes, and actionable update conflicts. | `tests/application-installation-authenticated-local.spec.ts` covers two independently owned businesses, pinned source release, retained target records/local title, publish boundary, and conflict. | **Pass locally** for native app reuse. No production rollout or customer maintenance contract. |
| OFFER-07 | Contributor and award records never expose customer data or imply royalty or cash entitlement. | Agency credits explicitly state allowance units are not cash; commercial terms are not inferred. | **Pass as a guard; decision required** before any benefit or royalty flow. |
| OFFER-08 | Learning rejects unauthorized/stale/duplicate/over-budget evidence and preserves evidence kind, contrary evidence, outage, withdrawal, pause, review, alternatives, and decisions. | Product-learning server, SQL, command tests, and browser fixture implement stage transitions and many guards. | **Partial pass.** Execute a single durable R1–R10 trace rather than accepting isolated transition coverage. |
| OFFER-09 | One learning project includes a rejected idea, independent build review, unknown/observed outcome, changed decision, and approved next test on the same held-out workload. | The model supports these objects and states. | **Proof gap and external-evidence gap.** Fixtures prove mechanics. They do not prove interviews, a real frontier trial, a customer cohort, or post-launch value. |
| OFFER-10 | All seven job families reopen in the common workspace across independent businesses and restricted members. | Customer requests, trackers, documents, local scheduling/investigation, fixed-part native apps, and bounded people/agents exist. | **Implementation/proof gap.** Custom applications are disconnected; live scheduling/provider recovery is absent; inquiry/provider delivery is incomplete. Run a declared breadth matrix without treating variants of one form as separate families. |

## PRD 07: visual foundation and functional experience quality

| ID | Mandatory observable acceptance | Current evidence | Evaluation and next action |
| --- | --- | --- | --- |
| DESIGN-A1, DESIGN-A2 | Shared fields expose labels/errors; tabs, dialogs, and drawers support keyboard and preserve focus. | Owned field/tab primitives and component tests record semantic fixes. | **Partial pass.** Verify actual consumers, dialogs, and the mobile drawer in consequential journeys. |
| DESIGN-A3 | Owned controls expose applicable default, focus, disabled, loading, error, and read-only states in both themes. | Component specimens and foundation inventory exist. | **Proof gap.** The inventory says adoption is incomplete. A specimen is not product-wide adoption. |
| DESIGN-A4 | Real desktop/phone journeys work with long content, zoom, and reduced motion. | Multiple browser fixtures cover desktop/mobile and some reduced motion. | **Proof gap.** Run joined critical journeys at 320 px, 390 px, 200% zoom, keyboard only, and reduced motion. |
| DESIGN-A5 | Interrupted input is recovered only within the authorized context and expires safely. | Public tab-local recovery exists; several native forms retain drafts through request failure. | **Decision/implementation gap.** Storage, retention, expiry, cross-user cleanup, and private continuation are not one declared contract. |
| DESIGN-A6 | Duplicate attention is controlled; notification return after revocation is safely denied. | No complete notification event/deduplication/preferences/transport contract was found. | **Decision and implementation gap.** Select notification transport and retention before building. Do not hold functional completion on a channel that remains future scope unless this PRD stays mandatory. |
| DESIGN-A7 | Component change appears in a real consumer and remaining adoption gaps are named. | Component-system and verification records name owners and gaps. | **Partial pass.** Reinspect changed customer consumers after functional work; do not claim whole-product migration. |
| DESIGN-A8 | Generated comparisons are inline and remain labeled exploration until selected. | Jacob paused image generation and deferred aesthetic polish. | **Deferred by explicit direction.** No functional release blocker while no new generated comparison is claimed as implementation. Human material acceptance remains open. |

## PRD 08: acceptance, release, and customer value

| ID | Mandatory observable acceptance | Current evidence | Evaluation and next action |
| --- | --- | --- | --- |
| PROOF-A1 | Visitor result survives supported account flow and later return without crossing businesses. | Safe relative callback exists. | **Release blocker.** ENTRY-02 must pass with actual retained state. |
| PROOF-A2 | Existing website customer retains site/agreement and requests/reviews a governed change. | Managed website routes and governance remain intact. | **Proof gap.** Run the connected journey with synthetic local tenant data, then separately seek production authority if needed. |
| PROOF-A3 | Owner request through employee use, candidate change, review, publication, recovery, and continued use preserves records. | Separate application request and authenticated application lifecycle tests exist. | **Release blocker at the join.** One journey must start at request/install and render the actual app before continuing through the proven lifecycle. |
| PROOF-A4 | Inquiry survives connection failure, repair, and verified completion without duplicate accepted write. | Inquiry provider fixtures and SQL prior art exist. | **Proof gap.** Run the full failure/repair case at the supported local provider boundary. |
| PROOF-A5 | Time-bounded delegation is accepted, used, reclaimed, and denied after expiry/revocation. | Operational assignment and tracker handoff connected tests pass locally. | **Pass locally** for their bounded native scopes. |
| PROOF-A6 | Two reused installations stay isolated through customization and update. | Connected application installation test provides this local evidence. | **Pass locally.** |
| PROOF-A7 | Personal agent proposes within scope; revocation prevents later retrieval and action. | Service logic and UI fixtures exist. | **Proof gap.** Add real token-use revocation test. |
| PROOF-A8 | Help request, provider acceptance, customer review, and cost are distinct events. | Identities and partial events exist. | **Implementation gap.** Requires the provider acceptance/delivery chain. |
| PROOF-A9 | Contributor benefit follows explicit agreed terms; absent terms create no award. | Current implementation avoids implied cash/royalty. | **Decision required** for any actual benefit terms; guard should remain. |
| PROOF-A10 | Payer/plan change and leaving apply selected continuity, export, access, and obligation rules. | Not complete. | **Decision and implementation gap.** Same blocker as RUN-14–18. |
| PROOF-A11 | Full-schema upgrade and scheduler interruption/recovery pass on isolated representative data. | `pnpm check:workspace-upgrade` and scheduler tests have prior local evidence; upgrade script applies ordered migrations in an isolated cluster. | **Reverification required.** Run after source stabilizes. It is safe and local with the documented PostgreSQL PATH. |
| PROOF-A12 | Applicable journeys have desktop/phone, denial, realistic failure, and Jacob acceptance. | Scattered local evidence exists. | **Open.** Complete functional joins first, then run the smallest consequential matrix and record Jacob's decision. |
| PROOF-A13 | Customer trial reports actual use, return, non-return, intervention, and full known/unknown cost against predeclared criteria. | No customer trial evidence. | **External evidence and decision required.** Jacob must select participants, terms, thresholds, and observation window. Do not infer value from fixtures. |

## Unassigned definition-of-done scope

The eight PRDs do not remove the broader definition-of-done requirements.

| Scope | Current reality | Completion requirement |
| --- | --- | --- |
| Ten-part learning loop | Durable state machine, registered-source collection, versioned briefs, reviews, outcomes, and proposals exist locally. | Execute one full trace with contrary evidence, rejection, changed mind, and post-result next test. Label fixture, operator-reported, simulated, and observed evidence correctly. |
| Custom applications | Restricted container build and fixed-part native application are separate mechanisms. | Connect customer intent, authorization, accepted budget, build artifact, checks, immutable release, isolated runtime, install, deployment/maintenance owner, records, upgrade, rollback, and retirement. |
| Agency and access | Exact delegated work, bounded agency queue, participation, handoff, assignments, and agent tokens exist. | Select the model beyond eight clients; prove revoked token use is denied; define cross-client operation and maintenance acceptance only if included in release. |
| Enterprise | Existing organization and membership primitives exist. | Select SSO/SCIM, policy, access review, audit/export, retention, and operating terms before making an enterprise claim. Until then enterprise is not an accepted offering. |
| Notifications | No selected transport/retention contract. | Decide whether notification delivery is mandatory for this release. If yes, implement event identity, deduplication, preferences, authorized return, revocation, and retention. |
| Release infrastructure | Workspace and background capabilities are gated; isolated upgrade rehearsal exists; production checklist inspects real configuration and hosts. | Complete local gates, prepare exact environment/migration/deployment actions, obtain authority, deploy a new production artifact, then run read-only and authorized production verification separately. |

## Executable acceptance plan

Do not run production-readiness or release commands casually. `pnpm check:prod` executes `scripts/production-checklist.ts`, which reads production environment and performs network checks against configured Vercel, Supabase, Stripe, Redis, DNS, and application endpoints. It should run only after pulling the intended production environment into an isolated local env file and confirming the caller has authority for read-only production inspection. It does not deploy or mutate by itself, but its output and network scope are live.

The following local evaluations are safe with isolated data and should become the release evidence set.

### EVAL-ACCOUNT: continuation and invitation lifecycle

Browser plus isolated Supabase Auth/Postgres:

1. Create public state containing a business match, edited context, one chosen result, one file reference, and a help request.
2. Start signup, cancel, and confirm the public state is unchanged.
3. Complete signup and assert the same opaque continuation opens the intended business and work; URLs, referrers, and logs contain no private payload.
4. Refresh, use Back/Forward, open a second tab, and repeat the callback. Assert one retained result and no duplicate business or membership.
5. Repeat with an existing member invitation, wrong signed-in identity, unconfirmed email, expired callback, revoked membership, and unavailable workspace store.
6. Query isolated SQL for exact membership, business, continuation, and work counts. Assert no private business/work fields are disclosed before verification.

Pass only if the same work survives and every failure names the state without substituting another business. Existing callback unit tests are necessary but insufficient.

### EVAL-APPLICATION: request, installation, owner and staff continuity

Browser plus authenticated API and isolated SQL:

1. Start with a plain-language staff-request goal and prepare the deterministic application plan.
2. Persist the app, rehearse, install, publish, install the offering, and follow the rendered business-workspace link.
3. Assert the exact application title, business, release version, owner actions, and nonempty native view. A URL assertion alone fails.
4. Grant a verified staff recipient, open the rendered `/apps/[workId]` surface, submit once through a forced response interruption, and assert one record.
5. Revise a candidate while the old release remains usable; compare exact schema/view/behavior changes; reject stale publication.
6. Publish the candidate, retain prior records, roll back the release pointer, and confirm continued staff use and revoked-access denial.

Pass only if one durable application identity survives the entire journey. Fixture-only plan generation and separate lifecycle mocks must be labeled.

### EVAL-ECONOMICS: admission, effect, settlement, transition, and exit

Authenticated API plus isolated SQL:

1. A named payer accepts a maximum and period allowance. Two concurrent admissions cannot exceed either boundary.
2. Retry the same execution key before and after native effect. Assert one effect and one attributable receipt.
3. Inject a failure after effect and before economics settlement. Reconcile from the native receipt without rerunning the action.
4. Inject accepted provider response plus failed read-back. Assert accepted-unverified state, retained maximum hold, and no automatic retry.
5. Supply one trusted known-cost receipt and prove it settles exactly once; supply unknown cost and prove the hold remains.
6. Change payer/plan at a declared effective boundary. Assert admitted work retains old terms, later work uses new terms, and unknown work is not rebilled.
7. Exercise limit warning, extra-cost approval, hard stop, resume, payment/subscription pending, cancel, export, provider handover, retention, deletion choice, and access removal according to the selected rules.

Steps 5–7 currently require implementation or product decisions. No Stripe mutation is authorized.

### EVAL-ASSIGNMENT: bounded operator effect

The existing `tests/operational-assignments-authenticated-local.spec.ts` is the right high boundary. Rerun it against an isolated stack and retain its actual document before/after evidence. Add pause/cancel between accepted steps and a lost-response recovery assertion. Do not broaden operational assignments to paid or external effects without a new authority and economics design.

### EVAL-DELIVERY: provider acceptance chain

Browser plus authenticated API and isolated SQL/provider fixture:

1. Customer requests help and sees pending, scope, price/cap, and no provider commitment.
2. Wrong or unassigned provider cannot inspect or accept it.
3. Provider accepts with named actor, responsibility, expiry, payer, and exact work scope.
4. Assigned worker performs the allowed work; uncertain result and failed verification remain separate.
5. Customer reviews the result and either accepts it, requests a revision, or ends the responsibility.
6. Revocation and expiry stop the next action. History, cost, records, and unresolved evidence remain.

This evaluation cannot run until the provider acceptance record and joined delivery surface exist.

### EVAL-LEARNING: one R1–R10 trace

Use synthetic but source-labeled data for mechanism proof. Register an allowed source and a source outage; collect a claim with contrary evidence; create several materially different alternatives; reject one attractive idea; select a falsifying test; version the brief; run an independent build review; record an unknown outcome and then a permitted observed outcome; change the decision; approve the next test. Assert every transition, source kind, cost, actor, revision, and access rule after reload. This proves the machine, not demand or retention.

### EVAL-CUSTOM-APP: connect the isolated build

Start from an authorized customer work item and accepted budget. Produce a content-addressed build artifact in the restricted builder, attach check evidence, create an immutable application release, install it into the correct business, issue bounded user access, retain records across an update, roll back, and identify deployment and maintenance owners. Fail closed on unapproved dependency, network access, secret access, budget overrun, incompatible schema, stale candidate, and unavailable deployment. Until this exists, describe the container build as engineering evidence only.

### EVAL-RELEASE: integrated local gate

After builders finish and no other agent is changing source:

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm check:boundaries
pnpm check:ontology
pnpm check:custom-repos
pnpm version:check
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql
PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-upgrade
```

Then run the named browser/Auth evaluations with an isolated Supabase stack, synthetic identities, no production credentials, and unique Playwright output directories. Record command, commit/tree state, environment class, fixture/provider substitutions, observed result, failure, and reviewer decision for each case.

## Production prerequisites and authority

Before production activation, all of the following must be true:

1. All mandatory local cases above are either accepted or explicitly removed from the release by a recorded product decision. Future/undecided scope must remain visible; it cannot be silently scored as complete.
2. Jacob has accepted the connected critical journeys and selected the unresolved account retention, first-value, provider acceptance, payer transition, exit, notification, agency-scale, enterprise, trial, and commercial rules that remain in scope.
3. The clean release revision passes the integrated local gate and isolated schema-upgrade rehearsal. The acceptance ledger links the exact evidence and tested revision.
4. Production environment changes, migrations, deployment, provider calls, external messages, billing changes, DNS changes, and live data repair are prepared as separate exact actions with targets, expected effects, rollback or compensation, and verification.
5. Explicit authority is obtained for each consequential live action. The current request does not authorize any production deployment, environment mutation, database migration, live email, Stripe mutation, provider write, DNS action, or customer trial.
6. A new production deployment follows any authorized Vercel environment change. Production verification then separates read-only health, authenticated customer journeys, provider behavior, and customer outcomes.

Commercial completion remains impossible to establish locally. Customer participants, trial terms, success thresholds, observation window, data use, provider budget, price/allowance policy, and support commitments still require Jacob's decisions. Voluntary return, intervention time, provider cost, failure recovery, and non-return must be observed before claiming customer value or sustainable delivery.

## 2026-09-18 independent economics runtime review

The budget execution and trusted receipt reconciliation path is accepted for its implemented local boundary. It authorizes the exact job target before consulting the evidence resolver and repeats that authorization after the evidence read. The database command then locks the budget and execution rows and rechecks verified identity, current workspace membership, the admitting actor, execution key, maximum, cost kind, and attribution before changing the receipt. A known reconciliation requires an `accepted` or `none` effect, an integer amount, and an evidence reference. A settled known receipt cannot be rewritten.

Concurrency and retries do not create another opportunity to act. One live execution blocks another claim on the budget. A finished execution replays its receipt, while reserved, running, or unknown work stays held for reconciliation. Pre-action authorization or native-policy denial closes the reservation as `effect: none` and zero cost before returning the failure. A failure after the native effect leaves the durable execution authoritative, and allowance settlement reads that receipt without invoking the native action again.

The reviewed responsibility integration reconciles from native records rather than a browser amount or model inference. Document work requires the exact revision increment, recorded owner, content, and receipt time. Investigation work requires the exact request receipt and unchanged source versions for active work. These native operations reconcile as zero-cost `tool` work. Generic provider reconciliation still depends on the caller supplying a read-only server evidence authority. Retrying reconciliation may read that authority again, so it must never perform or retry the provider action. No live provider call, payment, Stripe mutation, production credential, or production data was used in this review.

Focused local verification passed 22 tests across `work-economics-runtime`, allowance repository and service, and extra work-execution cases. During this review, the isolated workspace SQL rehearsal passed the work-economics schema, then the aggregate command failed later in `tests/provider-delivery-schema.sql:121` with `offering_business_membership_required`. A subsequent independent release evaluation reported that the provider-delivery fix, focused checks, typecheck, lint, and full isolated workspace SQL suite pass. That later report removes the integration blocker, while the 22-test and work-economics SQL results remain the evidence directly observed in this review.

## 2026-09-18 provider-delivery follow-up

This follow-up records implementation and connected evidence added after the
independent baseline above. It does not rewrite the earlier findings. `RUN-07`,
`COLLAB-07`, `OFFER-04`, `OFFER-05`, and `PROOF-A8` now have a coherent local
path for the supported internal Strelva case: customer request, explicit staff
acceptance, exact scoped assignment, one allowed application rehearsal,
customer changes-requested or confirmed review, and revocation with preserved
history. The route and offering UI join these states; they are no longer only
separate primitives.

### EVAL-DELIVERY result for the supported internal path

The connected run used real local Supabase Auth and Postgres rather than the
fake repository/provider gateways used by focused tests. The customer selected
the exact approved zero-cost assignment and saw `Requested. Strelva has not
accepted this work.` An active internal staff actor accepted it. The assigned
Operations surface exposed only the bound application command, and the actor
completed that rehearsal. The customer then exercised changes requested and
confirmed review states. A stale customer revoke returned a revision conflict
and left the operational assignment accepted; a fresh revoke atomically revoked
the delivery through the canonical operational-assignment function. An
unrelated workspace was unavailable to the customer.

The trust review found and corrected three consequential faults. A caller could
previously select `assigneeKind: strelva` without proving internal authority;
acceptance and execution now require active `super_admins` status and current
customer-workspace membership. Assignment binding previously proved only the
workspace, resource ID, and kind; acceptance now rechecks the active
installation and its exact native application. Revocation previously risked
changing assignment authority before validating the delivery revision; the
database command now validates first and invokes canonical assignment
revocation in the same transaction. It also recovers when the assignment was
revoked independently. PostgreSQL offset timestamps and an interrupted
assignment-accepted/delivery-pending retry are covered at the repository and SQL
boundaries.

Rendered inspection covered the authenticated desktop journey and a 390 by 844
phone viewport. The phone view stayed in one column, with a measured document
width of 390 CSS pixels and no horizontal overflow. Request and load failures
have explicit UI states. Focused service, repository, route, and UI verification
passed 10 tests; typecheck, scoped lint, the isolated workspace SQL rehearsal,
and the ordered upgrade rehearsal passed on the reviewed source. These are
local results, not production evidence.

The baseline's wider provider and commercial findings remain open. This path
supports active internal Strelva staff, one existing native application command,
and zero-cost operational authority. It does not establish an external provider
organization, onboarding, pricing, payer transition, payment, service level,
response-time promise, notification transport, public deployment, or live
customer outcome. The customer-facing delivery panel identifies the approved
assignment and pending acceptance, but no selected provider price or commercial
cap exists to display. `OFFER-10` remains incomplete because this one joined
application path is not a seven-family breadth matrix. `WORK-12` also remains a
provider-specific proof requirement for any future non-idempotent external
write.

## 2026-09-18 payer-transition follow-up

This append-only follow-up changes the status of the payer-transition part of
EVAL-ECONOMICS step 6 for the tested local boundary. It does not change the
baseline's wider release decision or the still-open exit, subscription,
provider-cost, payment, notification, production, and customer-value work.

The accepted rule is prospective and identity-scoped. A current owner can
propose any exact verified account as the payer for future jobs. The successor
does not need workspace membership and acceptance does not grant access to the
business or its saved work. The accepted transition is the successor's narrow
financial authority. Existing jobs keep the payer and terms stored at creation,
including reservations and unknown-cost holds. New jobs resolve the successor
inside the same transaction that creates their economics record. The exact
payer then accepts each job maximum separately before an authorized workspace
member can claim runtime capacity.

The connected fixture used real local Supabase Auth and Postgres, synthetic
verified owner, successor, and unrelated identities, the synthetic `Payer
Boundary Workshop` workspace, a ten-dollar old job with a two-dollar unresolved
hold, and a five-dollar new job. It proved owner proposal on desktop, wrong-user
denial, successor acceptance in the personal Account surface at 390 by 844 CSS
pixels, no implied workspace access, and no horizontal overflow. The first
acceptance committed successfully and returned HTTP 200, but the browser
received an injected 503. Retrying returned the same accepted row and timestamp.
The new job named the successor; the old job and unresolved hold still named
the owner. The successor accepted only the new financial maximum, received a
bounded response without usage, execution, or actor identifiers, and could not
read the saved operations work. The member runtime actor then claimed one
dollar against that accepted maximum. A proposal whose proposing owner was
subsequently removed became stale instead of changing the payer.

The executable evidence is
[`tests/workspace-payer-transition-authenticated-local.spec.ts`](../../tests/workspace-payer-transition-authenticated-local.spec.ts),
[`tests/workspace-payer-transitions-schema.sql`](../../tests/workspace-payer-transitions-schema.sql),
[`supabase/migrations/20260918140000_workspace_payer_transitions.sql`](../../supabase/migrations/20260918140000_workspace_payer_transitions.sql),
and the concurrency cases in
[`scripts/check-workspace-sql.sh`](../../scripts/check-workspace-sql.sh). The
SQL gate includes both acceptance/create orderings plus deterministic
three-session same-actor propose/create and accept/create races. It verifies the
common lock order and the prospective payer boundary without changing existing
jobs.

The real Auth/Postgres browser case passed 1 test. Six focused payer-transition,
work-economics route, work-plan economics, Account page, and horizontal-route
Vitest files passed 46 tests. The full isolated workspace SQL gate, TypeScript
checking, scoped ESLint, and `git diff --check` passed on the tested local tree.
The browser fixture removed its synthetic identities and rows. No production
database, Stripe object, provider account, live customer record, or external
message was read or changed. This closes only the local prospective
payer-transition mechanism in EVAL-ECONOMICS step 6; step 7 and the full-product
release blockers remain open.
