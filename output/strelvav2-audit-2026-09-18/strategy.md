# Strelva migration: business strategy and product-experience audit

Date: 2026-09-18

Scope: the migration from a Website-led managed service toward a horizontal
product businesses can use to improve and operate their work. This is a
read-only audit of the current repository, the workspace context, the latest
horizontal brief and acceptance records, the public-entry research, and the
local implementation. It scores evidence strength, not code-completion
percentage.

`PRODUCT_STRATEGY.md` was not present in the repository, workspace, or agent
configuration paths searched. The accepted ADRs, root context, repository
context, dated product brief, product-reality register, and source code are the
available decision record.

## Judgment

The migration has produced a serious local control plane and a credible
customer-experience testbed. It has not yet proven the business transition.

The strongest evidence is around authority, ownership, durable state, recovery,
release semantics, and a shared frame around real Managed Websites work. The
weakest evidence is first-value comprehension, repeat use, paid continuation,
support-inclusive margin, and any advantage over a capable general assistant
used with native business tools.

The right strategic posture is to keep the full horizontal direction while
proving a narrow customer promise at a time. The first proof should be a
complete result that can lead to a second, materially different job. A narrow
proof corridor is sequencing; it is not a smaller definition of the company.
The staff application and inquiry work remain useful regression cases, but the
September 15 brief explicitly says the staff application is an acceptance
journey rather than a product ceiling (`docs/horizontal-product-brief-2026-09-11.md:133-137`,
`docs/horizontal-product-brief-2026-09-11.md:166-185`).

The migration should be judged on this chain:

```text
useful first result
  -> saved or portable result
  -> customer puts it to work
  -> verified outcome and recoverable history
  -> second job or continued responsibility
  -> paid continuation with falling human effort
```

The repository currently proves parts of the first four steps locally. It does
not prove the last two with customers.

## Evidence scores

Scale: 0 means no meaningful evidence; 10 means repeated, observed customer
and commercial evidence across more than one context. A high score can coexist
with unfinished implementation. A low score does not mean the idea is wrong;
it means the next decision should be an experiment rather than a claim.

| Dimension | Score | What supports it | What is missing |
| --- | ---: | --- | --- |
| Direction coherence | 7/10 | The September 15/16 brief clearly defines a horizontal offering, installation, assignment and responsibility shape (`docs/horizontal-product-brief-2026-09-11.md:31-88`, `:97-131`). | First offering, first repeated job, success thresholds, exact price and release composition remain open (`docs/horizontal-product-brief-2026-09-11.md:272-276`). |
| Customer problem evidence | 3/10 | Managed Websites supplies a real operating base; research records several plausible workflow problems and counterevidence. | The nine transition hypotheses remain unvalidated; current interviews, product usage and customer outcomes are absent (`docs/product-reality.md:23-49`, `docs/product-reality.md:113-120`). |
| Authority and trust mechanics | 8/10 | Local routes, SQL checks and browser journeys cover membership, grants, stale versions, revocation, publication, rollback and duplicate protection (`docs/strelvav2-horizontal-acceptance.md:61-82`). | Provider operation, production identity, real external effects and human acceptance remain unverified. |
| Durable local product behavior | 8/10 | The ledger records local Auth/Postgres journeys for applications, records, handoffs, ongoing work, budgets and recovery (`docs/strelvav2-horizontal-acceptance.md:55-82`, `:120-166`). | Some new topology browser proofs still use fictional adapters; the complete model creation path is fixture-backed. |
| Horizontal capability breadth | 5/10 | Applications, documents, trackers, investigations, scheduling, ongoing work, offerings and agent access have source contracts. | Most new capabilities are release-gated or local; provider connectors, custom deployment and general execution are open. |
| First-value legibility | 4/10 | Examples, free text, result previews and continuation exist in the local frame (`src/experience/workspace/WorkspaceStart.tsx:169-200`). | The lexical router is brittle, several visible paths are unavailable, and the first result is often described in internal terms such as “shape” or “plan.” |
| Product experience continuity | 5/10 | Stable workspace/work links, recovery state, shared navigation and product-specific deep links are implemented locally (`src/experience/workspace/WorkspaceApp.tsx:138-205`). | The current `WorkspaceApp` path carries a website request through a short-lived session-storage draft into the site's chat; the manual copy/open panel is only the `WorkspaceLayout` fallback when no website handler is supplied. Business settings depend on a linked website; role-specific direct-use journeys are incomplete (`src/experience/workspace/WorkspaceApp.tsx:677-685`, `src/lib/website-request-draft.ts:1-20`, `src/app/dashboard/chat/ChatPageClient.tsx:26-36`, `src/experience/workspace/WorkspaceStart.tsx:88-94`). |
| Differentiation versus general AI and native tools | 3/10 | Governance, source-specific authority, verification and recovery could form a real advantage; the repository already has more control detail than a blank chat. | Local research says general assistants and incumbents already provide connected work, app generation, scheduling, approvals and recovery. No equivalent-access comparison has been run (`docs/product-reality.md:61-64`, `:85-90`). |
| Activation and acquisition | 3/10 | Public-entry research proposes examples plus a request field, and the local workspace has concrete examples (`docs/research/public-entry-architecture-2026-09-15.md:6-14`, `:74-117`). | A dated public-contract discrepancy needs re-verification; anonymous-to-result-to-save has not been exercised as a live acquisition path; no cohort evidence exists. |
| Retention and expansion | 2/10 | Saved work, handoffs, installations and ongoing records create possible return paths. | No observed second job, recipient return, ongoing use, or continued responsibility. Diagnosis is not retention (`/Users/jacobrhinehart/Desktop/strelva/.scratch/product-adoption-audit/audit.md:95-97`). |
| Distribution and agency loop | 3/10 | Agency identity, scoped handoffs, destination selection and revocation are modeled and locally tested. | No two-agency/two-customer delivery cohort, no agency payer/support model, and no evidence that recipients become users. |
| Economics | 2/10 | The direction specifies subscriptions, included work, understandable usage, a spending limit and one payer per job (`docs/horizontal-product-brief-2026-09-11.md:213-233`). | No measured fully loaded cost, willingness to pay, subscription synchronization, provider charge, or margin. Local allowances are explicitly not billing proof. |
| Migration/release readiness | 4/10 | Local checks are broad and the ledger correctly separates local proof from release acceptance (`docs/strelvav2-horizontal-acceptance.md:41-59`, `:104-116`). | No live migration, no production deployment, no real model/provider call, and pending human review. A dated release-identity discrepancy in the records needs current verification before release; it is not evidence of a current public version. |
| Customer/revenue proof | 1/10 | Root context records nine customers as of August 14. | That record does not establish current collection, use, margin, accepted responsibility, renewal or result (`/Users/jacobrhinehart/Desktop/strelva/CONTEXT.md:99-121`). |
| Internal learning loop | 6/10 | Product-learning records, source collection, candidate comparisons and evidence states exist locally. | No live cohort, frontier trial, customer outcome or post-release learning cycle has been observed (`docs/product-reality.md:3-10`, `docs/strelvav2-horizontal-acceptance.md:120-166`). |

## How the older and newer strategy fit together

The older accepted decisions still matter at the boundary level:

- Managed Websites remains the commercial and operating base.
- A product owns its domain mandate, credentials, native execution, result,
  verification, recovery, support and economics.
- A bounded free result can precede a paid product or accepted responsibility.
- Continued responsibility requires a real workflow, an owner, willingness to
  pay, safe authority transfer and a credible path to falling human effort.

The newer September 15/16 direction expands what can be built and who can use
it. It moves from “hire Strelva to deliver a defined asset” toward a product
that improves and operates work customers already do, or makes worthwhile work
possible (`docs/horizontal-product-brief-2026-09-11.md:31-52`). Owners,
employees, agencies, Strelva staff and external AI can participate, while
ownership, payer, provider, approver and acting person remain separate
(`docs/horizontal-product-brief-2026-09-11.md:106-125`).

That is a sequencing change, not a relaxation of proof. The brief says the
inquiry-first and agency-first assumptions are superseded as overall scope, but
their implementation contract remains evidence for the existing slice
(`docs/horizontal-product-brief-2026-09-11.md:256-270`). The acceptance ledger
also says the old staff journey remains a regression and that adding output
types cannot compensate for an incomplete owner journey
(`docs/strelvav2-horizontal-acceptance.md:20-28`).

The unresolved tension is between the broad customer promise and the current
entry architecture. The direction says people should receive value without
knowing product names or completing organization setup (`docs/horizontal-product-brief-2026-09-11.md:20-29`).
The local workspace currently authenticates before loading private work
(`src/app/api/workspace/route.ts:181-192`), routes free text through a narrow
lexical classifier (`src/experience/workspace/workspace-start.ts:136-166`), and
often turns unsupported or unavailable requests into help. This is acceptable
for a local release gate. It is not yet the experience implied by broad
horizontal discovery.

The company should therefore preserve both levels:

1. A broad product direction and shared authority model.
2. A small number of complete, evidence-producing proof corridors.

Do not interpret “prove one job” as “return to an inquiry-only product.” Do not
interpret “build the whole topology locally” as “the company now has a
horizontal product.”

## What the migration has actually achieved

The implementation has real substance.

The shared frame connects Home, Work, Ongoing, People & access, Settings,
utilities, account and contextual Managed Websites. The API keeps the catalog
descriptive and enforces authority in executing use cases
(`src/experience/app-frame/StrelvaSidebar.tsx:10-31`,
`src/app/api/workspace/route.ts:163-230`). This is a sound boundary: a visible
offering does not silently become an entitlement or execution permission.

The local application path now separates candidate definitions, released
definitions and records. The acceptance journey covers sharing, submissions,
exact review, publication, rollback, conflict handling and revocation
(`docs/strelvav2-horizontal-acceptance.md:61-82`). Ongoing work separates
standing policy, admitted jobs, runs and receipts in the local schema
(`supabase/migrations/20260914040000_standing_responsibilities.sql:1-19`).

The economic and authority substrate is ahead of the commercial proof. Runtime
admission reserves configured allowance, records usage and prevents replay in
local tests, but the ledger explicitly says there is no Stripe synchronization,
customer price, provider charge or royalty evidence
(`docs/strelvav2-horizontal-acceptance.md:32-48`,
`docs/strelvav2-horizontal-acceptance.md:120-166`). That is good engineering
honesty, but it leaves the central business question open.

The implementation has also preserved product boundaries better than a generic
“AI workspace” would. The catalog says it is descriptive rather than an
authorization, billing or provider-configuration source
(`src/platform/products/catalog.ts:3-9`). Managed presence remains a tenant
resource; the shared workspace receives a narrow link rather than tenant
credentials or configuration (`src/experience/workspace/contracts.ts:73-87`).
Offering copy distinguishes a requested provider from an accepted provider
commitment (`src/experience/workspace/WorkspaceOfferings.tsx:303-307`). These
details support a defensible trust position if customers value them.

The migration is still locally bounded. The latest ledger says no migration has
been applied to a live database, no customer price or allowance has changed,
new browser proofs use fictional adapters, no live model/provider call was made,
and human product acceptance is pending (`docs/strelvav2-horizontal-acceptance.md:41-59`,
`:76-90`). The result is a local implementation proof, not an operated product.

## Business strategy audit

### The customer problem is still a hypothesis

The transition brief is unusually clear about what must be measured. TH-01 to
TH-09 require independent useful results, recovery from ordinary errors,
improvement against today's baseline, bounded access, meaningful handoffs,
repeat use, paid continuation and falling intervention cost
(`docs/horizontal-product-brief-2026-09-11.md:54-83`). The evidence register
confirms all nine remain unvalidated (`docs/product-reality.md:23-49`).

This means the current strategic question is not “which feature should ship
next?” It is “which complete customer result can make the transition observable
without hiding its costs?” Each trial needs a baseline: today's workflow, tools,
people, elapsed time, correction and review, cash cost, quality, and what the
customer would do if Strelva were absent. The brief explicitly requires these
comparisons and warns that time released is not automatically cash saved
(`docs/horizontal-product-brief-2026-09-11.md:77-88`).

The nine-customer record is useful as access and trust context, not proof of a
horizontal market. Reconcile each relationship before using it as evidence:
accepted obligation, payer, collected amount, deployed release, configured
capability, meaningful use, latest result, unresolved exception and next
obligation (`/Users/jacobrhinehart/Desktop/strelva/CONTEXT.md:99-121`).

### General AI is a real control, not a straw competitor

The local research correctly rejects differentiation based only on chat,
generation, persistent context, scheduling, memory, browser operation,
permissions or a larger model. Its evidence register records app generation,
permissions, approvals, execution history and recovery in current alternatives,
and connected, scheduled, multi-step work in current general assistants
(`docs/product-reality.md:61-64`, `:85-90`).

The relevant comparison is a capable person using a general assistant alongside
the native systems already in the business. Strelva wins only if it reduces
total work or carries a responsibility the other combination leaves with the
customer. A feature comparison will mislead. Run the same case with equivalent
data, authority and failure conditions. Count setup, review, corrections,
support, retries, provider costs and recovery, not only successful model steps.

The potentially defensible difference is a qualified business obligation:

- the right business and resource are selected;
- authority and spend are explicit and rechecked;
- the customer can see what will change;
- a provider write is distinguished from a verified effect;
- an accepted write is not retried after an uncertain read-back;
- a human receives a concrete exception or decision;
- the system carries the case through waiting and recovery; and
- the product can support the boundary at a known cost.

The repository has many of these mechanisms locally. It has not demonstrated
that customers value them enough to switch, return or pay. The moat is a
hypothesis about dependable responsibility, not a present market fact.

### Acquisition and activation

The strongest public-entry research recommends concrete examples people can
inspect and change, with a plain-language request field beside them. It says to
continue into the same result when someone saves or uses it, and to reveal
connections, business selection, cost and human help only where needed
(`docs/research/public-entry-architecture-2026-09-15.md:6-14`). That fits the
horizontal brief better than a product catalog or generic chat landing.

The local workspace has five examples and a free-text request. The proposal
then asks the person to “Show me the shape,” presents parts, and sends the user
to a supported route (`src/experience/workspace/WorkspaceStart.tsx:169-200`).
That is understandable as an implementation seam, but “shape,” “plan,” and
“route” are internal concepts. The visitor needs to know the result they will
receive, what they can change, and what will happen to the result afterward.

The classifier is a material activation risk. It uses weighted regular
expressions for a small set of phrases (`src/experience/workspace/workspace-start.ts:136-166`).
For example, “Build an app for my team” matches the explicit `build an app`
signal, while the natural “Build a staff request app” does not match that
pattern and can fall into help. The home composer itself hardcodes the former
phrase as “Build an app” (`src/experience/workspace/BusinessHome.tsx:317-324`).
This is exactly the kind of wording failure that can make a broad product feel
smaller than it is. Treat it as a measurable activation problem, not a copy
polish issue.

Availability also affects trust. The workspace adds executable product entries,
but current application, scheduling, investigation and operations entries are
all marked `release_gated` (`src/platform/products/executables.ts:21-46`). The
API maps release posture to `available`, `managed`, `release_gated` or
`not_enabled` and sends the catalog separately from execution authority
(`src/app/api/workspace/route.ts:163-174`, `:209-216`). The UI should make a
release-gated possibility useful as an honest request or example, not a false
promise of immediate use.

The public acquisition contract also needs one answer before demand increases.
A dated, historical root-context record describes both a separately quoted
custom build and a free-build or pay-after-approval claim on public surfaces
(`/Users/jacobrhinehart/Desktop/strelva/CONTEXT.md:256-266`). That record is not
current pricing evidence; reverify the public contract before treating it as a
live conflict. A visitor cannot infer whether Strelva is a product, a service,
or both when the first commitment is unclear. The product and managed-service
paths can coexist, but their buyer, result, timing, price basis and acceptance
boundary must be visible.

### Retention and expansion

The planned expansion loop is plausible: a useful result is saved, put to work,
shared with another person, changed later, or connected to an ongoing
responsibility. The local frame supports stable work identity, result history,
handoff, installations and ongoing records. Home also avoids inventing activity:
only recorded exceptions and proposed work enter attention
(`src/experience/workspace/workspace-home.ts:3-20`).

There is no evidence yet that a customer returns for a second need. Account
creation, a saved assessment, a sent message or an installed offering should not
be counted as retention. The relevant event is a customer who obtains one
complete result and voluntarily starts another useful job, or retains a bounded
responsibility after a real exception. The older adoption audit makes the same
distinction (`/Users/jacobrhinehart/Desktop/strelva/.scratch/product-adoption-audit/audit.md:95-97`).

The first retention test should cross adjacent jobs rather than repeat one
screen. Examples: a website finding leads to a prepared change; an intake or
tracker leads to an ongoing check; an interactive result leads to a recipient
using or adapting it. Record why the second job began and what context carried
over. If no second job appears, that is evidence about the first result's value,
not a reason to add more navigation.

### Economics and packaging

The selected direction is generous subscription plus included work, clear usage,
a customer spending limit and one payer per job. Higher subscriptions may include
bounded human help; exact price, allowance, metering and results-based pricing
remain open (`docs/horizontal-product-brief-2026-09-11.md:213-233`). This is a
reasonable packaging direction, but it is not yet a business model.

Local allowance records are not subscription billing. The ledger says actual
subscription synchronization, customer prices, royalties and provider operation
remain open (`docs/strelvav2-horizontal-acceptance.md:32-48`). The current
generation path also has no dollar-budget enforcement or usage receipt
(`docs/strelvav2-horizontal-acceptance.md:84-90`).

Before selecting a recurring responsibility price, measure:

```text
fully loaded cost per verified result
= model + tools + runtime + retries + review + support + setup + maintenance
  / verified results

customer time released
= today's effort - setup - learning - review - correction - exception effort
```

Keep customer time, Strelva labor, cash cost and business outcome separate. A
cheap model call does not settle the economics if review or exception work
dominates. The root context records a 60–90-day shadow-evidence gate for a new
responsibility price, including fully loaded contribution margin, p95 exception
and recovery cost, and a bounded loss case
(`/Users/jacobrhinehart/Desktop/strelva/CONTEXT.md:256-258`). Reconfirm that
recorded gate before treating it as the current pricing policy.

The dated $19 prepared website improvement proposal is a useful experiment,
not an accepted price or entitlement. If used, it must have a concrete artifact,
verification receipt, failure/refund rule, support boundary and known maximum
human intervention (`/Users/jacobrhinehart/Desktop/strelva/.scratch/product-release/pricing-2026-09-08.md:5-22`,
`:30-40`).

### Distribution and agencies

Agencies are a promising distribution and operating path because they already
hold customer context, but the product direction deliberately treats agency as
a role and commercial relationship rather than a tier. The local handoff work
gets important details right: explicit destination business, optional scoped
read access, revocation and preservation of customer-owned work
(`src/app/api/workspace/route.ts:42-50`, `:247-291`).

The missing evidence is operational. An agency must be able to deliver the same
qualified result to multiple customers without a code fork, private data leak or
unclear support duty. The customer must retain direct control after the agency
leaves. A two-agency/two-customer cohort is stronger evidence than more agency
navigation.

### Horizontal versus vertical

The foundation should stay horizontal, while R&D investigates verticals where
access, economic opportunity, reuse and learning transfer justify it
(`docs/horizontal-product-brief-2026-09-11.md:235-254`). Buffalo is the first
proving ground and relationship advantage, not a permanent customer ceiling
(`/Users/jacobrhinehart/Desktop/strelva/CONTEXT.md:237-239`).

Do not choose a vertical from the current portfolio alone. Do choose a bounded
workflow where Strelva can obtain permission, observe the baseline and measure a
result. The vertical becomes strategic only after multiple businesses show
repeatable outcome and support-inclusive economics.

## Product-experience audit

### The product is broad in the model and narrow at the moment of choice

The shared frame is a good container, but the user still has to understand a
large internal topology: Work, Ongoing, People & access, Settings, offerings,
applications, documents, trackers, inquiries, assessments, managed websites,
assignments and agent access. The product brief says applications, documents and
websites should be types of work rather than required permanent navigation
categories (`docs/horizontal-product-brief-2026-09-11.md:148-164`). The current
sidebar follows that principle reasonably well (`src/experience/app-frame/StrelvaSidebar.tsx:19-31`).

The risk moves into Home. Home displays four metrics, a business illustration,
destinations, attention, recent work, offerings, allowances and a composer
(`src/experience/workspace/BusinessHome.tsx:144-149`, `:232-355`). This can
make the company feel substantial, but it may ask a new user to interpret a
system before receiving a result. Test whether the first screen helps a person
choose and complete work faster than a result-first example. Do not assume that
more visible capability equals more perceived value.

### Business identity is not yet independent of Website

The product brief makes the business the enduring home, and the migration has
customer workspaces. In the actual settings surface, however, business controls
are linked to an authorized website and the empty state says business
information, connections and domains become available only after a website
installation is linked (`src/experience/workspace/WorkspaceBusinessSettings.tsx:58-88`).

This is a product-scope gap, not evidence of bad tenant isolation. The data
boundary can be correct while the experience still tells a new non-Website
business that it does not fully exist. Before broad product acquisition, give an
independent business a minimal identity, people/access, context and billing
home. Deep-link Website settings when a Website is present; do not make Website
the existence condition for the business.

### The result should remain the center of the loop

The current implementation already has a good principle: Home derives attention
from recorded work state and does not call waiting work a failure
(`src/experience/workspace/workspace-home.ts:3-20`). The app acceptance contract
also keeps the released application usable while a candidate changes and
requires exact review, publication, rollback and record preservation
(`docs/strelvav2-horizontal-acceptance.md:61-82`).

Carry that principle into every product surface. The customer should see:

- the result or live thing they care about;
- what Strelva observed or changed;
- the current state and next decision;
- the authority and cost being used;
- the exact recovery path; and
- the next useful action.

Drafts, plans, runs and agent traces can support inspection. They should not
become destinations the customer must assemble to finish a job.

### Roles need separate experiences

The topology correctly distinguishes owner, employee, agency, Strelva staff,
provider and external AI. The source also has a direct application route and
scoped personal-AI access. The product experience should preserve those distinct
surfaces. An employee should open the task they need without seeing owner setup;
an agency should see only explicitly delegated customers; a provider request
should not look accepted; an external AI caller should receive an API result, not
a forced dashboard.

The acceptance ledger says direct application use, installation-scoped agency
permissions, branded portals and broader agent execution remain incomplete
(`docs/strelvav2-horizontal-acceptance.md:120-166`). Treat this as a set of
role-specific product proofs, not a reason to add more general navigation.

### Trust language is a strength worth preserving

The local offering view states that a requested provider does not mean that the
provider accepted the work (`src/experience/workspace/WorkspaceOfferings.tsx:303-307`).
The API refuses cross-origin mutations, checks confirmed identity and separates
unavailable work from internal errors (`src/app/api/workspace/route.ts:234-245`,
`:66-83`). These details can become a customer-facing advantage if expressed in
plain language at the moment of commitment.

Do not turn “governed,” “qualified,” “responsibility,” or “agent identity” into
marketing abstractions. Say who can act, what will happen, what was verified,
what remains uncertain and who owns the next decision.

### Visual and accessibility evidence remains local

The latest ledger records desktop/mobile fixture inspection and broad local test
passes, but it also says Jacob's human review remains pending and that no
production verification is claimed (`docs/strelvav2-horizontal-acceptance.md:55-59`,
`:92-94`). A visual system can support trust, but it cannot resolve first-value
confusion, product availability or paid value. Use the visual work to make
results, state and next action easier to see; do not use it as evidence of
adoption.

## Strategic alternatives worth keeping visible

These are three proof lanes, not three new products or a request to shrink scope.

| Lane | Customer promise | Why Strelva could win | Main risk | Evidence needed now |
| --- | --- | --- | --- | --- |
| A. Keep a bounded business condition true | Strelva monitors a supported condition across existing systems, takes permitted action, and returns exceptions or proof. | Existing Website/inquiry governance, authority and recovery are closest to this. | Exception labor turns each account into bespoke service. | One repeated responsibility in two unrelated businesses; measure intervention and p95 recovery. |
| B. Make the smallest software the business needs | Strelva turns an existing process or file into a usable application and maintains it through later changes. | Local application lifecycle, installation and record-preservation work give a concrete testbed. | App generation is crowded; long-tail maintenance can destroy margin. | First build, recipient use, later rule change and recovery against native builder plus general AI. |
| C. Become the trusted business action another agent calls | An outside assistant requests a scoped operation; Strelva checks authority, prepares, applies only when approved and returns evidence. | Product-owned Website authority and verification can remain the source of truth. | Platform dependence, low take rate and direct provider APIs can commoditize wrappers. | One real read/propose operation, revocation, accepted-but-unverified state and cost comparison. |

The best near-term order is A or B for customer evidence, with C tested early
enough to avoid building a product that assumes users will move their daily
behavior into Strelva. Shared substrate work is justified only when two real
products reuse an invariant with measurable maintenance, reliability or cost
leverage. The root context sets that gate explicitly
(`/Users/jacobrhinehart/Desktop/strelva/CONTEXT.md:256-258`).

## Validation program

The following experiments preserve the full direction and produce evidence that
can change the product choice.

### 1. Entrance and wording comprehension

Run the same three intentions through the public example path, free-text path
and authenticated Home: a website improvement, a staff request application and a
tracker or recurring check. Include natural variants such as “Build a staff
request app,” “make a form for my team,” and “keep customer requests from being
missed.”

Measure whether the person can state the expected result, whether the route is
correct, time to the first useful preview, recovery after an unavailable path,
and whether they need founder explanation. A lexical match is a routing defect
when a reasonable person expresses the same intent in ordinary language. Keep
the outcome copy result-oriented. Do not optimize click-through to a dead-end
release-gated flow.

### 2. One complete result against real substitutes

Choose one supported Website or inquiry result and one adjacent software result.
For each, record today's method, a well-configured native-tool baseline, a
capable general-assistant baseline and Strelva. Use equivalent permitted data
and failure cases. Count setup, learning, review, correction, support, provider
cost, retries, completion time, quality, exception handling and customer
acceptance.

Pass evidence requires a complete portable or applied result with explicit
verification and recovery, plus lower total customer effort or a materially
better outcome at an acceptable cost. A successful local fixture or one model
run is not a pass.

### 3. Second-job retention

Invite people who completed the first result to return for a different useful
job within a defined observation window. Preserve the same business, history
and permissions, but do not make the second job a forced upsell. Record whether
the second job began because the first result changed trust, revealed another
need, or simply triggered a sales follow-up.

The key event is voluntary second use with a finished result. Account creation,
an invitation, an assessment save or a request for an unavailable capability is
not a substitute. This directly tests TH-01, TH-02 and TH-05
(`docs/horizontal-product-brief-2026-09-11.md:58-68`).

### 4. Reuse and maintenance across two businesses

Install one bounded offering into two independently owned businesses. Keep
records, grants, credentials and local choices separate. Apply a later update;
the released version must remain usable while the candidate is prepared. The
second business should not require a code fork or founder rewrite.

Measure setup minutes, support minutes, local adaptation, conflict rate,
rollback/recovery and the cost of updating both installations. This tests TH-07
and reveals whether shared capability is real reuse or merely repeated bespoke
delivery.

### 5. External-agent caller

Use a single scoped read/propose operation on a real or explicitly permitted
fixture. The caller should identify the business and resource, receive the exact
approval requirement, and distinguish accepted, verified, uncertain and denied
states. Revoke access before a second call and confirm no new action occurs.

Compare the caller's total effort with direct dashboard use. If the agent path
adds setup without removing customer work, it is an integration demo rather than
a product advantage.

### 6. Shadow economics before a recurring price

Instrument each trial without storing private inputs: model and tool usage,
elapsed time, attempts, retries, storage, support, founder intervention,
correction, provider failure, verification age and result status. Assign one
customer-visible unit to the job and keep unknown usage unknown.

Run enough cycles to estimate ordinary and p95 exception/recovery cost. Use the
company's 60–90 day shadow-economics gate before pricing a continuing
responsibility. A one-off prepared artifact can be tested earlier, but it still
needs a completion, failure, refund and support boundary.

## Gates before broad public promotion

1. One complete result is useful without requiring the person to understand
   product names, and identity is requested only when saving, connecting,
   authorizing or continuing requires it.
2. Every visible action has truthful availability. Release-gated capabilities
   become examples or requests with an honest next step, not fake install paths.
3. An independent business can exist without a linked Website. Website settings
   deepen that business when present; they do not define its existence.
4. One supported job has been observed end to end with explicit authority,
   verification, recovery and customer acceptance.
5. A second useful job or continuing responsibility occurs without founder
   reconstruction of the entire context.
6. Customer, provider, payer, approver and acting person remain distinct in the
   actual journey.
7. Fully loaded support-inclusive economics are measured before a recurring
   responsibility price or broad allowance is promised.
8. Production migration, release identity, provider operation, rollback and
   human acceptance are separately verified. Local tests remain local evidence.

## Decisions that still need a deliberate choice

- Which two proof corridors should represent the broad product in the next
  customer cohort: Website/inquiry, small application/tracker, or another
  permitted workflow?
- Is the first free result a prepared Website improvement, a different complete
  product result, or one of several examples with a common save/return path?
- What exact public sentence separates product use, managed help and an
  unaccepted request for service?
- When an agency participates, who pays, who supports the work, and what remains
  when the agency leaves?
- What evidence will make a capability supported, and what evidence will cause
  it to be declined or replaced?

The implementation can continue locally against the full horizontal acceptance
ledger. The business should make no stronger claim until the next result,
second-use and economics experiments answer these questions with observed
behavior.
