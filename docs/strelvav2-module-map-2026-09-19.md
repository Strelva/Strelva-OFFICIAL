# Strelva experience and module comparison, September 19, 2026

This is a proposed product definition compared with draft [PR #191](https://github.com/Strelva/Strelva-OFFICIAL/pull/191), inspected at `396facf4137a83ff307f4ed1a059ca15ac7f98ec`. It records choices for Jacob to judge, not approval of new offers or a production release. The [acceptance ledger](./strelvav2-horizontal-acceptance.md) remains the owner of implementation verification. Company strategy and public presentation remain outside this repository.

The subsequent [staff-request journey implementation](./strelvav2-horizontal-acceptance.md#september-19-staff-request-journey-and-clean-checkout-ci)
addresses the named return-path and clean-checkout CI findings below. This audit
retains the original revision's observations; broader offer gaps remain open.

## Judgment

The branch contains a substantial shared workspace and several real product engines. Its most convincing horizontal capability is the bounded application lifecycle: create a private app, work with records, publish a checked version, share access, change it safely, and reuse it in another business. The gap is assembling those engines into complete customer offers with dependable connections, delivery, economics, and an understandable experience.

We should distinguish three questions: can the code perform a bounded operation, can a customer complete the whole job, and can Strelva sell and reliably operate that job? Passing the first does not settle the other two. This audit does not assign a completion percentage.

## The customer experience

**Home** answers “What needs me, what changed, and what can I start?” It shows meaningful outcomes, requests for decisions, and work needing attention. A short request can start work, but the result opens in the interface suited to it.

**Work** holds the things the customer creates and operates: websites, applications, intake processes, investigations, and recurring checks. An application remains an application people can use. A website remains a website. These objects can contain tasks without becoming task cards themselves.

**Business** holds shared facts, people, connected services, installed offerings, and spending arrangements. Agency membership, business ownership, permission to act, and who pays remain separate. Customers should not repeatedly configure the same business facts for each piece of work.

This three-part navigation is a proposal. The selected direction in [DESIGN.md](../DESIGN.md) and current sidebar is Home, Work, Ongoing, People & access, and Settings, with New, Search, Explore offerings, Help, and Account. Moving those destinations requires a deliberate information architecture change, not just renaming labels. See [StrelvaSidebar](../src/experience/app-frame/StrelvaSidebar.tsx).

Within an individual piece of work, show its useful result first and a small set of relevant sections. For onboarding that could be Overview, People, Requirements, and Activity. For an app it could be App, Records, and Changes. Do not give every object the same large tab set. The deeper modules below supply those sections when needed; they are not twelve new sidebar destinations.

The story is carried by actual state: what was requested, what exists now, what changed, and what needs a decision. For example: “Eight suppliers are ready. Two still need insurance documents. Review one mismatch.” Atmospheric visuals cannot substitute for those facts.

## Offers a customer can understand

These are possible customer promises, not a declaration that all are available. Keep the nouns simple and put the outcome in the description.

| Offer | What the customer buys or starts | Modules underneath | Current position |
| --- | --- | --- | --- |
| Websites | Create and maintain a business website. | Site management, content, checks, approvals, activity. | Existing managed-site capability; broad new-customer self-service is a separate release question. |
| Apps | Give people a useful tool for a particular job. | Forms, records, views, access, versions, installations. | Strong bounded local implementation. Arbitrary custom software has a separate incomplete runtime path. |
| Intake | Collect requests, understand what is missing, and move each to a next step. | Forms, records, inquiries, checks, communication, assignments. | Native request apps and inquiry engines exist; generic end-to-end intake is not a released offer. |
| Bookings | Let customers book and keep appointments handled. | Availability, reservations, communication, connected calendars, recovery. | Native scheduling and governed adapter boundary exist; provider delivery is not implicitly configured. |
| Onboarding | Get a customer, employee, or supplier ready with fewer manual handoffs. | Intake, documents, requirements, assignments, checks, reminders. | A composition opportunity. File handling and reliable external coordination need more than the current app shell. |
| Checks | Watch a defined condition and bring back evidence when something needs attention. | Sources, investigations, comparisons, schedules, decisions. | Saved-source investigations and bounded recurring execution exist; arbitrary live-system monitoring is broader. |
| Custom builds | Have Strelva or an agency deliver something specific. | Scope, shared work, delivery acceptance, app/runtime capability. | Participation and bounded delivery records exist; general contracted custom delivery remains unresolved. |

Invoices, collections, migration rehearsal, and contract obligations remain candidate jobs. Their names do not establish accounting integrations, migration safety for external systems, or complete legal-document understanding. “Planning” is currently better treated as a capability within work. “Handoffs” is a behavior across offers. Neither needs to become another commercial product merely because it has a noun.

The existing [discovery catalog](../src/platform/products/catalog.ts) also includes AI Visibility, Domain Monitoring, Homefinder, and spreadsheet trackers. Preserve their distinct status: public assessment, managed-portfolio operations, external pilot, and workspace capability are different delivery models. The proposed offer list does not retire them or establish broader availability. Internal research and learning tools also remain internal unless separately selected for a customer offer.

## The deeper modules

“Present” below means inspected source exists. Local verification is recorded in the acceptance ledger and is revision-specific. No row establishes production availability.

| Module | What the user can understand | Present in this branch | What prevents the broader promise |
| --- | --- | --- | --- |
| Requests and plans | Describe the outcome, review the proposed work, see the result. | Workspace starts, model-backed planning, bounded plan outputs and native dispatch. [Plan outputs](../src/platform/workspaces/plan-output.ts). | A recorded request-to-app browser journey used a planning fixture. A full real-model journey needs separate proof. |
| Forms and records | Collect information and keep an editable, usable record of it. | Native application forms/list/detail/document views; trackers, filtering, assignments, related records, grouped edits and Undo. [Apps](../src/products/applications/server.ts), [trackers](../src/products/tracker/engine.ts). | Recipient access is bounded; rich interactions and recipient editing of existing app records remain open in the ledger. |
| Documents and evidence | Keep instructions and show what a conclusion is based on. | Native text documents and revisions; source-aware investigation records. [Documents](../src/products/documents/engine.ts), [investigations](../src/products/investigations/server.ts). | General attachment ingestion, extraction, multimodal provenance, and missing-document workflows are not established. |
| Decisions and checks | Compare information, inspect differences, approve the next action. | Investigations, saved-source comparisons, tracker comparisons, bounded execution and recovery. [Investigations](../src/products/investigations/server.ts), [comparisons](../src/products/tracker/comparison.ts). | Reliable arbitrary research, accounting reconciliation, and simulation are distinct capabilities requiring their own evidence. |
| Scheduling | Choose a time, reserve capacity, and understand whether it was confirmed. | Native reservations; injected provider authorization, stable write keys, reconciliation, separate verification evidence. [Scheduling](../src/products/scheduling/server.ts). | No provider is implicitly available. Complete calendar connection, changes, reminders, and recovery need an actual integrated journey. |
| Communication and inquiries | Receive a request, prepare or send an allowed response, and follow up. | Inquiry receive, approval, delivery, consent, reconciliation, and follow-up code; governed application email. [Inquiries](../src/products/inquiries/server.ts). | These bounded paths do not constitute a universal inbox or a generic communication engine for every new offer. Inquiry installation is disabled in the offering registry. |
| Ongoing work | Keep a specific job running and tell me when it needs help. | Finite ordered responsibilities, dependencies, pause/resume/cancel, waits and receipts; standing investigation runs. [Standing work](../src/platform/work-execution/standing.ts). | Standing scope is currently investigation runs. Background execution has its own release flag; arbitrary paid cross-system autonomy is not established. |
| People and delivery | Do it myself, involve someone, or give Strelva responsibility for agreed work. | Exact-work participation, proposals, expiring grants, operational assignments, and Strelva delivery request/accept/revoke/customer-decision records. [Delivery](../src/platform/offerings/provider-delivery.ts). | Installing an offer does not hire a provider. Current delivery requires an active installation and an exact Strelva assignment. General agency commerce and service commitments are broader. |
| Business context and connections | Reuse what Strelva knows about my business and control what it can access. | Scoped facts, sources, freshness, corrections and conflicts; business ownership; selected existing integration paths. [Context](../src/platform/work-context/service.ts). | This is not a universal connector library or learned operating procedure for every business. Each integration needs real access and failure handling. |
| Changes and versions | Improve a working app without losing records or surprising its users. | Checked candidate publication, stable field identity, record-preserving rollback, pinned reusable installations and conflict checks. [Applications](../src/products/applications/server.ts). | Supported native changes are bounded. General custom-code migration, deployment, and runtime safety are separate incomplete work. |
| Offers and installations | Start a defined service or reuse a working application in my business. | Versioned definitions, resource bindings and installation responsibility. [Definitions](../src/platform/offerings/definitions.ts). | Exactly three definitions: staff request app, customer inquiry intake, and managed website changes. Only two are installable; inquiry setup is not enabled. Discovery catalog entries are not equivalent to installable offers. |
| Usage and spending | See what work may cost, who pays, and what was used. | Budgets, reservations, accepted caps, payer changes, usage receipts, and provider-evidence validation. [Economics](../src/platform/work-economics/types.ts), [provider evidence](../src/platform/work-economics/provider-evidence.ts). | Trusted billable provider receipts and general usage settlement are not wired end to end. Existing website Stripe billing is separate from new horizontal usage charging. |

Permissions, audit history, tenant isolation, recovery, and data ownership support every module. They should appear where a person makes a consequential choice, rather than becoming machinery every customer must configure. Export is bounded workspace export, not proof of complete enterprise portability or account deletion.

Several implementation limits materially affect what we can offer:

- Native apps support text, number, and boolean fields, with at most 30 fields, 12 components, and 1,000 records. Attachments, formulas, arbitrary code, and integrations are not supplied by that engine. See [application contracts](../src/products/applications/contracts.ts).
- Trackers accept text/CSV up to 1 MiB, 1,000 rows, and 50 columns. They do not execute spreadsheet formulas or synchronize Google Sheets. See [tracker contracts](../src/products/tracker/contracts.ts).
- Investigations compare exactly two permitted sources in the same workspace, drawn from documents, trackers, or apps. They do not perform general web research or connect arbitrary external APIs. See [investigation contracts](../src/products/investigations/contracts.ts) and [source handling](../src/products/investigations/server.ts).
- Delegated operations have a narrower command set than the owner-facing product. Their current native execution does not spend on models or providers. Giving someone responsibility is not permission for unrestricted external action. See [operations](../src/products/operations/server.ts).

The inquiry code's onboarding helper reads public metadata and stores corrections; its name does not establish a general onboarding product. Similarly, rehearsal with synthetic records is not a general business simulation capability.

## One concrete journey to judge the composition

Three source-level experience gaps make the composition problem concrete:

- Home removes offering-bound resources from Recent work and presents them through the offerings card. Inside an offering, Connected work displays resource kind and raw ID instead of the work title. A customer should be able to return directly to the thing they recognize. See [BusinessHome](../src/experience/workspace/BusinessHome.tsx) and [WorkspaceOfferings](../src/experience/workspace/WorkspaceOfferings.tsx).
- Provider delivery is nested inside an active offering and requires approved assigned operations work created or offered through Ongoing. That is more setup than the proposed immediate “Have Strelva handle it” experience. The underlying checks are useful; the customer should not have to coordinate them manually.
- Business currently means several contexts: selected workspace, managed website settings, and the separate `/business/[tenant]` inquiry surface. The proposed Business destination needs a precise scope. Website controls also have both workspace Settings links and managed-dashboard navigation. A shorter sidebar alone would not resolve this.

These are source observations, not a fresh rendered usability test. The existing shared shell, object-specific result views, and direct `/apps/[workId]` application route are useful foundations worth preserving.

A business says: “Get our suppliers ready to work with us.” It can start itself or ask Strelva to help. The proposed result is a supplier workspace with a request form, supplier records, requirements, and a list of unresolved issues. A supplier submits information. Strelva identifies missing or conflicting evidence, prepares the next communication, obtains approval where required, and records what actually happened. An owner can later change a requirement without breaking existing records.

The current native app, records, scoped collaboration, and safe-change foundations cover meaningful portions of that journey. We cannot claim the whole journey from those pieces. Document upload and extraction, supplier-specific requirements, external communication, rechecks, and reliable completion need explicit composition and proof. Calling the page “Onboarding” does not supply them.

A narrower journey is much closer: “Give staff a private request form, let me review requests, and let me safely update the form later.” This has an actual offering definition and substantial native behavior. My recommendation is to judge the common experience against this complete bounded journey, while keeping supplier onboarding as a more ambitious integration test. That preserves the larger direction without advertising an unfinished service.

## Current PR and release evidence

The inspected checkout matches PR #191's head, `396facf4137a83ff307f4ed1a059ca15ac7f98ec`. Against local `origin/main` at `4e4777252356843af8d6cafe6368af7fb5e2a6ac`, the comparison contains 917 changed files, 123,997 additions, and 3,131 deletions. This is a large integration candidate, not an easily judged single feature.

Hosted CI is failing. [Run 35473388094](https://github.com/Strelva/Strelva-OFFICIAL/actions/runs/35473388094) fails TypeScript checking at `src/experience/delivery/BusinessHome.tsx:19`, which imports `./assets/business.webp`. The image is committed and present. The ignored local `next-env.d.ts` supplies Next image type declarations, while CI typechecks before running a Next build. Missing clean-checkout type generation is a plausible cause, not a reproduced diagnosis. No code fix or rerun was performed for this audit.

The September 19 ledger records 391 passing Vitest files, 2,872 passing tests and one skipped test, plus local lint, typecheck and focused gates. Earlier build, SQL rehearsal, and browser evidence apply to their named revisions. Local green results do not cancel the hosted failure. The draft CI path does not establish authenticated browser acceptance. See the [release record](./strelvav2.md#september-19-pr-preparation).

Both repositories remain on the recorded shared version `0.1.1`; `0.2.0` is a proposal. Checked-in configuration disables automatic Git deployments. That guard is not evidence of the current production revision. Production schema, live provider behavior, public availability, commercial acceptance, and deployment remain separate gates. This audit performed no production mutation or live-provider action.

## Decisions this comparison supports

1. Retain the simple Home / Work / Business proposal for review, with relevant modules inside each object. Test that layout against a usable app, an ongoing process, and an agency-delivered job before accepting it as the common model.
2. Recognize the native application lifecycle as a substantial existing capability. Avoid rebuilding it or describing all safe app changes as future work.
3. Treat intake, onboarding, and bookings as specific composed journeys with explicit missing dependencies. Do not multiply nominal offers faster than complete customer outcomes.
4. Keep agency help available in the same work context, but make requested help, accepted responsibility, scope, permissions, price, and customer acceptance distinguishable.
5. Resolve hosted CI and prove the chosen connected journeys before presenting this PR as ready to release. Human product acceptance and authorization for production remain outstanding.
