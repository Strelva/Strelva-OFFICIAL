# Strelva interface and Managed Websites context

## October 8 private completed-month evidence #299

This isolated follow-up starts at frozen private candidate `e28e1a5f`. New
migration32 adds immutable completed-month responsibility evidence from recorded
historical captures, with current actor checks, exact source identity and explicit
partial/unavailable coverage. Current-month previews remain separate. Prices,
Stripe export, accepted SLA targets and production authority stay off/unselected.
[Monthly evidence contract and native rehearsal](docs/operations/responsibility-month-evidence-2026-10-08.md)
own this branch's preparation; no prior public release claim is extended.

## October 8 private integration #601

`prepare/launch-integration-601-20261008` reconciles prepared `1902c15c` onto
`e9ac136f`, preserving every existing deployed migration byte. Its unapplied tail
is rebased after the deployed 266-file history; no production migration or flag
changed. [Integration proof](docs/operations/launch-integration601-proof.md) records
all 42 retained acceptances, current-authority/native/rollback/upgrade checks,
8,693 passing units with 46 skips, 196 client contracts and remaining review/provider
limits. The wholesale eligibility repair selects no rate or commercial policy.
This private candidate does not include the parallel October 8 website/recent-auth
changes; final convergence and authenticated release proof remain gates.

## October 7 security/runtime and bounded agency release (deployed)

The four requested repairs are deployed at `https://app.strelva.com`: snapshot
readers, owner-link authority, inquiry retention and forward-preserving runtime
recovery. Final source `954f1905`, artifact `dpl_9k1j1sG8ioAGVeYr6WAAZZvKzBmP`,
exact hosted 266 migrations. All seven stronger owner guards and the original
238-signature recovery scope remain unchanged. The retired 151200 was never applied.

8,505 units, final native SQL/actual-PUBLIC restore, local authenticated agency
journey and final hosted checks pass. All 60 public client reads remain
byte-identical. Existing workspace flag was preserved; only agency add-client
and website-rebuild flags were added as `1`. Other 65 env entries were unchanged.

Agency work can reach signed-in owner claim, exact approval, explicit named-agency
consent and accepted publication/receipt. New-site public URLs remain unavailable:
default `<tenant>.strelva.com` has no qualified wildcard DNS. This is not full 1.0
acceptance, adoption, economics or live external website delivery. Native app/Version
signed links still require sign-in; scheduled retention and real provider undo
remain unproven. Existing dirty main/model/customer checkouts were preserved.
[Exact release, recovery and remaining proof boundaries](docs/operations/security-runtime-production-2026-10-07.md)
own this rollout. Broader Reborn work remains outside this authorization.

Reviewed: 2026-09-17

Component checkpoint reviewed on this date; earlier product evidence retains its
own dates.
Kind: product

Next release: **Strelva Reborn**, the one build to `1.0.0` (decided Oct 6).
Jacob subsequently authorized the bounded security/agency rollout above before
the full 1.0 release. See the
[build](./docs/product/strelva-reborn.md) and
[what Strelva becomes at 1.0.0](./docs/product/product-model.md), the product
model area by area. The earlier
[strelvav2](./docs/product/strelvav2.md) release shipped the workspace on Sept 30.
Broader Reborn work remains internal and unapproved for production beyond the
explicit bounded October 7 security/agency rollout above.

## Money and agents/apps private preparation, October 7–8, 2026

Private `build/money-apps-combined-20261007` implements the two money and
agents/apps issue chains from pinned `cdf5c31a`. It is unmerged; local native
command/rollback/authority tests and browser fixtures do not establish provider
operation, adopted pricing, demand or commercial responsibility. The
[prepared implementation record](./docs/operations/money-apps-prepared-2026-10-07.md)
owns proof commands and stop points; the workspace `.scratch/agency-1.0/money-apps-2026-10-07/`
owns exact42 issue acceptances and final receipts. Main-workspace
`PRODUCT_MODEL.md` remains canonical. Reserved decisions, directory/legal facts,
Sandbox dependency/resource consent and real provider proof remain explicit.

## Product model

Selected by Jacob on October 4, 2026
([ADR 0011, proposed](../docs/adr/0011-organize-strelva-around-systems-connections-possibilities-versions.md)).
Customers see **Systems**, **Connections**, **Possibilities** and
**Versions**. The verbs are Make, Connect, Explore, Make real and Version.
This is direction. No System runtime, table or screen is shipped yet, and
nothing here proves demand, delivery cost or pricing.

Walk it with The Mooney Firm. Its website is a **System**: it stays the same
System through a rebuild, a new domain or a new booking section. It has
**Connections**: it reads hours and services from the business record, appears
on attymooney.com, and could act on the firm's Google Business profile once
that access is granted. A **Possibility** could be a consult-booking flow
Strelva builds beside the current contact path, which the owner can open, try
and compare. **Make real** turns it on. If the website change lands and the
calendar grant fails, the owner sees exactly that, and the part that landed
stays. If the firm opened a second office, a **Version** would be the same
site adapted for it, with its own hours, people and accounts.

Five rules hold underneath. They are proposed records in the product ledger
(`PRODUCT_MODEL.md`, untracked in the main checkout) and must be proven before
any of them is called shipped:

1. **Identity outlives the build** (`RULE_SYSTEM_OUTPUT_IDENTITY`). A System
   keeps its ID while it changes. Things it already issued, like an accepted
   proposal, keep their own terms and never rewrite.
2. **Connections are contracts** (`RULE_SYSTEM_CONNECTION_CONTRACT`). Each
   declares direction, authority, source of truth, freshness and what happens
   on failure. Knowing about Stripe is not permission to charge.
3. **Possibilities are isolated** (`RULE_POSSIBILITY_ISOLATION`). They pin
   the baselines they change, use isolated data and effects, and go stale
   when the System under them changes. Make real goes through the same
   approvals, governance and stop points as any other change.
4. **Versions are context, not time** (`RULE_CONTEXT_VERSION_IDENTITY`). A
   Version has its own releases. Across businesses, each Version is that
   business's own System with its own data, credentials and grants; nothing is
   shared implicitly.
5. **Lifecycle is not health** (`RULE_SYSTEM_PAUSE_HEALTH`). Draft, Live and
   Paused say what the business intends. Health and needed decisions are
   tracked separately. Pausing keeps records and commitments already made.

Capabilities, offerings, methods and installations below are the machinery
and packaging under Systems, not what a customer navigates. Open questions:
where a System ends and a new one begins, how Versions map onto today's
release fields, what Make real guarantees after a partial failure, and whether
any of this makes customer work easier at a cost we can carry.

[docs/product/product-model.md](./docs/product/product-model.md) says what
every area becomes at 1.0.0, including the two nouns outside the four
(Requests and Running), Needs you and Strelva handled.
[docs/product/systems-transition.md](./docs/product/systems-transition.md)
maps today's code onto Systems, Connections, Possibilities and Versions:
where each existing module lands and what the inventory found.

## Role

REB owns the Managed Websites control plane and the current local implementation
of the common Strelva customer interface. Workspace, managed website, and account
views use one shared frame. Company direction and cross-product boundaries live
in the [workspace context](../CONTEXT.md); interaction decisions live in
[DESIGN.md](./DESIGN.md).

## Current component work

Start with the [foundation inventory](./docs/design/component-system.md): tokens,
atoms, contracts and remaining adoption work. The
[September 17 component checkpoint](./docs/design/current-component-context.md)
records local implementations, rejected treatments, alternatives and proof.
The system is partially adopted, not fully migrated. No material winner, final
visual acceptance or production release is implied.

The September 18 [visual direction map](./DESIGN.md#visual-direction-and-extension-map)
and [foundation extension contract](./docs/design/component-system.md#extending-the-foundation)
connect selected direction, source owners, specimens and verification. They
resolve older font-selection guidance in favor of the recorded Geist/custom-logo
decision. This is structural documentation work; component implementation and
adoption gaps remain in the foundation inventory.

## Agency Team implementation, October 7, 2026

Branch `a1/agency-team` prepares #261 locally: workspace/Systems-gated Team
management uses existing invitation records and acceptance, extends agency
admin sponsorship only for staff invitations, protects owner/self memberships,
and assigns staff through 7A's SQL command in an atomic bulk wrapper. Removal
extends the 7A membership-deletion trigger to end staff rows and revoke
offered/accepted agency work assignments with removal actor/time; rejoining
restores neither.
Browser evidence uses fictional responses; permission, cleanup and rollback
proof use isolated PostgreSQL. This is not deployed or adopted. Per-client
permissions remain the 7A provider-seat policy; #241 is still a production
decision. [The handoff](./docs/product/streams/a1-agency-team.md) owns commands,
limits, touched shared files and the next integration action.

## Ordinary agency workflow, October 7, 2026

Private branch `agency/workflow-proof-20261007` composes add-client, provider
verification/resource gates and exact owner effects against integration
`f3097dd6` (private merge `f3483091`). Staff on the current provider seat can prepare and retain website
work without a direct client membership. A verified business owner can explicitly
authorize their named current agency to publish this website after each exact
approval; anonymous approval alone grants no publishing mandate. Seat, staff,
verification and resource authority are rechecked before native effects.

The [workflow handoff](./docs/operations/agency-workflow-2026-10-07.md) owns
local Auth/Postgres/browser proof, migration order, failure evidence and next
actions. Fictional delivery receipts and platform verification are fixtures.
The combined security/agency artifact is deployed as recorded above. Minimum
three-flag local Auth/browser and final 266 native SQL proofs pass; the final source
also passes 8,505 unit tests. Signed-in owner claim and consent are qualified;
public HTTPS website delivery, sent email, adoption and economics are not.
Fictional providers/models stay fixtures. Public routing remains open under #243/#322.
The earlier restored-dump supplied-actor ACL finding is historical: fresh hosted
ACLs deny anon/auth execution; 191 adds explicit drift protection. Root performed
the sole production migration sequence and final promotion. Broader agency
#245/#255/#263 and the flags-off app authority acceptance remain open.
Canonical model reconciliation remains pending because main revision 8 and
integration revision 7 contain independent evidence; the handoff preserves the
proposed delta and exact merge action without replacing the main checkout.
## Provider website workspace access, October 8, 2026

Prepared code for #245 lists a named provider's client workspace through
`read_version_actor` without creating a direct membership. Seat-only saved reads
and writes are restricted to `websites/website`; exact delegated work keeps its
existing grant. General workspace controls, inquiry entry, inquiry/booking
connection selection and Ask do not gain member authority from this projection.
#241 remains Jacob's decision. The website checkpoint migration
`20261018110000_provider_seat_website_access.sql` keeps identity, resource,
revision, exit and existing owner/customer launch checks. Native forward,
rollback and reapply tests exercise real website creation/checkpoint RPCs;
browser proof uses fictional responses. No production migration, provider write
or customer adoption is established. #245's broader relationship lifecycle
and decision requirements remain open.

## Current product work

Jacob's October 1 direction makes managed delivery the default for managed
clients, while retaining creation tools for agencies and people who deliberately
choose to build. Clients provide business information, judgment and approvals;
Strelva handles setup, testing, delivery and agreed maintenance. The website
remains clear and directly accessible: its name and domain, live-site link,
verified status, change requests and previews awaiting review. Clients should
not have to manage Strelva's software or agents. The
[managed-client direction](./docs/product/horizontal-product-brief-2026-09-11.md#october-1-managed-client-default-and-website-clarity)
owns the acceptance requirements. This selects behavior, not implemented
completion, proven delivery economics or new commercial terms.

Use **The Mooney Firm, attymooney.com**, as the default product example and
walkthrough from now on. The [website release focus](./docs/product/horizontal-product-brief-2026-09-11.md#september-20-website-release-focus)
records this choice and links its existing customer acceptance requirements.

Jacob's September 21 direction keeps Strelva's agency website delivery and
independently useful native business tools in the same product. A customer who
hires Strelva must not have to build the website themselves. A native-tool user
must not need a website purchase. The agency intends a 24-hour website offer;
its accepted scope, clock start and delivery definition still require explicit
commercial selection before publication. No price, refund or unlimited-work
policy is implied. The September 20
[website release focus](./docs/product/horizontal-product-brief-2026-09-11.md#september-20-website-release-focus)
is historical where it makes self-service websites the primary release gate. Read the [website release review](./docs/operations/strelvav2-horizontal-acceptance.md#website-release-review)
for the distinction between existing managed sites, new customer creation and
outside-site connection. The subsequent [self-service implementation record](./docs/operations/strelvav2-horizontal-acceptance.md#self-service-website-implementation-follow-through)
records the working local creation, private preview, approval and downloadable
website flow. Launch preparation currently prepares files; it does not deploy
the website or connect a domain. Supporting workspace capabilities remain available
according to their own evidence; the new focus does not certify a self-service
website builder or change existing customer obligations.

The September 20 completion work prepares shared version `0.2.0` as an
Unreleased candidate. The [current execution record](./docs/operations/strelvav2-horizontal-acceptance.md#september-20-completion-execution)
owns the latest implementation and verification state; [the completion plan](./todo.md#september-19-completion-plan)
separates local work from operating and production requirements.

The September 16 [transition and hypotheses](./docs/product/horizontal-product-brief-2026-09-11.md#september-16-transition-and-hypotheses)
explain the move from hiring Strelva for defined delivery toward using a product
to improve and operate business work. Improving existing work and enabling
previously unaffordable work are equally part of the direction. The
[evidence register](./docs/product/product-reality.md#september-16-transition-hypotheses)
keeps this selected direction separate from unproven adoption and economics.

Jacob's September 15 direction authorizes local implementation of the full
business and offering topology in the
[product brief](./docs/product/horizontal-product-brief-2026-09-11.md). The earlier staff
application journey remains a required regression, not a restriction on broader
work. The [acceptance ledger](./docs/operations/strelvav2-horizontal-acceptance.md) separates
proof from unfinished behavior. Existing customer agreements, native product
authority and production restrictions remain unchanged.

## Language

Workspace terms beyond these live in [GLOSSARY.md](./GLOSSARY.md).

**System:** Something a business made in Strelva that works, such as a
website, proposal, booking page, intake flow or internal app. Its identity
survives changes to how it is built. Draft, Live or Paused; health is separate.
_Avoid_: app, product, module, project (as the customer noun)

**Connection:** What a System reads, acts on, appears in, shares with, depends
on or is triggered by: another System, business facts, a person, an outside
account, a domain. An account binding is one kind; a Connection never grants
authority by itself.
_Avoid_: integration (for the customer noun)

**Possibility:** A working alternative to one or several Systems that a person
can open, use and compare. A suggestion alone is not a Possibility. **Make
real** turns it on.
_Avoid_: idea, recommendation, experiment (for the customer noun)

**Version:** A System adapted to a different context (market, segment, agency
client, location) with lineage to its source. Not an edit or a deploy.
_Avoid_: release, revision, copy, fork

**Business:** The customer organization whose work and records must remain
separate from other businesses. A business is not a website tenant, payer or
agency merely because the same person can access them.
_Avoid_: tenant (legacy storage name only), account, client (for the record)

**Business record:** The one shared set of facts, contacts, requests, bookings
and content that belongs to a business and that every capability reads.
_Avoid_: CRM, knowledge graph, tenant config

**Capability:** Something Strelva's software can do on a business record, such
as answering requests, taking bookings or publishing a website. Businesses
don't buy capabilities directly; Systems are built from them.
_Avoid_: module, product, executable, feature, app (for first-party capabilities)

**Offering:** An outcome a business turns on, named the way the business would
say it ("Never miss a new client"), delivered by one or more capabilities
under stated limits. Human help is the exception path inside it, not the
offering itself. Since October 4, packaging for a System, not the primary
customer noun.
_Avoid_: item, shelf item, package, product, service

**Responsibility:** A condition an offering keeps true over time under stated
limits, such as every inquiry answered within five minutes. It is the unit
Strelva prices and is accountable for.
_Avoid_: retainer, maintenance, service level

**Receipt:** The record that an outside change was made and then read back from
the outside system, with what changed and how to undo it.
_Avoid_: proof, log, evidence (for a single change)

**Provider:** Whoever serves a business beyond the software: nobody
(self-serve), an agency, or Strelva's own agency.
_Avoid_: operator (that's Strelva staff in the console), vendor

**Method:** An agency's reusable way of setting up and running offerings for
its clients. A method carries no customer data, secrets or grants.
_Avoid_: playbook, snapshot, template, recipe

**Customer agent:** An AI acting for a member of the public, such as Google
calling to book or ChatGPT making a reservation. It is not Strelva's agent and
holds no business authority.
_Avoid_: bot, AI customer

**Installation:** An offering configured for one business, with its selected
version and connected resources. Internal binding under a System or Version;
not a customer noun. Installation does not grant new authority or
prove that a human provider accepted service.

**Assignment:** A person's or agent's explicit permission to operate specified
work within agreed limits and time. It does not transfer customer ownership.

**Work:** A finite request, action or result. Work can belong to an installation
or remain independently useful.

**Provider commitment:** The work a provider has actually agreed to take care of.
Requesting a provider is not its acceptance.

**Contribution reward:** An explicitly awarded benefit for helping develop an
offering. It may begin as usage or subscription credit; it is not company equity
or permission to access client information.

## Evidence state

Jacob authorized the full horizontal local implementation on September 12. The
[acceptance ledger](./docs/operations/strelvav2-horizontal-acceptance.md) is the completion
record. The current work adds durable owner-approved execution, private bounded
apps, local scheduling, repeated saved-source investigations, scoped contributions,
source context, runtime cost admission, and the internal learning loop. Results
remain central in the common frame; website requests carry into the governed
composer and document drafting stays in place. Generated app plans create native
private drafts through the existing atomic plan-output receipt.

The isolated Auth/Postgres journeys have exercised actual local persistence,
revocation and native execution. Browser fixtures separately prove interface
behavior. Neither proves production operation, live calendar/provider integration,
real research samples, customer value, or Jacob's human acceptance. Production,
paid calls, live messages, grants and deployments remain unapproved.

- **Latest confirmed product direction:** the
  [horizontal product brief](./docs/product/horizontal-product-brief-2026-09-11.md)
  records Jacob's subsequent decisions: users across organization sizes, fluid
  self-service and managed collaboration, outside agencies and agents, and
  vertical R&D measuring time and financial value. The inquiry migration below
  is one narrow implementation slice, not the whole product or its launch
  sequence. See the [audit and staged plan](./docs/product/horizontal-audit-and-plan-2026-09-11.md).
  These planning decisions do not change live scope, billing or runtime authority.

- **Existing inquiry implementation contract:** the
  [inquiry-first product specification](./docs/capabilities/inquiries/inquiry-first-product-spec-2026-09-11.md)
  governs the September 11 local migration. The
  [acceptance matrix](./docs/capabilities/inquiries/inquiry-first-acceptance-2026-09-11.md) keeps
  implementation and evidence status separate from the selected behavior.
  Work present in the local tree is under review and does not establish release,
  deployment, provider access, live delivery, or customer adoption.

- **Implemented locally:** the shared frame, workspace Home/My work/Explore,
  contextual website navigation, account presentation, and release-gated account
  entry routing are present in the September 7 working changes. The existing
  workspace supports bounded AI Visibility results and scoped agency access;
  the September 12 bounded execution work extends this foundation; it is not an unrestricted agent runtime.
- **Verification:** focused account tests cover invitation processing, release
  gating, managed recovery, operator routing, verified identity, and unavailable
  workspace storage. The production build and focused browser checks pass locally. Native T3
  review covered the shared home, product directory, managed frame, and account;
  automated checks cover narrow-screen navigation, focus, and request flows.
  This is local verification, not release acceptance.
- **Deployed:** this local interface change has not been deployed or enabled in
  production. The earlier [September 7 audit](../.scratch/product-adoption-audit/full-audit-and-structure.md)
  distinguishes live observations from source capability.
- **Operated, adopted, commercial:** managed website agreements and live use
  require the corresponding current evidence. A working shared interface does
  not establish new paid plans, adoption, or accepted service.

## September 11 inquiry migration checkpoint

The inquiry engine, business entry, fixed public form, version-bound intake,
rehearsal UI, publication transaction, receipts, consent controls, and undo now
have local implementation and tests. Production activation remains pending. The [initial implementation checkpoint](./docs/archive/inquiry-first-implementation-status-2026-09-11.md)
is historical. The [horizontal verification record](./docs/archive/horizontal-local-verification-2026-09-11.md)
records the later implementation and authenticated local evidence. Keep
`STRELVA_INQUIRIES_RELEASE` off until that checklist is complete and a separate
production action is authorized.

## Owns

- The common customer frame and the implemented workspace routes and records.
- Managed website access, content, governed actions, approvals, publishing,
  verification, history, integrations, and product-specific billing.
- The internal operator console and the deployed versioned storefront contract.

## Does not own

Company strategy or public marketing presentation; independently operated product
runtimes; customer-specific frontend code; authority implied by a relationship
label; new commercial terms inferred from navigation. Existing client agreements
and provider permissions survive the interface transition.

## September 8 self-service transition

Local changes move `/ai-visibility`, its retained public results, and `/audit`
out of the marketing layout into the common product frame. Website diagnostics
use the existing canonical audit engine; the marketing repository redirects old
entry/report URLs to the product. Anonymous assessment remains available; private
AI Visibility and website-audit saving retain the workspace release gate. Website
audits now support explicit private copies of retained server reports; lead details
and browser-supplied result payloads are not imported. Public result URLs support
reopening while their retained source exists.

Saved-work URLs now include workspace identity. Reload, browser history, sign-in
and failed callback recovery retain the requested result. Missing results have
an explicit unavailable state; handoff acceptance opens the customer's copy and
assessment retry retains its business inputs. The additive September 8 recovery
migration introduces actor-bound attempts, leased execution, a durable result
checkpoint, and atomic completion into one saved work item. Recovery is explicit;
a pre-checkpoint interruption may repeat read-only provider checks. Pending
assessments can be found from the server as well as the same browser session.

Pricing options live in `../.scratch/product-release/pricing-2026-09-08.md`.
No price, new entitlement, production migration, deployment, or release flag was
selected or changed. The product and marketing builds pass locally; live auth,
database and existing-client rollout acceptance remain separate gates. Isolated
PostgreSQL verifies the workspace and recovery migrations; read-only production verification now uses the existing Vercel login and the
production connection from `strelva-admin`, whose domains include `app.strelva.com`.
The identity table is accessible, but workspace tables and RPCs are not exposed
to the service role through PostgREST; the new workspace schema is not available
to the application. No migration or activation was performed. On September
8, public HTTP checks returned 404 for `/workspace` and 200 for `/sign-in`,
`/ai-visibility`, and `/audit`. These do not prove authenticated production behavior.

## Current attention

The [internal product research](./docs/research/strelva-horizontal-product-research.md)
and [evidence register](./docs/product/product-reality.md) examine horizontal capabilities
and product structure. Jacob clarified the high-growth technology-product aim,
with clients becoming product users under subscription/usage pricing. Exploration
keeps app creation, recurring work, interactive shared outputs, and reusable
products open. A general work-centered or agency-delivery default was not
accepted by that research. The October 1 direction above subsequently selects
managed delivery for managed clients while retaining deliberate creation. R&D
is strictly internal. These research options authorize no implementation or
production change.

The [September 12 frontier report](./docs/research/frontier-strelva-2026-09-12.md)
adds a six-month capability delta, 29 source-inspected workflow teardowns, four
product alternatives, and ten proposed demonstrations. Its recommendations are
research, not a newly selected strategy or evidence of general autonomous
operation. Existing authority and release boundaries remain in force.

The [definition of done](./docs/product/strelvav2-definition-of-done.md) proposes separate
acceptance gates for the horizontal interface, working local product and internal
research/learning system, and operated customer offerings. Inquiry screen counts
do not measure horizontal completion. Internal research retains sourced claims,
observations, inferences, unknowns, and contradictory evidence; synthetic users
do not establish demand. These definitions add no production or spending authority.

The [full horizontal acceptance ledger](./docs/operations/strelvav2-horizontal-acceptance.md)
now defines the requested expansion beyond the first slice. Current local work
adds outcome entry, private documents, grouped tracker edits and Undo, task and
project starts, model-backed planning with selected sources, reusable inquiry
updates, cost records, and richer experiment comparisons. Implementation is in
progress; the earlier first-slice verification does not prove these additions.
Jacob will conduct the end-to-end behavior review. Use focused behavior tests,
critical failure checks, and type checking during implementation. Production
remains off, and no audited full-product completion percentage is established.

The [first horizontal scope](./docs/archive/horizontal-first-scope-2026-09-11.md) is selected:
shared inquiry work, CSV trackers, and internal experiment evidence. Its local
implementation passes unit, browser, build, compatibility and isolated storage
checks, including authenticated local journeys. See the
[verification record](./docs/archive/horizontal-local-verification-2026-09-11.md) for the
exact evidence and limits. Provider testing, representative client installation
and production activation remain release gates. Use
the [rollout checklist](./docs/operations/horizontal-release-checklist-2026-09-11.md) to keep
local, authenticated staging, and production evidence separate. Preserve the
inquiry acceptance requirements for any
inquiry release without weakening the existing
shared-navigation, website-continuity, narrow-screen, keyboard, error,
read-only, and account-recovery boundaries. Keep capability and price
availability honest. A submitted capability request is not an accepted delivery
promise, and a local inquiry fixture is not a live handling authority.

## Verify before consequential action

Read [AGENTS.md](./AGENTS.md). Verify the deployed release, tenant membership,
accepted service, billing, and required provider authority before live action.
`STRELVA_WORKSPACE_RELEASE` remains the production workspace gate. Synthetic
routes under `/preview/strelva` require both development mode and
`STRELVA_UI_PREVIEW=1`; they are interface fixtures, not authentication bypasses
or evidence of a production result. Do not enable a release or deploy from the
presence of these routes.

## Context map

- [Operating instructions](./AGENTS.md) and [developer setup](./README.md).
- [Interface contract](./DESIGN.md), [shared frame](./src/experience/app-frame/StrelvaShell.tsx),
  [workspace experience](./src/experience/workspace/WorkspaceApp.tsx), and
  [managed website frame](./src/components/dashboard/ConversationShell.tsx).
- [Testing and CI](./docs/operations/testing-and-ci.md) and
  [persistence boundaries](./docs/architecture/persistence-boundaries.md).
- [Inquiry-first product specification](./docs/capabilities/inquiries/inquiry-first-product-spec-2026-09-11.md)
  and [acceptance matrix](./docs/capabilities/inquiries/inquiry-first-acceptance-2026-09-11.md).
- [Client dashboard surfaces](./docs/architecture/client-dashboard-ia.md) and
  [operator responsibilities](./docs/architecture/operator-command-center.md).

## Agency prospecting (October 7, local)

The `a1/agency-prospecting` stream prepares agency-attributed public checks,
name-only report/email branding, agency-owned prospect capture, membership-only
reads and durable per-agency quota behind the default-off
`STRELVA_AGENCY_PROSPECTING_RELEASE`. Its [stream contract](./docs/product/streams/a1-agency-prospecting.md)
owns the routes, configuration, migration/rollback proof and extension handoff.
This is local implementation, not a production change or evidence of agency
adoption. Extensions and richer agency profiles/branding remain unfinished.
