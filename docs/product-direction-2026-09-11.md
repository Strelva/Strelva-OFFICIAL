# Strelva product direction: one interface, four nouns, one unit of work

Prepared 2026-09-11. Status: research synthesis. Jacob subsequently selected
the [inquiry-first product specification](./inquiry-first-product-spec-2026-09-11.md)
for local implementation. That specification supersedes this memo's generic
Request object, four-destination rail, founder implementation order, and open
interface decisions where they conflict. This memo remains research context.
It authorizes no price, production migration, deployment, live message,
provider write, deletion, release, or public claim.

Research inputs, each with dated citations, live in
[`docs/research/2026-09-11/`](./research/2026-09-11/):
[frontier feel](./research/2026-09-11/01-frontier-feel.md),
[business offering](./research/2026-09-11/02-business-offering.md),
[agency offering](./research/2026-09-11/03-agency-offering.md),
[topology](./research/2026-09-11/04-topology.md), and
[request lifecycle](./research/2026-09-11/05-request-lifecycle.md).
Prices quoted from other products are snapshots taken on or near September 11, 2026.

## 1. The takeaway

The vision is right and the interface count is wrong. The repository holds five
separate customer compositions (personal workspace, managed website dashboard,
business delivery study, agency delivery study, Enterprise Customers), each with
its own home, history, and way to ask Strelva. All five research streams,
working independently, arrived at the same correction: one persistent frame,
three first-class objects plus one policy layer, and a single durable unit of
work called a Request.

What makes Strelva feel like frontier software is not visual styling. It is that
a person can name a piece of work, watch it move through honest stages, receive
a result they can inspect, approve an exact consequence, and see proof that it
landed in their system. The repository already contains the trust primitives
that make this possible (governed decisions, review queues, accepted-write
markers, durable checkpoints, verified handoffs). What it lacks is the one
product-facing Request layer that joins them and shows them.

## 2. The product

Strelva is where a business asks for something to be done and gets a verified
result it keeps. The customer path stays Problem -> Work -> Result -> Your
system -> Handled, and every screen is one of those five landmarks for one Request.

Three relationships use the same product with different scope:

| Relationship | Pays for | Sees | Strelva's promise |
| --- | --- | --- | --- |
| Business, direct | One free finding, then one prepared result at a time, then continuation only once repeat is proven | Its Business, Requests, Resources | A specific, evidence-backed result; nothing goes live without approval |
| Enterprise (agency) | One predictable organization bill covering a bounded number of Customers, members, and Requests | Customers it is explicitly assigned, their Requests and Resources, agency-only notes | Commission, review, and hand a client a decision inside one place |
| Managed (Strelva delivers) | A responsibility tier: cadence, approvals, application, read-back, exceptions, monthly outcome note | The same interface with service state visible | Continuity and accountability, not unlimited requests |

The nine existing managed clients keep their agreed service and billing. The
interface changes; the agreements do not.

## 3. The topology

Three objects plus one layer, and Home as a view:

```text
Strelva
├── Home          current Business, one composer, recent Requests, what needs you
├── Requests      the one collection of work; Active, Needs me, In review, Complete
│   └── Request   brief, plan, checkpoints, result, approval, evidence, activity
├── Resources     durable things the Business owns
│   ├── Website          preview, content, media, brand, store, history as modes
│   ├── Assessment       score, evidence, recommendations, follow-up
│   └── Home Finder      installation, readiness, delivery receipts
├── Business      identity, connections, presence, people and access, service, settings
└── Customers     agency-only collection of Business records (Enterprise context)
```

**Business** is the stable subject. **Request** is the unit of intent and
lifecycle. **Resource** is the durable system or result. **Access** is the
who-can-do-what layer and appears inside Business, Request, and Resource; it is
not a navigation item. Workspace stays an internal scope mechanism. Product
stays a catalog reached from Home and empty states, not a nav branch.

Utility navigation keeps Help & service and Account. The operator console at
`/admin` stays a separate topology. Public routes and client storefront routes
stay outside the private frame.

### What each existing surface becomes

| Today | Becomes |
| --- | --- |
| `/workspace` Home, My work, Explore | Home and Requests. Explore folds into Home and empty states. |
| `/dashboard` Today, Ask Strelva, Review, History, Reports | Home in Business context; Request views with filters; Resource history and evidence. |
| `/dashboard` site, content, collections, assets, brand-kit, store | Website Resource modes. Existing editor and sub-navigation are kept. |
| `/dashboard` google, reviews, analytics, health, integrations, sources, leads, members, roster, schedule, settings, ownership | Business bands: Presence, Connections, People and access, Settings. Vertical pages become conditional modules, not permanent nav. |
| `/preview/strelva/client` Business Home | The layout survives as the real Home. Its browser-only request model is retired in favor of the server-backed Request. |
| `/preview/strelva/agency` Clients | Folds into Customers. One list component, not two. |
| `/preview/strelva/customers` | Canonical Customers collection and Business detail. |
| `/preview/strelva/start` | Local fixture hub only. |

The full route-by-route keep, fold, drop map is in the
[topology report, section 5](./research/2026-09-11/04-topology.md). Fold means
the URL keeps working and renders the canonical object. Nothing in this document
deletes data or deployed compatibility names.

## 4. The Request

The Request is a durable case file, not a chat transcript and not a spinner.

**Two dimensions, not one status list.** `phase` is one of problem, work,
result, system, handled. `state` is precise: captured, scoping, ready to work,
working, result ready, awaiting approval, applying, verifying, handled, failed,
cancelled, superseded. `attention` is separate and says in plain words what is
being waited on and who can act.

**Three approvals, never merged.** Approval to start (scope), approval of the
proposed result, and authorization to change the live system. Each records the
actor, target, version, action, and expiry. "Approve" always says which one it is.

**Handled means proven.** A provider accepting a write is not the same as
read-back confirming it. Accepted-but-unverified stays a visible state. The
existing no-duplicate-write protection is preserved and surfaced. Retry is
hidden once an external write has been accepted.

**One shape, three meanings of done.**

- An assessment is handled when an evidence-backed report is saved and accessible. It can auto-run after valid inputs.
- A website change is handled when approved content is present in the live target and verified. Low-risk facts may follow current auto-publish policy; copy, structure, and external writes need review.
- A build is handled when the accepted implementation is at the agreed release target with checks and a rollback path recorded. Preview may be automatic; production deploy is separately approved.

**Two views of the same record.** The business view leads with outcome,
preview, decision, and proof. The agency view adds queue, assignment, diff,
logs, release detail, receipts, and client handoff.

## 5. The frontier feel, made concrete

Frontier in 2026 is an operating model, not a palette. Strelva already has the
right visual language in DESIGN.md. The changes are about behavior:

- **Home** answers three questions fast: which Business, what can I start or resume, what needs me. One composer that reads as a work brief, three or four real starting examples, recent Requests with evidence cues, a "Needs you" area only when real. No metric cards, no health score, no invented activity.
- **Request in progress** names the work at the top (Request, Business, Resource, State), shows a phase rail, one or two meaningful events newest first, and the working artifact. Events are things like "Checked the homepage and found the call-to-action section," never "thinking."
- **Result** is the visual center: title, plain outcome, what changed or was found, evidence, before and after, lifecycle state, exact next verb (Review change, Approve, Ask for a revision, Open preview, View verification). Follow-up chat is secondary and scoped.
- **Business panel** is a quiet scope anchor: name, domain, role, connected versus unconnected integrations, work in flight, pending approvals, service state. Switching Business is explicit and warns when a Request is open.
- **Shell speed**: command palette, fast search, keyboard hints, background continuation, stable return URLs. Motion only on real state change.

Things that would make Strelva look dated: a chat transcript standing in for a
Request, a purple-blue AI gradient or orb, four metric cards before real work,
an "Allow" modal that names no consequence, a success badge that ignores
verification, a page reload that kills a running Request, and a dark monitoring
room shown to small-business owners.

## 6. The offering

These are tested hypotheses, not accepted prices. No checkout or entitlement
changes until Jacob selects them.

**Business ladder.**

| Stage | Buys | Hypothesis |
| --- | --- | --- |
| Free start | One evidence-backed finding plus a recommended next job. No card, no external write. | $0 |
| First paid result | One prepared, verified website improvement: artifact, before and after, receipt. Prepared, not live. | $19 |
| Continuation | Only after repeat purchases show what recurs: a bundle or a "keep watch" plan with a real recurring action. | ~$49 bundle or $19-29/mo |
| Managed pilot | One system boundary, capped jobs, approvals, application, read-back, monthly outcome note. Five to ten slots. | ~$149/mo + $399 setup |

**Enterprise pilot.** One bounded plan before any ladder: $99/month per agency
organization, five active Customers, two agency members, unlimited client
reviewers at no seat charge, ten Request records per month, usage export as CSV,
co-branded not white-labeled ("Managed by Agency in Strelva"). Agency pays
Strelva; client owns its Business and Resources; payer, owner, access, and
service responsibility stay separate fields. Pilot with at most three agencies.

**Do not build**: a marketplace, sub-account SaaS mode, reseller payouts, a CRM,
per-seat reviewer charges, full white label, usage-based customer billing,
unlimited maintenance, auto-publish for consequential writes, ranking guarantees.

## 7. Founder-sized implementation order

No new database migration is required for the first useful step.

1. Freeze the vocabulary. Add a small shared contract for Business, Request, Resource, Access. Keep deployed Redis keys, API symbols, and tenant contracts behind adapters.
2. Make Home the single customer entry. Reuse the existing shell, merge the useful parts of workspace Home, managed Today, and the business study Home.
3. Build one Request collection and one Request detail shell with phase, state, attention, and the evidence bundle. Map saved assessments and managed website requests first; add conversation, review, and run modules inside the same shell.
4. Build one Resource collection and detail shell. Start with Website (existing sub-navigation), Assessment, Home Finder.
5. Move Business settings and Access into one Business detail using the existing settings bands, access panel, assignments, handoffs, and delegations.
6. Fold old routes. Keep compatibility URLs; change the rendered destination before changing any URL.
7. Retire duplicates: the delivery study shell, global History, separate Review and Ask surfaces, the second customer list.
8. Leave `/admin` and public routes alone.

This supersedes the shape of the September 8 major-release package where they
differ (Access as a nav item, five peer surfaces). Its authority boundaries,
acceptance IDs, and Home Finder gates still apply.

## 8. Decisions Jacob owns

Interface and model:

1. Confirm the 3+1 topology and the four destinations: Home, Requests, Resources, Business, plus Customers for agencies.
2. Confirm Request as the one work object covering assessment, website change, and build.
3. User-facing labels: "Business" or "Your business"; "Resources" or "Your systems and results." The model stays Business and Resource either way.
4. Is a recurring managed service a long-lived Request, a Resource service state, or both?

Authority:

5. Which actions may auto-start or auto-apply, and which always show a scope checkpoint and approval?
6. Can an agency approve on behalf of a client? Is agency default access read-only with per-Request grants?
7. The contractual meaning of Handled when a provider accepts a write but read-back fails.

Offering:

8. Which first job has the strongest connector and fastest read-back: website copy or metadata, contact or booking checks, Google Business facts, or review reply drafts?
9. Whether the $19 result stays prepared-only or includes one low-risk live application after approval.
10. Which agency archetype comes first: local web and marketing agencies, or real-estate agencies distributing Home Finder.
11. Actual human minutes per result on the nine current managed businesses, to test the managed price.

Each research report ends with its own open-question list where finer detail is needed.
