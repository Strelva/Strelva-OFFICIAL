# Strelva product experience: state and next work

## September 20 website release focus

Jacob selected websites as the main current offer, with self-service as the
primary experience and agencies participating around client-owned work. The
[product brief](./docs/horizontal-product-brief-2026-09-11.md#september-20-website-release-focus)
owns the direction; the [website release review](./docs/strelvav2-horizontal-acceptance.md#website-release-review)
owns assignments, findings and proof. Read those before the historical backlog
below. Existing horizontal work and customer compatibility obligations remain.

The parent has verified a candidate baseline through unit coverage, TypeScript,
build, schema upgrade, browser gates and pinned client checks. Website-specific
review and repairs are in progress. New-customer self-service creation is a
confirmed product gap: current onboarding requests an operator build, and
provisioning assumes a separately built client repository. Do not call that
path complete from managed-client or workspace tests.

The immediate work is to finish the five website review lanes, resolve supported
creation and connection scope explicitly, verify the resulting candidate and
prepare updated PRs. Existing managed website prices remain unchanged. New
self-service terms and all production actions remain separate decisions.

## September 19 completion plan

Reviewed against `484dd2c1`, the current acceptance ledger, the eight experience
PRDs and the implementation owners linked below. The earlier 20 follow-up tasks
cover offering modules; they are not the complete release backlog. This section
is the current completion sequence. Older sections retain their dated evidence.
The [acceptance ledger](./docs/strelvav2-horizontal-acceptance.md) remains the
owner of proof, and the [PRDs](../.scratch/strelvav2-experience/spec.md) remain
the detailed requirements. No new commercial offer or production authority is
created by this plan.

### Already done, so do not rebuild

- The first remediation batch is committed and pushed in
  [draft PR #191](https://github.com/Strelva/Strelva-OFFICIAL/pull/191).
  Hosted build and secrets checks pass for `484dd2c1`. Draft CI does not run
  all browser acceptance gates.
- Local proof covers workspace continuity, offering conflict recovery, unified
  discovery, saved service requests and provider review, app choice fields and
  native reservation rescheduling.
- Native app publication, recipient submission, versioned updates, rollback,
  reuse and revocation already exist. Remaining app work extends that lifecycle.
- The inquiry engine already has a connected local submission, staff assignment,
  governed reply, receipt and failure journey. INT-02 must close the remaining
  offering-entry, follow-up and recovery evidence, not recreate the engine.
- Provisioning retries already preserve persisted secrets and customized sections;
  inquiry portfolio failures already expose unavailable tenants. Focused tests
  cover both. Their older unchecked repair entries below are historical.
- Payer transition, budget admission, recurring saved-source jobs and a bounded
  workspace export have local proof. Payment collection, arbitrary integrations,
  complete account closure and live operation do not follow from that proof.

### Work required to complete the customer product

“Build” means a missing behavior. “Connect/prove” means useful implementation
already exists but the joined journey or operating evidence is incomplete.
Existing task IDs refer to the [module queue](./docs/strelvav2-horizontal-acceptance.md#subsequent-task-queue).

| Work | What must be finished | Completion evidence and owner |
| --- | --- | --- |
| Public entry and first use | Connect/prove the chosen public result through account creation, business selection, invitations and return. Review unfamiliar-user requests and unsupported requests; select the public first-value promise without changing the accepted page composition by assumption. | A new customer and a new recipient reach the intended result, recover a failed callback, and return without operator repair. Public signup already has a workspace-release-gated source path. P4; navigation and marketing owners. |
| Apps | Build explicit recipient record editing and date-only fields; prove the same published app reopens through Home, change and rollback. | Own/shared record edit policy is explicit; stale edits fail without losing input; dates do not shift timezone; records survive release changes. APP-02/03/04; app owner. |
| Intake | Build the missing offering-installation connection to the existing inquiry lifecycle, prove due follow-up and recovery, then prove actual delivery and response. | Setup, receive, assign, reviewed reply, follow-up and recovery use the same request and receipt. A failed read-back never repeats an accepted send. INT-01/02/03; inquiry owner. |
| Bookings | Connect the native schedule to one selected real calendar and define timezone, availability, confirmation, change, cancellation and reminder behavior. | A booking and its provider record agree after success, conflict, timeout and retry. BOOK-03; scheduling owner. Local rescheduling is already complete. |
| Onboarding | Build requirements with missing/supplied/correction/accepted states; attach exact document versions; support private uploads and reviewed extraction. | Customer, employee or supplier onboarding can finish with a visible outstanding-items list. Replacing a document does not silently preserve an obsolete approval. ONB-01 through ONB-04; onboarding owner, reusing records/documents. |
| Checks | Persist an unavailable run outcome when a source cannot be read or changes during a check; prove recovery and add one defined external source adapter. | Changed, unchanged, stale and unavailable sources remain distinguishable; scheduled work reopens the exact evidence and can pause/recover. CHECK-01/02; investigations owner. Existing saved-source scheduling is not a new build. |
| Agency or Strelva delivery | Join request review, agreed scope, provider commitment, named operator, necessary permissions, cost acceptance, delivery, customer review and provider exit. | “Accepted for review” cannot become “work started” by implication. A complete self-service-to-provider-to-customer journey preserves the same business, request and resource. R6 plus PRDs 05/06; service-request/delivery owners. Existing delivery/assignment services must be reused. The request-link API has no customer UI and needs explicit request-to-delivery scope matching. |
| Agency execution | Extend review-only agency participation into an explicit assignment and delivery contract. Current provider delivery accepts only Strelva, and current assignments reject nonzero costs. | A customer can authorize a named agency for exact work, review the result, revoke access and change providers while retaining records. This is new behavior, not an already-working paid agency handoff. PRDs 05/06; collaboration/delivery owners, after scope and commercial decisions. |
| Websites | Prove request-to-governed-change continuity and dated site-check history. Prove interrupted setup preserves existing configuration; verify a representative client install and domain handoff. | One site retains identity, edits and credentials across retry, change, review and recovery. WEB-01/02/03 plus provisioning-resume verification; website and client-repository owners. |
| Custom-built applications | Connect the existing isolated build adapter to an authorized, budgeted resource with review, tests, release, maintenance ownership and recovery. | One custom result can be built, reviewed, released to its intended user, changed and recovered without a manual untracked handoff. The current container build produces an artifact; it is not a customer deployment lifecycle. PRD 03 and the custom-app acceptance row; app/build owners. Commercial Custom Software packaging remains a separate decision. |
| Costs and payment | Connect trusted provider usage to settlement, present payer/allowance facts clearly, implement selected subscription entitlements and verify historical agreements. | Known cost closes the exact hold once; unknown cost stays unresolved; concurrent/replayed events do not create duplicate charges; preserve the already-tested distinctions between one-off payments, subscriptions and grandfathered customers. BILL-01 through BILL-04, P6; economics and billing owners. Prices, included usage, overages and refund terms must be selected before charging behavior is finalized. |
| Leaving or changing provider | Complete the exit journey around existing export: cancel future work, resolve outstanding obligations, revoke participation, hand over maintained resources and apply selected retention rules. | Customer data remains usable, active work has a named successor or stopped state, and the export states omissions and handles its size limit. PRD 04; workspace/economics/delivery owners. A download is not account closure. |
| Agency and personal-AI breadth | Complete agency queue coverage for the chosen scale and prove restricted-member and sponsored-agent journeys. Add a named external assistant connector only if it is included in the offer. | Partial/unavailable client coverage is explicit; scoped access can be revoked without losing customer work. The existing REST contribution entrance is not an MCP connector or arbitrary execution permission. PRD 05; collaboration owner. |
| Usable, accepted interface | Review complete customer journeys, repair misleading states and dead ends, finish necessary shared-control adoption, then review visual composition. | Desktop, phone, keyboard, loading, empty, denied, error and recovery states work for realistic content. Jacob reviews first use, self-service, staff use and managed handoff. P3/P5; experience and component owners. Image generation and aesthetic exploration remain deferred. |

### Separate operating and release requirements

1. **Prove the selected customer case.** The Mooney Firm's website submission must
   reach the approved Outlook destination and required ADR Notable workflow.
   Verify actual vendor/mailbox receipt, uncertain-outcome recovery, monitoring,
   repeat use and operating effort. Preserve the firm's existing systems;
   do not add a second case-management pipeline. The exact configuration and
   authorized live rehearsal remain prerequisites. [Owning checklist](./docs/horizontal-release-checklist-2026-09-11.md#first-customer-release-case).
2. **Prove the operating model.** Exercise due work, provider interruption,
   unknown cost, failed evidence writes, operator escalation and recovery in the
   intended hosted environment. A missing portfolio read must never mean all
   work is healthy. Name who handles exceptions and measure their effort.
3. **Finish internal learning evidence.** Keep the existing learning lifecycle.
   Exercise it with permitted real observations, a measured capability trial,
   contradictory evidence and an explicit keep/change/stop decision. Record
   setup, correction, support and provider cost separately. Do not rebuild ten
   research services or treat synthetic users as demand. [Definition of done](./docs/strelvav2-definition-of-done.md#the-ten-part-learning-loop).
4. **Prepare the release as an exact operation.** Check current hosted migration
   state, rehearse the pending order and recovery, verify pinned client revisions in isolated checkouts, storefront/revalidation
   compatibility and existing agreements, select the shared version, align both
   changelogs and public claims, rerun marketing checks against its own revision,
   and prepare activation and rollback steps.
   Hosted browser/Auth/provider evidence and human acceptance remain separate
   from green CI. Merging into main, migrations and deployment are distinct
   actions. [Versioning](./VERSIONING.md) and [release checklist](./docs/horizontal-release-checklist-2026-09-11.md).
5. **Qualify commercial claims.** Observe useful first use, a later change and
   voluntary return; include support and recovery in the economics. Public
   access does not establish willingness to pay or a supported enterprise offer.
   Enterprise identity lifecycle, organization policy, audit/export, retention
   and service commitments need a selected contract before enterprise claims.

### Execution order and decisions

The next local implementation wave is recipient editing/date fields, onboarding
requirements, and the request-to-delivery connection in parallel. Run inquiry,
scheduled-check and website continuity proofs beside them, fixing only demonstrated
gaps. Custom-app release integration is a separate substantial workstream.
Economics, exit behavior and operator recovery must be completed before taking
ongoing paid responsibility. Prepare provider adapters against selected contracts
and synthetic responses, then perform authorized external proof. Finish customer
acceptance and release preparation before activation; visual refinement follows
usable behavior, as already directed.

Public access is already the selected direction; the hosted signup path and
release flags still need verified activation. Do not ask Jacob to choose public
versus invite-only again.

Jacob selected Outlook first, followed by Google Calendar, for booking
integrations. Checks will first monitor public website changes. These choices
authorize the adapters and local verification; connected-account proof remains
a separate operating requirement.

Jacob selected subscriptions with included usage for paid customers. Prices and
included quantities remain unset. On customer exit, stop future work and retain
records for export until the customer explicitly requests deletion. Do not add
an automatic deletion deadline.

The dependent decisions are: the public first-value promise; recipient edit
scope; paid plan amounts and provider
commitments; and the actual enterprise or personal-AI
connector promise, if included. Prepare concrete choices at each boundary.
These decisions do not block unrelated local implementation. Existing operator
awards are local allowance units; their references are not yet bound to accepted
contribution records. If rewards are offered, specify eligibility, attribution
and correction before connecting subscription credits or other benefits.
Contribution credits or equity are not prerequisites for self-service, request review or
delivery; no reward promise should be inferred from participation.

This plan does not declare every listed capability a launch-day commercial
offer. Full horizontal local acceptance, production activation and qualification
of each operated offering remain distinct finish lines. No new public release
date or completion percentage is supported by the available evidence.

Updated September 18, 2026. Read the overview and next steps first; the numbered
sections below preserve the full journey checklist. This file is the work index.
The [product brief](./docs/horizontal-product-brief-2026-09-11.md) owns selected
behavior, [DESIGN.md](./DESIGN.md) owns design direction, and the
[acceptance ledger](./docs/strelvav2-horizontal-acceptance.md) owns implementation proof.

## Practical scalability: reduce Strelva's operating work

The [September 18 friction audit](./docs/horizontal-audit-and-plan-2026-09-11.md#september-18-audit-less-work-and-friction-for-strelva)
checks setup, supervision, troubleshooting, coordination and maintenance per
useful result. No measured reduction or scalability percentage is established.
The following are audit findings and proposed next fixes, not completed work:

- [ ] Repair provisioning resume: preserve credentials/customer edits, reuse the
  existing project, and verify signed revalidation after each interrupted step.
- [ ] Stop unavailable portfolio reads appearing as “Portfolio is clear”; expose
  exact failed/unknown workspace work with an owner and a safe recovery action.
- [ ] Connect trusted model-cost receipts to settlement so ordinary planning
  does not routinely require manual reconciliation.
- [ ] Establish attributable Mooney delivery monitoring and recovery using the
  firm's existing tools. Jacob reports both ADR forms configured; URLs are pending.
- [ ] Remove repeated setup/configuration and assignment-link coordination for
  supported offerings; prove reduced effort on a second installation and update.
- [ ] Record Strelva setup/operating time and customer/provider friction separately
  in the existing experiment evidence, including failures and support.

## Current priority: requirements and working journeys

**Selected first production acceptance case: The Mooney Firm, attymooney.com.**
Jacob selected the native website → structured submission → Outlook / ADR Notable
handoff. The firm keeps its operational truth in its existing systems. It must
not need to check Strelva for a new inquiry. Do not add a Strelva case or inquiry
pipeline to satisfy this case.

The first customer case passes when:

- A visitor submits through the actual website and the accepted fields are validated.
- The correct Outlook destination receives what the firm needs to act.
- ADR Notable receives the firm's required intake or handoff through a supported,
  approved method. A website click alone does not prove vendor receipt.
- Strelva can distinguish received, attempted, provider-accepted, delivered,
  failed and uncertain outcomes, and recover without duplicate delivery.
- Strelva retains only the minimum operational metadata needed to prove and
  repair execution. Matter state and confidential content remain with the firm.
- The firm uses the result through its own tools. Record actual receipt, next
  action, repeat use, setup/correction effort and provider cost.

Current evidence: the live September 18 contact page includes organization,
an administrative note and time-sensitive fields in addition to contact details
and inquiry type. The current source is `/Users/jacobrhinehart/Desktop/mooney-firm-site`; the older
`mooney-firm-live-inquiry` checkout is stale. Preserve the existing September 14
uncommitted guide/decision-tree work. The exact ADR Notable configuration,
mailbox delivery and approved live rehearsal remain to be verified. The isolated
`mooney-native-handoff` checkout now passes local safe-retry checks for one prepared
submission, including reload recovery and configuration changes. It is not deployed;
production monitoring, abuse controls and cross-browser duplicate handling remain open.

The generic Strelva inquiry tests remain useful broader-product regression
proof; they do not establish this native Mooney handoff. The other PRDs and
staff-application lifecycle remain in scope. Local synthetic proof cannot
establish customer use or authorize a live action.

Jacob's latest direction: pause image generation and defer UI/UX refinement until
behavior is in place. Keep a usable interface built from existing components.
Clear actions, visible consequences, permissions, input preservation, loading,
errors and recovery remain functional requirements now; final composition,
material, animation and aesthetic acceptance come later.

Read the PRDs as requirements, not a completion report. Current next steps:

1. Verify Mooney's approved mailbox and ADR configuration. Local safe-retry
   checks now pass; prepare the exact live rehearsal before seeking authorization.
2. Review the now-verified nonmember payer journey: explicit acceptance applies
   to new jobs, while old jobs and unresolved holds stay with the original payer.
3. Review the verified owner-only workspace download and its explicit omissions.
   Account closure, provider handover, retention and production-scale export
   resource limits remain open. Complete release approval separately.
4. Review the connected application, public/account and invitation journeys with
   Jacob. Their local proof does not replace human acceptance.
5. Observe actual customer use and costs. Refine visual composition afterward.

P1–P7 identifiers remain stable; they identify work rather than execution order.
Essential accessibility and usable failure recovery remain requirements now.

**App handoff repaired locally:** Staff request offering setup now opens one usable
application after the simulated lost-response retry. The joined preview verifies
records, access, exact change review, two releases, record-preserving rollback,
revocation and its declared reload reset. This remains an in-memory preview.
The authenticated request and application-use journeys also pass locally. A mobile
assertion measured a hidden inner element rather than visible navigation; its
expectation now checks visible navigation and usable content at the agreed test boundary.
Jacob's review and production acceptance remain open.

## PRDs

The [PRD index](../.scratch/strelvav2-experience/spec.md) covers all eighteen
journey areas in eight linked requirements documents. Each records user stories,
decisions, observable acceptance cases and open choices. Requirements are drafted;
implementation, Jacob’s acceptance and release remain separate. The existing
browser, authenticated command/API and focused SQL test boundaries are confirmed.

| Next work | Requirements |
| --- | --- |
| P1 / P2: entry, return and setup | [02 Business workspace](../.scratch/strelvav2-experience/issues/02-business-workspace.md) |
| P3: complete app journey | [03 Creation and use](../.scratch/strelvav2-experience/issues/03-creation-and-use.md) |
| P4: public/account continuity | [01 Entry and account](../.scratch/strelvav2-experience/issues/01-entry-and-account.md) |
| P5: foundation and image studies | [07 Visual foundation](../.scratch/strelvav2-experience/issues/07-visual-foundation-and-experience-quality.md) |
| P6: costs and operational proof | [04 Ongoing work](../.scratch/strelvav2-experience/issues/04-ongoing-work-and-economics.md), [06 Offerings](../.scratch/strelvav2-experience/issues/06-offerings-and-delivery.md), [08 Acceptance](../.scratch/strelvav2-experience/issues/08-acceptance-release-and-customer-value.md) |
| P7: customer value | [08 Acceptance and customer value](../.scratch/strelvav2-experience/issues/08-acceptance-release-and-customer-value.md) |
| Collaboration, agency and personal AI | [05 Access](../.scratch/strelvav2-experience/issues/05-collaboration-and-agent-access.md) |

## Where we are

**There is substantial working local product behavior, but the full customer
experience is not accepted or ready for release.** The strongest parts are the
shared frame, retained work, permissions, app releases and recovery. First use,
setup, broader connected journeys and consistent component adoption need work.

Status terms: **Local proof** means the named scope has recorded local evidence;
**Partial** means code exists with a concrete gap; **Decision** needs product or
visual judgment; **Unproven** means the needed operating/customer evidence is absent.
These are not completion percentages. Earlier proof retains its date and limits.

| Experience | State | What exists / what remains |
| --- | --- | --- |
| Public arrival | Partial | Session-led homepage and a bounded private-brief continuation are implemented. The isolated new-account/Auth/Postgres journey passes explicit destination selection, exact saved-document recovery, wrong-account privacy and revoked access. File contents and arbitrary execution are not imported; export and closure remain open. [Public handoff](../strelva-marketing/docs/design/session-landing.md) |
| Home, Work and navigation | Local proof | Shared business, agency, website and account frame; supported saved work now uses native reopen labels and route-specific actions. Unit and preview journeys pass; broader human review remains. [Audit](./output/strelvav2-audit-2026-09-18/audit.md) |
| Start something new | Local proof / partial | Ordinary application, scheduling, tracker and investigation paraphrases reach their native entry or a useful clarification, with destination-specific continuation copy. The public entrance and unsupported work still need product decisions. |
| Create, use and change an app | Local proof | One deterministic browser journey now connects prepared request, owner and employee use, exact change review, publication, record-preserving rollback and revocation. Model creation remains fixture-backed; Jacob’s acceptance is pending. [Ledger](./docs/strelvav2-horizontal-acceptance.md#current-acceptance-gate) |
| Business setup and offerings | Local proof | Home and Settings expose direct assignment for account-authorized websites; business identity remains coherent without a website. An isolated Auth/Postgres journey passes owner, administrator, member, wrong-business and exact-retry cases. The internal Strelva provider request, explicit acceptance, exact assigned operation, review and revocation also pass locally. External provider arrangements and production remain open. |
| Agency and personal AI | Local proof / partial | Scoped agency access and exact-work read/propose tokens exist. Agency attention checks at most eight clients; native AI-host connectors and broader execution are not established. |
| Ongoing work and costs | Local proof / partial | Planning now requires a user-entered maximum and explicit payer acceptance, records an unknown-cost hold, and refuses receipt replay. Connected assignments, standing-work recovery and zero-cost execution pass locally. Trusted native-receipt reconciliation passes independent review; internal provider acceptance and assigned execution also pass with real local Auth/Postgres. Nonmember payer transition, bounded job acceptance and runtime claim pass with real local Auth/Postgres; model-provider billing evidence and live delivery remain open. |
| Visual system | Selected / partial implementation | REB and marketing now bind one Geist family and their owned field/tab primitives carry semantic relationships and keyboard behavior. Broader consumer adoption, exact weights/material review and Jacob’s visual acceptance remain open. [Foundation](./docs/component-system.md) |
| Website request to business work | Generic connected local proof; Mooney incomplete | Generic website submission helper → durable request → staff assignment → governed reply → retained outcome and Undo pass with isolated Auth/Postgres/Redis. Simulated accepted-send/read-back failure cannot send twice. Mooney uses the separate native handoff described above; its Outlook/ADR receipt and actual firm use remain unproven. |
| Release and business value | Local upgrade proof / unproven value | The full ordered schema now upgrades successfully from the documented pre-workspace baseline in isolated PostgreSQL, including permissions and atomic duplicate rejection. Hosted continuity, Jacob's acceptance, repeat use and customer economics remain open. Existing Managed Websites agreements are separate. |

This overview uses the [September 18 audit](./output/strelvav2-audit-2026-09-18/audit.md),
current source spot checks and dated local records. It is not a fresh production
check or a claim that all browser journeys were rerun today.

## Work queue

This is the current recommended queue, not a new restriction on the horizontal
product scope. The staff application remains a required regression, not a limit
on what Strelva can become. Owners below identify who can close the work, not a
claim that a worker is currently running it.

| ID | Work | Owner | Done when |
| --- | --- | --- | --- |
| P1 | Repair New, continuation labels and saved-work labels | Implementation | Ordinary paraphrases reach a relevant proposal or useful clarification; actions name the actual destination; supported saved work reopens with accurate labels. |
| P2 | Finish business setup handoffs | Implementation; Jacob reviews behavior | A business without a website has a coherent settings path; an authorized but unassigned website has a direct assignment action with the right business and permission checks. |
| P3 | Make the complete app journey reviewable | Implementation prepares; Jacob reviews | Request → proposal → owner use → employee use → change → exact review → publication → recovery is exercised with named fixture/provider limits and retained records. |
| P4 | Connect public value to the correct account/business | Implementation; product choice where needed | The chosen supported result and permitted context survive the declared registration/invitation flow; unsupported work has an honest continuation. |
| P5 | Complete foundation specimens and adoption | Implementation; Jacob selects visual treatments | Geist, shared roles, fields/tabs and both themes meet the existing component contract. Actual consumers and remaining gaps are recorded. |
| P6 | Close economic and operational proof gaps | Implementation; separate live-action authority | Planning spend is admitted/receipted; newer offering/assignment Auth journeys and a local scheduler failure/recovery cycle are demonstrated; full schema upgrade is rehearsed. |
| P7 | Establish independent customer value | Jacob chooses participants and terms | Observe useful first use, a later change and voluntary return; count setup, correction, support and provider cost. No adoption claim from fixtures. |

- [x] P1: local entry, continuation and saved-work label repair.
- [x] P2: local business setup and connected Auth/Postgres assignment proof.
- [ ] P3: connected app review with Jacob.
- [ ] P4: public-to-account continuation.
- [ ] P5: actual foundation implementation and visual review.
- [ ] P6: remaining cost, authenticated operation and upgrade proof.
- [ ] P7: customer observation and economics.

## Confirmed payer rule

An owner proposes a new payer; that person must accept. Only jobs created after
acceptance use the new payer. Existing jobs and unresolved costs stay with the
original payer. Implementation and concurrent-job acceptance checks are in
progress. This does not authorize Stripe changes or alter existing agreements.

## Decisions for Jacob

These are unresolved choices, not prerequisites for fixing verified defects.

- [ ] Choose what should make the first visit valuable: bring a problem, discover
  an opportunity, or get a known result working. The three paths were discussed
  as alternatives; no preferred value path has been selected. The session-led
  homepage remains the selected public composition.
- [ ] Judge the live-result/change-review experience using the complete P3 journey.
- [ ] Review Geist weights and actual light/dark gloss/material specimens. The
  font family is selected; exact treatment remains reviewable.
- [ ] Decide whether a larger agency needs complete portfolio attention coverage
  beyond the current eight-client scan.
- [ ] Confirm the firm's actual ADR Notable handoff configuration and prepare
  the authorized live rehearsal. Native handoff is selected; prices, provider
  commitments and rollout remain separate.

## Image generation: paused

Use the [image briefs](./docs/design/product-experience-image-briefs.md). They
contain reference paths, fixed content, prompts, comparison options and review
questions. Two exploratory studies were generated in this conversation. Jacob found the first glass treatment too strong and requested quieter components arranged around user intent. Neither study is an accepted implementation. Further generation is paused.

| Brief | Purpose | Readiness |
| --- | --- | --- |
| F1: foundation comparison | Judge type hierarchy, gloss and selective atmosphere in light/dark components | Ready for an exploratory generation; does not depend on choosing a new product entrance |
| X1: owner uses and changes an app | Make the delivered result and exact change review concrete | Prepared proposal; five interaction/composition alternatives available for Jacob's comparison |
| X2: business Home | Judge attention, live work and return paths with realistic sample content | Prepared proposal; preserves current navigation and treats illustration as optional exploration |
| Public first visit | Explore a new entrance | Wait for the first-visit choice above; the selected session homepage remains the current reference |

When visual work resumes, revisit these briefs against the completed journeys.
X1/X2 are image studies, not authorization to redesign product pages. Generated
pixels cannot select tokens, prove behavior, or mark P1–P7 complete. Show every
result inline in chat and retain its prompt, references and review notes.

- [x] Reconcile the selected visual direction and its extension owners.
- [x] Prepare current reference inputs and generation briefs.
- [x] Generate and show exploratory comparisons inline; no final selection recorded.
- [ ] Record Jacob's selection and rejected options in the owning design record.
- [ ] Implement the selected treatment with real components and verify its states.

## How to keep this readable as we move

Update the affected overview row and P item when behavior or proof changes. Add
one dated note below, link the existing owner, and keep detailed technical proof
out of this overview. A checked local item is not human acceptance or release.
If scope changes, say what changed instead of silently changing the denominator.

Latest changes:

- **September 18:** repaired request routing, continuation copy and native
  saved-work labels; focused unit and preview journeys pass.
- **September 18:** added direct website assignment on Home and Settings and ran
  the corrected owner/admin/member/cross-business/retry journey against isolated
  local Auth and Postgres. The local stack was stopped afterward.
- **September 18:** connected the prepared-application review fixture through
  employee use, exact change review, publication, rollback and revocation.
- **September 18:** added explicit planning maximum proposal and payer
  acceptance, durable unknown-cost holds, scheduler recovery proof and a full
  ordered-schema upgrade rehearsal. Provider reconciliation remains open.
- **September 18:** aligned Geist, semantic field relationships and keyboard
  tabs in REB and marketing primitives. Broader adoption and visual acceptance
  remain open.
- **September 18:** wrote eight linked PRDs in the local issue tracker; confirmed
  browser, authenticated command/API and focused SQL acceptance boundaries.
- **September 18:** four-agent audit separated local capability from experience,
  release and commercial proof; this page now exposes the concrete next work.
- **September 18:** visual-direction ownership and extension structure aligned
  across product/marketing. Runtime component migration remains unfinished.
- **September 18:** prepared image briefs; no new images or visual selection yet.
- **September 17:** recorded local public homepage replacement and continuity
  checks. Account import and general execution remain open; see section 2.

## Detailed journey checklist

The original scope is preserved below. An unchecked item means its full
experience still needs agreement and proof, not that there is no implementation.
The checked public items retain their original local evidence limits. Close a
journey only with its relevant failure/permission states and a linked record.

Jump to [entrances](#1-entrances-and-navigation), [public arrival](#2-public-discovery-and-first-value),
[Home](#4-business-home), [creation and change](#7-prepare-preview-publish-and-change),
[direct use](#8-delivered-apps-websites-forms-and-portals),
[agency](#13-agency-workspace), [settings](#16-settings-payment-and-leaving), or
[walkthroughs](#18-end-to-end-walkthroughs-before-calling-the-ux-determined).

## Existing decisions to preserve

- Make ambition affordable while keeping people involved on their own terms.
- Keep each business's records and permissions separate. Switching operators does not move ownership.
- Keep the delivered thing central, with changes, review, access and history beside it.
- Infer configuration from permitted context and let the customer correct it. Do not infer consequential authority.
- A request for Strelva or an agency to help is not that provider's acceptance.
- Employees and external users can enter the thing they use without the owner's workspace.
- Personal AI uses the same work and permission boundaries, not a duplicate business.
- Marketing stays in the sibling marketing repository; client-specific websites stay in their own repositories.
- No new price, royalty agreement, provider commitment, production deployment or domain change is authorized by this checklist.

## How to resolve a checkbox

For each experience, show the entry screen, what the person sees and does, what
Strelva handles, the next screen or inline state, the saved result, and the return
path. Include the relevant permission and failure states. Use realistic content.

For a consequential subjective choice, bring Jacob five materially different
options with concrete screen behavior and tradeoffs. Do not turn every small
control into five variants or quietly select the company's direction.

Record accepted interaction decisions in [DESIGN.md](./DESIGN.md), product
decisions in the [product brief](./docs/horizontal-product-brief-2026-09-11.md),
and working evidence in the [acceptance ledger](./docs/strelvav2-horizontal-acceptance.md).
Link those records from completed items here instead of creating competing specifications.

## 1. Entrances and navigation

Current entrances: public marketing; `/workspace`; `/apps/[workId]`;
`/workspace/contribute/[workId]`; restricted `/admin`; personal-AI API access.
Branded workspace addresses and native AI-host connectors are not established.

- [ ] Draw the complete screen map, marking existing routes, proposed screens, inline panels and dialogs separately.
- [ ] Define the first destination for a visitor, returning owner, employee, agency member, collaborator and Strelva staff member.
- [ ] Design the account/business/agency switcher, including one person belonging to several businesses and agencies.
- [ ] Show the current business, acting person and applicable permissions without making users read an access policy.
- [ ] Specify browser Back, refresh, saved links, sign-in return and opening work in another tab.
- [ ] Decide which interactions need a page, inline controls, a temporary generated interface or no visible interface.
- [ ] Define the mobile navigation, collapsed desktop navigation and return from a direct application.
- [ ] Decide what a branded address opens: owner workspace, employee app or customer portal. Show wrong-account, unverified-domain and unavailable-address states.

## 2. Public discovery and first value

Public presentation belongs in `strelva-marketing`, not this control plane.

September 15: Jacob accepted the [public discovery interaction direction](./DESIGN.md#public-discovery-into-business-home):
business name/website entry with a connection action, a preview of business Home,
opportunity cards, contextual opportunity previews, and an interactive sample
business under Examples. The accepted continuation includes progressive discovery,
editable business context, reversible opportunity dismissal, a connection panel,
contextual next actions and requests, and signup returning to the same result.
The items below remain open until their full states and journeys are specified
and verified.

September 17: the [architectural landing implementation](../strelva-marketing/docs/design/architectural-landing.md)
adds the supplied visual direction, motion, and a local business/sample preview.
Tab-local drafts now survive refresh and Back/Forward, with direct opportunity
links, dismissal undo, and clear/storage-failure states. Live business discovery,
provider connections, and signup continuation remain unfinished. The
[acceptance ledger](./docs/strelvav2-horizontal-acceptance.md#september-17-public-entry-motion-and-continuity)
records the local proof. This does not complete the journey checkboxes below.

September 17, replacement decision: Jacob explicitly selected the session-led
landing as the replacement homepage, not a separate optional study. The marketing
root `/` now renders it locally. `/preview/session` is only a development alias;
`/preview/intent` is a superseded comparison. The earlier business explorer remains
available at `/explore`, and old `?discovery=…` entry links redirect there.
No deployment is authorized by this implementation decision.

Completed local public work is recorded in the
[replacement handoff](../strelva-marketing/docs/design/session-landing.md):

- [x] Replace the local homepage with the session-led composition.
- [x] Keep Product/Examples anchors and agency, website pricing, tools, contact, sign-in and legal destinations reachable.
- [x] Preserve separate local business briefs across refresh, expose storage failure, and provide an explicit clear action.
- [x] Provide a downloadable brief and a usable contact fallback without JavaScript.
- [x] Retain the previous business explorer and its direct sample/opportunity links.

September 17, composed public-site continuation: the [release record](../strelva-marketing/docs/design/composed-public-release.md) ties the approved ink direction to the shared public components and actual routes.

- [x] Compose artwork, original lettering and request entry together on desktop and mobile, with GSAP motion, pause, reduced motion and a static fallback.
- [x] Show reversible request/proposal examples and visible links to the existing website audit and AI visibility capabilities.
- [x] Keep request results in view; preserve business separation, local retention, clear confirmation, downloadable briefs and editable contact continuation.
- [ ] Align shared navigation/footer, about and agencies with the actual component system. Reopened after Jacob rejected font mixing and custom controls; the [component audit](../strelva-marketing/docs/design/component-system-audit-2026-09-17.md) records the required corrections. Preserve agreed website pricing.
- [x] Remove unconditional analytics and private brief text from new contact URLs; keep legacy links recoverable.
- [x] Verify a local optimized production build, relevant public journeys and no-JavaScript content visibility. This is local evidence, not a deployment.

The full account/file import and real execution items below remain open. The
September 17 read-only live check found invitation-only signup; that is dated
evidence, not a fresh live check. Legacy pages inherit the shared system but have
not all received a complete new composition.

Public work still to finish before claiming the whole journey is complete:

- [ ] Connect request interpretation to a real product capability and display its actual result, failure and recovery states.
- [ ] Carry the brief and authorized files through registration into the correct business. Current account links do not import the brief.
- [ ] Align agency, contact, pricing, about, free releases and older offering pages with the selected public direction while preserving their real routes and agreements.
- [ ] Verify the full public journey against the intended release, including metadata, analytics privacy, provider access and account continuation.

- [ ] Map Product, Examples, For agencies, Pricing, Free tools, Help/contact and Sign in to their actual next destinations.
- [ ] Design an offering detail page: useful result, example, limits, required access, price basis and who handles ongoing work.
- [ ] Determine what someone can try before registering, connecting software or paying.
- [ ] Show a useful trial result and the exact transition from trying it to saving or using it.
- [ ] Preserve the request, files and result through sign-up; specify what cannot be retained anonymously.
- [ ] Distinguish available, trial-only, requires connection, requires human agreement and unavailable offerings.
- [ ] Design the request for an unsupported capability without implying that Strelva has accepted delivery.

## 3. Sign-in, invitations and account

Current account entrance: `/workspace/account`.

- [ ] Design sign-up, sign-in, email verification, expired session, failed callback and account recovery.
- [ ] Define invitation acceptance for a new user, an existing user and someone signed into the wrong account.
- [ ] Show personal identity separately from business role, subscription payer and service provider.
- [ ] Define creating a business versus joining an existing one; prevent accidental duplicate businesses.
- [ ] Design the arrival of an existing managed-website customer, preserving their site and agreed service.
- [ ] Specify the account list, business opening, lost membership, pending invitation and unavailable access checks.
- [ ] Determine how someone leaves a business or closes their personal account without accidentally deleting business work.

## 4. Business Home

Current entrance: `/workspace` in a selected business.

- [ ] Decide what appears first for a new business, an active business and a business with urgent decisions.
- [ ] Show requests needing judgment with a specific action: review, provide information, reconnect, approve or take over.
- [ ] Distinguish work being handled, waiting for someone, completed and unable to continue.
- [ ] Determine how people open their website, app, document or tracker directly from Home.
- [ ] Show opportunities inferred from permitted evidence, including why they appeared and how to dismiss or correct them.
- [ ] Decide where a person starts a new request without requiring a chat-first experience.
- [ ] Define the role of the business illustration versus actionable lists on desktop and phone.
- [ ] Show loading, a genuinely empty business, partial data and unavailable data without inventing activity.

## 5. New, Search, Explore offerings and Help

Current utilities are reachable from the shared navigation.

- [ ] Design New for a plain-language request, an example, an uploaded file and an existing piece of work.
- [ ] Show the interpreted request and editable assumptions without presenting an architecture diagram.
- [ ] Determine when one clarifying question is necessary and when Strelva should prepare something immediately.
- [ ] Design Search across permitted work, records and websites, with business scope visible and no cross-client leakage.
- [ ] Design Explore offerings for discovery, comparison, trial, installation and reopening an installed offering.
- [ ] Show what is already included, what consumes usage and what requires a separately agreed service.
- [ ] Design Help beside the affected work: explain the problem, attach permitted context, contact a person and return to the result.
- [ ] Determine premium human contact and response expectations without implying an unaccepted service promise.

## 6. Work list and individual work

Current list: `/workspace?view=work`. Saved-work links carry workspace and work identity.

- [ ] Define the list's search, filters, ordering, grouping and empty states for mixed work types.
- [ ] Distinguish a live thing, a draft, a request, an installed offering and a historical result in ordinary words.
- [ ] Decide which work belongs together and how related items open without creating a maze of project pages.
- [ ] Design one recognizable work header: title, business, status, primary action and responsible person/provider.
- [ ] Place Use/Open live, Request a change, Review, Sources and collaborators, responsibility and history around the result.
- [ ] Determine which controls are shared and which belong only to a website, app, tracker, document or assessment.
- [ ] Design naming, copying, archiving, deleting, exporting and reopening work, with consequences visible.
- [ ] Show a missing, retired, inaccessible or moved item without substituting a different result.

## 7. Prepare, preview, publish and change

- [ ] Walk through “Build my intake app”: request → editable proposal → working trial → review → release → direct use.
- [ ] Walk through “Change this intake question” while the old app remains usable and existing records remain intact.
- [ ] Design previews appropriate to the result: page comparison, sample form submission, document edits, record changes or proposed external action.
- [ ] Show affected people, records, connections, costs and irreversible effects before approval.
- [ ] Distinguish approving a proposal, authorizing execution and confirming a live result.
- [ ] Show progress honestly, including waiting, partial completion and outcomes that cannot yet be verified.
- [ ] Design simultaneous edits, stale approvals and changes to connected data after a preview was created.
- [ ] Define revision requests, rejected proposals, retry, cancellation and returning to an unfinished draft.
- [ ] Design history and recovery so restoring software does not silently erase records created afterward.
- [ ] Decide when a generated interface is temporary and when it becomes a maintained application with an owner and update process.

## 8. Delivered apps, websites, forms and portals

Current direct application entrance: `/apps/[workId]`. Public client websites remain separate.

- [ ] Show exactly what an employee sees when opening an assigned application, without owner setup controls.
- [ ] Show a prospect/customer completing a form, receiving confirmation and finding the next step.
- [ ] Determine which experiences may be public and which require identity, an invitation or verified access.
- [ ] Design applicant, vendor and partner access where needed, including which records each can see or update.
- [ ] Decide when a single form is sufficient and when the user needs a returning portal with status and history.
- [ ] Define validation, unsaved work, duplicate submissions, slow requests, attachments and recovery after interruption.
- [ ] Show the correct business branding, contact and responsibility for the service; decide where Strelva appears.
- [ ] Design app updates, retirement, revoked access and unavailable service from the recipient's perspective.

## 9. Managed website controls

Use the existing [client dashboard map](./docs/client-dashboard-ia.md); do not invent a second website-management product.

- [ ] Map business Work → website → content, assets, leads, reviews, reports, integrations, settings and relevant commerce/booking controls.
- [ ] Carry a website change request into the governed composer without losing the request or publishing it automatically.
- [ ] Show account-authorized websites separately from websites explicitly linked to this business.
- [ ] Design linking an authorized website, incorrect business selection, missing owner authority and removing the link.
- [ ] Define approval, publishing, failed verification and recovery in the same website context.
- [ ] Preserve the customer's route back to their business and distinguish website-specific settings from personal Account.

## 10. Ongoing work and interruptions

Current entrance: `/workspace?view=ongoing`.

- [ ] Design the responsibility list: what is being handled, by whom, within which limits and when it last produced a result.
- [ ] Show the difference between a finite job and an ongoing responsibility without exposing scheduler internals.
- [ ] Define setup for outcome, allowed actions, timing, spending, review requirements and stopping conditions.
- [ ] Show a new event becoming work, including duplicate events and events received while paused.
- [ ] Decide which actions happen quietly, which appear in a digest and which require immediate interruption.
- [ ] Design pause, resume, cancel, run now and human takeover, showing actions that already occurred.
- [ ] Walk through an inquiry arriving while the CRM connection is broken: receipt, safe holding, notification, repair and confirmed completion.
- [ ] Design waiting on a customer, provider, approval or connection, with an accountable next step.
- [ ] Show delivery evidence and failed/uncertain outcomes without treating an attempted action as success.

## 11. People, permissions and changing involvement

Current business entrance: `/workspace?view=access`; exact-work controls also live beside work.

- [ ] Design inviting a team member, outside collaborator, agency or Strelva provider, with distinct scopes.
- [ ] Present role presets and understandable exceptions, including read, propose, operate, approve and export permissions.
- [ ] Show invitation pending, accepted, declined, expired, revoked and account-mismatch states.
- [ ] Design “Let this agency manage follow-up for three months, but not export customer records.”
- [ ] Show provider acceptance separately from the customer's request and approval of limits.
- [ ] Design moving between doing the work, reviewing it and delegating it without relocating the work.
- [ ] Design replacing an operator, temporary coverage, expiring responsibility and taking work back yourself.
- [ ] Show revocation during in-progress work: what stops, what has already happened and who must resolve the remainder.
- [ ] Design ownership transfer, removal of the last owner and access review without confusing ownership with billing.

## 12. Personal AI and outside collaborators

Current personal-AI entrance is scoped REST access, not a native Claude/Codex connector.

- [ ] Design “Use this work from my AI”: select work → understand access → authorize → connect → confirm it works.
- [ ] Determine the actual connection experience in each supported AI host; identify required engineering rather than drawing a fake connection button.
- [ ] Design one-time credentials, expiry, lost credentials, connection failure and revocation.
- [ ] Show what the AI can read, propose or operate, keeping unsupported execution unavailable.
- [ ] Walk through a proposal returning from an outside AI and appearing beside the original work for review.
- [ ] Identify the acting AI/person and sponsor in results, proposals, costs and history.
- [ ] Design stale proposals, conflicting changes, exceeded limits and revoked access without losing submitted work.
- [ ] Design the direct collaborator contribution page and its return to the owner's review controls.

## 13. Agency workspace

Current agency Home shares `/workspace`; the selected workspace determines the agency context.

- [ ] Design the first agency visit: create/join agency → bring a client or start private work.
- [ ] Design the cross-client queue, including urgent decisions, partial loading and more clients than one screen can show.
- [ ] Open a queue item into the exact client's work, then return to the same queue position and filters.
- [ ] Show which client granted which access, including one person working through multiple agencies for the same client.
- [ ] Design client onboarding and handoff to a customer-owned business, not an agency-owned copy of customer records.
- [ ] Design private agency drafts, methods and reusable applications separately from client-owned work.
- [ ] Show how an agency uses Strelva-built offerings for a client, requests missing access and invites the client to approve.
- [ ] Design agency team assignment without granting everyone access to every client.
- [ ] Define agency branding and the visible relationship between agency, Strelva and customer.
- [ ] Design client departure, agency replacement and unresolved work during the handover.

## 14. Reusable offerings and contributor benefits

Private agency offering distribution and royalty workflows remain decisions, not released features.

- [ ] Design submitting a new offering idea with a concrete example and expected customer result.
- [ ] Show proposal received, under discussion, accepted for development, declined and released as distinct states.
- [ ] Determine how parties review contribution, ownership, maintenance, support and benefit terms before accepting them.
- [ ] Design building and testing an offering using isolated sample data rather than private client records.
- [ ] Design installing a reusable offering into another business without copying secrets, records or permissions.
- [ ] Show version, provider, local configuration and maintenance responsibility on an installation.
- [ ] Design updates, customer modifications, incompatibility, decline/defer and rollback.
- [ ] Design earned subscription/usage credits, attribution, adjustments and disputes using actual award records.
- [ ] If royalties are adopted, separately design the agreement, earnings calculation, payout status and disputes. Do not present credits as cash or equity.

## 15. Inside Strelva

Current restricted entrance: `/admin/work`. Refer to the [operator map](./docs/operator-command-center.md).

- [ ] Design request intake → scope discussion → provider acceptance → staff assignment → delivery → customer confirmation.
- [ ] Define the staff work queue and exact assignment entrance without giving delivery staff super-admin access.
- [ ] Show customer context, permitted actions, agreed limits and outstanding questions on each job.
- [ ] Design customer/staff communication, review requests and escalation without starting a disconnected support thread.
- [ ] Design exception investigation and repair, including uncertain external writes that must not be blindly retried.
- [ ] Define offering development screens for evidence, candidate versions, trials, qualification and release decisions.
- [ ] Show costs per completed job, human effort, retries and unknown costs without fabricated portfolio totals.
- [ ] Separate delivery, support, offering development and restricted system administration in navigation and permissions.

## 16. Settings, payment and leaving

Current business entrance: `/workspace?view=settings`; website billing remains in native website controls.

- [ ] Design business information and inferred facts, with sources, corrections and stale/conflicting values.
- [ ] Design connections: requested permissions, selected account, successful test, freshness, broken connection, reconnect and disconnect consequences.
- [ ] Design domain assignment and verification, including the destination, certificate/setup state, failure and removal.
- [ ] Show included capabilities, subscription, usage allowance, optional add-ons and human-service terms without a fee at every action.
- [ ] Design payer selection separately from owner and operator, including agency-paid versus customer-paid work.
- [ ] Show usage approaching a limit, an explicit additional-cost approval, a hard stop and resumption after resolution.
- [ ] Design upgrade, downgrade, payment failure and cancellation with the effect on active work shown before confirmation.
- [ ] Preserve existing managed-client agreements and exceptions when presenting new packaging.
- [ ] Design export, provider handover, service shutdown, retention and deletion as separate choices.
- [ ] Show what remains usable after cancellation and who is responsible for anything that continues running.

## 17. Cross-screen behavior and UI quality

- [ ] Make controls, labels and status meanings consistent across business, agency, staff and direct-use views.
- [ ] Define notification delivery, deduplication, preferences and links back to the exact affected work.
- [ ] Specify loading, empty, read-only, disconnected, unavailable, partial, expired and recovery states for every applicable screen.
- [ ] Keep forms and unsaved requests recoverable through navigation, sign-in expiry and connection loss.
- [ ] Define keyboard navigation, focus after transitions, screen-reader announcements, dialogs and mobile drawers.
- [ ] Check realistic long names, large work lists, small phones, zoom, reduced motion and differing time zones.
- [ ] Distinguish sample data, preview, approved draft, released software and verified external results everywhere.
- [ ] Refine product-page composition against the agreed behavior. Foundation specimens and image studies may progress independently within their scope; use the selected Geist, color and motion contracts rather than reopening them as undecided.

## 18. End-to-end walkthroughs before calling the UX determined

These are local design/review journeys, not permission to send messages, spend money or deploy.

- [ ] Visitor tries an assessment → signs up → saves the same result → returns later.
- [ ] Existing website client signs in → finds their site and agreement → requests a change → reviews the result.
- [ ] Business owner requests an intake app → tries it → approves release → employee uses it → owner changes it without losing records.
- [ ] Prospect submits an inquiry → responsibility receives it → connection fails → someone repairs it → completion is verified.
- [ ] Owner delegates limited work for three months → agency accepts → resolves it from its queue → owner takes it back.
- [ ] Agency installs reusable work for two clients → each customizes it → an update preserves their separate records and permissions.
- [ ] Owner authorizes personal AI → receives a proposal → reviews it → revokes access → confirms the AI can no longer retrieve the work.
- [ ] Premium customer asks Strelva for help → staff accepts → customer participates in review → delivery and cost are visible.
- [ ] Contributor proposes an offering → terms are agreed → offering is released → an actual benefit is awarded and explained.
- [ ] Customer changes payer or plan → reviews consequences → active work continues or pauses as explicitly agreed.
- [ ] Customer leaves an agency or Strelva → receives agreed exports/deliverables → access ends → remaining responsibilities are clear.
- [ ] Walk every applicable journey on desktop and phone, including denied access and a realistic failure, then record Jacob's review.
