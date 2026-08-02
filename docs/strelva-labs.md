# Strelva Labs

Status: **working product specification; not yet a selected commercial product**
Created: 2026-08-02

This document captures the long-term product direction and initial validation
plan for Strelva Labs. It is intentionally more ambitious than the current
managed-website offering, but it does not supersede `product-ontology.md`, the
current roadmap, or existing commercial commitments until evidence promotes a
specific Labs direction into product truth.

## Product thesis

Strelva Labs is the place where a person or organization can turn a real goal
into a working, governed experiment.

The user describes what they want to make possible and supplies whatever
context they have. Strelva constructs the necessary combination of software,
intelligence, and tools; runs it within an explicit authority boundary; returns
a working artifact with evidence; and lets the user keep successful experiments
running.

Skills, agents, applications, analyses, and workflows are possible output
forms. They are not separate product categories that the user must understand
before receiving value.

The long-term company thesis is:

> Strelva lets AI change real systems without losing control of what changed,
> who approved it, or whether it worked.

Labs is the public proving ground for that thesis. Governed execution and
verified outcomes are the platform underneath it. Paid websites are the first
mature production application of that platform.

## Mission

Make advanced AI immediately useful to people and organizations, beginning in
Buffalo, while building the trusted execution layer required for autonomous
software to operate in the real world.

Buffalo is the launch network, not the permanent ICP boundary. Early users can
include businesses, nonprofits, institutions, founders, builders, operators,
and teams. The product should be globally usable even while local density and
trust make the initial learning loop faster.

## Relationship to the current Strelva business

Strelva's selected business remains paid managed websites with a software
control plane. Labs does not make managed websites free and does not silently
bundle unvalidated AI delivery into the existing Presence, Growth, or Scale
plans.

The relationship is:

- **Strelva Websites** is a paid production capability with ongoing managed
  delivery, publishing authority, verification, and reporting.
- **Strelva Labs** is a low-friction environment for trying useful ideas and
  proving demand before turning them into persistent systems.
- Existing website clients can receive richer Labs experiments because Strelva
  already has their content, analytics, business rules, connections, and a
  governed path to production changes.
- A free Labs user may analyze public website information or simulate a change,
  but does not receive a free custom website repository, managed publishing, or
  an ongoing website service.

Labs should initially be commercially separate from website subscriptions.
Pricing and packaging for persistent experiments must be earned through
observed usage, delivery cost, and willingness to pay.

## Product principles

### Begin with the desired outcome

The first question is `What should Strelva try?`, not `Which agent do you want?`
Strelva chooses the internal form required to produce the outcome.

### Ship before selling

The first meaningful interaction should produce value. A useful experiment,
artifact, or verified result should precede a discovery call or proposal
whenever the authority and cost boundary permits it.

### Every action has an authority envelope

An experiment must state what context it may read, which tools it may call,
which actions it may take, which actor can approve those actions, and where it
must stop. Model access to a tool never implies actor authority or provider
permission.

### Provider acceptance is not proof

An API returning success proves only that the provider accepted the request.
Labs should distinguish:

`proposed -> approved -> accepted -> verified -> propagated -> outcome observed`

These states must not collapse into a generic success message.

### Correctability is part of the product

Every consequential experiment should provide an explicit correction,
recovery, or rollback path. When an external side effect cannot safely be
retried or reversed, the product must make that limitation visible before
execution.

### Free experiments must compound

A generous experiment should improve at least one durable Strelva asset:

- a capability contract;
- an authority policy;
- an integration adapter;
- an evaluation or reliability record;
- an outcome receipt;
- a reusable understanding of a repeated customer job.

A free tool that produces no learning, reusable capability, distribution, or
retention should not remain part of Labs.

### Hide machinery without hiding consequences

Users should not need to understand models, frameworks, protocols, or tool
selection. They must understand the intended action, source context,
permissions, expected result, uncertainty, and actual outcome.

## Core customer experience

### 1. Ask

The user enters a goal in ordinary language and may add a public URL, files, or
connected context.

Examples:

- Find why customers abandon our catering inquiry and make a better version.
- Create something that answers repetitive vendor questions using our actual
  policies.
- Watch these sources and tell us when an important fact changes.
- Build a simple tool customers can use to estimate their savings.
- Determine which products should be bundled and let us test the bundle.
- Keep our public hours, booking state, and temporary closures consistent.

The same entrance should support a one-time analysis, generated interface,
recurring monitor, governed action, or persistent agent without asking the user
to select one of those implementation forms first.

### 2. Preview the experiment

Before execution, Strelva presents a compact experiment contract:

- the intended outcome;
- context and sources it will use;
- what it will create or change;
- systems it may contact;
- approval requirements;
- known limitations;
- estimated time and usage.

High-consequence missing judgment is requested from the user. Low-consequence
implementation choices are made by Strelva.

### 3. Run safely

Public-data and uploaded-file experiments run within an isolated environment.
Experiments that need private systems request narrowly scoped connections.
Consequential actions produce a durable proposal and require the applicable
policy decision before execution.

### 4. Return a working artifact

The primary result is not a conversational promise. It is a usable artifact or
completed action, such as:

- an interactive analysis or simulator;
- a functioning micro-application;
- a monitor with an initial result;
- a grounded service assistant;
- a completed and verified operational change;
- a structured decision with source evidence;
- a recurring agent or workflow ready to be activated.

Every result includes evidence, uncertainty, actions taken, actions not taken,
and the current verification state.

### 5. Revise, share, or keep it running

The result offers a small set of consequential next actions:

- run again;
- change the experiment;
- share the artifact;
- delete the experiment and its retained data;
- keep it running.

`Keep it running` is the primary transition from exploration to persistent
value. It may add schedules, durable context, private connections, team
membership, approval policy, production actions, or support commitments.

## The execution contract

Every Labs experiment should eventually use the same conceptual spine:

```text
Goal and context
  -> capability selection
  -> experiment contract
  -> proposal when an action is consequential
  -> authority decision
  -> execution attempt
  -> provider receipt
  -> read-back verification
  -> artifact and outcome receipt
  -> correction, rerun, or persistence
```

The current codebase already contains partial versions of this system:

- `src/lib/agent/gbp-operations.ts` provides the strongest seed for a typed
  operation registry.
- `src/lib/ai-governance.ts` and `src/lib/agent-risk.ts` classify whether AI
  work can publish, requires review, or must be blocked.
- `src/lib/events.ts` and `src/lib/event-actions.ts` provide claims,
  reconciliation, and recovery markers for external effects.
- `src/lib/verify-live.ts` provides post-write verification.
- `src/lib/governed-work/` models Proposal, Decision, ExecutionAttempt, and
  Outcome as distinct records.
- `src/lib/agent-results.ts` provides a structured result and receipt pattern.
- `src/lib/site-capabilities.ts` and the custom-repository contract demonstrate
  an authoritative, subtractive capability manifest.

These pieces are promising foundations, not yet a generic experiment runtime.

## Proposed domain model

Labs should not overload the current Tenant and Site Property concepts. A Labs
participant may not own a website or even be a business.

The smallest useful model is:

### Environment

The durable boundary containing people, context, policies, connected systems,
budgets, and retained experiments. A current Tenant can later be associated
with or promoted into an Environment without changing its commercial website
agreement.

### Experiment

The durable statement of a goal, inputs, authority envelope, selected
capabilities, lifecycle, and retention policy.

### Run

One execution of an Experiment. A Run records model and prompt versions,
context snapshot, capability versions, actor, budget, attempts, trace, cost,
and evidence references.

### Operation

A typed action that declares:

- input and output schemas;
- required actor authority and review audience;
- preconditions;
- effect and idempotency behavior;
- provider execution adapter;
- verification adapter;
- retry, recovery, and rollback behavior;
- evidence emitted.

### Artifact

A user-facing result produced by a Run. It may be interactive, downloadable,
shareable, executable, or connected to a production target.

### Receipt

The durable evidence of what a Run intended, attempted, and achieved. It must
distinguish proposal, approval, provider acceptance, verification,
propagation, and observed business outcome.

## Initial capability seams

These are evidence-backed experiment seams found across the current client
portfolio. They are not proposed dashboard categories or separate divisions.

### Audit to receipt

Join the public audit, browser analyzers, remediation logic, governed changes,
live verification, and recurring proof into one end-to-end experiment.

### Inquiry routing

Generalize typed intake, spam protection, recipient routing, email delivery,
lead events, spreadsheet handoff, and external booking links already repeated
across client sites.

### Truthful availability

Represent hours, closures, temporary moves, seasonal operation, appointment
requirements, intake pauses, and booking handoffs as source-linked state rather
than scattered copy.

### Grounded service assistance

Combine structured business content, deterministic recommendation rules,
model-assisted dialogue, escalation, and external booking or contact handoff.

### Local commerce and retention

Reuse proven catalog, checkout, shipping, rewards, membership, subscription,
review, and support patterns where an experiment requires commerce. Do not
claim these providers are generally available until activation and operational
support are verified.

### Content and capability plane

Generalize the versioned content, page configuration, preview, signed
revalidation, and subtractive manifest pattern used by connected custom
repositories.

The product should combine these capabilities as needed. The user should not
have to buy or navigate them as a feature bundle.

## Long-term product forms

### Experiment Environment

The primary user experience and demand-discovery loop. It turns a goal into a
working result and lets successful experiments become durable.

### Governed action runtime

The strongest horizontal platform opportunity. It lets agents publish, reply,
book, charge, update, or otherwise affect real systems under explicit policy,
approval, idempotency, verification, and recovery rules.

This runtime is infrastructure inside Labs first. It becomes a developer or
enterprise product only after Strelva demonstrates reliable internal usage and
outside demand.

### Release Receipt

A potential generous developer distribution surface. A CLI, GitHub Action,
deployment integration, or SDK could prove what changed after a release and
provide a signed, inspectable receipt with a correction pointer.

This is narrow enough to distribute independently while strengthening the same
verification system used by Labs and paid websites.

### Current truth record

A possible public record of an organization's source, freshness, and conflicts
for consequential claims such as hours, prices, policies, services, booking
state, and public actions. It may later provide machine-readable context to
external agents.

This should remain an experiment until demand for maintaining and consuming
the record is proven.

## Generous edge and paid persistence

The initial economic hypothesis is:

### Free or inexpensive edge

- public-data experiments;
- uploaded-file experiments within clear retention limits;
- simulations and dry runs;
- shareable artifacts;
- browser extensions and lightweight developer tools;
- limited release verification;
- limited experiment history.

### Paid persistent value

- managed websites;
- private system connections;
- persistent organizational context;
- scheduled and background execution;
- production side effects;
- team roles and approval policy;
- larger usage and retained history;
- audit evidence, enterprise controls, and service commitments.

No specific Labs price is selected by this document. Usage budgets, support
cost, abuse risk, willingness to pay, and retention must be measured before
packaging is promoted.

## Distribution

Labs should distribute through useful artifacts rather than a conventional
agency funnel alone:

- public experiments that can be tried without a call;
- shareable results and receipts;
- browser extensions;
- open-source verification tools;
- embedded artifacts;
- current Strelva clients;
- Buffalo founder, business, nonprofit, and institutional networks;
- eventually agent protocols and developer integrations.

Buffalo density, referrals, and trust are hypotheses under test. They are not a
proven moat. Labs must record which experiments are shared, forwarded, rerun,
persisted, and converted before claiming a local distribution advantage.

## First validation program

Run a tightly controlled pilot before building generalized self-serve
infrastructure.

### Cohort

- five existing Strelva clients;
- five Buffalo organizations without a Strelva website;
- five founders, builders, institutions, or operationally complex teams.

Each participant brings a real goal. Strelva may use operator assistance behind
the interface during this phase, but the user-facing promise and receipt must
remain honest about what was automated and what was performed manually.

### Claim under test

> Given one real goal and existing context, Strelva can produce a useful,
> trustworthy working artifact with less than ten minutes of customer effort.

### Strong evidence

- at least 80% receive an artifact they judge useful against the original goal;
- median customer input is under ten minutes;
- at least 50% rerun, revise, or share an experiment;
- at least 25% choose to keep it running, connect private context, or request a
  production deployment;
- zero unauthorized external actions;
- founder intervention falls below twenty minutes per experiment after the
  initial capability is established;
- every consequential result has an inspectable receipt;
- observed run and support costs fit a plausible paid margin.

### Weak evidence

Users like or praise artifacts but do not rerun, share, connect, persist, or pay
for them. In that case Labs may be a useful acquisition surface but has not
demonstrated a standalone product.

### Rejection evidence

- fewer than half of completed runs produce a useful result;
- experiments repeatedly require more than forty-five minutes of bespoke
  founder work;
- users cannot understand or trust the authority preview and receipt;
- repeated unauthorized, duplicate, or unverifiable actions occur;
- the generous edge has no credible cost or abuse boundary.

## Platform prerequisites for broad self-serve adoption

The current product can support an operator-created pilot. It cannot yet
support fast, generous, public Labs adoption.

Before opening self-serve Labs broadly, Strelva needs:

- a Labs Environment distinct from the current paid website Tenant lifecycle;
- public signup and Environment claim flow;
- account-level membership and roles;
- Labs-specific capability and authority entitlements;
- persistent usage and cost budgets rather than only burst rate limits;
- abuse controls and explicit data-retention behavior;
- shared low-cost provisioning that never creates a custom website repository;
- durable Experiment, Run, provenance, Artifact, and Receipt records;
- provider adapters with explicit scopes, health, retries, and verification;
- safe secret storage and connection teardown;
- isolated execution for generated code and untrusted inputs.

Reusing `case_study` billing or ordinary website tenants for public Labs would
conflate free experiments with free websites and expose broad tools without a
durable economic boundary. It is acceptable only for a small, manually
controlled validation cohort.

## Trust work required before external side effects

The current trust spine is promising, but these known limitations prevent it
from being treated as a general-purpose Labs runtime today:

- approval audience is not universally enforced at the authorization boundary;
- background model fallback can repeat a turn after a mutation tool ran;
- nested content verification can compare incompletely;
- tenant-controlled prompt context is not universally isolated as untrusted
  evidence;
- human, agent, operator, and email approval paths do not share one policy
  boundary;
- queued proposals and mutable drafts are not always transactionally bound;
- OAuth nonce, scope, and account-selection behavior requires hardening;
- integration status can overstate executable capability;
- provider acceptance and live verification are not consistently distinguished;
- Redis remains operational authority for events with finite retention while
  governed Postgres work is still a lossy shadow.

The Labs runtime must promote governed work into an authoritative, durable
model before it earns broad production authority.

## Roadmap horizons

### Horizon 1: Try

Unify public audits, browser tools, and operator-assisted experiments under one
Labs promise. Produce working artifacts and honest receipts before building a
marketplace or generalized runtime.

### Horizon 2: Keep

Add Environments, durable experiments, reruns, artifact history, budgets, and
the `Keep it running` transition.

### Horizon 3: Operate

Add private connections, schedules, governed production actions, read-back
verification, correction paths, and team approval policy.

### Horizon 4: Package

Turn repeatedly successful experiments into reusable capabilities without
forcing users to understand internal agent, skill, application, or workflow
boundaries.

### Horizon 5: Distribute

Expose proven verification and governed-action contracts through developer
tools and agent-compatible interfaces.

### Horizon 6: Network

Allow organizations and builders to publish verifiable capabilities and allow
agents to discover and invoke them through explicit authority contracts.

## Non-goals

Labs is not initially:

- a page of disconnected free AI utilities;
- a free website program;
- a generic chat interface;
- a prompt or agent marketplace;
- a wrapper around arbitrary model calls;
- a bespoke automation agency under a different name;
- a national marketplace requiring supply-and-demand liquidity;
- an autonomous runtime with silent or unbounded production authority;
- a claim that current integrations, customer usage, Buffalo distribution, or
  Labs willingness to pay are already validated.

## Decisions still owned by the founder

1. Is Labs a formal long-term product arm or a temporary name for Custom
   Software experimentation?
2. Is Strelva willing to broaden its eventual category from managed business
   presence to governed execution for people, organizations, and agents?
3. Which pilot users and real goals will form the first validation cohort?
4. How much operator assistance and model cost may the initial generous edge
   absorb?
5. Which actions, if any, may the pilot execute outside a sandbox?
6. What evidence is sufficient to promote Labs from a working specification to
   selected product truth?

## Promotion rule

Labs remains an experiment until behavior demonstrates otherwise. Promote it
into the normative product ontology only when Strelva has repeated evidence of:

- useful outcomes across more than one customer or vertical;
- rerun, persistence, or recurring demand;
- a safe and supportable execution path;
- plausible margins or strategic distribution value;
- a product responsibility that is clearer than bespoke custom software.

The desired destination is ambitious, but the immediate discipline is simple:
ship real experiments, preserve authority, verify outcomes, and let observed
retention determine what Strelva Labs becomes.
