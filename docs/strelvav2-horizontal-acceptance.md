# strelvav2 horizontal acceptance

Updated: 2026-09-18. Jacob requested the full horizontal vision, running locally,
with tested customer journeys and production kept off. This expands the earlier
[first slice](./horizontal-first-scope-2026-09-11.md); it does not discard its
permissions, storage, compatibility, or proof requirements.

## Product promise

A person brings a business goal and the context they have. Strelva helps them
choose a useful starting point, proposes what it will create or change, rehearses
the result, and operates approved work within explicit limits. The same work can
move between self-service, Strelva assistance, and an outside agency. Customers
retain their records, decisions, and history.

The foundation works across industries. Internal R&D develops industry knowledge
and proves offerings against customer outcomes, human effort, and cost. A working
demonstration is not proof of saved money or a supported offering.

## Current acceptance gate

Jacob's September 15 direction authorizes the business and offering topology in
the [product brief](./horizontal-product-brief-2026-09-11.md), including connected
offerings, shared context, operational assignments, agency participation and
usage controls. The September 14 application lifecycle below remains a required
regression. Adding output types does not compensate for an incomplete owner
experience. New topology work is under local implementation and review; earlier
proof does not cover it.

### September 15 implementation and remaining work

| Area | Current local work | Still requires proof or implementation |
| --- | --- | --- |
| Installed offerings | Customer-workspace installation record, native resource references, configuration, retirement and server-authored entrances; default staff-request draft creation and dual-owner website binding pass isolated SQL checks, including rename, revocation and tenant deletion; route-shaped browser setup and lost-response retry pass; direct website assignment now passes an isolated local Auth/Postgres browser journey | Coordinated native configuration and provider acceptance remain open |
| Context | Shared bounded preparation for selected planning sources and granted work context; likely-secret redaction is defense in depth | Live connectors, automatic source selection with explicit use authority, and general business knowledge |
| Assignments | Explicit accepted assignments to run approved finite work using current identity and native permissions; independent review, isolated SQL, command tests and three route-shaped desktop/mobile browser tests pass, including expiry before effect, exact-claim recovery and retry cases | Real local Auth/Postgres browser execution; outside-guest least-privilege native writes, paid delegated work, provider service commitments |
| Allowances | Configured period/unit allowances, payer cap acceptance, operator-awarded contribution credits and trusted execution accounting; isolated SQL, runtime retry tests and independent review pass | Actual subscription synchronization, customer prices and royalties; unconfirmed receipt failures require explicit reconciliation |
| Experience | Offering views, explicit website assignment, allowance summary, assignment links and accurate discovery state in the existing workspace; Home and Settings expose the same assignment command and remain useful without a website; desktop/mobile fixture journeys and the isolated local Auth/Postgres assignment journey cover permission denial, owner/admin success, native destinations and exact retry | Installation-scoped agency permissions, general branded portals and domain lifecycle |
| External AI | Personal integration token tied to its verified issuer, exact work and native read/propose grant; token lifecycle, bounded HTTP requests, bearer-route authentication and aggregate isolated SQL checks pass | Host-specific connectors, independent agent identity and broader execution |

This table is an implementation tracker, not a release claim. No migration has
been applied to a live database, and no customer price or allowance has been
changed.

Most September 15 browser proofs use explicit fictional request adapters; the
database checks use isolated PostgreSQL. On September 18 the website-assignment
journey separately passed against isolated local Supabase Auth and Postgres.
Other connected journeys retain their recorded limits. The operational
assignment Auth spec remains prepared but unexecuted. No live model or provider
call was made.

Shared capability contracts and execution remain in `src/platform/capabilities`.
Concrete product definitions now live in `src/server/capabilities.ts`; the old
platform definitions file was moved, not duplicated. The source boundary check
passes. Customer records were not deleted during this work.

Final September 15 local checks: 2,736 Vitest tests pass, one is skipped;
TypeScript, full ESLint, production build, product boundaries, ontology,
app/marketing version parity and the aggregate isolated workspace SQL checks
pass. Desktop/mobile fixture screenshots were inspected. This is local
implementation evidence, not launch acceptance or production verification.

Use a staff request application to prove: request → creation →
owner use and sharing → employee submissions → proposed change beside the live
app → exact review → publish → recovery → continued use. The owner sees what
exists, what will change and any ongoing behavior attached to the work. Existing
records and the employee's access must survive compatible publication and
recovery. Review must disclose actual changes and validated effects, not infer
that records are safe from a decorative summary.

Current local proof covers owner submissions while a candidate is edited,
recipient use, owner controls for fields and supported views, an exact
field/view/title/behavior review, owner publication, record-preserving rollback
and revoked access. An interrupted proposal save preserves the owner's inputs;
new fields receive new identities and existing field identities stay stable. Publish binds the displayed
candidate and live release versions and rechecks current records. The local
repair-request journey proves these mechanics. The
[request-to-application journey](../tests/application-request-authenticated-local.spec.ts)
also uses New, preserves a failed request for retry, creates the application,
publishes, shares with an employee and edits the application through owner
controls. Its planning response and saved plan are fixtures; subsequent actions
use real local Auth and Postgres. A real model request through the complete
creation path remains unverified. No production or human product acceptance is
claimed.

A real generation check needs the existing primary provider key,
`STRELVA_WORKSPACE_RELEASE=1` and `STRELVA_PLANNING_ENABLED=1`. Use one synthetic
request without source documents or fallback settings. The generation call has
a 20-second deadline, a 1,800-output-token ceiling and zero SDK retries. It now
requires a user-entered maximum and explicit payer acceptance through the shared
work-economics boundary. Unknown provider cost preserves the accepted maximum as
a visible hold and a durable receipt prevents replay. Verified-cost
reconciliation and provider quota enforcement remain unfinished. Provider use
is a separate authorized step and was not exercised here.

Jacob will repolish the interface after the connected behavior is in place.
Use existing components and focus this pass on functional review, publication,
sharing and recovery. Visual redesign is not part of this gate.

### September 18 acceptance increment

The following evidence was rerun locally on September 18:

- Entry routing recognizes ordinary application, scheduling, tracker and
  investigation paraphrases. Continuation actions and supported saved-work rows
  name their actual native destination.
- Home and Settings expose the same managed-website assignment command. The
  connected browser journey passed against an isolated local Supabase stack for
  owner and administrator success, member denial, cross-business denial, native
  settings destinations and exact idempotent retry. The stack was stopped after
  the run.
- The deterministic application review journey connects a prepared request to
  owner use, employee submission, exact candidate review, a second release,
  record-preserving rollback and revoked access. It does not exercise Auth or a
  model provider; those limits remain visible beside the separate connected
  tests.
- Model-backed planning now requires an accepted workspace-scoped economics job.
  The customer enters the maximum, the named payer accepts it, and the server
  records an unknown-cost hold without replaying a durable receipt. Verified
  provider-cost reconciliation is still missing.
- The standing-work scheduler passed authorized admission, duplicate-trigger
  replay, recovery after a lost terminal receipt and zero-cost accounting tests.
  Production scheduling remains off.
- `pnpm check:workspace-upgrade` applied the repository's ordered migrations
  from `20260729180000_org_layer_phase0_accounts.sql` through all current
  workspace/recovery migrations in isolated PostgreSQL. It preserved seeded
  tenant/content identity, enforced permissions and RLS, rejected unverified
  creation, and rejected a duplicate migration atomically.
- REB and marketing now use one Geist family at their foundation owners. Their
  field and tab primitives carry described-by/error relationships and keyboard
  tab behavior. This is named primitive adoption, not whole-product visual
  acceptance.

Focused verification passed: 104 Vitest cases across 16 files, 27 REB preview
browser cases, the application lifecycle fixture, the connected website
assignment case, two marketing design-stack browser cases, TypeScript in both
repositories, product boundaries, ontology, version parity, the aggregate
workspace SQL suite and the full-schema upgrade rehearsal. All evidence is local.
No production deployment, migration, provider call, customer charge or external
write followed from it.

### Visible preview review follow-up

The September 18 unavailable-destination defect is repaired. The joined preview
now opens one usable app after the exact setup retry, then verifies owner records,
scoped access, exact change review, publication of two releases, record-preserving
rollback, revocation and its declared reload reset. Two focused preview cases,
three application-use UI cases and eight application release/use unit cases pass.
The managed account website link also renders and navigates, but its generic
preview destination does not establish matching customer content.

The authenticated application-request and application-use journeys now pass
locally. The earlier mobile assertion measured a hidden inner navigation element;
the outer frame was collapsed and the inner sidebar was not visible. Tests are
being corrected to assert visible drawer behavior rather than a hidden element's
computed desktop width. This was an assertion defect, not evidence that customers
saw an open mobile sidebar.

### Additional connected proof, September 18

Against isolated local Supabase Auth/Postgres, the operational-assignment journey
passed explicit acceptance, scoped native execution, revocation, expiry and retry.
Two standing-responsibility cases passed distinct jobs, duplicate triggers,
lost-terminal-projection recovery with one effect, pause, cancellation, revocation
and retained history. The application-installation case also passed. Two runtime
defects were repaired: valid Postgres timestamp offsets are accepted, and a
committed assigned effect returns its durable result after its active lease clears.

The personal-agent Auth journey passed exact-work read/propose, wrong-business
denial, pending proposals without native mutation, token redaction and revocation.
It does not establish native third-party AI-host connectors.

The internal product-learning Auth/Postgres journey passed the ten-stage record
lifecycle, contrary evidence, independent build acceptance, source change/outage,
stale-revision denial, pause and revoked internal access. Evidence and participants
were synthetic. Collection was explicitly invoked after moving the isolated test
record's due time; no running production scheduler, real cohort or customer value
is claimed. Production access now requires `STRELVA_PRODUCT_LEARNING_RELEASE=1`
in addition to the workspace gate and verified internal access. It stays off by
default; no environment flag was activated in production.

The integrated unit rerun passed 2,820 tests across 382 files, with one intentional
skip. The ordered full-schema upgrade rehearsal also passed, including the new
provider-delivery and public-continuation migrations. Remaining agent changes
still require their focused checks and final integration. Connected inquiry,
public-account and provider-delivery journeys remain under verification; these
aggregate passes do not establish customer acceptance.

Jacob has paused generated visual studies and deferred UI/UX refinement until
functional journeys are in place. Existing components provide the interim
interface; permission clarity, accessible actions and recoverable failures remain
required for functional review.

## Completion contract

The [definition of done](./strelvav2-definition-of-done.md) now specifies the
proposed horizontal screen gate, local product gate, and internal product
learning loop. This ledger remains the current implementation inventory for
the twenty customer-product requirements; its R&D row does not stand in for the
ten new learning requirements.

## What 95% must mean

Earlier estimates of 40%, 55%, 64%, 85%, 95%, and 100% used different scopes or
unverified screen classifications and are not an audited completion measure.
Do not reuse them as measured progress. A directory with fourteen inquiry links
does not establish fourteen accepted horizontal screens.

The 95% target requires all core journeys below to work through authenticated
local adapters, with durable state and failure recovery. The remaining work may
be minor polish or separately authorized rollout. Missing execution, permissions,
data durability, cost enforcement, or whole capability classes cannot be counted
as the last 5%. Count demonstrated behavior, not routes, screens, code volume, or
unit-test totals. Hosted operation and customer value require separate evidence.

## Acceptance ledger

| Area | Required behavior | Current implementation and remaining work |
| --- | --- | --- |
| Surface topology | Public discovery, business work, direct application use, agency work and internal operations have connected entrances; personal AI uses the same exact work | The [shared sidebar](../src/experience/app-frame/StrelvaSidebar.tsx) connects Home, Work, Ongoing, People & access, and Settings, with separate utilities and personal Account. [Agency Home](../src/experience/workspace/AgencyHome.tsx) loads at most eight explicitly delegated clients, filters exact work IDs and opens the selected work; partial and failed loads are visible. [Internal work](../src/app/admin/work/page.tsx) connects existing delivery/support/development/cost controls without giving staff super-admin access. Public pricing/audit entrances are in the sibling marketing repository. Direct application use remains `/apps/[workId]`. [Business navigation](../tests/illustrated-home.spec.ts), agency, internal, and public desktop/mobile fixture checks pass, including mobile drawer recovery. [Focused Settings tests](../src/__tests__/workspace-business-settings.test.ts) distinguish loading, unavailable and confirmed-empty assignments. These are local surfaces, not production rollout or completed future offerings. |
| Starting | Useful examples and permitted context help people begin without knowing product names; a request produces an editable proposal before work starts | Result entry and native examples remain in one frame. Document drafting stays in place; website requests arrive as unsent drafts in the governed composer. App requests enter a reviewed native plan. [Interface](../src/experience/workspace/WorkspaceApp.tsx); desktop/mobile fixture journeys passed; Jacob review pending. |
| Planning | Plans name supported operations, dependencies, missing inputs, limits, costs, and decisions; unsupported requests cannot masquerade as executable work | Reviewed document, tracker and bounded application outputs use the atomic plan-output receipt. Planner choices and native execution share qualified, versioned operation definitions. Model generation now requires a workspace-scoped maximum proposed by the customer and explicitly accepted by its payer; unknown cost remains held and replay is refused. Accepted outputs pin their capability version and older v1 receipts still reopen. [Planner](../src/products/work-plans/server.ts), [registry](../src/platform/capabilities/registry.ts); local tests and authenticated native execution pass. Provider-cost reconciliation, a paid model trial, MCP entrance and common event/API dispatch remain open. |
| Shared work | Requests, plans, results, decisions, receipts and costs reopen at stable links in one workspace | Saved native results, proposals and responsibility history reopen in the same frame. Generated results link back to their exact plan. [Workspace](../src/experience/workspace/result.ts), [execution](../src/platform/work-execution/runtime.ts); local durable document journey passed. |
| Business home | Needs you, delegated jobs, changes, and live capabilities appear in order, with useful empty and error states | Saved results and recorded decisions take precedence. A multi-output plan remains until its saved outputs exist; returning Home reloads native state. [Projection](../src/experience/workspace/workspace-home.ts); browser fixture proof and human review pending. |
| Records | Lists and detail views support editing, history, filtering, adding records and scoped bulk changes | Native trackers support member assignments and exact related records alongside CRUD, grouped changes and Undo. [Coordination](../src/products/tracker/coordination.ts) checks membership, workspace and target revision at commit. Real local Auth/browser proof covers reopen, invalid assignees, stale links and Undo preserving later cell edits. Customer handoff clears source-workspace assignments and links. |
| Changes | Preview before applying; one grouped receipt and Undo; later records survive; conflicting edits are protected | Existing native document/tracker/inquiry revision checks and receipts remain authoritative. Shared execution records accepted or uncertain effects without reopening them to replay. [Runtime](../src/platform/work-execution/runtime.ts); concurrency, pause/cancel and unknown-outcome tests pass. |
| Interfaces | Forms, lists, detail views, documents, and pages use approved components and meaningful editable results | Native applications compose form/list/detail/document parts. Owners issue and revoke access; verified recipients use a focused app while a candidate changes. The [real local Auth journey](../tests/application-use-authenticated-local.spec.ts) passes with submissions, retry, publication, rollback and revocation at desktop and phone sizes. The recipient must already have a verified account. This app path supports reading and submitting records; editing existing app records and richer interactions remain open. No invitation email or public portal deployment was added. |
| Rehearsal | Stored tests rerun after relevant changes; pretend inputs and provider inboxes are visibly separate from real operation | Inquiry rehearsals remain; app schema/runtime checks bind the exact spec version and invalidate on changes. Native command tests cover document/record/schedule/investigation failures. This is not a universal external-provider rehearsal system. |
| Ongoing work | Explicit owner, worker, approver and next step; durable wait, resume, retry, pause and cancellation | Owner-approved responsibilities support ordered dependencies, durable waits, pause/resume/cancel, receipts and reconciliation. Standing saved-source checks create distinct jobs and runs; generic execution and recovery update the same results. The [local Auth/browser journey](../tests/standing-responsibilities-authenticated-local.spec.ts) covers create, approve, Run now, pause and reopen. Focused scheduler tests cover authorized interval admission, duplicate-trigger replay, recovery after a lost terminal receipt and zero-cost accounting. [Native runner](../src/products/operations/server.ts), [due sweep](../src/products/operations/sweep.ts). Current scope is saved-source comparisons, with no provider spending; background dispatch remains off in production. |
| Autonomy | Approved rules govern spending, publishing, messaging, deletion and access; revocation takes effect before a new action | Native approvals remain in their products. The shared runner rechecks membership, versions, cancellation and accepted budgets; accepted/unknown effects do not replay. Source selectors in investigations grant that native job access independently of contextual source grants. No general browser operator is enabled. |
| Collaboration | Customers and agencies share scoped work, request review, contribute safely and revoke access | Scoped expiring read/propose grants, attributable contributions, exact-version review and revocation work through [participation](../src/platform/work-participation/index.ts) and a dedicated guest entry. Real local Auth/browser journey passed. Accepting a contribution records a decision; it does not silently edit the native artifact. |
| Agency operations | Cross-client attention, client-specific access, reusable installations and clear maintenance ownership | Existing inquiry attention/read handoff remains. The [local Auth handoff journey](../tests/tracker-handoff-authenticated-local.spec.ts) now requires an explicit receiving business and tests recipient-bound reopening and revoked access. Scoped contribution review and reusable app installations add local breadth. Broader maintenance agreements, cross-client write delegation and operational service acceptance remain open. |
| Reuse | Install definitions without data/secrets/grants, pin versions, review updates, preserve local changes, rehearse and undo | Existing inquiry pattern updates remain. Application installations carry definitions and a pinned source release. The [real local Auth journey](../tests/application-installation-authenticated-local.spec.ts) passes across two independently owned businesses: private source records stay behind, target records and local title changes survive source updates, the old release serves until publication, and conflicting updates are rejected. [Application service](../src/products/applications/server.ts); no production rollout. |
| Connections | Each connection states permitted reads/writes, consent, freshness, failure and disconnect behavior | Existing tenant provider authority is unchanged. New context grants cover exact authorized SavedWork sources, versions, expiry and revocation. They are not universal OAuth connections or live calendar/browser permissions. External connection breadth remains a provider-integration gate. |
| Context | Sourced facts, corrections, preferences and procedures are inspectable; learned preferences cannot grant authority | [Work context](../src/platform/work-context/index.ts) stores sourced facts, freshness, conflicts, corrections and non-authorizing preferences; scoped source retrieval rechecks the grant in SQL. Current source adapters are workspace records. Automatic learned procedures and general cross-system memory are not claimed. |
| Economics | One explicit payer, estimate acceptance, enforced reservations, attributable usage, unknown costs, and no customer charge for Strelva-caused retries | [Runtime admission](../src/platform/work-economics/runtime.ts) atomically reserves approved funds, limits concurrent work, records measured/unknown usage, preserves unresolved holds and excludes Strelva retries. Native document execution exercised the accepted budget through real local Auth/Postgres. Planning now uses the same admission boundary with an explicit user-entered maximum and payer acceptance; unknown provider cost keeps that maximum held and a durable receipt blocks replay. Verified provider-cost reconciliation, provider quota enforcement and Stripe payment are not implied. |
| R&D | Same-workload candidate comparisons, versioned evidence, support-inclusive effort/cost, explicit qualification decision | [Internal learning](../src/products/product-learning/server.ts) implements the ten-stage evidence/decision lifecycle, scheduled registered-source collection, versioned briefs, independent build review and outcome-driven proposals. Local SQL/command/browser proof passed. Live interviews, actual cohorts, frontier trials and customer outcomes remain evidence gates. |
| Agent participation | Bounded agent identity, delegated scope, budget, task status, cancellation and attributable receipts | A sponsored verified account can receive a bounded agent-labeled read/propose grant, submit attributed work within its allowance, inspect its status and lose access on revocation. [Personal AI access](../src/experience/operations/PersonalAiAccessControl.tsx) exposes exact-work token issuance, one-time copying, expiry and revocation beside the work. The [browser fixture journey](../tests/personal-ai-access-ui.spec.ts) covers issuance, work switching, revocation and failed-list recovery at desktop/mobile sizes. Contributions do not become arbitrary execution permissions. This REST entrance is not a Claude/Codex/MCP connector or an unreviewed third-party runner. |
| Custom applications | Bounded generation, sandbox execution, test evidence, dependency management, deployment ownership and recovery | Outcome-driven plans create private fixed-part app drafts, then native checks gate installation. Versioning, records, reuse, rollback and retirement are implemented locally. A [restricted local container build](../scripts/check-custom-application-build.ts) also produced a working custom application, exercised at desktop and phone sizes. That build is not connected to application releases, customer authorization, budgets or deployment. Public deployment and live maintenance delivery remain unproved. |
| Large organizations | Organization policy, identity lifecycle, access review, audit/export, retention and operational requirements | Existing organization identity and workspace membership remain the authority. New work-level grants/history add local access review evidence. Enterprise SSO/SCIM, organization-wide policies, retention choices, exports and service terms still require the concrete offering/acceptance decisions; no enterprise acceptance is asserted. |

## Verification and authority

Local command, SQL, browser and real Auth/Postgres proofs now cover the bounded
horizontal implementation described above. This is still not unrestricted agent
execution, live provider operation, enterprise acceptance or proof of customer
value. Jacob's human review remains pending. No completion percentage is asserted.

Jacob's latest direction is implementation first, with behavior-first TDD at
the public command boundary and a small set of critical failure checks. Jacob
will perform end-to-end behavior review. Do not expand automated browser suites
or repeat broad checks to substitute for completing the product. Record this
manual review as pending until it happens.

Every completed entry must cite its implementation and successful user journey,
including the relevant denial, stale edit, retry, cancellation, and unavailable
state. Keep local simulation, real local Auth/database adapters, hosted staging,
real provider operation, and customer results distinct.

Use [the release checklist](./horizontal-release-checklist-2026-09-11.md) for
activation. No production deployment, migration, live message, paid provider
experiment, billing change, or third-party grant follows from this ledger.

The current branch remains `strelvav2`. Public branding and frozen compatibility
names remain as documented in [the internal release entry](./strelvav2.md).

## September 17 public-entry motion and continuity

The marketing homepage now follows Jacob's architectural reference and the
[accepted public-discovery direction](../DESIGN.md#public-discovery-into-business-home).
The [marketing implementation record](../../strelva-marketing/docs/design/architectural-landing.md)
tracks the exact local scope. Business entry, interactive sample Home,
opportunity previews, dismissal/undo, and the editable contact handoff remain
separate from live discovery or accepted service.

The continuation adds direct opportunity links and versioned tab-local drafts
that survive refresh and Back/Forward. Reset, malformed stored drafts, blocked
storage, and write failures have visible recovery. Navigation URLs contain
screen identifiers, not business text. Scene motion is pausable, stops when
hidden, and honors reduced motion; controls remain stationary after entry.

Local browser checks cover these paths at desktop and phone widths. The
marketing build, typecheck, and lint pass. This is public-preview evidence only.
Live research, supported provider connections, server-side retention, and exact
signup continuation remain unfinished. No checklist-wide completion or
production release is established.

## September 18 inquiry operation and economics evidence

The inquiry path now has one connected local proof from the portable
[`custom-repo-starter` client](../custom-repo-starter/inquiry-client.ts) through
the versioned public API into the canonical inquiry workspace. With synthetic
accounts and loopback-only Auth, Postgres, Redis and provider fixtures, the
journey publishes a rehearsed form, records a submitted customer request and
its timeline, assigns it to the authenticated staff member, exposes that
assignee on the record, verifies one governed reply through provider read-back,
records the handled outcome, and preserves the request and receipts when the
public form is undone. A second isolated request forces one provider read-back
failure after the fixture accepts its governed message. That accepted message
remains durably `accepted_unverified`, a duplicate approval is non-retryable,
and the fixture records one send for that request. This proves the bounded local
workflow and duplicate barrier; it does not prove a live website, live email
delivery, later clean verification of the faulted message, or use by a real
business.

This generic inquiry workspace is not evidence for the selected Mooney firm
handoff. That customer path is a direct website-to-Outlook delivery with an ADR
Notable firm-required step and only minimum received/attempted/delivered/failed
operational metadata. It must not inherit Strelva inquiry statuses or a retained
case pipeline, and it requires its own synthetic proof against the verified
customer form shape before any production claim.

The work-economics boundary requires a payer-authorized maximum before
admission. Atomic reservations prevent concurrent or duplicate execution from
exceeding that admission or charging twice. Trusted native receipt evidence can
reconcile a known zero-cost operation exactly once; unknown provider cost keeps
the authorized hold instead of becoming a fabricated zero. Accepted actions
with an interrupted settlement retain recoverable receipts and cannot replay
the provider action, while unauthorized and cross-workspace reconciliation are
rejected. Current native operations supply the concrete zero-cost evidence.
Provider model billing still lacks a verified usage adapter and pricing
contract, so paid model cost reconciliation, provider quota enforcement,
refund policy, Stripe charging and payer transitions are not claimed.

## September 18 provider-delivery acceptance and security evidence

A connected local journey now covers the supported internal Strelva delivery
path. It used loopback Supabase Auth and Postgres with three synthetic verified
identities, a synthetic customer workspace, an installed staff-request
application, and an operational assignment bound to that exact application.
The customer selected the approved assignment in the offering, requested
delivery, and saw that the request was pending and had not been accepted. An
active internal Strelva staff identity then accepted it explicitly, performed
the one allowed application rehearsal, and returned the result for customer
review. The customer exercised both changes-requested and confirmed decisions.
The customer request never changed provider state by itself.

The security review tightened the identity and authority boundaries in the
[provider-delivery migration](../supabase/migrations/20260918010000_provider_delivery.sql),
[delivery route](../src/app/api/offerings/provider-delivery/route.ts), and
[operations server](../src/products/operations/server.ts). A caller-provided
`strelva` label is insufficient: acceptance and execution require an active
internal `super_admins` identity plus current membership in the customer
workspace. Revoking that internal status blocks acceptance and the next action.
The installation must remain active, and the assignment must name the exact
native application recorded by that installation. A different application in
the same workspace is rejected. Stale revocation leaves the accepted assignment
unchanged; a current revocation updates the delivery and calls the canonical
assignment revocation in one database transaction. Accepted actor and time stay
in history after revocation.

The authenticated desktop browser covered customer request, provider
acceptance, assigned execution, customer review, stale revocation, successful
revocation, and an unauthorized workspace. The phone-sized authenticated view
at 390 by 844 CSS pixels retained the same lifecycle in one column; measured
document width was 390 pixels, so there was no horizontal overflow. Initial
request failures and delivery-load failures now remain visible without clearing
the selected assignment or making a false acceptance claim in
[the offering UI](../src/experience/workspace/WorkspaceOfferings.tsx).
Focused service, repository, route, and UI tests passed 10 cases. The isolated
workspace SQL and ordered upgrade rehearsals passed, including offset
timestamps, partial-acceptance recovery, exact-resource binding, independently
revoked assignment recovery, and revoked-after-accepted history.

This evidence uses the actual application source, local Auth, and local
Postgres. Fake repositories in focused tests supply deterministic retry and
failure injection; they are not the connected acceptance evidence. The only
supported provider is active internal Strelva staff using an existing zero-cost
native assignment. No external provider organization, provider onboarding,
price, payment, service level, response-time promise, commercial commitment, or
live customer operation was selected or proved. A provider-requested offering
record still does not create any of those commitments. The synthetic users,
workspaces, installation, assignment, and delivery were removed after the local
proof; no production system or external provider was contacted.

## September 18 public-brief account continuation follow-up

The bounded public-brief continuation now has a connected local Auth/Postgres
path for a newly confirmed account. The public intake retains the validated
brief in an encrypted, HTTP-only browser-session cookie and returns an opaque
account destination without putting private request text in the response or
URL. After sign-in, the account page establishes that person's personal
workspace, names the signed-in email, and requires the person to choose a
writable destination. Saving creates one native document with the exact brief,
opens that document, and resolves the same workspace and work IDs after reload
or an interrupted response.

The [connected browser case](../tests/public-continuation-authenticated-local.spec.ts)
uses real local Supabase Auth and Postgres. It checks a fresh personal
destination, exact saved document content, idempotent reload, a second confirmed
account that cannot see the title or request, and revoked membership that blocks
both import replay and saved-destination resolution. The
[isolated SQL case](../tests/public-continuation-schema.sql) also preserves an
importer tombstone when the saved document is deleted, so another account cannot
render or reimport the retained cookie. Direct table and function access remain
service-role only. Independent current-tree verification passed 32 focused
continuation, repository, Auth-callback, and workspace-location tests.

This transfers the bounded brief and local file names, not file contents. The
cookie has browser-session retention and no claimed server expiry. Anonymous
visitors are not identity-bound before sign-in, so the confirmed account and
explicit destination are the first ownership decision. This does not prove
general account export, account closure, business ownership, production
deployment, or recovery after the browser cookie is lost.

## September 18 payer-transition follow-up

The local economics boundary now supports an exact verified person as the
future payer without making that person a workspace member. A current business
owner proposes the account by normalized email. The addressed account sees the
proposal and bounded financial obligations in its personal Account surface,
but receives no business, saved-work, operational-history, or customer-data
access. Acceptance changes the payer only for jobs created after that accepted
boundary. Existing jobs retain their original payer, maximum, reservations,
unknown-cost holds, and unresolved actual cost. Every later job maximum still
requires the exact payer's separate acceptance before a current workspace
member can claim runtime capacity.

The connected
[payer-transition journey](../tests/workspace-payer-transition-authenticated-local.spec.ts)
used real loopback Supabase Auth and Postgres with synthetic identities, the
synthetic `Payer Boundary Workshop` business, one pre-transition unknown-cost
job, and one post-transition job. The owner proposed a verified account that
had no workspace membership. A different account was denied. At a 390 by 844
CSS-pixel viewport, the successor accepted from the personal Account surface
without horizontal overflow or business access. The test allowed the first
acceptance request to commit and return HTTP 200, replaced that response with a
synthetic 503, and then retried. The retry returned the same accepted transition
and timestamp. The successor accepted the new job's bounded five-dollar
maximum through the financial-only route, and the owner then claimed one dollar
of runtime capacity. The original ten-dollar job remained bound to the owner
with its two-dollar hold and unresolved actual cost. Removing a proposing owner
made that owner's later pending proposal stale, and a payer-only account could
not read the underlying operations resource.

The durable rules live in the
[payer-transition migration](../supabase/migrations/20260918140000_workspace_payer_transitions.sql),
[transition service](../src/platform/work-economics/payer-transitions.ts),
[bounded route](../src/app/api/work-economics/payer-transition/route.ts), and
[personal Account surface](../src/experience/workspace/AccountPayerInbox.tsx).
The [isolated SQL fixture](../tests/workspace-payer-transitions-schema.sql)
covers exact identity, current-owner revalidation, ordinary-member privacy,
revoked identity, replay, old-job immutability, payer-only job acceptance, and
member runtime claim. The [workspace SQL gate](../scripts/check-workspace-sql.sh)
also runs both acceptance/create orderings and three-session same-actor
propose/create and accept/create races. Lock ordering is verified as actor row,
workspace advisory lock, then membership, transition, and job rows.

The connected browser case passed 1 test. Six focused payer, route, account,
and economics Vitest files passed 46 tests. TypeScript checking, scoped ESLint,
the full isolated workspace SQL gate, and `git diff --check` passed on the
tested local tree. Synthetic identities and rows were removed after the
connected case. This is local mechanism evidence. It does not establish a
production migration, live business use, payment collection, Stripe behavior,
provider pricing, refunds, notification delivery, or a general subscription
policy. The remaining full-product and production blockers elsewhere in this
ledger are unchanged.

## September 18 bounded workspace portability evidence

A current, verified direct owner can download one versioned JSON snapshot for
the selected workspace. The snapshot contains workspace identity, an explicit
allowlist of supported saved results and native application records, and
economics authorizations, reservations, usage receipts, and execution outcomes.
Unknown actual costs remain unknown rather than becoming zero. Its manifest
lists every included category and names the excluded or unavailable categories.
Credentials, connection data, access tokens, invitation tokens, request inputs,
idempotency keys, command digests, internal product-learning records, and
operator notes are outside this snapshot. Tenant-managed website data is also
outside it because this workspace authority does not establish tenant export
authority.

The [isolated SQL case](../tests/workspace-export-schema.sql) proves the exact
owner check, member and foreign/delegated-owner denial, denial after owner
removal, the explicit data projections, preserved unknown cost, and the two
megabyte output limit. An over-limit snapshot creates no success receipt.
Successful downloads create a metadata-only receipt with the requester,
workspace, schema version, byte size, category counts, and time; exported
content is not copied into the receipt. The
[connected browser case](../tests/workspace-export-authenticated-local.spec.ts)
used real local Supabase Auth and Postgres, parsed the downloaded artifact, and
exercised the owner, member, delegated-owner, and revoked-owner paths. The same
owner surface was rendered and inspected at desktop and 390 by 844 CSS pixels
without horizontal overflow. The isolated full-schema and ordered-upgrade
rehearsals passed with this migration in sequence.

This is a bounded current-workspace portability snapshot. It does not establish
complete account export, account closure or deletion, retention terms, managed
site export, provider handover, or production availability. The two megabyte
limit bounds the final JSON and receipt, but is checked after the database builds
the snapshot. Production-scale query memory and time limits remain unproved.

## September 18: Mooney native inquiry retry preparation

Jacob selected The Mooney Firm's existing website → structured inquiry → Outlook /
ADR Notable workflow as the first production acceptance case. Strelva must not
create a second case or inquiry pipeline. The current live contact form was
inspected read-only; its September 8 field contract includes optional organization,
a bounded administrative note and time-sensitive details. No live inquiry was sent.

Local client changes are isolated in `../../../mooney-native-handoff`, branch
`codex/mooney-native-handoff`, based on the canonical `mooney-firm-site` September 8
release. The canonical checkout's existing September 14 work was preserved.
The [client contract](../../../mooney-native-handoff/docs/product/adr-notable-implementation.md)
owns the native handoff and release conditions; client-specific implementation
remains outside this control plane.

Independent review accepts safe retry for one prepared submission. A signed,
payload-bound ticket expires after 23 hours and binds the delivery configuration.
Retries preserve the exact request and provider idempotency key. Expired tickets,
configuration changes and uncertain outcomes cannot silently create another send.
Only the outstanding receipt is stored in browser session storage; inquiry content
remains in memory during retry. Reload and unavailable storage lead to contact
recovery. Logs contain bounded execution metadata, not inquiry content. Provider
acceptance is labeled separately from destination delivery and firm receipt.

The client standard test command passes 15 handler tests, the normal Turbopack
production build and the runtime contact-route test. Typecheck passes; lint has
no errors and three existing proposal-script warnings. Mocked browser checks at
390 and 1280 pixels exercise acceptance, uncertain retry, reload, storage failure,
and a rejected retry after an uncertain first attempt. Root separately inspected
the 390-pixel reload recovery: no form inputs or send action, direct contact
available, and no horizontal overflow. All provider behavior used local mocks.

This is not a completed production handoff. Cross-browser or cleared-storage
repeat submissions are not deduplicated by this session design. Approved recipient
configuration, durable operational evidence and failure monitoring, abuse controls,
actual Outlook visibility, firm-specific ADR Notable forms and resulting records,
and firm use remain unverified. A generic Strelva inquiry test cannot close these
gates. No production environment change, deployment or vendor write was performed.

## September 18 integrated local verification

After the payer, invitation, public-continuation and workspace-export changes
settled, the combined REB working tree passed `pnpm lint`, `pnpm typecheck` and
`pnpm test`: 388 test files passed, with 2,845 passing tests and one skipped test.
The final production build also passed. It ran with a minimal environment and
no provider credentials, using `.next-integrated` to preserve the running local
review servers. Build-generated TypeScript include changes were restored.
These results apply to the local uncommitted working tree based on `a376d20`,
not to a deployed or immutable release revision.

Product boundaries, ontology checks, app/marketing version parity and all 54
representative custom-repository compatibility checks passed. The full isolated
workspace SQL suite and ordered schema-upgrade rehearsal passed after the export
corrections. Focused authenticated browser evidence and its provider/fixture
limits remain in the dated sections above. Earlier account-test fixture failures
were resolved before this combined run. Relative documentation links and
`git diff --check` passed.

This closes the named local verification pass. It does not close the full
production checklist, human acceptance, remaining product choices, external
provider evidence, or Mooney's live Outlook / ADR Notable acceptance case.
