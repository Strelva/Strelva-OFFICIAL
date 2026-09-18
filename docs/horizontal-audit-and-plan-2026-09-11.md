# Horizontal architecture audit and build order

Reviewed September 14, 2026 against Jacob's supplied topology and build order.
This replaces the September 11 staged proposal. The
[confirmed brief](./horizontal-product-brief-2026-09-11.md) owns product intent;
this file records source findings, required contracts, and implementation order.
The audit used three independent read-only reviews and coordinator inspection of
the current working tree. Existing uncommitted implementation was preserved.
Production and provider operation were not inspected or changed.

## September 18 audit: less work and friction for Strelva

Jacob's criterion is practical: serve more useful customer work with less Strelva
setup, supervision, troubleshooting, coordination and maintenance per result.
Capacity and feature count do not answer that question. Customer and provider
effort must remain visible so moving the work to them is not reported as savings.

**Verdict:** there are credible mechanisms for reducing repeated work, especially
in the native application lifecycle, identity continuity and duplicate prevention.
The operating loop is incomplete. Important paths still require manual setup,
link sharing, cost reconciliation or investigation. No observed customer labor
baseline or reduction was established by this audit; do not assign a scalability
percentage from implementation completion or the passing test count.

Scope: current local source, focused tests and the dated acceptance ledger,
including the separate Mooney client checkout. Two independent read-only reviews
were checked against source by the coordinator. No production behavior, provider
account, customer time study or live delivery was inspected. The older audit below
retains its date and should not override newer implementation evidence.

### Findings and the work they create

**1. Fix onboarding retry before expanding automation. Highest priority, reproduced locally.**
[Provisioning](../src/lib/provisioning.ts) generates a new revalidation secret on
every invocation, but its existing-tenant branch reuses only the tenant ID. If a
prior run created the tenant and failed before creating the project, resumption
can configure the new project with a secret different from the stored tenant.
The resume path also writes all nine default content sections again. It does not
preserve customer edits by seeding only missing sections. Additionally,
[project creation](../src/lib/vercel.ts) does not recover an already-created
project by reading its identity when creation fails.

These paths can turn an ordinary retry into manual credential repair, content
restoration or project investigation. The normal provisioning test checks that
steps continue; it does not establish these recovery invariants. A temporary
synthetic test used the existing mocks, supplied a persisted secret, resumed the
run, and asserted that returned client configuration preserved it. The assertion
failed. No real secret or provider was used; the temporary test was removed.

Done when: failure after each durable step resumes the same tenant/project,
preserves its secret and customer edits, fills only missing setup, and verifies
signed revalidation. Reuse the native tenant mapper/encryption boundary and
provisioning step results. Do not rotate credentials or overwrite content as an
implicit retry.

**2. Strelva cannot yet trust every attention surface to identify required work. High priority.**
[Portfolio actions](../src/app/admin/actions/portfolio-actions.ts) catches tenant
and event read failures as empty arrays. Its [client view](../src/app/admin/actions/PortfolioActionsClient.tsx)
can display “Portfolio is clear” when the resulting item count is zero.
The [existing test](../src/__tests__/portfolio-actions.test.ts) explicitly accepts
a failed tenant read disappearing from the result. This is a source-verified
failure path, not an observed production incident.

Separately, the [workspace sweep](../src/products/operations/sweep.ts) returns
aggregate processed/failed counts. The [internal work page](../src/app/admin/work/page.tsx)
links to other surfaces; it is not a joined list of failed workspace executions
and unknown-cost holds. Operators still need to find the exact work and its safe
next action. Native histories exist; do not build a second execution store.

Done when: unavailable reads say that coverage is incomplete; failed/unknown
work appears once with customer, work, age, effect certainty, responsible person
and permitted recovery. Resolve representative failures without log or database
hunting. Reuse [availability-aware reads](../src/lib/operator-data.ts), existing
Ops presentation, durable execution records and reconciliation commands. Never
turn an accepted or uncertain external effect into a retryable send.

**3. Budgeted model planning creates a reconciliation obligation on the normal path. High priority.**
The [planner](../src/products/work-plans/server.ts) records `amountCents: null`
after a successful budgeted model call. The [planning view](../src/experience/workspace/WorkPlanExperience.tsx)
blocks another preparation while the durable receipt remains unresolved. This
correctly avoids invented charges, but does not remove the work of obtaining and
reconciling trusted cost evidence. Provider-specific automatic reconciliation is
not established by the native zero-cost execution tests.

Done when: supported provider evidence settles the exact execution without
operator transcription; replay is idempotent; a genuine unknown remains held
with an owner and an actionable exception. Reuse the [trusted reconciler](../src/platform/work-economics/runtime.ts).
Measure unresolved-hold age and manual reconciliation frequency. Do not replace
unknown costs with zero to make the journey appear automatic.

**4. A second installation still includes repeated setup and maintenance work. High priority for repeat delivery.**
The [provisioner](../src/lib/provisioning.ts) creates surrounding infrastructure
but explicitly excludes building and deploying the customer site. Its manual
steps include connecting the repository and verifying instrumentation.
The [custom-repository contract](./custom-repo-delivery-model.md) requires starter
adoption and per-repository version records. [Conformance](../scripts/custom-repo-conformance.ts)
proves contract compatibility; it does not distribute updates to every customer.
This leaves repeated source copying, configuration and rollout checks with Strelva.

Google OAuth is already a real owner self-service path. Older service-account
instructions must not be mistaken for its only connection route. Remaining
source-level gaps include GA4 resource selection: provisioning leaves its
property ID empty and the [configuration route](../src/app/api/admin/tenants/[id]/analytics-config/route.ts)
is super-admin-only. Primary/admin domain settings and domain attachment also
remain split; the domain helper targets a global project while custom storefronts
have their own projects. Connection, resource selection, attachment and verified
readiness are different steps.

Done when: a second supported installation reaches a verified preview without
Strelva copying files or transcribing configuration. Customer-owned consent and
DNS decisions remain explicit. A shared starter update prepares reviewable
changes and per-client compatibility evidence while preserving custom code.
Reuse the existing starter, provisioning, OAuth, domain claims and release
manifest; promote shared behavior only under the existing two-client rule.
Measure setup time and ongoing update effort for both installations.

**5. Human participation is authorized, but finding and accepting the work still needs coordination.**
The [assignment surface](../src/experience/operations/ResponsibilityExperience.tsx)
offers an exact link to copy/open. The [internal work page](../src/app/admin/work/page.tsx)
tells staff to use that link. Provider acceptance is available in the appropriate
business installation, but a recipient-wide inbox for these authorized requests
was not established. Someone must share links and follow up outside this flow.

Done when: an assignee sees all and only their pending authorized requests,
accepts the exact scope, and sees expiry or withdrawal without manual link
forwarding. Preserve explicit provider acceptance. Reuse assignment/provider
records rather than introducing another task authority. Record handoffs and
follow-up time, not just clicks saved.

**6. Mooney's safe failure handling still transfers work to people. High priority for the first customer case.**
The [client handler](../../../mooney-native-handoff/worker/inquiries.ts) preserves
one submission identity and logs minimal execution metadata. Its
[recovery view](../../../mooney-native-handoff/app/contact/InquiryForm.tsx) asks the
visitor to retry the exact inquiry, or contact the firm after reload/expiry.
The local handler does not itself establish durable failure monitoring or verified
Outlook/ADR receipt. A safer failure is valuable, but a visitor phone call and
firm inbox search still count as work.

Jacob reports that both ADR forms are configured; their actual links/configuration
have not been inspected. Do not count obtaining those links as building the forms.
The [handoff contract](../../../mooney-native-handoff/docs/product/adr-notable-implementation.md)
keeps matter records with the firm. Strelva should observe delivery execution,
not introduce a case-status pipeline. An existing [Resend webhook](../src/app/api/webhooks/resend/route.ts)
reconciles the generic inquiry product; it is reusable evidence-handling machinery,
not proof that Mooney's separate submission IDs are wired to it.

Done when: approved synthetic failures create minimal, attributable operational
evidence and a specific recovery action without routine mailbox/log checking.
Verify destination receipt separately from provider acceptance. Measure the firm's
and visitor's extra recovery effort as well as Strelva's. Normal legal work the
firm intends to do is not an automation failure.

**7. Changes and exit have a bounded self-service path, then a service boundary.**
Native application installation, record-preserving updates and rollback have
[connected local evidence](./strelvav2-horizontal-acceptance.md). That can remove
routine developer involvement for supported changes. The
[custom build](../src/products/custom-applications/build.ts) is not yet joined to
customer release, deployment and maintenance. A [custom change request](../src/app/api/change-requests/route.ts)
records work to scope and quote; it does not implement that work. Likewise,
[offboarding](../src/app/api/offboarding/request/route.ts) queues a handoff for
Strelva, while the new workspace export covers only its declared subset.

Done when: supported changes complete without Strelva editing/deploying code,
using the existing native release and access contracts. Unsupported work remains
an explicit service commitment. Exit should assemble available exports and
verified transfer checkpoints; unresolved retention, contract and deletion
choices must not be silently automated. Measure developer touches per change
and Strelva effort per handoff.

### Measure removed work using existing records

The [experiment comparison](../src/products/tracker/comparison.ts) already records
setup, review, correction, support and maintenance minutes, provider costs and
evidence type. [Product learning](../src/products/product-learning/service.ts)
imports these as operator reports or simulations rather than inventing observed
customer behavior. Reuse this capability before adding a telemetry product.
The missing evidence is an operated baseline and attributable results, with
Strelva, customer and outside-provider time kept separate.

For one named workflow and observation window, record:

- Strelva setup time separately from ongoing work. Count investigation, failed
  attempts, retries, support and maintenance in total effort, not only successes.
- Verified useful results and the fraction completed without unplanned Strelva
  intervention. Record planned approvals separately; they still cost time.
- Exception frequency, age and time to resolve, including context gathering.
- Customer/provider recovery time, repeated information and direct-contact
  fallbacks so effort shifted to them remains visible.
- The same measures for a second installation and a shared update, alongside
  outcome quality, delivery failures and provider cost. Unknowns stay unknown.

Proposed order: repair provisioning recovery; make incomplete attention visible;
join exact workspace/provider exceptions and cost reconciliation; operate Mooney
with evidence; then prove a second installation and update require less work.
Run effort measurement from the first baseline rather than waiting for all fixes.
Human consent, financial limits and necessary review remain protected.

Audit validation: the existing portfolio-actions and tracker-experiment suites
passed 14 tests. The separate synthetic provisioning invariant probe failed as
expected from the inspected defect. This audit changed documentation only and
did not fix product code or exercise live services.

---

## Target and judgment

Build one shared system that can deliver software, documents, analysis, external
actions, and ongoing services. The nine interface families describe views into
that system, not nine engineering projects or permanent navigation labels.

Describe the product through the people using it. A business owner asks for work,
reviews results, changes what was made and sets the rules for ongoing work. Staff
and customers open the application, document, form or website they need.
Strelva's team investigates failures and maintains what was delivered. These
people use the same underlying business records with different access. Agencies
and large organizations add scoped relationships and oversight; they do not
receive ownership of their clients' businesses.

At the start of this audit, the source had useful shared ownership, persistence,
execution, and cost mechanisms. It did not satisfy the delivered-product architecture. In
particular, application edits interrupt use, recipient app permissions are absent,
and custom-code delivery has no common release contract. Passing current tests
cannot accept these missing behaviors. Extend the existing modules around these
cases before expanding the interface inventory.

## Findings before this implementation

These findings describe the starting point, before the September 14 changes.
They are not a current completion report. “Partial” means some required behavior exists but the target contract is not
complete. Listed tests are evidence of their named cases, not hosted operation.

| Concern | Classification and inspected evidence | Gap against the target |
| --- | --- | --- |
| Spaces and resource identity | Partial. [Workspace types](../src/platform/workspaces/types.ts) distinguish personal, agency and customer spaces. SavedWork has stable identity, owning workspace, product/kind and creator. | Lifecycle/version semantics remain product-specific. Preserve them behind a common resource reference; do not introduce a second ownership store or make all payloads one universal schema. |
| Business ownership through delivery | Partial. Customer-owned copies and per-work agency read delegation exist. [Handoff migration](../supabase/migrations/20260912200000_tracker_handoff_isolation.sql) strips tracker assignments and links. | Acceptance chooses the recipient's earliest customer workspace by creator, without an explicit destination-business decision. A person with multiple businesses needs explicit destination selection and membership checks before acceptance. |
| Resource permissions | Partial. [Workspace repository](../src/platform/workspaces/repository.ts) checks membership; [participation](../src/platform/work-participation/service.ts) adds scoped read/propose grants. | Membership is broad access to workspace work. App use, record access, design, release, support and export are not separate permissions across delivered resources. A contributor view is not a staff application runtime. |
| Shared surfaces | Partial. [WorkspaceApp](../src/experience/workspace/WorkspaceApp.tsx) uses one frame; [Home](../src/experience/workspace/workspace-home.ts) derives attention/results from work records. | [Result presentation](../src/experience/workspace/result.ts) and the app contain product-specific dispatch. No complete shared host with focused recipient rendering is established. Do not create separate state stores for search, attention or notifications. |
| Native apps and data | Partial. [App service](../src/products/applications/server.ts) validates fixed parts, records, revisions, checks, updates and rollback. | revise, rollback and adopt_update replace the current spec and set status to draft. submit then refuses records. There is no independently usable released definition while a candidate is prepared; spec and records share the bounded payload/revision. |
| Reusable installations | Partial. The app service copies definitions without records, pins the source version and preserves local changes or rejects conflicts. | Existing [unit reuse case](../src/__tests__/bounded-applications.test.ts) uses the same workspace. Prove an installation and subsequent update across independently owned businesses, restricted actors and concurrent customer activity. |
| Work and ongoing operation | Partial. [Execution runtime](../src/platform/work-execution/runtime.ts) supports durable attempts, membership rechecks and recovery. [Operations](../src/products/operations/server.ts) invokes native commands. | The horizontal responsibility is a finite plan with embedded steps/attempts. Define the relationship between standing responsibility, triggered accepted work and each run; retain the richer inquiry-specific rules. |
| Costs and authority | Partial. [Runtime economics](../src/platform/work-economics/runtime.ts) reserves accepted funds and records usage. Existing product gates remain authoritative. | An accepted envelope does not prove provider charging, shared business billing or entitlement. Payer, owner, worker and approver must remain distinct through new delivery paths. |
| Capability expansion | Partial. [Product contracts](../src/platform/products/contracts.ts) describe discovery and release posture; they explicitly do not grant authority. Native commands are reused by bounded execution. | Discovery, planner allowlists, execution and rendering require separate wiring. No single versioned executable capability contract covers inputs, outputs, authority, cost, retry, verification and compatibility across entrances. |
| Custom-code delivery | Planned for the horizontal target. Current [app contracts](../src/products/applications/contracts.ts) intentionally reject executable code. The [client starter](../custom-repo-starter/README.md) remains an existing website delivery asset. | Isolated builds, runtime authorization, immutable releases, schema migration, rollback, operational ownership and focused distribution must be joined. Native fixed components are one delivery path, not the permanent capability ceiling. |
| Internal improvement | Partial. [Product learning](../src/products/product-learning/server.ts) records evidence and decisions. | A learning decision is not automatically a compatible executable release. Add qualification and controlled rollout of exact capability/model versions, retaining existing mandates. |

## Rules the whole product must share

Keep a modular backend and product-owned commands. Extract a network service only
when demonstrated runtime, isolation or operational needs require it.

1. **Ownership and resource reference.** Stable resource ID, owning workspace,
   kind, native record reference and lifecycle/version projection. A company
   draft remains company-owned. Creation, payment and management do not transfer
   ownership. Handoff explicitly identifies the receiving business. Personal
   storage is an explicit choice, not the fallback destination for company work.
2. **Authority.** Carry actor, owning scope, target resource, operation, source
   grants, accepted limit and version preconditions through UI, API, model
   context, queue, files and export. Product commands recheck current authority.
   A person authorized in two businesses does not authorize a job to combine
   them. Resource use, record scope, design, release and support need distinct
   grants where those roles differ.
3. **Change and release.** Keep an immutable released definition serving users
   while a candidate is prepared and validated. Data revisions and application
   releases have separate lifecycles. At release, validate against current data,
   not only the rehearsal snapshot. Publication atomically binds the exact
   approved candidate and expected current release; compatibility checks are
   synchronized with record writes so a concurrent submission cannot invalidate
   the checked state before publication. Schema migrations declare compatibility,
   forward recovery and rollback limits; an interface rollback never restores an
   old copy of customer records.
4. **Responsibility, work and run.** Standing policy specifies triggers, owner,
   limits, exclusions and escalation. Each trigger admits distinct finite work
   and its attempts. A business decision, a provider failure and a completed
   obligation remain distinguishable. Existing inquiry policy remains native.
5. **Executable capability.** A versioned server-side definition declares input
   and output schemas, resource types, execution adapter, required authority,
   cost admission, idempotency/reconciliation, completion evidence, supported
   entrances and compatibility. Discovery and planner choices derive from the
   qualified definitions. Presentation metadata never becomes permission.
6. **Delivery and evidence.** Native renderers, custom deployed applications and
   operations in existing systems use the same ownership, authorization and
   execution references. Each product retains its native receipts and recovery.
   Home/search/attention project this evidence instead of deciding completion
   independently. Finished experiences disclose only the recipient's permitted
   material and actions.

A model upgrade can change how an accepted operation is implemented after
qualification. It cannot expand a mandate, change an employee's released app or
select a new data recipient by itself. Pin the relevant capability, model and
release versions in execution evidence. Do not add a second universal approval
engine around existing governed commands.

## Build order and acceptance cases

September 14 sequencing update: complete one staff request
application from request through sharing, exact change review, publication and
recovery before starting the later delivery paths below. Keep the live item at
the center of the owner experience. Proposed changes and history belong with it.
The later steps remain architecture obligations; they are not concurrent UI
projects. Existing correctness fixes may finish while this application is proved.

### 1. Fix ownership selection and application release semantics

Begin with the existing app service, workspace ownership and grants. Define
resource references and candidate/released definition contracts using actual
records. Add focused failure tests before changing these consequential rules.

Required cases:

- One agency operator belongs to businesses A and B. A queued job for A cannot
  read B through a selected source, target, file or export. Revoke access after
  enqueue and before execution; no new action occurs.
- A recipient owns two businesses. Handoff names the destination explicitly;
  membership and destination are rechecked at acceptance, including replay.
- Release v1 remains usable while v2 is edited and rehearsed. Staff add records
  during that interval. Release v2 and roll its interface back; all accepted
  records remain. An incompatible schema change blocks release or requires an
  explicit tested migration. Draft changes never silently stop production use.

### 2. Deliver an application to a non-creator

Build the resource host and focused use surface against that release contract.
A staff member opens a stable link, sees permitted records and completes a task
without a creation conversation or access to design/release controls. Direct
record use needs no model call. Resource-scoped read, use and record-write grants
are enforced on the server, not merely hidden in the UI.

Review desktop/mobile, keyboard, realistic density, selected records, contextual
changes, exact review, revoked access and recoverable failure. This is the next
integrated product proof. A Home redesign does not satisfy it.

### 3. Exercise different delivery paths through the contracts

Use an isolated staff-availability application, a recipient-facing document or
decision, a managed website change and a recurring supplier-document check.
Preserve product-native authority. The recurring check must create separate work
per trigger, wait, resume and report an unresolved business decision.

Add a custom application whose necessary behavior cannot be expressed by the
native catalog. Build and test it in an isolated execution environment, with a
local release record, scoped resource/connection access and a recovery path.
Reject unapproved network or secret access. A repository export alone does not
complete delivery. Client-specific code stays in its own repository. Hosted
release and live providers require their existing separate authorization.

### 4. Prove continued operation and independent installation

Install a permitted reusable definition into another owned business without
copying records, grants or credentials. Preserve local configuration through an
update or present an explicit conflict. Verify concurrent records, stale release
approvals, revocation, cancellation, duplicate events, accepted-but-unverified
provider effects and attributable costs. Operator recovery must use the same
receipts and scoped access as the operating path.

### 5. Prove expansion without rebuilding the product

Introduce a materially new operation or renderer. Register its typed contract,
qualify it on representative permitted cases, then expose it through discovery,
a contextual action and a scheduled or API entrance. All must invoke the same
native operation and enforce the same limits. It must require no new ownership
model, parallel permission engine, competing work history or redesigned Home.
A model-version change must leave existing grants and released interfaces intact.

This sequence keeps all three delivery routes in scope. Finishing the native
application case does not certify custom applications or external operation.
Release acceptance includes these connected journeys alongside the existing
[product and learning requirements](./strelvav2-definition-of-done.md).

## How the agents divide the work

The implementation assignments are:

- **Who owns what:** business selection, resource ownership and access.
- **Changing and releasing an application:** drafts, released versions, records
  and safe updates.
- **Using the finished application:** focused staff access, direct record use,
  sharing and recovery.
- **Running ongoing work:** standing rules, individual jobs, runs and decisions.
- **Adding new capabilities:** one versioned definition for discovery, planning,
  execution, costs and verification.

The coordinator owns integration, custom application delivery coverage, the
complete user journeys and the final evidence record. These assignments are
engineering responsibilities. They do not name product sections. Explain what
the business owner, staff member, customer and Strelva operator can each do. Use
recognizable destinations such as Staff availability, Inquiries and Proposals. Each agent must agree shared contracts before changing them,
preserve the other agents' files, and show focused failure-path proof.
Independent review checks isolation, stale decisions, duplicate effects and
record-preserving updates after integration.

### Coverage of the nine interface families

Every family remains in scope. The assignments above change shared behavior;
they do not each create a new section of Strelva.

| Interface family | Where it belongs | What connects it to this work |
| --- | --- | --- |
| Home and navigation | Workspace | Read the existing resource, decision and completion records. Pins use the names of useful destinations, such as Staff availability or Proposals. |
| New and discovery | Workspace | Offer supported, qualified capabilities and create proposed work with explicit ownership. |
| Creating and changing | Beside the affected resource | Prepare and review a candidate while the released version remains usable. |
| Applications, documents and records | The application, document or record the person opens | Keep native renderers and direct actions; enforce the recipient's resource and record permissions. |
| Ongoing work | Workspace, with internal recovery | Keep the approved responsibility, each admitted job, its runs and unresolved decisions distinct. |
| Sharing and agencies | Resource sharing, recipient entry and authorized business portfolio | Select the receiving business explicitly; install definitions without copying private records, credentials or grants. |
| Managed websites | Website-specific controls and delivered client sites | Reuse existing governance, publishing and client contracts. This program does not move client websites into the control-plane frontend. |
| Connections, account and costs | Contextual controls and administration | Carry the owning business, current provider authority and accepted budget into execution. A capability definition does not grant provider access. |
| Operator console and R&D | Internal console | Inspect the same receipts, costs and release evidence. Qualification expands supported work without silently expanding existing authority. |

The first integrated acceptance case is the staff application and its safe
update. Custom application delivery, different external operations and ongoing
service outcomes retain their own acceptance cases above. Neither this table
nor completing the native application case certifies those other routes.

## Verification and limits

Implementation is in progress locally. The coordinator has run the isolated
PostgreSQL checks for business selection, application releases, recipient access
and standing responsibilities. These checks include cross-business denial,
revocation, stale publication, compatibility with current records and rollback
without deleting records. The current source-update and standing-execution migrations pass the aggregate schema check.

The business handoff passed against local Supabase Auth, including destination
selection, reopening the accepted copy and revoked access. Updates between independently owned businesses also pass against real local
Auth: source records stay private, local edits survive, and conflicts leave the
target intact. The owner-to-recipient app journey also passes against the refreshed local
database, including submissions, publication, rollback and revocation. Desktop
and phone views were inspected. Ongoing work now has local API proof for two
completed jobs, replay and revocation; command tests cover interrupted projection
recovery and the SQL checks cover policy-gated claims. The Auth/browser journey
creates, approves, runs, pauses and reopens one saved-source check. This verifies
that bounded path, not arbitrary external automation or human product acceptance.

A custom application was built in a restricted local container and exercised in
a browser at desktop and phone sizes. This proves isolated construction only.
It is not connected to customer application releases, runtime permissions,
budgets or deployment, and does not establish maintained custom-code delivery.

No production migration, deployment, provider write or live customer operation
was performed. This work does not establish customer demand or delivery economics.

## External reference checks

The supplied architecture is the target, not evidence of installed dependencies.
[PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) documents
owner/BYPASSRLS exceptions; application checks remain essential here.
[Temporal](https://docs.temporal.io/activity-definition) describes activity retry
and idempotency requirements. [json-render](https://json-render.dev/) illustrates
a constrained catalog, and [Vercel Sandbox](https://vercel.com/docs/sandbox)
provides isolated code execution. [MCP authorization](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization)
does not replace native business-operation permissions. These references were
opened during this review. No vendor, dependency or new runtime was selected.
