# Product topology and information architecture

Research stream 4 | 2026-09-11

Scope: frontier-product comparison plus a read-only audit of the Strelva control-plane repository. Route counts below are source-file counts, not claims about deployed production behavior.

## 1. Executive answer

Yes, with one important correction. Business, Request, Resource, and Access are the right domain nouns, but they should not be four peer navigation items. Use a 3+1 topology: Business, Request, and Resource are first-class objects. Access is a relationship and policy layer that appears inside those objects.

The customer frame should have four primary destinations: Home, Requests, Resources, and Business. Show Customers only for agency contexts. Keep Help and Account in utility navigation, with the current Business or workspace explicit in the header.

Home is a view, not an object. Workspace is scope, not a user-facing noun. Product is a catalog, not a top-level destination. Customer is a Business collection, not a sixth data model.

A Request owns the composer, conversation, execution, review, evidence, and history. A Resource owns the durable result and deep modules. Business owns identity, connections, service, and people. Access appears under Business and contextually inside Requests and Resources.

This fits Strelva better than Workspace, Project, Task, Artifact because Strelva manages a living business system, not a repository. It lets one founder consolidate the existing shells.

## 2. Evidence

### A. How frontier products keep a small object model deep

| Product | Object model and navigation pattern | Rule worth carrying into Strelva |
| --- | --- | --- |
| Linear | A workspace contains teams. Teams appear in the main navigation and own issues. Projects are outcome-oriented containers that can span teams, with a project overview, properties, documents, milestones, and a detail sidebar. Linear recommends starting with one workspace and one or two teams. See [Workspaces](https://linear.app/docs/workspaces), [Teams](https://linear.app/docs/teams), and [Projects](https://linear.app/docs/projects), accessed 2026-09-11. | Scope is explicit. The sidebar exposes the stable collection level, while detail pages carry the deep behavior. A project is not just another screen. It has dates, outcomes, documents, issues, and progress. |
| Vercel | A team owns projects, members, and billing. A project represents an application from a repository and groups deployments, domains, settings, observability, and firewall. A deployment is a concrete build with its own URL, logs, resources, and promotion controls. The project documentation was last updated 2026-08-19. See [Projects](https://vercel.com/docs/projects) and [Deployments](https://vercel.com/docs/deployments/overview). | The parent object is a useful operational boundary. A deployment is a deep child of a project, not a competing product. The dashboard organizes around the thing that owns the lifecycle. |
| GitHub | A repository is the main working scope. Issues track ideas, tasks, and bugs. Pull requests represent reviewable changes. Projects are collections of issues, pull requests, and other items with table, board, and roadmap views. Repository permissions and roles are documented separately from the content objects. See [What is GitHub](https://docs.github.com/en/get-started/start-your-journey/what-is-github), [Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects), and [Access permissions](https://docs.github.com/en/get-started/learning-about-github/access-permissions-on-github), accessed 2026-09-11. | Work objects are composable. A view is not a new copy of the work. Permissions remain a policy layer rather than becoming a content object. |
| Claude | A project is a self-contained context with chat histories and a knowledge base. Chats remain the working conversation. Artifacts are durable outputs shown in a dedicated sidebar and right-hand window, with editing, iteration, and version selection. Claude says free users can create up to five projects; paid plans add retrieval over project knowledge. See [Projects](https://support.claude.com/en/articles/9517075-what-are-projects), updated 2026-07-23, and [Artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts), accessed 2026-09-11. | Conversation and durable output are related but not identical. The chat is the work surface. The artifact is the thing a person can return to, inspect, and use. |
| Cursor | A Cloud Agent task runs on an isolated virtual machine. The task can plan, edit, run, and test. Its output can include a branch, pull request, screenshots, video, and logs. Agents can be started from Cursor, the web, Slack, GitHub, or Linear. See [Background agents](https://prod.cursor.com/help/ai-features/background-agents) and [Background agent docs](https://docs.cursor.com/background-agent), accessed 2026-09-11. | An agent run is not the main object. It is an execution module under a task. Evidence is attached to the task so the human can review the result without reconstructing what happened. |
| Codex | The Codex app is a command center for multiple agents. Threads are organized by project, work happens in isolated worktrees, and the user reviews diffs, test output, screenshots, approvals, and pull requests. Automations produce a review queue rather than silently becoming a second home. See [Introducing the Codex app](https://openai.com/index/introducing-the-codex-app/), 2026-02-02, [Work with Codex from anywhere](https://openai.com/index/work-with-codex-from-anywhere/), 2026-05-14, and [Codex cloud tasks](https://help.openai.com/en/articles/11390924), accessed 2026-09-11. | The unit of intent is the task or thread. Runs, diffs, tests, and approvals are evidence and state underneath it. The review queue is a view over work, not another object family. |
| Stripe | The Dashboard is account-scoped. Its primary sidebar exposes a small number of core workflows such as Home, Product catalog, Connect, and Payments. Search, shortcuts, and recent pages help users reach deeper resources without adding each resource type to the permanent nav. See [Dashboard basics](https://docs.stripe.com/dashboard/basics?locale=en-GB), accessed 2026-09-11. | Keep the primary rail short. Use search, recents, and contextual sub-navigation to reach deep operational records. |
| Notion | A workspace contains everything. The sidebar combines Home, Meetings, Inbox, Library, AI, teamspaces, shared pages, private pages, favorites, and nested pages. Pages can be nested and reordered. Home surfaces recents, favorites, teamspaces, and agents. See [Navigate with the sidebar](https://www.notion.com/en-gb/help/navigate-with-the-sidebar) and [Workspaces](https://www.notion.com/en-gb/help/intro-to-workspaces), accessed 2026-09-11. | Navigation is a tree over a small set of durable containers. Home is a retrieval surface for recent work, not a duplicate container. |
| Replit | A Project contains code, data, artifacts, and resources. A Task is a unit of work that can be planned and executed in the background. The task board uses Drafts, Active, Ready, and Done, with review, apply, and dismiss actions. Replit recommends one project when data, backend, and publishing are shared, and a separate project when the lifecycle is independent. Current task concurrency is listed as Core 1, Pro 10, and Enterprise 64. See [Task system](https://docs.replit.com/core-concepts/agent/task-system) and [Projects and artifacts](https://docs.replit.com/learn/projects-and-artifacts/projects-and-artifacts), accessed 2026-09-11. | A project is a lifecycle boundary. A task has explicit state and review. The product makes it easy to see what is active without promoting every task state into a new navigation destination. |

These products follow a consistent set of rules:

1. Keep the primary rail at the stable collection level. Linear uses teams, Vercel uses projects, GitHub uses repositories, and Stripe uses account-level workflows.
2. Give one object a real detail page. The detail page carries status, history, related records, settings, evidence, and actions. It is not merely a title plus a list.
3. Put execution underneath intent. Cursor and Codex make a task or thread the human-facing object, then attach runs, diffs, logs, tests, screenshots, approvals, and pull requests.
4. Keep outputs durable. Claude separates chats from artifacts. Vercel separates projects from deployments. Replit separates projects, tasks, and artifacts.
5. Treat permissions as policy. GitHub keeps roles and permissions separate from issues and projects. Strelva should do the same with Access.
6. Use search, recents, queues, and contextual sub-navigation to make depth usable. Adding a top-level link for every module creates breadth without clarity.
7. Make scope visible. The current workspace, team, project, repository, account, or business is always apparent before a user acts.
8. Use status as a view over work. “Needs review,” “Active,” and “Ready” are useful filters and queues. They do not need to become separate top-level object types.

### B. Repository audit

#### Surface counts and current navigation

| Surface | Page files | Current navigation and screen shape |
| --- | ---: | --- |
| Common workspace | 2: `src/app/workspace/page.tsx`, `src/app/workspace/account/page.tsx` | `StrelvaShell` has 3 primary items: Home, My work, Explore. It also has Start something, Help & service, and Account. `WorkspaceLayout` adds Home, work, products, help, work detail, assessment, and access states in one client experience. |
| Managed dashboard | 25 page files, 24 concrete route slots plus a catch-all | `ManagedNavigation` resolves 7 core product surfaces: Today, Ask Strelva, Website, Google Business, Analytics, Reports, and Reviews. Settings is a separate footer destination, making 8 canonical links when available. Needs you is conditional. Schedule, Members, and Roster add up to 3 vertical links. Website has a 5 or 6 item sub-navigation: Preview, Content, Media, Brand Kit, Store when enabled, and History. |
| Strelva delivery previews | 10 page files, including 2 aliases | The client preview uses Home, Build, Requests, Your business, and Integrations, plus Appearance, Help, Settings, and New request. The agency preview uses Home, Clients, Requests, and Agency, plus New request. `DeliveryExperience` contains 9 audience-dependent view states: home, clients, live, requests, new, detail, business, integrations, and help. |
| Customer preview | 2 page files: collection and `[customerId]` detail | `CustomersApp` uses the common shell, an Organization context, and one split collection/detail experience. It shows customers the user can access and the resources attached to a selected customer. |
| Operator console | 16 page files, 14 concrete views plus 2 tenant aliases | `AdminRail` has 13 items: Overview; Clients, Accounts, Leads, Onboard, Pay links, Analytics; Actions, Drafts, Maintenance; Ops, Uptime, Audit. The command palette has 11 direct navigation entries plus actions and tenant shortcuts. |

The supporting code confirms that these are not just visual differences. `src/experience/` contains 38 files across app frame, workspace, delivery, customers, product shell, and conversation. `src/components/dashboard/` contains 80 files. `src/products/` contains 34 files: Access 2, AI Visibility 13, Assessment 5, Domain Monitor 2, Home Finder 3, Managed Presence 4, and Website Audit 5. `src/platform/` contains 23 files across Customers 13, Products 3, Relationships 1, and Workspaces 5.

The repository already has most of the right model pieces. `src/platform/workspaces/types.ts` has personal, agency, and customer workspaces plus saved work, handoffs, and delegations. `src/platform/customers/README.md` defines explicit customer relationships, resources, assignments, and scoped reads. `src/platform/products/catalog.ts` treats products as capabilities with resources, operations, presentation, distribution, and release metadata. `src/products/access/AccessPanel.tsx` treats Access as contextual handoff and revocation behavior. That evidence favors a 3+1 topology rather than four peer content objects.

#### What each current surface actually does

**Common workspace.** `/workspace` is already the strongest candidate for the shared customer Home. It combines a start surface, recent work, managed work, product discovery, and a result view. Its `?view=work` state is the current work collection. Its assessment flow is a structured request composer. Its access panel handles read-only access, agency creation, customer sharing, handoff, and revocation. `/workspace/account` is identity and workspace access, not Business identity.

**Managed dashboard.** The dashboard is a mature managed-website application inside the common shell, not an independent product. `Today`, `Needs you`, `Ask Strelva`, `Review`, and `Reports` are different views of work. Website, Analytics, Google Business, Reviews, Integrations, Leads, and vertical features are modules of a managed business and its website. The existing dashboard IA document already consolidates Health into Analytics, Store into Website, Leads into Today, and old settings sections into four settings bands.

**Business and agency delivery preview.** `BusinessHome` is a strong prototype for the proposed Business context. It has a central “I want to...” input, suggestions, recent work, a managed website, requests, and a right-side BusinessContext panel. The same preview also adds a separate Business page, a request-detail business aside, and a separate agency client grid. This is useful exploration but not three production objects. It shows exactly where the eventual consolidation is needed.

**Customer preview.** `CustomersApp` has the best current collection/detail pattern. A customer detail shows the resources available to the viewer, including Website, Assessment, and Home Finder installation. Access availability is explicit, with states such as unavailable and revoked. This should be the agency Customers experience, while the delivery preview client grid should be retired as a duplicate.

**Operator console.** `/admin` is a distinct operator product. Its overview, client list, client detail, actions, drafts, maintenance, uptime, audit, billing, and onboarding workflows should remain separate from the customer topology. The current consolidation of `/admin/tenants` into `/admin/clients` is the correct pattern.

#### Duplicate inventory

| Duplicate type | Current copies | Finding | Recommendation |
| --- | --- | --- | --- |
| Homes | `/workspace`; `/dashboard`; `/preview/strelva`; `/preview/strelva/client`; `/preview/strelva/agency`; `/preview/strelva/start`; `/admin` | There are 7 relevant home-like entry points. Five are customer or preview variants, one is a fixture hub, and one is an operator home. Context explains some of the difference, but the customer variants currently teach different navigation models. | One customer Home with a current Business context. Keep `/admin` as a separate operator Home. Keep preview homes only as fixtures. Remove `start` as a product concept. |
| Histories | Workspace recent work; `/dashboard/history`; `ManagedHistory` in the chat rail; `/dashboard/reports`; request activity in the delivery preview; operator activity, digests, and maintenance | “History” currently means recent work, conversation recents, website version history, written reports, request lifecycle, and operator audit. A single global history would be too vague. | Attach Request history to Request. Attach changes and versions to Resource. Keep Home recents as a small retrieval module. Keep operator audit separate. |
| Composers | BusinessHome input; DeliveryExperience New request; workspace assessment form; `/dashboard/chat`; website `ChatPanel` and `CustomChangeRequestPanel`; admin Ask operator; public AI Visibility and Website Audit forms | There are at least 7 ways to start work. They mix free-form intent, structured assessment, website change, operator action, and public acquisition. | One customer Request composer. Preserve structured follow-up fields after intent is captured. Keep website Ask Strelva as a contextual entry to a Request. Keep public forms as acquisition entry points. Keep admin operator commands separate. |
| Customer lists | `CustomersApp`; DeliveryExperience `view=clients`; `/admin/clients`; `/admin/accounts`; plus vertical lists such as Leads, Reviews, Members, and Roster | There are two agency-facing customer lists and one operator client list. Accounts and vertical records are different objects, not interchangeable customer lists. | Make CustomersApp the one agency customer collection. Keep `/admin/clients` for operators. Keep Accounts and vertical records in their own contexts. |
| Business-context panels | Workspace selector; managed `PropertySwitcher`; BusinessHome `BusinessContext`; full `view=business`; request-detail business aside; Settings Business section; Customers organization scope and detail; admin client detail | The same business identity appears in headers, right rails, detail asides, settings, and customer scope. Repetition makes the object boundary hard to learn. | Use one canonical Business detail. Keep a compact current-business selector in the header. Show a small Business chip in Request and Resource details. Do not repeat the full context panel in every view. |

The most important duplication is not visual. It is that the current UI has several competing definitions of “work”: a saved assessment, a website change request, an agent conversation, a review queue item, a report, and an agency request. A Request object can unify those without forcing all of their screens to look the same.

## 3. Recommended topology

### A. Final object model: 3+1

```text
Strelva
├── Home                         current Business context and next action
├── Requests                     intent and bounded work lifecycle
│   └── Request detail           brief, conversation, run, review, evidence, history
├── Resources                    durable systems and results
│   ├── Website                  managed site and its operational modules
│   ├── Assessment                score, evidence, recommendations, follow-up
│   └── Home Finder               installation, readiness, delivery, service
├── Business                     identity, connections, service, people, access
└── Customers                    agency-only collection of Business objects
```

**Business** is the stable subject. It answers who the work is for and where the result belongs. A direct business user sees “Your business.” An agency sees Customers as a collection of Business records. The internal tenant remains a compatibility and persistence boundary, not the user-facing label.

**Request** is the unit of intent and lifecycle. It can be an assessment, a website change, a build, a connection request, or a service question. A Request should have a title, brief, current status, current owner, conversation, structured inputs, execution state, review state, resulting Resource links, and an activity timeline. The current `SavedWork`, assessment attempt, `DeliveryRequest`, chat thread, review item, and custom change request can be adapted into this shape without pretending that their detail layouts are identical.

**Resource** is a durable system or result that a Business can return to. Website, Assessment result, and Home Finder installation are the right first types. Resource detail owns current state, deep modules, evidence, service status, and links to Requests. A Resource can be the target of a Request, the output of a Request, or both.

**Access** is a relation and policy layer. It answers who can see or act on a Business, Request, or Resource, with scope, role, state, and audit evidence. The existing customer assignment and `AccessPanel` patterns are aligned with this. Access should be visible, but it should not compete with Home, Requests, Resources, and Business in the primary rail.

Two other concepts should stay below the user-facing topology:

- **Workspace** remains the ownership, membership, and scope mechanism. It can be selected in the header or Account area. It does not need to be a top-level destination in addition to Business.
- **Product** remains the catalog and distribution layer. AI Visibility, Managed Presence, Domain Monitoring, and Home Finder can be discovered from Home or a Resources empty state. Products should not create another permanent nav branch for every capability.

### B. Navigation structure

Use one persistent customer frame:

1. **Home**: current Business summary, one start-request entry, recent Requests, Resources needing attention, and proof of what Strelva has done.
2. **Requests**: one collection with status filters such as Active, Needs me, In review, Complete, and Archived. Status is a view, not a new object.
3. **Resources**: one typed collection of Websites, Assessments, Home Finder installations, and future durable systems.
4. **Business**: the current Business detail with identity, connections, service, people, and access.
5. **Customers**, only for agency or multi-business contexts: one collection and one reusable Business detail.

Keep Help & service and Account in utility navigation. Keep a visible current Business or workspace selector above the rail. Show New request in Home, Requests, and Resource detail as the same action, not three different composers.

The labels can stay close to the proposal. “Resources” is technically accurate, but the page heading can use concrete copy such as “Your systems and results” if testing shows that small businesses do not understand the abstract noun. Do not solve that copy question by creating separate Website, Reports, and Assessments top-level links.

### C. Deep modules by object

#### Home

Home is intentionally shallow. It should contain:

- One request composer with suggested prompts.
- Needs you, based on Request status and approval requirements.
- Recent Requests and recently viewed Resources.
- A compact current Business panel with links to Business detail.
- Result proof: the last meaningful completed result, not a grid of metrics.

The current Today page can become this Home module. It should not remain a second dashboard home.

#### Request

Every Request detail should have a stable frame even when the work type changes:

- **Brief**: what was requested, for which Business, and what success means.
- **Conversation**: the user and Strelva discussion, including structured follow-ups.
- **Plan and run**: the work steps, agent traces, external writes, and current status.
- **Review**: approvals, proposed changes, required human decisions, and policy warnings.
- **Result and evidence**: links to changed Resources, screenshots, audit results, reports, and read-backs.
- **Activity**: status changes and history for this Request.
- **Access**: who can view, approve, or act, when relevant.

The existing Ask Strelva conversation, Review queue, Drafts, assessment recovery, and website change panels should all open this model at the appropriate module. A long-running agent run is a module inside the Request, not a new global object.

#### Resource

The Resource collection should be typed, but the detail shell should be shared.

**Website modules:** Overview, Requests and changes, Preview, Content, Media, Brand, Connections, Google Business, Reviews, Analytics, Reports, History, and Store when enabled. The current Website sub-navigation is a good implementation seam. Google Business and Reviews can appear as Business presence modules with links back to the Website Resource when they affect the site.

**Assessment modules:** Overview, score, evidence, recommendations, result history, follow-up Request, sharing, and Access. The public AI Visibility and Website Audit entry points can create or attach a private Assessment Resource after sign-in.

**Home Finder modules:** Overview, readiness, delivery evidence, access, service, and integrations. The current customer preview already models readiness, delivery receipts, availability, revoked access, and service detail. Preserve that depth.

#### Business

Business detail should contain:

- Identity and public business information.
- Connected services and domains.
- People, roles, and Access.
- Service relationship, plan, billing, and support path.
- Leads or inbound records when that vertical is enabled.
- Business-level presence and reputation settings.

Business is the right home for settings that are currently split between `/dashboard/settings`, `/dashboard/google`, `/dashboard/integrations`, `/dashboard/leads`, and the BusinessContext panel. Website-specific content stays under the Website Resource.

#### Customers and Access

Customers is a relationship-specific collection of Business records. It should reuse the Business detail and show the Resources the agency can access. It should not grow a second customer-specific object model.

Access has three entry points, all using the same underlying policy model:

- Business > People and access for standing membership and delegation.
- Request > Access for sharing a request, approving, or handing off.
- Resource > Access for a scoped read or action permission.

This keeps access discoverable without giving it a misleading independent lifecycle.

### D. Alternative considered

The main alternative is the frontier engineering model:

```text
Workspace -> Project -> Task or Issue -> Run or PR -> Artifact
```

It is a strong model for Linear, GitHub, Cursor, Codex, and Replit. It gives a clean home for agent work, review queues, and durable outputs. It is not the best primary model for Strelva for four reasons:

1. Strelva's stable subject is a Business, not a code repository or a user-created project.
2. “Project” would be ambiguous. A Business may have a Website Resource, an Assessment Resource, and a Home Finder Resource without the user wanting to create a project container first.
3. “Task” describes execution but not the request, context, service promise, human approval, and result that a Strelva customer understands.
4. “Artifact” is too narrow for a live Website or Home Finder installation, which is operated over time rather than merely downloaded.

The recommended 3+1 model borrows the alternative's useful internals. Request owns task/run/review modules. Resource owns artifact-like evidence and live systems. Business owns the context that a project would otherwise provide. Access stays cross-cutting, as it does in GitHub and the existing Strelva platform.

This is implementable by one founder because it is mostly a consolidation and naming layer over existing boundaries:

- `SavedWork` and delivery requests become Request adapters.
- Tenants, managed sites, assessment results, and Home Finder installations become Resource adapters.
- Workspace membership, customer assignments, handoffs, and delegations remain the Access source.
- `StrelvaShell`, `WorkspaceLayout`, `ManagedNavigation`, and the Website sub-navigation remain the frame seams.
- No new platform-wide project object is required.

## 4. Concrete recommendations

### Keep

- **Keep the common `StrelvaShell` and persistent context.** It already provides the right frame, utility navigation, and dynamic slot. Reuse it rather than creating a fourth shell.
- **Keep Business, Request, and Resource as the core nouns.** They match the product direction and the code's existing platform boundaries.
- **Keep Access as a first-class capability.** Preserve explicit scoped access, read-only states, handoff, revoke, and access history. Move it under Business, Request, and Resource rather than making it a primary destination.
- **Keep the current Website sub-navigation.** It is a good deep module seam for Preview, Content, Media, Brand, Store, and History.
- **Keep `CustomersApp` as the agency collection/detail pattern.** It has one list, one selected detail, explicit resource availability, and a clear access model.
- **Keep the operator console separate.** `/admin` has a different audience, risk model, and operational vocabulary. Its 13-item rail should not be forced into the customer rail.
- **Keep public AI Visibility and Website Audit routes.** They are acquisition and result entry points. After authentication, their next action should open a Request or Assessment Resource.
- **Keep current commercial boundaries.** The repository exposes Presence at $99/mo, Growth at $199/mo, and Scale at $499/mo in the operator onboarding flow. Those prices belong in Business service and billing, not in the object taxonomy or as separate product nav items.

### Change

- **Change the primary customer navigation to Home, Requests, Resources, Business.** Add Customers only for agency contexts. Rename My work to Requests when the new collection is ready.
- **Change `/dashboard` from a second home into the current Business view of Home.** Preserve the URL as a deep link or redirect during migration.
- **Change Ask Strelva, Review, and Needs you into Request views.** They should open the same Request detail and collection with different filters or panels.
- **Change Reports and History from global destinations into deep modules.** Reports become evidence under a Resource or Request. Website version history remains under the Website Resource. Request activity stays with the Request.
- **Change the composer model.** Start with one plain-language Request composer. After intent is captured, add structured fields for assessment, website change, build, or connection work. Do not make customers choose a product before stating the problem.
- **Change the Business context presentation.** Use a compact current-business selector everywhere and one canonical Business detail. Replace repeated right rails and detail asides with a small Business summary plus a link.
- **Change the agency customer experience to one collection/detail pattern.** Reuse `CustomersApp` and remove the separate delivery-preview client grid from the production design.
- **Change the command palette to mirror the actual rail.** It currently has 11 direct navigation commands while the admin rail has 13 items. Either include every canonical item or clearly separate navigation from actions and search.
- **Change `/dashboard/settings` into Business settings with four clear bands: Business, Account, Domains, and Plan.** Keep Ownership as a compatibility route into Business > People and access.

### Add

- **Add a typed Request contract.** Minimum fields: `id`, `businessId`, `requestType`, `title`, `status`, `createdBy`, `assignee`, `resourceIds`, `reviewState`, `createdAt`, `updatedAt`, and `activity`. Keep product-specific payloads behind the type.
- **Add a shared Request detail shell.** It should render Brief, Conversation, Plan and run, Review, Result and evidence, Activity, and Access modules. Existing assessment, chat, website-change, and agency-request screens can plug into it gradually.
- **Add a Resource collection and shared Resource detail shell.** Start with Website, Assessment, and Home Finder. Each type can own a deep module registry without creating a separate top-level application.
- **Add explicit result proof to Home and Request detail.** A user should be able to see what Strelva did, what changed, what was verified, and what needs approval without opening an audit screen blindly.
- **Add a single current Business context contract.** It should be available to the shell, Request, Resource, and Business detail, with a clear scope label and permission state.
- **Add cross-links rather than copies.** A Request should link to its resulting Resource. A Resource should list its Requests. A Customer detail should list Resources. This prevents separate histories and duplicate records.
- **Add a migration adapter rather than a data rewrite.** Map existing `SavedWork`, assessment attempts, delivery requests, managed websites, customer resources, and access assignments into the new UI contracts first.
- **Add status filters as views.** Start with Active, Needs me, In review, Complete, and Archived. These are enough to replace Today, Review, and several queue variants without new nav branches.

### Drop

- **Drop Access as a primary navigation item.** It is a policy layer, not a destination with an independent user goal.
- **Drop Explore as a permanent primary destination.** Product discovery belongs in Home, an empty Resources state, and the Request composer. Keep a product catalog internally.
- **Drop the idea of Today as a second home.** Its useful next-action and proof modules belong on Home.
- **Drop a separate top-level Ask Strelva destination for customer navigation.** Keep Ask Strelva as the contextual Request composer and preserve deep links to conversations.
- **Drop a separate top-level Review destination.** Preserve the Needs me filter and review panel inside Requests.
- **Drop a global History destination.** Use Request activity and Resource history instead.
- **Drop the duplicate `DeliveryExperience` production shell.** Keep it as a prototype fixture while the shared shell is built, then retire its duplicate Business, Clients, and New request surfaces.
- **Drop `/preview/strelva/start` as a product destination.** It can remain a local fixture hub for design testing but should not teach the production IA.
- **Drop the second agency customer list.** Make `CustomersApp` canonical and use the same Business detail from every entry point.
- **Drop generic dashboard feature grids.** Keep deep modules that have a clear operational responsibility. Do not add new top-level links for every integration, metric, or vertical record.

## 5. Route map

The actions below describe the intended user-facing topology. “Fold” means preserve the route for bookmarks and compatibility, but render it as a module or redirect it to the canonical object. “Drop” means retire the named screen from the product IA. It does not mean deleting data, and a compatibility redirect should remain when a route is externally linked.

### Common workspace

| Existing route or state | Action | Destination |
| --- | --- | --- |
| `/workspace` | Keep | Canonical customer Home. It should absorb the best of the current common Home, managed Today, and BusinessHome. |
| `/workspace?view=work` | Keep, rename | Requests collection. Keep the URL during migration, but change the visible label from My work to Requests. |
| `/workspace?work=<id>` and saved-work detail states | Fold | Request detail. The result view becomes Request Result and evidence, with links to the resulting Resource. |
| `/workspace?view=products` | Drop as a primary screen, fold the capability | Show product suggestions inside Home, Resources empty states, and the Request composer. Keep the catalog in `src/platform/products`. |
| `/workspace?view=help` and help-prefill states | Keep in utility nav | Help & service. A submitted help request creates a Request rather than a separate help history. |
| `/workspace/account` | Keep | Account and workspace access. It remains a utility destination and is not renamed Business. |

### Managed dashboard

| Existing route | Action | Destination |
| --- | --- | --- |
| `/dashboard` | Fold | Home in the current Business context. Preserve the route as a compatibility entry point. |
| `/dashboard/review` | Fold | Requests filtered to Needs me or In review, with the same review module. |
| `/dashboard/chat` | Fold | Request detail with the Conversation module. Keep a deep link for existing conversations. |
| `/dashboard/site` | Keep as compatibility and Website entry | Website Resource overview. The future canonical path can be `/resources/website`, but do not move the data boundary just to change the URL. |
| `/dashboard/content` and `/dashboard/collections` | Fold | Website > Content and Collections. `/dashboard/content` already acts as a redirect in the current code. |
| `/dashboard/assets` and `/dashboard/brand-kit` | Fold | Website > Media and Website > Brand. |
| `/dashboard/store` | Fold | Website > Store when the business has commerce enabled. Hide it when not applicable. |
| `/dashboard/history` | Fold | Website > History and changes. It is Resource history, not global history. |
| `/dashboard/analytics` and `/dashboard/health` | Fold | Website > Analytics and site health. Keep the existing health redirect as a deep link. |
| `/dashboard/reports` | Fold | Resource evidence and Request result. Reports remain accessible, but no longer define a separate top-level object. |
| `/dashboard/google` and `/dashboard/reviews` | Fold | Business > Presence, with links to the affected Website Resource. Keep the existing connection and governed-write behavior. |
| `/dashboard/integrations`, `/dashboard/sources`, and `/dashboard/sources/[id]` | Fold | Business > Connections, with resource-specific connection detail when needed. |
| `/dashboard/leads` | Fold | Business > Leads or inbound records. Keep it conditional by business model and relationship. |
| `/dashboard/members` and `/dashboard/roster` | Fold | Business > People. Keep vertical-specific labels inside the module. |
| `/dashboard/schedule` | Fold | Business > Operations or the relevant vertical module. Do not add a permanent Schedule item for every business. |
| `/dashboard/settings` | Keep as deep route | Business > Settings with Business, Account, Domains, and Plan sections. |
| `/dashboard/ownership` | Fold | Business > People and access, preserving the existing redirect to the ownership section. |
| `/dashboard/[...notFound]` | Keep | Technical fallback only. It is not part of the IA. |

This maps all 25 dashboard page files, including the catch-all. The visible dashboard rail should eventually be a filtered view of Requests, Resources, and Business, not a second taxonomy.

### Strelva previews

| Existing route | Action | Destination |
| --- | --- | --- |
| `/preview/strelva` | Keep as fixture | Common Home and Requests/Resources fixture. It is useful for local design review, not a production route. |
| `/preview/strelva/workspace` | Fold | Alias to `/preview/strelva`. |
| `/preview/strelva/workspace/account` | Keep as fixture | Account fixture under the common shell. |
| `/preview/strelva/start` | Drop from product IA | Local fixture hub only. Do not use it as a production landing pattern. |
| `/preview/strelva/client` | Fold | Business-context Home fixture inside the common frame. Preserve its central composer and proof modules, but remove its separate shell. |
| `/preview/strelva/agency` | Fold | Agency context with Customers and Requests. Keep the agency relationship as a mode of the common frame, not a second application. |
| `/preview/strelva/customers` | Keep as fixture and canonical agency pattern | Customers collection. |
| `/preview/strelva/customers/[customerId]` | Keep as fixture and canonical agency pattern | Reusable Business detail with accessible Resources and Access state. |
| `/preview/strelva/website` | Fold | Alias to the managed Website fixture catch-all. |
| `/preview/strelva/website/[...path]` | Keep as fixture | Typed Website Resource detail and deep-module fixture. |

### Operator console

Keep `/admin` as a separate operator topology. The operator has a different job: triage the portfolio, inspect clients, approve or repair work, manage billing, and monitor operations. The recommended mapping is:

| Existing route | Action | Destination |
| --- | --- | --- |
| `/admin` | Keep | Operator Home and portfolio triage. |
| `/admin/clients` and `/admin/clients/[id]` | Keep | One operator client collection and detail. |
| `/admin/tenants` and `/admin/tenants/[id]` | Fold | Compatibility redirects to Clients and client detail. |
| `/admin/accounts` | Keep | Operator accounts and organizations. This is not the agency Customers list. |
| `/admin/leads` | Keep | Operator lead pipeline. |
| `/admin/onboard` | Keep | Operator onboarding and commercial setup. |
| `/admin/pay-links` | Keep | Operator billing action. |
| `/admin/analytics` | Keep | Portfolio or client analytics. |
| `/admin/actions` and `/admin/drafts` | Keep | Operator review and action queues. |
| `/admin/digests` | Keep as deep maintenance route | Maintenance and digest operations. |
| `/admin/ops`, `/admin/uptime`, and `/admin/audit` | Keep | System operations, uptime, and audit. |

The 13-item operator rail can remain. It should be made internally consistent with the command palette, but it should not be collapsed into the customer rail.

### Supporting routes outside the requested customer surfaces

These routes should not be forced into the Business, Request, Resource, Access navigation:

| Route family | Action | Reason |
| --- | --- | --- |
| `/(product)/ai-visibility`, `/(product)/ai-visibility/[id]`, and `/(product)/audit` | Keep | Public acquisition and result entry points. Their authenticated continuation should create or open a Request or Assessment Resource. |
| `/access-request`, `/no-access`, and `/onboard` | Keep boundary; fold `/onboard` to the existing access-request flow | These are authentication and authorization states, not product objects. |
| `/delivery/[token]` | Keep | External delivery boundary with a different trust and sharing model. |
| `/pay/[slug]` and `/pay/rohlax` | Keep | Billing and grandfathered agreement compatibility. They do not belong in the object rail. |
| `/sign-in/[[...sign-in]]` and `/sign-up/[[...sign-up]]` | Keep | Authentication boundary. |
| `/(marketing)/account` | Keep as entry router | It should route signed-in users to the common Home, managed context, or operator console as current access requires. |
| `/(marketing)/home`, `/(marketing)/guides`, `/(marketing)/guides/[slug]`, `/(marketing)/m-blog`, `/(marketing)/privacy`, and `/(marketing)/terms` | Keep outside private IA | Public and marketing presentation. The sibling marketing repository remains the source of truth for production marketing. |
| `/(public)`, `/(public)/about`, `/(public)/blog`, `/(public)/blog/[slug]`, `/(public)/contact`, `/(public)/events`, `/(public)/faq`, `/(public)/links`, `/(public)/providers`, `/(public)/services`, and `/(public)/shop` | Keep outside private IA | Public content and service routes. Do not use them to justify another signed-in Home. |

## 6. Founder-sized implementation order

1. **Freeze the vocabulary.** Add a small shared contract or mapping layer for Business, Request, Resource, and Access. Do not rename deployed Redis keys, API symbols, or tenant contracts. Keep the old persistence names behind adapters.
2. **Make Home the single customer entry.** Reuse `StrelvaShell`, keep the current Business selector, and merge the useful Today, BusinessHome, and workspace proof modules into one Home state.
3. **Create one Request collection and detail shell.** Start by mapping saved assessments and managed website requests. Add chat, review, and agent run modules inside the same detail shell. Do not migrate all data before the UI can read both old and new shapes.
4. **Create one Resource collection.** Start with Website, Assessment, and Home Finder. Reuse the current Website sub-navigation and customer resource readers.
5. **Move Business settings and Access into one Business detail.** Reuse the existing Settings bands, `AccessPanel`, customer assignments, handoffs, and delegations.
6. **Fold old routes.** Keep compatibility URLs for `/dashboard/*`, `/workspace` query states, and preview aliases. Change their visible destination before changing URLs. This makes the transition reversible.
7. **Remove duplicate entry points.** Retire the delivery-preview production pattern, the global History, the separate Review and Ask surfaces, and the second agency customer list.
8. **Leave `/admin` and public routes alone.** Only align operator command search and keep the public-to-private handoff clear.

The first useful release does not require a new database migration. It requires one shared frame, one Request shell, one Resource shell, and a route adapter. That is the lowest-risk path for a solo founder while preserving the current managed website behavior.

## 7. Open questions for Jacob

1. Should the user-facing label be **Business**, **Your business**, or **Organization**? The model should stay Business even if the copy is warmer.
2. Will customers understand **Resources**, or should the page heading use “Your systems and results” while keeping Resource as the internal contract?
3. Should a recurring managed service be represented as a long-lived Request, a Resource service state, or both? This decision affects reports, renewals, and recurring work.
4. For agencies, should Customers remain a collection-only destination, or should an agency be able to pin a current customer in the persistent context selector? The recommendation is collection-only until repeated use proves a switcher is needed.
5. Is a Home Finder installation owned by the brokerage Business, a property, or both? The Resource contract should settle that before the pilot expands.
6. Which legacy `/dashboard/*` URLs need permanent public compatibility because they are in customer emails or support documentation? This determines whether “Fold” means a server redirect or an in-place module shell.

## 8. Sources

### Repository sources read on 2026-09-11

- `CONTEXT.md`
- `DESIGN.md`
- `docs/client-dashboard-ia.md`
- `docs/operator-command-center.md`
- `src/experience/app-frame/StrelvaShell.tsx`
- `src/experience/workspace/WorkspaceLayout.tsx`
- `src/experience/workspace/WorkspaceRequest.tsx`
- `src/experience/delivery/DeliveryExperience.tsx`
- `src/experience/delivery/BusinessHome.tsx`
- `src/experience/customers/CustomersApp.tsx`
- `src/components/dashboard/ManagedNavigation.tsx`
- `src/components/dashboard/SectionSubNav.tsx`
- `src/platform/workspaces/types.ts`
- `src/platform/customers/README.md`
- `src/platform/customers/types.ts`
- `src/platform/products/catalog.ts`
- `src/products/access/AccessPanel.tsx`
- `src/app/admin/onboard/page.tsx`

### Frontier product sources

- Linear, [Workspaces](https://linear.app/docs/workspaces), [Teams](https://linear.app/docs/teams), and [Projects](https://linear.app/docs/projects), accessed 2026-09-11.
- Vercel, [Projects](https://vercel.com/docs/projects), last updated 2026-08-19, and [Deployments](https://vercel.com/docs/deployments/overview), accessed 2026-09-11.
- GitHub, [What is GitHub](https://docs.github.com/en/get-started/start-your-journey/what-is-github), [Planning and tracking with Projects](https://docs.github.com/en/issues/planning-and-tracking-with-projects), and [Access permissions](https://docs.github.com/en/get-started/learning-about-github/access-permissions-on-github), accessed 2026-09-11.
- Anthropic, [What are Projects](https://support.claude.com/en/articles/9517075-what-are-projects), updated 2026-07-23, and [What are Artifacts](https://support.claude.com/en/articles/9487310-what-are-artifacts), accessed 2026-09-11.
- Cursor, [Cloud Agents](https://prod.cursor.com/help/ai-features/background-agents) and [Background agent](https://docs.cursor.com/background-agent), accessed 2026-09-11.
- OpenAI, [Introducing the Codex app](https://openai.com/index/introducing-the-codex-app/), 2026-02-02, [Work with Codex from anywhere](https://openai.com/index/work-with-codex-from-anywhere/), 2026-05-14, and [Codex cloud tasks](https://help.openai.com/en/articles/11390924), accessed 2026-09-11.
- Stripe, [Dashboard basics](https://docs.stripe.com/dashboard/basics?locale=en-GB), accessed 2026-09-11.
- Notion, [Navigate with the sidebar](https://www.notion.com/en-gb/help/navigate-with-the-sidebar) and [Introduction to workspaces](https://www.notion.com/en-gb/help/intro-to-workspaces), accessed 2026-09-11.
- Replit, [Task system](https://docs.replit.com/core-concepts/agent/task-system) and [Projects and artifacts](https://docs.replit.com/learn/projects-and-artifacts/projects-and-artifacts), accessed 2026-09-11.
