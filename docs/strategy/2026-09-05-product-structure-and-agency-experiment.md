# Product structure and agency experiment

Date: 2026-09-05
Status: architecture and agency experiment proposal, revised with the founder's September 5 direction for a common conversational interface and User / Paid User / Client / Enterprise relationships. These relationship and interface choices are founder direction; implementation details and partner economics remain proposals. This does not activate a partner program, change pricing, or supersede existing customer agreements.

## Recommendation

Give Strelva one accessible conversational entry point, familiar in its basic interaction to ChatGPT: start a conversation, describe a task, receive a usable result, and return to previous work. Independently implemented products supply capabilities behind that interface. Support direct customers and customers introduced or managed by agencies through the same product implementation. Treat managed websites as one product and delivery relationship.

### Founder direction: access and service relationships

| Status | Relationship | Experience |
| --- | --- | --- |
| User | Default for people without a paid or managed relationship | Use Strelva directly through the common interface, within the free allowance |
| Paid User | Pays for standard Strelva product access | Same interface with purchased capabilities or usage; exact allowances and pricing remain undecided |
| Client | Receives personalized, substantial managed work | Same interface with authorized business context, connected work, and the agreed managed service; all existing clients retain this status |
| Enterprise | Receives a more extensive negotiated organizational service | Same entry point with the access, delivery, and support scope agreed for that organization; qualification and packaging remain undecided |

Payment establishes paid standing, but a paying Client remains visibly a Client rather than being relabeled Paid User. Existing clients do not need to repurchase standard access to preserve their existing service. Interest in heavy personalized work opens a client/enterprise qualification conversation; it does not itself provision access or promise delivery.

Implement billing state, service relationship, and permissions separately. Derive the displayed status from those facts. For example: a paid account with a managed engagement displays Client; a paid account without one displays Paid User. A team member can receive paid access through an organization without personally being its payer. One person can be a User in their personal context and a member of a Client organization. A late invoice changes billing state under the agreed policy, not identity or ownership.

Agency is a partner relationship, not a fifth step in this ladder. An agency can itself be a User, Paid User, Client, or Enterprise account while receiving explicitly delegated access to other accounts. Referral or royalty eligibility remains separate from service status and data access.

### Interface and execution

The common application owns conversations, history, attachments, and saved outputs. Users should not have to choose an internal product module or agent before asking for a supported outcome. Offer a small set of concrete starting tasks to make available capability understandable.

Return structured results when the job benefits from them: a report, editable draft, comparison, preview, or action with a receipt. Allow direct editing and focused controls alongside conversation. Clearly show the selected personal or organization context; a conversation must never silently switch the business it acts on.

Proposed first proof: a new User asks Strelva to check a website, receives a sourced AI Visibility result in the conversation, saves it, and returns to the same work without a managed tenant. An existing Client can enter the same application and reach their authorized business work. Paid access expands agreed usage/capabilities; personalized delivery remains a separate service relationship.

The current `src/app/dashboard/chat/page.tsx` requires a tenant dashboard session, and `src/app/api/agent/route.ts` imports tenant permissions, subscription checks, site manifests, and managed-site tools. Reuse suitable conversation UI and streaming mechanisms, but introduce a general conversation use case that dispatches only to authorized product operations. Keep existing managed-site checks at the managed-presence boundary. Merely removing its tenant guard would expose the wrong execution model to general users.

Use IDX Home Finder to test agency distribution first. Keep direct adoption possible in the architecture; do not run two acquisition campaigns before the first installation works. Separately test whether an agency can supply a repeated problem, reachable customers, and useful product expertise in exchange for a bounded product royalty.

## What is collapsing today

| Boundary | Current evidence | Consequence | Proposed correction |
| --- | --- | --- | --- |
| Person and managed customer | `src/app/(marketing)/account/page.tsx:40` routes users with no tenants to NoAccessState; signup is invite/build oriented | A person cannot retain a standalone product relationship through this account flow | Product use and identity must work without a managed site; anonymous use where appropriate, account creation when saving or returning adds value |
| Business, site, delivery, and billing | `src/lib/types.ts:564` puts site name, template, domains, custom repo, capabilities, and subscription on TenantConfig | New products inherit website requirements; an agency can be mistaken for the business it serves | Separate customer account, product installation, optional site, payer, and delegated manager; adapt existing tenants rather than rename them wholesale |
| Product and dashboard feature | `src/lib/features/registry.ts:47` locks Today, Ask Strelva, Website, Analytics, Reports on for everyone | Buying one product risks opening the entire managed-service dashboard | Keep this registry local to managed presence; the common conversational interface invokes product operations and opens focused product views when useful |
| Operator grouping and user authorization | `src/lib/accounts.ts` uses Redis site bundles; the phase-0 Postgres account schema exists, while `src/lib/auth.ts:315` checks tenant membership | An account row is not currently a working agency delegation model | Reconcile the existing account stores and identifiers; add explicit scoped, revocable delegation without automatically granting agency-wide access |
| Product retention and sales intake | `src/app/api/ai-visibility/[id]/monitor/route.ts` saves a Delivery Lead; `src/lib/ai-visibility/results.ts` retains public results for 180 days | Monitoring interest becomes founder follow-up rather than an activated recurring product | Give monitoring its own subscription/run/history lifecycle when built; keep optional sales follow-up separate |
| Reusable monitoring and portfolio execution | `src/lib/domain-monitor.ts` imports all tenants; its store saves one global latest portfolio snapshot | Turning this into a public or agency product would inherit portfolio-wide scan and read assumptions | Keep host checking reusable; make installation scheduling, storage, quotas, and reads scoped before exposing it |
| Commercial owner and beneficiary | Tenant billing plus account bundles model site relationships | Product purchases and partner payouts would otherwise be attached to a site or a feature flag | Product subscription items identify the beneficiary installation and payer independently; partner attribution is a separate record |

The code already distinguishes tenant capabilities, site manifests, agent tools, and commercial plans. Preserve that distinction. Several registries are justified because they answer different questions. In particular, readiness scoring and live AI-answer observations must retain their different evidence meanings even if placed within one product module.

This is a source review. Live database state, production behavior, load capacity, and application tests were not verified in this review.

## Code organization

Use a modular application in the main repo first. Avoid a repository-wide move as the first implementation. The current pnpm workspace contains only the root package. Keep the separately deployed IDX product separate while its runtime and commercial experiment remain different.

Proposed main-repo structure:

```text
src/
  app/                         Routes, request parsing, session resolution, rendering
  experience/
    conversation/              Common composer, threads, history, result rendering
    workspace/                 Personal/organization context and saved work
  products/
    managed-presence/          Website upkeep, content, reputation, owner experience
    ai-visibility/             Readiness scans, observed visibility, saved results
    domain-monitor/            Host checks, installations, schedules, alerts
  platform/
    identity/                 Authenticated people
    accounts/                 Customer accounts and memberships
    access/                   Scoped delegation and authorization
    commerce/                 Payers, subscriptions, product entitlements
    relationships/             Client/Enterprise engagements; derived display status
    partners/                 Attribution and approved earning agreements
    execution/                Jobs, usage measurement, retries, event delivery
  integrations/               Provider-specific adapters
  components/ui/              Shared presentation primitives

strelva-idx-home-finder/       Existing separate product repository
```

Each product owns its domain types, use cases, repository interface, implementation, focused UI, and behavior tests. A small exported interface defines what other modules may call. The experience layer composes those interfaces into conversations and interactive results. Route files invoke use cases. A product may use platform services; platform code must not import a product's internals. Cross-product reuse goes through a named contract, not direct table access. Product selection by a model never substitutes for server-side entitlement and permission checks.

Do not create empty platform folders for hypothetical reuse. Extract a shared mechanism when an actual product needs it. Extract cross-repository packages only when both applications have a demonstrated consumer and compatible runtime requirements.

For every product feature, answer: which user job, owning product, data owner, permitted actor, entry point, operational dependency, usage cost, and observable success event? A new dashboard tab is a presentation choice, not the feature definition.

## Relationship model

| Concept | Meaning |
| --- | --- |
| User | Person with an identity; may use products without buying managed presence |
| Display status | User, Paid User, Client, or Enterprise in the selected account context; derived from paid standing and service relationship |
| Conversation | Account-scoped work history with explicit participants and authorized product operations; separate from a website tenant |
| Service engagement | Personalized work and responsibilities agreed with a Client or Enterprise account; existing clients retain their classification |
| Customer account | Individual or organization owning product resources; adapt the existing account model |
| Membership | User's role in an account |
| Product installation | One configured use of a product for a beneficiary account; no site required unless the product needs one |
| Site | Optional website connected to an installation; existing managed tenants remain compatible |
| Delegation | Explicit agency permission over named customer resources and actions, with revocation |
| Payer | Account responsible for a subscription; may differ from the beneficiary |
| Referral attribution | Evidence that a partner brought a particular customer; grants no data access |
| Product contribution agreement | Accepted contribution, named product scope, earning formula, term, and evidence; grants no data access |

An agency and a brokerage are separate accounts. An agency can introduce a brokerage without managing it, manage an authorized installation without owning the brokerage, or pay for an installation under a reseller agreement. Ending agency management must not silently delete customer data or transfer ownership. Continued service depends on an explicit payer transition if the agency paid.

For IDX, home buyers are product users; brokerages are beneficiaries and possible payers; agencies are distributors and possible managers/payers. A buyer submitting an inquiry does not automatically become a Strelva account or marketing contact.

## Migration order and proof

1. Establish product module boundaries on one existing slice. AI Visibility is the clearest candidate because its public entry already exists. Preserve routes and behavior while moving its owned code; keep a compatibility export during the move.
2. Reconcile account authority before new account writes: inspect deployed schema and records, map Redis account identifiers to durable identifiers, preserve site billing, backfill with verification, then explicitly switch reads. Do not assume the dormant SQL schema is already the active source of truth.
3. Add one complete standalone conversational journey: ask for a website check, receive a structured result, save the conversation to an account without a managed tenant, and return to it. Verify anonymous-to-account claiming cannot attach another person's private result; persist explicit ownership and context for conversations and attachments.
4. Classify existing managed accounts as Client while preserving memberships and billing. Add independently modeled paid standing and service relationships, then one product installation with an independent payer and explicit access policy. Prove a User can become a Paid User without a custom website repository or managed engagement, and that paying Clients retain Client status.
5. Add agency delegation for that same installation. Test access before grant, after grant, outside scope, and after revocation. Referral codes must never authorize access.
6. Connect IDX through a narrow installation/status contract only if the pilot needs it. Keep its inquiry content and provider rules within IDX. Its current documented persistent SQLite runtime must be addressed before assuming it can share the main app's serverless deployment.

Existing managed clients should continue through their current routes throughout the transition. Product boundary checks and tests should reject platform-to-product imports, unauthorized cross-account reads, duplicate subscription handling, and accidental website prerequisites for standalone users.

## John Leone evidence

The [IDX email thread](https://mail.google.com/mail/#all/1a001746537c0749) establishes:

- August 14: Jacob described adding a brokerage-branded home search to an existing client site.
- August 18: John wanted to experiment with client sites, naming Blake Realty Group as an example.
- August 28: John reported that he could not get the code working and asked to run an experiment.
- September 2: Jacob sent a prototype link; later messages arranged a September 4 call.

The thread does not establish the call outcome, permission to modify a brokerage site, a paid commitment, or an agreed royalty. John's installation difficulty is observed friction. Agency distribution remains a hypothesis with an interested participant.

The [IDX repository](https://github.com/rhinehart514/strelva-idx-home-finder) already distinguishes agency, brokerage, installation, inquiry, and receipt. Its documented preview uses synthetic inventory; live operation requires provider authorization and verified delivery configuration. That is source evidence, not a verified live deployment.

The [existing pilot offer](https://github.com/rhinehart514/strelva-idx-home-finder/blob/main/HOME-FINDER-PILOT.md) specifies a $3,000, 90-day agency pilot, external fees separately, and $49/month afterward. It gates direct brokerage sales until product proof, defined by renewal plus a second paid installation. These are written terms in the repo, not verified accepted prices. A broader direct-and-agency architecture can coexist with this bounded initial channel experiment.

## Distribution models considered

| Model | What the agency contributes | What Strelva must prove | Choice |
| --- | --- | --- | --- |
| Direct product with referrals | Introductions | Customers activate and return themselves | Support structurally; keep acquisition attribution separate |
| Agency distribution and installation | Existing customer relationship and adoption assistance | Second installation is configuration, with measured support effort | First IDX experiment |
| Agency contribution with product royalties | Repeated problem, customer access, domain knowledge, validation | Contribution produces a reusable product that sells beyond the originating agency | Small separate experiment after defining a concrete contribution |
| Agency-funded exclusive custom builds | Project budget and specifications | Service margin and delivery quality | Valid commercial work, but a weaker default for broad product adoption because exclusivity can block reuse |

The recommendation combines the second model with a tightly bounded test of the third. Do not launch a general idea marketplace. A concept becomes a candidate only when its contributor can show the problem and reach people who experience it.

Current market precedent exists for recurring agency compensation: [IDX Broker's partner FAQ](https://developers.idxbroker.com/partnership/faq/) describes account-based paybacks with eligibility conditions. This supports testing distribution compensation; it does not validate royalties for proposing products or determine Strelva's rate. Its program is separate from the Trestle integration used by Home Finder.

## Proposed royalty experiment

Two different contributions should produce two different earning records:

- Customer introduction or management: commission on the named customer's eligible product revenue, with defined duration and responsibilities.
- Accepted product contribution: royalty on the named reusable product, including sales outside the originator's customer base, for a fixed term or cap. Require customer access, substantive validation, and an agreed contribution scope. Submission alone creates no earning entitlement.

Proposed negotiation starting point, not a promised offer: 15% referral commission for the first 12 paid months of a referred account; 5% product royalty for 24 months from first paid production use of the accepted product. Where both apply, total partner deductions for the same revenue line are capped at 20%, including other partners. Check measured economics before offering these rates.

Define eligible revenue as collected recurring software charges for the named product, less refunds, credits, chargebacks, and taxes. Exclude separately billed provider/MLS fees and bespoke setup/services. Hosting, compute, payment processing, and support still count as Strelva delivery costs when checking contribution margin; do not disguise them as zero cost because fees are passed through elsewhere.

Illustration only: on $100 of eligible monthly software revenue with $25 of delivery cost, $15 referral plus $5 product royalty leaves $55 before fixed operating expense. At the existing $49 post-pilot software price, the same percentages leave $39.20 before delivery cost. Measure whether that supports maintenance and support; the $3,000 setup payment cannot establish recurring viability.

Before an actual offer, specify product scope, pre-existing work, contribution evidence, term/start date, exclusions, stacked payments, refunds, payment timing, reporting, termination, and rights to reuse the implementation. Avoid an undefined perpetual claim over future Strelva products. This is a proposed commercial structure, not a drafted legal agreement.

No automated payout system is needed for the first experiment. Keep approved agreements, attributed subscription items, invoice adjustments, and calculated earnings in a reviewable ledger. Payment automation comes after reconciliation is proven.

## Campaign: bring one repeated client problem

Proposed participants: John plus two independent agencies/advisors, each able to introduce two relevant customer businesses. These are recruitment targets, not existing commitments. John is a prospective partner; his agency responsibilities are not established by the email signature.

1. Observe John using the hosted synthetic Home Finder preview without repository setup. Record task completion, where he needs help, and whether he can explain the result to a client. Do not count preview use as a live installation.
2. Obtain one authorized brokerage pilot and validate its actual feed/display conditions. NAR's [IDX policy](https://www.nar.realtor/handbook-on-multiple-listing-policy/advertising-print-and-electronic-section-1-internet-data-exchange-idx-policy-policy-statement-7-58) limits IDX display and redistribution; the participating MLS/provider conditions must be verified for this installation. Do not infer public inventory rights from the existence of working code.
3. Complete an inquiry on the installed experience and confirm recipient delivery. Record onboarding hours, support effort, provider costs, and time from authorized setup to first successful use.
4. Ask each participant for one recurring client problem, two reachable businesses with that problem, today's workaround, and a plausible payer. Select one concept only if independent customers confirm the same underlying need.
5. Test the royalty proposition with a concrete contribution brief and proposed economics. An accepted discussion is weaker evidence than introductions, implementation feedback, and paid usage.
6. Observe repeat use over 30 days after activation; evaluate renewal and a second paid installation on the existing pilot's longer timetable. Record low traffic separately from users trying and abandoning the flow.

Proposed early gates: two agencies can each name two reachable customers; one brokerage authorizes and pays for a pilot; five intended users complete the target task without founder guidance; two return during the observation period; the next installation requires no fork and no more than two hours of Strelva setup after provider authorization. These are falsifiable targets, not evidence or market benchmarks. Passing a small pilot warrants another cohort, not a mass-adoption claim.

Revise the model if agencies supply bespoke wishes with no shared demand, refuse introductions, cannot activate the product, require margins that erase recurring contribution, or produce users who do not return. If royalties attract submissions but do not improve customer access or validation, drop that incentive and retain the distribution channel.

Proposed invitation language for later review:

> Bring one recurring client problem and two people who need it solved. We'll test whether it can become a product they can use. If we agree to develop it together, we'll define your contribution and a share of that product's revenue before the work starts.

No outreach, pricing change, agreement, deployment, or payout was performed as part of this review.
