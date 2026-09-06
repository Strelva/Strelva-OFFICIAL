# Strelva: whole-experience choices

Status: historical divergent research. Subsequent user decision selected sidebar Home with collapsible navigation, full-width work, and optional right-side discussion, with restrained 21st-inspired visual treatment. These layouts are now implemented locally in `/workspace`; other choices below remain open. "Nothing selected" statements below describe the initial exploration, not the subsequent layout decision. The research itself did not change application screens, routes, permissions, or customer data.

Four Luna Max agents independently used Mobbin MCP across entry, work, agency collaboration, and account/support. Their inspected references are examples of screen structure, not evidence of demand, live Strelva behavior, mobile usability, or current AI economics. Proposed behavior below is not a claim that it already exists.

## Current boundary

Source inspection distinguishes Strelva marketing (`/home`, acquisition and guide routes), private work (`/workspace`), managed-client tools (`/dashboard/*`), internal operations (`/admin/*`), and tenant-rendered public websites (`src/app/(public)`). These are not interchangeable. Source route names alone do not establish deployed host routing.

Release-one workspace work is opt-in. Private agency preparation, recipient acceptance of an independent copy, and optional exact-work read delegation are implemented locally. Product-wide resumable jobs, generalized editors, new billing models, and Homefinder activation are not established by this report.

## Three comparable whole-experience structures

These are comparison baselines, not packages the user must choose wholesale.

| Area | A: task and conversation | B: saved work and tools | C: customer/business context |
| --- | --- | --- | --- |
| Arrival | Try a concrete task with examples | Explore named products and examples | Choose an outcome, then only the necessary context |
| Return | Recent conversations and unfinished requests | Recent saved work, search, shared work | Select personal or customer context; resume its work |
| Working view | Discussion with expandable results | Result/editor first, optional discussion beside it | Selected business's work and connected properties |
| New product release | New start action and contextual introduction | Product entry with an example and explicit availability | New applicable action within a context |
| Agency | Prepare and hand off from existing work | Customer filter and shared-work collection | Customer list leading to customer-specific work |
| Managed client | Requests, decisions, and completed-work receipts | Site preview, proposed changes, version history | Business-specific work, site, review, and activity |
| Principal risk | Work becomes buried in transcripts | Experience feels like a file manager | Ordinary users feel forced to configure a business |

## Full choice register

Choose each row independently, then check the combinations. A page, panel, or inline state is an option, not a predetermined answer.

| ID | Surface or decision | Choice A | Choice B | Choice C / consequence |
| --- | --- | --- | --- | --- |
| E1 | Public first screen | Direct task input with examples | Named product selection | Guided outcome selection; adds a step but explains fit |
| E2 | Product discovery | Start-menu picker | Dedicated discovery page | Contextual suggestions inside existing work; less discoverable |
| E3 | Product detail | Preview drawer | Shareable public product page | Embedded example in start screen; fewer destinations |
| E4 | Sign-in timing | Before private execution | After a bounded public trial, before saving | Entry-specific: handoffs require identity; anonymous claiming needs new secure implementation |
| E5 | Setup | Only when an action requires information | Short setup after authentication | Explicit join/create workspace; clearer teams, more entry friction |
| W1 | Returning home | Conversation history | Saved-work library | Customer/business context |
| W2 | Navigation | Collapsible rail | Minimal header with search/switcher | Persistent section navigation; more visible, more clutter |
| W3 | Search | Overlay across authorized work | Dedicated searchable library | Context-local search; simpler results, harder cross-context retrieval |
| W4 | Open work | Conversation dominant | Result dominant with discussion panel | Specialized full-width editor/map with contextual commands |
| W5 | Inputs | One compact form | Progressive steps | Conversation collecting fields with a visible confirmation summary |
| W6 | History | Expand within the work | Versions side panel | Activity destination; useful at volume, another place to navigate |
| W7 | Work needing attention | Mark it in recent work | Review drawer | Dedicated inbox; useful for many decisions |
| A1 | Agency organization | Customer filter in shared library | Workspace/customer switcher | Dedicated customer list and detail view |
| A2 | Handoff creation | Dialog attached to work | Handoff panel alongside work | Dedicated review/send step for substantial deliverables |
| A3 | Recipient acceptance | Work opens with acceptance panel | Dedicated acceptance page then work | Guided accept flow; more explanation and more steps |
| A4 | Access management | Share dialog listing exact grants | Access panel inside work | Account access directory with deep links; never imply agency-wide permission |
| A5 | Handoff delivery | Manual copy-link | Explicit reviewed email send | In-app inbox plus email; delivery infrastructure is additional work |
| M1 | Managed-client entry | Same home, managed work included | Dedicated service view inside app | Existing separate client area, visibly connected |
| M2 | Client approval | Inline proposed change | Review panel beside preview | Central approval queue; preserves high-volume triage |
| C1 | Account settings | Modal/sheet | Single settings page with sections | Separate personal/workspace settings; ownership clearer, navigation larger |
| C2 | Upgrade/payment | Contextual gate then hosted checkout | Plan comparison destination | Account billing entry; payer and beneficiary always explicit |
| C3 | Integrations | Connect at point of use | Connections panel in settings | Dedicated directory; useful only when breadth warrants it |
| C4 | Support | Contextual help/contact drawer | Searchable help destination | Both with escalation preserving relevant context by consent |
| C5 | Release communication | Dismissible inline notice | What's-new drawer | Shareable release page; don't force every return through announcements |
| O1 | Internal operations | Separate operator app section | Separate operator host | Exact deployment choice open; customer permissions never follow operator navigation |

## Behavior coverage for every chosen structure

- First visit and returning visit; empty account and large history; personal and agency context.
- Loading, measured/partial/unavailable result, failure, retry, interrupted session, and unsaved changes.
- Authentication cancellation, callback recovery, wrong account, expired invitation, revoked access, and unsupported product.
- Clear difference between preparing, saving, sharing, accepting, publishing, and verified completion.
- Mobile full-screen replacement for narrow panels; no nested modal stack. Keyboard focus/return, long names, readable evidence, and reduced motion require rendered checks.
- No silent customer/context switch, no hidden payer change, and no permission inferred from Client or Paid User labels.

## Mobbin reference board: entry and work

| Reference | Observed pattern | Decision it informs |
| --- | --- | --- |
| [Elicit Recent](https://mobbin.com/screens/d24b4334-a8fa-4a9e-b8e0-50ed35eaf752) | Creation actions, owned/shared work tabs, search | E1, W1, W3 |
| [Skillshare products](https://mobbin.com/screens/88d7bf05-e607-4dbd-bb39-d738b3ef4d9a) | Browse, New entry, filters, product grid | E2, C5; density is a tradeoff, not a proposed copy |
| [Whop Discover](https://mobbin.com/screens/cbcd2cb9-77f5-49a2-bee3-3337a3086f76) | Separate discovery destination, search and filters | E2, E3 |
| [Wrangle setup](https://mobbin.com/screens/a36483f9-b739-404c-bfe4-49a88aaac5cd) | Join existing or create workspace | E5 |
| [Dovetail welcome](https://mobbin.com/screens/ba3954bc-f187-443d-84b6-73b9e61e9e94) | Name, work type, workspace name and region setup | E5; fields are examples, not required Strelva inputs |
| [Lovable project search](https://mobbin.com/flows/8a95ff56-f887-426a-86c1-9f9407aca0e6) | Prompt-centered home, project navigation, search and creation close together | W1–W3; distinguish retrieval from creating new work |
| [Codecademy assessment](https://mobbin.com/flows/4a76a2f1-e45c-4d90-a3aa-a30debcc9f44) | Step count and result history on completion | W5, W6; no proof of resumability from screenshots alone |
| [beehiiv website publishing](https://mobbin.com/flows/cc8a7f73-6989-4cd0-b64c-a7d2727a9a7c) | Preview, page/device controls, explicit publish state | W4, M2; does not establish Strelva self-service publishing authority |

## Mobbin reference board: agency and managed review

| Reference | Observed pattern | Decision it informs |
| --- | --- | --- |
| [Mural sharing](https://mobbin.com/screens/595ecadd-b350-4820-a7ba-35e9190b3151) | Email recipient, role selector, link controls | A2, A4; copy ownership is an additional Strelva-specific decision |
| [Asana project access](https://mobbin.com/screens/71b098f6-f160-4d1c-8798-f793f92b2633) | Members, invite field and private access | A4; do not copy broad project access into exact-work delegation |
| [Qatalog account chooser](https://mobbin.com/screens/48ae9bce-7fbb-44fd-bb27-e6cea806863c) | Explicit personal/organization selection | A1, C1 |
| [Aboard approval](https://mobbin.com/screens/473a91f7-3b9f-4e2b-9c22-ff199209aa7f) | Comment field, approval flow, separate reject/approve | M2 |
| [Deel change request](https://mobbin.com/screens/04cf3d45-777b-4066-a5b2-b13598930ce7) | Selected request, review status, timeline and cancellation | A3, M2; persistent review versus quick dialog |

Agency alternatives are: a quick handoff attached to a result; a dedicated review page with history; or a context-specific shared-work queue. The first minimizes navigation, the second supports substantial review, and the third supports many customers but depends on reliable discovery and delivery. None is selected.

The current handoff creates a manually copyable link, not an outbound email. Recipient-controlled read access is unchecked by default. A customer may receive their copy into a reused customer workspace; acceptance does not require creating a new workspace every time. "Accept my copy" and "Approve a website change" must never imply the same authority. Granular expired/revoked/wrong-account explanations must only reveal details permitted for the authenticated recipient; outsiders receive a safe unavailable response.

## Mobbin reference board: account and utilities

| Reference | Observed pattern | Decision it informs |
| --- | --- | --- |
| [Hex workspace chooser](https://mobbin.com/screens/65d8d999-28f4-4f14-bd00-e25852008893) | Full-screen chooser, role/member information, create workspace | E5, A1, C1 |
| [Rise plans and billing](https://mobbin.com/screens/e7f1597f-23a9-4210-a3cc-2f2a34fec3c2) | Workspace subscription, seats, plan comparison and billing management | C2; not evidence that Strelva should price by seat |
| [Mistral admin subscriptions](https://mobbin.com/screens/5f89e87b-eb0c-499a-b765-68e7e3a6f065) | Explicit admin mode, distinct access/subscription/billing sections | O1, C1; reference concerns organization administration, not equivalent Strelva operator authority |
| [Pipedrive notification settings](https://mobbin.com/screens/a03d90c7-1adf-42a8-b1f8-b415cf13e4c3) | Personal account and company concerns separated | C1, C4, W7 |
| [Confluence account modal](https://mobbin.com/screens/ed0de1ce-bf14-4cfc-a512-d95ac91bc369) | Account utility in a modal | C1; alternative to a durable account hub |

Account alternatives are a persistent context switcher with scoped settings; a durable account hub before entering work; or a labeled utility panel available inside each working view. These respectively favor frequent switching, explicit orientation, and unobstructed working space. A context is an actual personal/workspace/customer entity, not a Client or Enterprise badge. Service relationship and paid standing annotate context; they do not create one or grant permissions.

Agency membership is never a route into the operator-only `/admin` area. Operator entry requires independent authorization in all alternatives. Billing placement is a UX choice, but its scope must follow the actual payer/subscription model; a convenient panel cannot silently change that model.

## How to use the map

Nothing is selected. Mark a row with A, B, C, a combination, or an alternative. Compare the full combination before implementing any screen. Examples of dependencies: a task-first entry can lead to a saved-work home; a product shelf does not require permanent product tabs; an agency context does not confer access to all customer work; fewer pages can still produce too many panels.

Before implementation, compare the same sample assessment, website proposal, and customer handoff across the retained structures. Test start, interruption, return, find, approve, accept, and revoke. Record observed comprehension and completion rather than calling a preferred screenshot validated.
