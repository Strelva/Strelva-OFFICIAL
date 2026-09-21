# Strelva as the IDE for business

Research correction: the [later horizontal product research](./strelva-horizontal-product-research.md)
revisits this memo's categorical competitor and runtime claims against current
documentation. Inspection, governance, and recovery are not absent from existing
products. Treat the original argument below as a hypothesis, not established
competitive evidence or accepted product topology.

Prepared September 11, 2026. Status: product research memo for Jacob's review.
It proposes direction and an object model. It does not authorize implementation,
a release, prices, production changes, or deletion of existing behavior.

This memo answers one question: what is the strongest version of Strelva if the
product thesis is that a business opens Strelva, says what it wants, and Strelva
understands the business, builds or changes the capability, exposes the interface
to run it, connects the systems, and keeps operating it over time. Agencies use
the same environment across many client businesses.

It is written to be read top to bottom. Sections 1 to 5 carry the argument.
Sections 6 to 20 are the required deliverables and can be read on their own.

---

## 1. The strongest interpretation

An IDE is not valuable because it has an editor. It is valuable because it holds
a complete, inspectable model of the project and runs every action against that
model with immediate feedback and a history. Rename a function and every caller
changes. Run the tests and you know if it still works. Look at the diff and you
know what you are about to ship. The editor is the least important part.

The weak readings of "IDE for business" all keep the editor and drop the model:

- **Chat that can call tools.** No persistent model of the business, no diff,
  no history that means anything. Every request starts from zero.
- **App builder with AI.** Retool, Lovable, and Airtable generate applications.
  None of them owns a model of the business the app serves, so nothing they build
  can be inspected, rehearsed, or reverted as a change to the business.
- **"AI operating system for business."** Too abstract to build. It has no
  primitive, so every feature is a new category.

The strong reading is this. Strelva holds a live, typed model of how a business
operates: what it offers, who it serves, how people reach it, what it has
promised, and what rules it follows. Every change Strelva makes runs against that
model with a preview, a rehearsal, a plain-language diff, and an undo. Some of
those changes are standing: Strelva keeps doing them inside limits the owner set.

The owner never sees an IDE. The owner sees their business as something they can
point at and change. The IDE is what Strelva is underneath. The programming
language is the small set of typed business objects and the operations allowed on
them. Without that language there is no refactor, no diff, and no test, which is
why "what is the primitive" is the first question, not the interface.

One more consequence follows. An IDE for code works because code has a runtime.
If Strelva only orchestrates other people's SaaS, it has no runtime and can never
offer preview, rehearsal, or rollback for the things that matter. Strelva has to
run the capabilities it builds. It already does this for websites and Home
Finder. The thesis says: extend that runtime to intake, records, follow-up, and
booking, and treat everything else as a connection.

## 2. The primitives Strelva should own

The test for a primitive: a person can point at it, Strelva can change it, it
needs a history, and it needs a permission. Six things pass. Everything else is a
view.

| Primitive | Plain meaning | IDE parallel | Visible to owner? |
| --- | --- | --- | --- |
| **Business** | The environment. Everything belongs to exactly one business. An agency is a person with access to many. | Repository plus runtime | Yes, in the sidebar |
| **Record** | A typed thing the business works with: lead, booking, page, listing, customer, quote, review. Has links and a timeline. | File, with the AST | Yes, inside a capability |
| **Capability** | A working, installed piece of the business: Website, Seller Intake, Booking, Lead follow-up. Bundles record types, surfaces, operations, rules, and connections. | Module or package, built and running | Yes, as the business outline |
| **Change** | A proposed, previewable, reversible modification to records, a capability, or a rule. Branch, diff, review, and deploy collapsed into one object. | Branch plus PR plus deploy | Yes, as a receipt |
| **Responsibility** | A standing delegation: Strelva keeps doing X within bounds. Has scope, limits, budget, escalation, and a log. | Daemon with a policy | Yes, as "Strelva is handling" |
| **Connection** | A link to a system the business already uses. Strelva reads through it and writes only through governed actions. Credentials are custodied, never copied into capabilities. | Dependency | Yes, with consent |

Two things deliberately are not primitives:

- **Work** is the thread: an intent and what Strelva did about it. It produces an
  answer, a Change, a Capability, or a Responsibility. It is the unit of the
  sidebar's "recent work" and of history, not an authority object. This matches
  the current DESIGN.md reading of Work as a history label.
- **Agent** is implementation. Owners see Responsibilities and Work, never agents.

Tested against the candidate models in the brief:

- *Business → capabilities → objects → interfaces → actions.* Close. Interfaces
  should not be a primitive the owner manages. Surfaces derive from a capability
  and its record types. Actions are operations a capability declares on records.
- *Business → data → experiences → operations → agents.* Wrong at both ends. Data
  without a type has no operations, and agents should never be visible objects.
- *Outcome or Responsibility as the root.* Responsibility is essential but it is
  a thing running inside a business, not the container.

The property that keeps the interface simple: a business is only ever a set of
capabilities, each of which is only ever records, rules, surfaces, and
connections. A dental practice and a brokerage differ in which capabilities are
installed and what their record types are, not in the shape of the interface.

### Translating the IDE vocabulary

| IDE concept | Business-native form | Needed? | Visible? |
| --- | --- | --- | --- |
| Repository | The Business: its model plus its history | Yes | Yes |
| File tree | The capability outline: what is installed, and its records | Yes | Quietly, in the right rail. Never a nav tree |
| Runtime | Strelva's hosted execution: sites, forms, records, workflows, responsibilities | Yes | Only as "live" |
| Build | Assembling a capability from its definition | Yes | Only as "preparing" |
| Deployment | "Make live" | Yes | Yes, deterministic button |
| Debugging | "Why did this happen?" trace over the event ledger | Yes | Yes |
| Dependency | Connection | Yes | Yes, with consent |
| Environment | Preview and Live. Exactly two | Yes | Yes, as those two words |
| Branch | A Change while it is proposed | Yes | No. Changes are serialized per capability so there is never a merge |
| Diff | The Change receipt: "7 pages, 1 routing rule, 2 templates" with before/after in each item's own rendering | Yes | Yes |
| Version history | The business history: changes, results, responsibility actions | Yes | Yes |
| Compiler errors | "This won't work yet": missing connection, missing consent, unverifiable claim, rule conflict | Yes | Yes, plain sentences, block before live |
| Test suite | Rehearsals: saved scenarios re-run on every change | Yes | Yes, as "Try it" and "Checks" |
| Observability | One typed event ledger per business | Yes | Only through debugging and activity |
| Package / library | Capability catalog, and Patterns for agencies | Yes | Owners see capabilities, agencies see patterns |
| Agent | Roles inside the kernel | Yes | No |
| Terminal | None | No | Rejected. The intent bar is not a terminal |
| Command palette | Ask/Do bar scoped to the selected object | Yes | Yes |
| Preview | Visual preview plus rehearsal | Yes | Yes |
| Source of truth | Strelva is canonical for what it runs. Connected systems stay canonical for their own data, mirrored with provenance | Yes | Shown honestly as "from Google, as of" |

## 3. The system and object model

### What a person opens

Opening a business opens its model:

1. **Identity and profile.** Name, locations, hours, offers, brand, voice. Seeded
   from the existing scanner and AI Visibility assessment, then corrected inline.
2. **Capabilities**, each with its record types, surfaces, operations, and rules.
3. **Connections**, each with scope, consent, freshness, and last verified read.
4. **People and access.** Owner, staff, agency members with scoped grants.
5. **Rules.** Typed policies stored as data and displayed as sentences.
6. **Responsibilities** currently standing, with their limits and last actions.
7. **History.** The event ledger and the change log.

### Canonical versus connected

Strelva is the source of truth only for what it runs: website content, intake
forms, records created through Strelva capabilities, rules, responsibilities,
rehearsal scenarios, and history. Everything a business already runs elsewhere
(email, calendar, Google Business Profile, MLS, payments, an existing CRM) stays
authoritative there. Strelva mirrors with provenance and writes only through the
governed action path, exactly as the current Google Business and review-reply
gates already work. A mirror never transfers authority, which is the same rule
`docs/persistence-boundaries.md` already applies to Redis.

The graph is not a triple store. It is typed Postgres records with explicit link
types, an append-only event ledger, and snapshots. That is what Palantir's
Ontology is underneath its marketing, and it is what `src/lib/tenants.ts` plus the
workspace tables already are in miniature.

### How the model is discovered

From the outside in: a URL gives pages, offers, contact details, and structured
data; Google Business gives hours, reviews, and categories; the email domain and
calendar give people and rhythm; payments give what sells. The existing audit and
assessment engines are the indexer. The onboarding surface is "here is what I
understood about your business, correct me," not a wizard.

### Capability definitions are data

A capability is a versioned definition: record types, surfaces built from a
governed component vocabulary, operations with risk tiers, rules, required
connections, rehearsal scenarios. Because it is data, it can be diffed, reverted,
copied to another business as a Pattern, and upgraded. Custom capabilities that
the catalog cannot express are authored as code in a sandbox but still declare
the same definition so they get the same diff, rehearsal, and history.

## 4. The interface architecture

Keep the shell. Left: New, Search, Businesses or Clients, Recent work, Account.
Center: the work surface. Right: an optional rail for the selected object.

**Business home** is not a dashboard. It is a page with four short sections in a
fixed order: what needs you (attention items), what Strelva is handling
(responsibilities), what changed (recent changes with receipts), and what is live
(the capability outline). No cards, no charts by default. Numbers appear only
inside an answer someone asked for.

**Work** is a single surface with a thread on the left edge and the object of the
work in the center. Intent at the top, then the shape card, then the plan, then
the preview, then the Change receipt, then status. Conversation and direct
manipulation are the same thread: an inline edit to a page section appears as an
item in the same Change as a request typed in words.

**Capability view** shows a capability's surfaces: usually a list of records, a
detail view, and the capability's rules as sentences. It looks the same for
Leads, Bookings, and Listings because it is generated from the record type.

**Record view** is the object in the center and its timeline in the rail.

**The right rail** is the inspector: details of the selected object, its history,
its allowed actions, and an "on this" intent box scoped to it. Select seven leads
and the rail offers bulk actions; the result is one Change.

**Ask/Do** is a single bar that knows the selection. "Improve this section for
first-time buyers" with a homepage section selected proposes a Change to that
section, in place. Nothing is ever typed into a detached chat panel.

**What Strelva is doing** is a quiet activity strip on the Work surface and an
Activity list at the business level. Each entry is a sentence with a receipt.

**Errors** are sentences with one next action, never codes. "The booking form
can't go live until Google Calendar is connected. Connect it."

**Changes commit** through one deterministic control: Make live. It is disabled
until checks pass, it names what will be affected, and it produces an Undo that
stays available.

## 5. Two workflows

### Owner: intent to operation

1. **Intent.** "We keep losing catering inquiries." Typed into New with the
   business selected.
2. **Shape.** Strelva answers with a shape card, not a build: "This looks like a
   catering intake on the website, a Catering request record, a rule that sends
   requests to Maria within 10 minutes, and Strelva following up if nobody
   replies in a day. It will use your existing email. Build all four?"
3. **Build.** A preview appears: the page, the form, the record list, the rule as
   a sentence. Everything is editable in place.
4. **Rehearse.** "Try it" plays a synthetic customer: fills the form, the record
   appears, the notification goes to a test inbox, the follow-up fires on a
   compressed clock. The trace is shown as a story.
5. **Make live.** The Change receipt lists what will exist and what will change.
   Checks are green. One button. Undo stays available.
6. **Operate.** The Responsibility "Strelva follows up on unanswered catering
   requests" appears on the business home in supervised mode. Each action it
   takes is a receipt. After enough clean actions the owner can move it to
   trusted, or leave it supervised forever.
7. **Debug.** Three weeks later: "Why didn't the Thursday request get a reply?"
   Strelva walks the ledger: form submitted, record created, notification
   bounced, follow-up blocked by the bounce. It proposes a Change: fix the
   address and resend.

### Agency: across clients

1. The sidebar lists clients. Selecting Buffalo Realty enters that business's
   own environment with the agency member's scoped access.
2. The member does the owner workflow above. Where the client must approve,
   Make live becomes Request approval and the client receives it in the same
   environment.
3. When the seller intake works, the member saves it as a Pattern. The Pattern
   is the capability definition with the business-specific bindings marked.
4. Selecting Hartwell Realty and "Use the seller intake pattern" installs it
   bound to Hartwell's brand, records, staff, and geography, then runs the same
   rehearsals before anything goes live. The receipt shows what adapted.
5. The only cross-client view is Attention: work needing judgment across all
   clients, opened one at a time in the client's environment. No portfolio
   dashboard, no agency reporting suite.

---

## 6. Answers to the research questions

The rest of the memo maps to the required output list. Research-backed sections
cite sources in section 20.

### 6.1 Research question 1: the primitive

Answered in section 2. The smallest set is Business, Record, Capability, Change,
Responsibility, Connection. Work is the thread that produces them. The
supporting evidence from the product survey is consistent: Linear runs a large
product on three nouns, Shopify's Sidekick generates reliable automations
because the store schema is small and well typed, and Palantir's Ontology is
objects, links, and typed actions as the only write path. Every product that
tried to expose a bigger vocabulary to end users (Zapier's Zaps, Tables,
Interfaces, Agents, and Canvas as separate things) fragmented.

### 6.2 Research question 2: what a workspace is

Answered in section 3. Two research findings sharpen it:

- **Retrieval must inherit permissions from the source systems.** Glean's
  enterprise graph mirrors source ACLs in real time and routes every agent
  action through them. Connections in Strelva must carry scope and the
  mirrored data must carry the permission it came with, or an agency member
  will see a client's inbox through a mirror they should not have.
- **Infer the model, then let the person correct it.** Palantir's Ontology is
  the right end state and the wrong onboarding. It needs forward-deployed
  engineers. Devin's DeepWiki shows the alternative: index the system, generate
  the map, keep it fresh from changes. Strelva's existing scanner and AI
  Visibility assessment are already that indexer for the public half of a
  business.

The gap Strelva can occupy is real. Surveys compiled in 2025 put CRM use at
about half of firms under ten employees, against over ninety percent above
that size. The same firms run on an average of about five tools. For the
smallest businesses the system of record is email, the calendar, Google
Business Profile, the website, and the accounting ledger. Half of them have no
customer system at all. A business model that starts from the website and the
Google profile, and treats a CRM as optional, fits how those businesses
already operate.

Canonical versus connected is the durable rule. Strelva runs and owns what it
builds. It mirrors what the business already runs elsewhere, with provenance and
freshness visible, and writes to those systems only through governed actions.

### 6.3 Research question 3: what New means

New is where a person states intent for a business without choosing a category.
Strelva's first response is never a build. It is a **shape card**: one sentence
per part, what each part touches, and which of four outcomes it is.

| Outcome | Meaning | Example |
| --- | --- | --- |
| Answer | Read-only result, saved as Work | "How did last month's inquiries go?" |
| Change | Modify something that exists | "Improve the homepage for first-time buyers" |
| Capability | Build something new and install it | "Build a seller intake experience" |
| Responsibility | Delegate something ongoing | "Follow up with leads who viewed a listing twice" |

"We need a better way to handle commercial customers" resolves against the
business model, not a form: Strelva looks at what capabilities exist, what
records mention commercial customers, and what connections are available, then
proposes a shape with three or four parts the person can strike out. Devin's
"research first, then plan, then ask" opening move and Excel Copilot's plan mode
are the same gate. The cheap explicit step between thinking and changing is
what keeps ambiguity from becoming configuration.

Reject: a category picker on New, a blank chat, and any flow that asks for
settings before showing a shape.

### 6.4 Research question 4: generative interfaces

The 2026 evidence is unusually clear. Every serious platform converged on the
same design: the agent emits validated data against a governed component
catalog, and it never draws pixels.

- Vercel paused its component-streaming generative UI after production failures
  and replaced it with json-render, a catalog of typed components the model can
  only select from, validated before render. Google's A2UI, OpenAI's Open-JSON-UI,
  Salesforce's Generative Canvas, and Retool's app generation all take the same
  shape: composition from approved blocks, no arbitrary code.
- Fully generated HTML wins preference tests for one-shot answers (Google's
  Generative UI paper: preferred over markdown about 83 percent of the time) but
  takes a minute or two, has an error rate that swings from zero to 60 percent
  by model, and produces disposable pages nobody can diff or upgrade.
- Agent-authored code is where the damage is. About one in ten public Lovable
  projects shipped with missing row-level security. The Replit agent deleted a
  production database during a code freeze and misreported the rollback. Both
  vendors responded in 2026 with sandboxes, PR flows, and review surfaces.
- HCI results favour an explicit intermediate representation: generate the data
  model first, derive the UI from it, and keep an inspectable spec between the
  person and the render. Users report more control and more predictable
  refinement when that spec exists.

Recommended architecture for Strelva, in tiers:

1. **Schema-derived surfaces** for records: list, detail, form, timeline. The
   agent proposes fields. The renderer is deterministic. Permissions on fields
   become permissions on the interface for free.
2. **A governed catalog** of Strelva components for everything else: comparison,
   stage board, calendar, receipt, rehearsal trace. The agent composes from it.
   Tokens, spacing, motion, and accessibility live in the components, which is
   the industry's stated fix for design drift.
3. **Capability definitions persisted as versioned data** with the originating
   intent stored next to the spec. This is what makes a capability diffable,
   revertible, upgradeable when a component changes, and copyable as a Pattern.
4. **Sandboxed code** only for custom capabilities the catalog cannot express,
   behind review, with a deny-by-default content policy and host-brokered
   actions, the model MCP Apps standardised in January 2026. Code never owns
   auth, data access, or the shell.
5. **Full-page generation** only for throwaway explanations, never persisted.

Measured by task completion and render error rate, not screenshots.

### 6.5 Research question 5: business objects as manipulable things

Yes. Records are first-class and the interaction model comes from three places:

- **Inspector on any selection.** Unity's model: a hierarchy on one side, a
  property inspector for whatever is selected on the other, with a visible tint
  when you are in simulation. Strelva's right rail is the inspector.
- **Point at the thing and say what you want.** Lovable's Visual Edits: click an
  element in the live preview, describe the change, receive a readable diff.
  Strelva does this for a page section, a lead, or a rule.
- **Bulk action as one Change.** Select seven leads, choose an action, preview
  the mutation per record, execute once, undo once. Cursor's staged multi-file
  diff with per-item accept and reject is the pattern.

Each record has a timeline. Every action on it, human or Strelva, appears there
with a receipt. That timeline is also the debugger's entry point.

### 6.6 Research question 6: diff and version control

Simplest model that gives confidence: **Proposed, Live, Undo.** Nothing else is
visible.

- A Change lists affected items grouped by kind: "7 pages, 1 routing rule, 2
  email templates, 1 booking requirement." Each item shows before and after in
  its own rendering. A page shows as a page. A rule shows as two sentences.
- Nothing writes until Make live. Shopify's Sidekick lands automations as
  drafts that the merchant activates; nearly half of new Flows came through it
  and none auto-activated.
- A snapshot is taken before every live change. Undo is a new Change that
  reverts it, so history is never rewritten. Cursor's checkpoints are the right
  interaction and the wrong durability; they are lossy and local. Strelva's
  checkpoints are the history.
- Undo keeps what arrived in between. PlanetScale's revert window preserves
  data written after the change; Strelva's Undo must keep the leads and
  bookings that came in while the change was live. Restoring also pauses any
  automatic publishing until the owner clears it, as Vercel's rollback does.
- Every publish is a named version with who, what, why, and the Work that
  caused it, reachable at a permanent link. Framer and Zapier both do this
  for non-technical users.
- Changes are serialized per capability, so there is never a merge. Branching
  the business model (Palantir does this, Figma does this for files) is powerful
  for operators and should stay internal until an agency proves it needs it.
- Approval gates come from the existing governance tiers. High-risk facts
  (prices, hours, contact details) already require review. That table extends to
  records and rules.

Environments collapse to two words: Preview and Live. Stripe moved from a global
test-mode toggle to named sandboxes because the toggle leaked into live. Strelva
should never show an environment switch to an owner.

### 6.7 Research question 7: preview and simulation

This is the strongest differentiator available and no product in the survey
ships the full version. Call it **Rehearsal**.

- **Play a customer.** Strelva creates a synthetic customer from the business's
  real patterns and walks them through the capability: fill the form, watch the
  record appear, see the notification land in a test inbox, watch the follow-up
  fire. Replit's Agent 3 tests its own build in a visible browser before
  handing it over. Strelva does the same for a business capability.
- **Advance time.** Stripe's test clocks let you attach a customer to a clock
  and move it 30 days to see invoices and dunning fire. A Responsibility with
  a "follow up after one day" rule should rehearse on a compressed clock.
- **Real incidents become saved scenarios.** Sierra turns every annotated
  conversation into a replayable test run before each release. Decagon runs
  persona batches then reviews every live conversation against the same
  criteria. Strelva keeps each rehearsal as a scenario and re-runs the set on
  every Change to that capability. That is the business's test suite, and the
  owner never hears the word test.
- **Replay history against a proposed rule.** "Here is what this new routing
  rule would have done to last month's 40 inquiries." Palantir's Scenarios are
  forks of the object graph for exactly this.

Three details from the research make Rehearsal honest:

- **Three parties, repeated runs.** Sierra and the tau-bench work use an agent,
  a simulated customer, and an independent judge, and score reliability over
  repeated runs rather than one pass. Sierra's own benchmark showed strong
  models passing eight of eight runs less than a quarter of the time. Strelva
  reports "passed 8 of 8," which is the number an owner can act on.
- **Sandbox what has one, simulate what does not.** Stripe sandboxes and test
  clocks, Twilio test credentials, and Resend test addresses exist. Google
  Business Profile has no sandbox at all. Google writes are rehearsed at the
  proposal layer and always gated by approval, which is the current rule.
- **Synthetic customers find procedure bugs, not tone.** The research on
  simulated people is clear that they flatten real customers. Rehearsal
  proves the capability works. It does not prove the copy is right.

Rehearsal runs in a visibly tinted mode, persists nothing to live records, and
sends nothing to real people. That separation lives in the tool layer, not in
a prompt. Strelva's Home Finder preview already has the
no-persistence, no-send invariant. Extend it.

### 6.8 Research question 8: debugging the business

A business-native debugger is a story told from the event ledger, with the
broken step highlighted and a fix offered as a Change.

What the ledger needs, taken from Stripe and Temporal:

- Every side effect carries a request id and an idempotency key. Every event
  links back to the request that caused it and records previous values.
  Stripe's event object does exactly this, and it is why "object, then events,
  then request" is navigable from any starting point.
- Every capability run is an append-only history with pending steps visible.
  Temporal's Pending Activities and Call Stack views are the tools for a stuck
  workflow. Strelva's version is "waiting on: Maria's reply, since Thursday."
- Long causal chains use links between traces, not one giant trace. The lead
  submitted on Monday and the follow-up on Wednesday are two traces joined by a
  caused-by link.
- Funnel drop-off drills to the actual people. PostHog lets you click a step
  and list who dropped there. "Why aren't leads converting" starts with the 14
  who stopped at the same step.

- **Expected events make absence visible.** A capability declares what should
  happen and by when: "follow-up due within fifteen minutes of a new lead."
  Then the debugger can surface a missing event, not only a failed one. Errors
  are the easy case. Silence is the one owners actually notice.

What the person sees is none of that vocabulary. They see:

> Thursday's catering request was received and a record was created. The
> notification to maria@ bounced. Because it bounced, the follow-up did not run.
> Fix: correct the address and resend. [Make this change]

Agent reasoning is exposed the way Sierra's Agent Traces and Intercom's Fin
Operator do it: a simplified decision path for the owner, full detail one level
down. Anomaly detection feeds the same attention list Strelva already has for
domains and site health.

### 6.9 Research question 9: responsibilities

Responsibility should be a visible primitive. It is the difference between a
tool that builds and a service that operates, and it is where Strelva's existing
governance already lives.

A Responsibility is a document the owner can read:

| Field | Plain form |
| --- | --- |
| Scope | "Inquiries that arrive through the catering form" |
| Actions allowed | "Reply, ask a clarifying question, assign to Maria" |
| Never | "Quote a price, promise a date, contact anyone twice in a day" |
| Approval | "Ask me before any reply that mentions cost" |
| Budget | "Up to 20 messages a day" |
| Escalate to | "Maria, then Jacob" |
| Voice and hours | "Friendly, first name, 8am to 7pm" |
| Trust level | Supervised or Trusted |
| Log | Every action with a receipt |

Three findings from the research shape the design:

- **Deterministic rules first, judgment second.** Claude Code evaluates hooks and
  deny rules before any model-based classifier, and those rules survive even
  permissive modes. Money, outbound messages, and external writes are rules.
  The long tail is judgment.
- **Policy is the program and every decision cites its clause.** Ramp's policy
  agent applies the written policy to each transaction, cites the text it used,
  clears three of four in-policy cases with no human, and proposes policy edits
  from what it observes. A Strelva Responsibility's "Never" and "Approval" rows
  are that policy.
- **A human stays the owner.** Linear keeps the person as assignee and adds the
  agent as contributor. Every Responsibility has a named person.

Two more requirements come from product policy and incident history. The legal
sources below are research leads, not a verified statement that one rule applies
to every Strelva message, jurisdiction, or channel:

- **Disclosure is in the template, not the prompt.** European Union, California,
  Utah, and FCC materials describe disclosure duties in specific contexts. The
  exact applicability to a Strelva message requires jurisdiction, channel, and
  use-case review. Separately, Strelva adopts sender disclosure as a product
  trust policy. Every message a Responsibility sends identifies Strelva, and
  every "Never" row is enforced by the tooling. The Air Canada chatbot dispute
  also shows the cost of allowing a bot to invent company policy.
- **Each Responsibility has an identity and a sponsor.** Microsoft's agent
  identity model gives every agent a directory identity, a recorded human
  sponsor, and an audit trail that marks its actions as an agent's. Strelva
  records the Responsibility, the person who approved it, and the evidence it
  relied on against every external write.

The default posture is what the Knight Institute's autonomy paper calls the
Approver level: the agent runs on its own, and every consequential external
action is confirmed unless the owner pre-authorised that class of action, with
the pre-authorisation itself logged and revocable.

Trust is earned per Responsibility. It starts supervised: every action is a
proposal. After a run of clean receipts the owner can move it to trusted for the
actions inside its boundaries. Review-reply auto mode with its delay and
re-check is already a trusted Responsibility in today's code.

### 6.10 Research question 10: agency mode

An agency is a person with access to many businesses. The research supports
keeping it that small.

- **Isolated tenants, one governance surface.** Shopify Plus runs expansion
  stores as fully independent instances under one organization admin for
  permissions. Stripe lets a user hold a different role in each sandbox.
  Strelva's tenants already work this way.
- **The only cross-client view is attention.** ServiceNow's control tower and
  Cursor's agents window are fleet views of "what needs judgment." An agency's
  version is one list: approvals waiting, responsibilities that escalated,
  changes that failed checks, opened one at a time inside the client's
  environment.

Agency-specific primitives that survive the ruthless test:

1. Scoped access per client (exists).
2. Request approval instead of Make live when the client must consent (exists
   in the delivery request flow, extend it to Changes).
3. Patterns: save a capability, install it elsewhere (section 6.11).
4. Cross-client search over records the member is allowed to see.
5. Internal notes on a client, private to the agency.
6. Handoff: the client takes over a capability and the agency's access ends
   without the capability changing.

Rejected: an agency dashboard, portfolio reporting, white-label shells, agency
billing inside the client's environment, and any agency-only navigation tree.

### 6.11 Research question 11: reusable capabilities

Strategically important, and not a template marketplace. Call them **Patterns**.

A Pattern is a capability definition with its business-specific bindings marked:
brand, record types, connections, staff, geography, rules. Installing a Pattern
in another business binds those slots from that business's model, then runs the
Pattern's saved rehearsals before anything goes live. The receipt shows what
adapted and what was reused.

No product in the survey ships all the parts, but each part exists somewhere:
a readable document that compiles (Devin playbooks, Decagon procedures), typed
triggers and actions (Shopify Flow), per-client modes over one definition
(Figma variables), tests carried with the package (Retool datasets), and
providers that fall back in order and charge only on success (Clay).

Sequence: agency-private Patterns first, then Strelva-curated Patterns, and
only then anything shared between agencies. The current custom-repo starter is
already the Pattern for client websites.

### 6.12 Research question 12: agent architecture

No universal agent. The kernel Strelva already has (intent, authority,
execution, verification, recovery) gets five roles, each with narrow tools:

| Role | Lives | Tools | Never |
| --- | --- | --- | --- |
| Interpreter | Per intent | Business model read, catalog read | Writes |
| Builder | Per Change or Capability | Definition write in preview, sandbox | Live writes, credentials |
| Reviewer | Per Change | Read definition, run rehearsals | Approves its own work |
| Operator | Per Responsibility, persistent | The Responsibility's allowed actions only | Anything outside its document |
| Inspector | Per question | Ledger read, trace walk | Writes |

Design rules taken from the research:

- Start with workflows, not agents. Anthropic's taxonomy reserves open-ended
  agents for open-ended problems and puts everything else on predefined paths
  with checkpoints. Most Strelva work is a predefined path.
- Sub-agents get context isolation and tool restrictions; a tool left out is
  not in the session at all. Multi-agent runs cost about fifteen times a chat
  and underperform when agents share context, so use them for breadth
  (research, review) not for one Change.
- Credentials never enter an agent's context. Anthropic's managed agents keep
  secrets in a vault behind a proxy so the harness is never aware of them.
  Strelva's secrets boundary already does this; extend it to every Connection.
- Every consequential action passes a permission chain in fixed order: rules,
  then approval requirement, then judgment. Auto-approved actions must still
  hit a hook, because anything skipped at that layer never reaches the check.
- Durable execution. Leased attempts, checkpoints, atomic completion, and
  resume-from-where-it-stopped. Strelva's assessment recovery already does
  this. LangGraph's caveat applies everywhere: code before an interruption runs
  again on resume, so side effects go after the gate or become idempotent.
- Supervisors audit operators. Sierra runs several supervisory agents over
  every production agent, one for input threats, others for policy compliance,
  steering rather than terminating.
- Memory is the business model and the ledger, not agent-private notes.

### 6.13 Research question 13: what to borrow

The full survey is in the sources. The twelve primitives worth taking:

1. A generated, continuously refreshed map of the system as the front door
   (Devin DeepWiki), not a search box.
2. An inspector on any selected object with a visible simulation tint (Unity).
3. Automatic restorable checkpoints per agent step (Cursor, Replit), made
   durable.
4. A staged change set with per-item accept and reject; nothing writes until
   approved (Cursor).
5. Point at the live interface, say what you want, get a readable diff
   (Lovable Visual Edits).
6. AI writes drafts, humans activate (Shopify Sidekick into Flow).
7. Time travel with test clocks (Stripe).
8. Real incidents become replayable regression tests (Sierra, Decagon).
9. Deterministic rules and hooks first, classifier second, per-tool approval
   with preview (Claude Code, Zapier Agents, Retool approvals).
10. Policy as the program, with cited clauses on every decision (Ramp).
11. Objects, links, and typed actions as the only write path; scenarios as
    forks of the graph (Palantir).
12. Capability packages as readable documents that compile, with per-client
    modes (Devin playbooks, Decagon procedures, Figma variables).

Eight things to reject: chat as the only surface; instant schema mutation on
live data (Airtable Omni); lossy convenience checkpoints; simulation as a
separate setup area or a plan-gated feature; standalone agent apps and
unbounded scheduled runs; model-everything-first ontologies; capability
fragmentation into SKUs; node-graph authoring for business users.

### 6.14 Research question 14: what disappears

| Conventional element | Replaced by | Realistic today? |
| --- | --- | --- |
| Setup wizard | Intent plus the inferred business model, corrected inline | Yes for public facts; partial for private systems |
| Settings pages | Rules stored as typed policy, shown and edited as sentences | Yes for the rules Strelva runs |
| Workflow builder | Responsibility document plus rehearsal | Yes for linear flows; branching stays explicit |
| Integration configuration | Connection with a consent screen; scope in plain words | OAuth consent remains explicit by necessity |
| Dashboard | Business home: needs you, Strelva is handling, what changed, what is live | Yes |
| Reports | Answers with dated evidence, saved as Work | Yes; existing reports are the seed |
| Form builder | Intake derived from the record type | Yes |
| CRM configuration | Record types emerge from installed capabilities | Yes for SMB scale |
| CMS admin | Website as records with Change and preview | Exists |
| Automation builder | Responsibility | Aspirational for multi-step, cross-system logic |

### 6.15 Research question 15: what remains explicit

Boring, structured, and predictable, on purpose:

- Money: prices, quotes, invoices, refunds, subscriptions, Strelva billing.
- Permissions and access, including agency scope and handoff.
- Connection consent and revocation.
- Make live, publish, and undo.
- Deletion and any irreversible action.
- Outbound communication policy: who Strelva may contact, how often, in what
  voice, with what consent. Real estate adds fair-housing language limits and
  consent for buyer contact.
- Identity and sign-in.
- Strelva sender disclosure in customer-facing messages. This is a selected
  product trust policy; legal duties vary by jurisdiction, channel, and use case.
- The Responsibility document itself. It is generated, but it is read and
  approved as a fixed form.

The existing governance rule that high-risk facts never auto-publish is the
first row of this list.

### 6.16 Research question 16: interface architecture

Answered in section 4. Two additions from the research:

- **Show the simulation state.** When a person is in Rehearsal the whole surface
  is tinted and the top says "Rehearsal. Nothing here is live." Unity's play
  mode tint is the model.
- **Narrate, but briefly.** ChatGPT agent's running commentary tested as helpful
  but slow. Strelva's activity strip is one sentence per step with a receipt,
  not a stream of thought.

### 6.17 Research question 17: first wedge

Reject "website plus direct modification" as the wedge. Framer, Wix, and
Webflow all edit sites from a prompt now. It is not fundamentally different.

The wedge is the smallest thing that uses all six primitives and ends with
Strelva operating, not just building:

**Intake to follow-up, built, rehearsed, and run, for one class of request.**

- Real estate: seller inquiry or buyer inquiry. Home Finder already produces
  inquiries with delivery receipts; the follow-up half is missing.
- Service businesses: quote or booking request from the website.

What the person experiences in one session: describe it, see the shape, watch a
fake customer walk through it, make it live, then watch Strelva handle the
first real one with a receipt. That sequence is what makes Strelva feel like a
different kind of thing. It is also where the money is for an SMB: a missed
inquiry is a lost job, and every owner knows it.

Why this and not lead debugging first: debugging needs a ledger, and the ledger
only exists once Strelva runs something. Why not a broad capability catalog
first: the catalog is only credible once one capability has been operated.

The first ninety days decide it. Benchmarks put roughly forty percent of
small-business software churn inside that window. The wedge has to produce one
visible win in week one: a real inquiry, handled, with a receipt. A discovered
business model and a pre-built intake get there faster than any onboarding.

The website stays the entry point because that is where intake lives and where
Strelva already has clients. The free diagnostics stay the front door because
they are the indexer that seeds the business model.

### 6.18 Two to three year path

**Now to six months.** Business model v1 seeded from audit, site, and Google
Business. Change with receipts and undo for website content and records.
Rehearsal v1 for one capability class. Responsibility v1, supervised only.
Agencies as a client list with scoped access. Kernel named and given one door.

**Six to eighteen months.** Capability catalog: booking, quotes, customer
records, seller intake, review handling. Connections: email, calendar, Google
Business, Stripe, MLS. Ledger-backed debugger. Patterns for agencies. Trusted
Responsibilities with budgets and escalation. Saved rehearsals as regression.

**Eighteen to thirty-six months.** Custom capabilities as sandboxed code under
the same definition contract. Replay history against proposed rules. Strelva as
the runtime for client-facing apps beyond websites. Strelva-curated Patterns.
An operator-of-record offering where Strelva accepts standing responsibility
under an explicit agreement, which is the Managed Websites model generalised.

### 6.19 Technical architectures that could enable it

- **Business model:** Postgres, typed records with link types, versioned
  capability definitions as JSON, an append-only event ledger, snapshots.
  Existing tenant, workspace, and audit tables are the seed.
- **Surfaces:** schema-derived renderers plus a governed catalog in the spirit
  of json-render or A2UI, over the existing component set. Definitions stored
  with intent.
- **Kernel:** the existing governance, executor, and shared agent factories,
  behind one entry point, with the permission chain in fixed order and hooks on
  every action including auto-approved ones.
- **Durable execution:** the leased-attempt, checkpoint, atomic-completion
  pattern already used for assessments, applied to Changes and Responsibilities.
  A workflow engine such as Temporal or Inngest becomes worth it once
  Responsibilities wait on humans for days.
- **Ledger and tracing:** request ids and idempotency keys on every side
  effect, previous values on every update, linked traces for long chains.
  OpenTelemetry's agent span conventions are still marked development, so
  adopt the shape, not the names.
- **Rehearsal:** a preview mode that swaps outbound providers for recorders,
  runs a compressed clock, and persists to a scenario store instead of live
  records.
- **Sandbox for custom code:** isolated execution with a deny-by-default
  network policy and host-brokered actions, credentials masked, the way MCP
  Apps and Claude Code's sandbox do it.
- **Client sites:** remain separate repositories with governed changes, which
  is already the boundary.

### 6.20 Unresolved risks

1. **Model inference from the outside in is shallow.** A website and a Google
   profile tell you the public half of a business. The operating half is in
   email, calendar, and someone's head. Getting it needs connections and
   conversation, and both cost trust.
2. **Rehearsal fidelity.** A fake customer that is too tidy proves nothing. The
   scenario generator needs real patterns and adversarial cases.
3. **Ledger completeness across connections.** A debugger is only as good as
   the events it can see. Google Business, MLS, and email give partial
   visibility.
4. **Cost per Responsibility.** Persistent operators plus supervisors plus
   rehearsal on every Change is real inference spend. Pricing per outcome
   (HubSpot and Intercom charge per resolved conversation) is the honest fit.
5. **Prompt injection through records.** A lead's message is untrusted input
   that an Operator reads. The best published defence still leaves about one
   percent attack success. Outbound actions from record content must stay
   behind rules, not judgment.
6. **Gated integrations.** Google Business Profile API access is manually
   approved, needs a verified profile older than sixty days with a website,
   starts with small quotas, and refuses increases when usage is low or spiky.
   Every MLS issues its own credentials and licence, and IDX display requires a
   participating broker. These are per-vertical fixed costs and per-client
   approval delays that no amount of product design removes. They are also a
   moat once paid.
7. **Systems of record are closing their doors.** Salesforce cut bulk Slack
   data access for non-marketplace vendors in May 2025. Expect more. Every
   mirror must be optional and every canonical domain must be one the
   incumbents do not hold for a small business.
8. **Blast radius.** The PocketOS incident in April 2026: an agent found an
   over-privileged token in an unrelated file and deleted a production volume
   whose backups lived on the same volume. Destructive operations need a
   platform gate independent of any agent, and backups must sit outside the
   agent's reach. Strelva's secrets boundary covers credentials; the backup
   rule is not yet written down.
9. **Definition drift.** Capability definitions must upgrade when the catalog
   changes without breaking installed capabilities. This is a versioning
   discipline, not a feature.

### 6.21 Strongest arguments against the thesis

Taken seriously, each one either kills the idea, is manageable, or points to a
better product.

| Argument | Verdict | Why |
| --- | --- | --- |
| Businesses do not think in systems | Points to a better product | True, and the owner never sees a system. They see a request, a rehearsal, a receipt, and "Strelva is handling." The system stays underneath. If the interface ever asks the owner to think in capabilities, it has failed |
| Generated interfaces become inconsistent | Manageable | Only if Strelva generates pixels. Catalog composition and schema-derived surfaces make it impossible by construction. This is the single most important architectural decision |
| Too much flexibility confuses | Manageable | New offers a shape, not a blank page. Four outcomes, six primitives, two environments. Flexibility lives in what gets built, not in how the interface works |
| Reliability is insufficient | Manageable, with a boundary | Building is unreliable; that is why nothing writes before Make live. Operating is reliable only inside a Responsibility document with rules first. Outside that document Strelva does not act |
| Integration fragmentation | Real and partly fatal for some categories | Strelva cannot own a business whose system of record is Salesforce or Shopify. Its ground is businesses whose operating state is fragmented across a site, email, a calendar, and a phone. That is most local service businesses and most brokerages |
| Owners buy one legible outcome and a bill, not an environment | Points to a better product | Confirmed by adoption and churn data. "IDE" is a founder and agency concept. The owner-facing product presents as a running business with a monthly number they understand |
| Users prefer existing SaaS | Manageable | They prefer their existing CRM until Strelva runs an intake that works and they never open the CRM for it. Strelva does not replace the CRM; it makes the capability that needed one |
| Agencies need explicit workflows | Points to a better product | They need explicit approval, explicit access, and Patterns. Those are explicit. What they do not need is a builder canvas |
| Agent permissions become dangerous | Manageable with the two-gate model | Rules first, cited policy second, named human owner, budgets, supervised-by-default. The Replit incident happened because none of those existed |
| Cost becomes unacceptable | Manageable with outcome pricing | Rehearsal and supervision cost money. Charge per handled inquiry, not per seat |
| Generated software becomes unmaintainable | Fatal if Strelva generates code by default; manageable if it does not | Definitions are data. Code is the exception, sandboxed, and carries the same definition contract. The vibe-coding maintenance record is the evidence for keeping code exceptional |

The one argument that does not resolve: if a foundation-model vendor ships a
credible small-business operator with connections to Google, email, and
payments, and prices it inside a subscription people already pay for, Strelva's
building layer is commoditised overnight. Section 6.22 is the answer.

### 6.22 The moat when models get much better

Better models make the Builder cheap. They do not give anyone the following,
and each is something Strelva accumulates by operating rather than by building:

1. **The business model and its history.** Records, rules, and three years of
   receipts live in Strelva. Leaving means leaving the memory of how the
   business runs.
2. **Standing Responsibilities.** Live delegations with earned trust levels are
   the hardest thing to migrate. Nobody re-earns trust for a new vendor's agent
   on a whim.
3. **Rehearsal scenarios.** Every saved scenario is a regression test for that
   business. They compound and they are useless to any other tool.
4. **Credential custody.** Connections with scoped consent are a trust boundary
   the owner granted once. Re-granting to a new vendor is friction with teeth.
5. **The runtime.** Strelva runs the intake, the records, the follow-up, and
   the site. An orchestrator over third-party SaaS owns none of that and can
   offer no rehearsal, no undo, and no ledger. Owning the runtime is the
   decision that makes the rest possible.
6. **Patterns across an agency's clients.** Every Pattern installed in a second
   client is a network effect within the agency, and every agency on Strelva
   compounds the catalog.
7. **Operating history is now a priced asset.** The AI services rollups
   (General Catalyst, Thrive Holdings, Crete, more than three billion dollars
   deployed by 2026) buy accounting and IT firms partly for their work records.
   One rollup says so explicitly. That is the same asset Strelva accumulates in
   software, with the agency rather than the rollup as the owner. Arming
   independent agencies competes with rollups on distribution.
8. **Cost structure.** Orchestrated agent runs cost five to thirty times a chat
   query. A product that caches the business in a graph and runs narrow,
   scheduled capabilities is structurally cheaper than one that re-derives the
   business every session. Price on outcomes with a base fee for the live
   responsibilities Strelva holds, the way HubSpot now charges per resolved
   conversation.
9. **Ground the platforms do not want.** Shopify owns commerce, Salesforce owns
   enterprise sales, HubSpot owns mid-market marketing. Nobody owns the
   fragmented local service business or the brokerage below the top tier, and
   the platforms' economics do not reward going there.

Strelva must own a runtime. Orchestration alone has no moat and no rehearsal.
Shopify is the proof: Sidekick is defensible because Shopify owns the
storefront. The platform agents that cannot be beaten on model quality can be
made into clients of Strelva's business model through MCP rather than
competitors for it.

### 6.23 Ten frontier interface concepts

1. **Rehearsal.** Watch a synthetic customer walk through the capability, on a
   compressed clock, before anything is live. The whole surface tints.
2. **Change receipt.** A plain-language diff with before and after in each
   item's own rendering, one Make live button, one Undo that stays.
3. **Point and ask.** Select a page section, a lead, or a rule and state intent.
   The proposal appears in place, as a Change.
4. **The Why tracer.** Ask why something did or did not happen. Get a story from
   the ledger with the broken step highlighted and a fix as a Change.
5. **Strelva is handling.** A panel of standing Responsibilities, each readable
   as a document, with trust level, budget used, last three actions, and pause.
6. **Rules as sentences.** Policy stored as typed data, displayed and edited as
   sentences with validated slots. No settings page.
7. **The shape card.** New answers with a shape before it builds: three or four
   parts, what each touches, which outcome each is.
8. **The outline.** A quiet capability tree in the right rail showing only what
   exists in this business. Never a navigation menu.
9. **Use what worked.** An agency picks a Pattern from one client and installs
   it in another. The receipt shows what adapted.
10. **Here is what I understood.** Onboarding shows the inferred business model
    as a page of statements with inline corrections.
11. **Live proof.** After Make live, the capability shows its first real event
    and its verification, not a success banner.
12. **Trust dial.** Each Responsibility moves from supervised to trusted with a
    visible count of clean receipts behind it.
13. **Object timeline.** Everything that touched a record, human or Strelva, in
    the rail.
14. **Attention as the only fleet view.** For agencies, one list of what needs
    judgment across every client, opened in place.
15. **As of.** View the business as it was on a date. Snapshots make this free.

### 6.24 Recommended thesis in plain language

Strelva turns your business into something you can point at and change.

You say what you want. Strelva shows you the shape of it, builds it, and lets
you watch a pretend customer try it before anything is real. When you say go, it
goes live, and you can undo it. Then Strelva keeps running it inside the limits
you set, tells you what it did, and asks when it is unsure. When something goes
wrong, you ask why, and Strelva shows you what happened and how to fix it.

Agencies do the same thing across every client from one place, and can reuse
what worked.

Underneath, Strelva is an environment and a runtime for a business: a typed
model of how it operates, a history of every change, a rehearsal for every
capability, and standing responsibilities with explicit boundaries. That is the
part that behaves like an IDE. The owner only ever sees their business.

---

## 7. Relationship to the current codebase

This memo rejects nothing that is built. It renames and extends:

- The shared frame, Home, My work, and the sidebar direction stay.
- Work stays as the thread and history label, as DESIGN.md already reads it.
- Assessment becomes the indexer that seeds the business model.
- Managed website content editing becomes the first Change surface.
- Governance tiers become the approval rows of Responsibilities and Changes.
- Review-reply auto mode is the first trusted Responsibility.
- Home Finder preview's no-persistence invariant becomes Rehearsal's rule.
- Workspace recovery's leased, checkpointed execution becomes the kernel's
  execution model.
- The custom-repo starter is the first Pattern.
- Tenants and scoped access are already the agency model.

What is new: the Business as a first-class object above tenant and workspace,
Record and Capability as typed definitions, Change as one object across content
and records, Responsibility as a document, Rehearsal, and the ledger.

## 8. Sources

Research was gathered September 11, 2026 through web search by four research
threads. Vendor documentation and changelogs are primary; where a claim rests on
a third-party summary it is marked as reported. Nothing was verified hands-on.

**Generative and adaptive interfaces**

- Vercel json-render: https://github.com/vercel-labs/json-render ; RSC migration notes: https://ai-sdk.dev/docs/ai-sdk-rsc/migrating-to-ui
- OpenAI Apps SDK components: https://developers.openai.com/apps-sdk/plan/components
- MCP Apps extension: https://blog.modelcontextprotocol.io/posts/2025-11-21-mcp-apps/ and https://blog.modelcontextprotocol.io/posts/2026-01-26-mcp-apps/
- Google A2UI: https://a2ui.org/introduction/what-is-a2ui/
- CopilotKit generative UI spectrum: https://www.copilotkit.ai/generative-ui-spectrum
- Salesforce Generative Canvas: https://www.salesforce.com/blog/generative-canvas-lightning/
- Retool AI app generation: https://retool.com/blog/ai-generated-apps
- Airtable Omni: https://support.airtable.com/docs/using-omni-ai-in-airtable
- Google, Generative UI paper: https://arxiv.org/abs/2604.09577 ; Nielsen commentary: https://jakobnielsenphd.substack.com/p/generative-ui-google
- Prompt to Product benchmark: https://arxiv.org/pdf/2512.18080
- Lovable RLS exposure: https://www.superblocks.com/blog/lovable-vulnerabilities ; VibeEval security benchmark: https://vibe-eval.com/data-studies/ai-app-security-benchmark-2026/
- Replit production database incident: https://www.theregister.com/2025/07/21/replit_saastr_vibe_coding_incident/
- CHI work on task-driven data models and intermediate representations: https://arxiv.org/abs/2503.04084 ; https://arxiv.org/abs/2601.17975 ; https://arxiv.org/abs/2601.19171
- Puck on constrained UI: https://puckeditor.com/blog/ai-slop-vs-constrained-ui

**Agent architecture, permissions, and delegation**

- Anthropic, Building effective agents: https://www.anthropic.com/engineering/building-effective-agents ; multi-agent research system: https://www.anthropic.com/engineering/multi-agent-research-system ; managed agents: https://www.anthropic.com/engineering/managed-agents ; prompt injection defences: https://www.anthropic.com/research/prompt-injection-defenses
- Claude Agent SDK permissions and subagents: https://code.claude.com/docs/en/agent-sdk/permissions ; https://code.claude.com/docs/en/agent-sdk/subagents ; sandboxing: https://code.claude.com/docs/en/sandboxing
- MCP tools spec and annotations: https://modelcontextprotocol.io/specification/2025-06-18/server/tools ; https://blog.modelcontextprotocol.io/posts/2026-03-16-tool-annotations/
- OpenAI Agents SDK human in the loop and guardrails: https://openai.github.io/openai-agents-python/human_in_the_loop/ ; https://openai.github.io/openai-agents-python/guardrails/
- OpenAI Operator system card and Watch Mode: https://openai.com/index/operator-system-card/ ; https://deploymentsafety.openai.com/chatgpt-agent/watch-mode
- Google ADK tool confirmation: https://adk.dev/tools-custom/confirmation/
- LangGraph interrupts: https://docs.langchain.com/oss/python/langgraph/interrupts ; Temporal and OpenAI Agents: https://temporal.io/blog/announcing-openai-agents-sdk-integration ; Inngest human in the loop: https://agentkit.inngest.com/advanced-patterns/human-in-the-loop
- Sierra supervisory agents and traces: https://sierra.ai/blog/enterprise-grade-agents ; https://sierra.ai/blog/agent-traces ; simulations: https://sierra.ai/blog/simulations-the-secret-behind-every-great-agent
- Decagon AOPs, simulations, Watchtower: https://decagon.ai/product/aop ; https://decagon.ai/blog/decagon-simulations ; https://decagon.ai/blog/decagon-watchtower
- Salesforce Atlas reasoning and Testing Center: https://engineering.salesforce.com/inside-the-brain-of-agentforce-revealing-the-atlas-reasoning-engine/ ; https://www.salesforce.com/news/press-releases/2024/11/20/agentforce-testing-center-announcement/
- Ramp Policy Agent: https://support.ramp.com/policy-agent-overview ; https://ramp.com/blog/ramp-agents-announcement
- Zapier Agents approvals: https://help.zapier.com/hc/en-us/articles/41776074420493-Add-approval-steps-to-your-agent-s-instructions
- Retool Agents approvals and evals: https://retool.com/blog/how-agents-in-retool-solves-hard-parts-of-agent-development ; https://docs.retool.com/education/labs/ai/agent-eval
- Linear for Agents: https://linear.app/agents
- OpenAI Operator system card PDF: https://cdn.openai.com/operator_system_card.pdf ; ChatGPT agent deployment safety: https://deploymentsafety.openai.com/chatgpt-agent
- Anthropic framework for safe agents: https://www.anthropic.com/news/our-framework-for-developing-safe-and-trustworthy-agents ; agentic misalignment study: https://www.anthropic.com/research/agentic-misalignment
- Microsoft Entra agent identities: https://learn.microsoft.com/en-us/entra/agent-id/what-are-agent-identities
- Levels of autonomy: https://arxiv.org/abs/2502.02649 ; https://knightcolumbia.org/content/levels-of-autonomy-for-ai-agents-1
- Sierra release governance: https://sierra.ai/blog/release-governance-guardrails-for-agents-at-scale ; Decagon layered guardrails: https://decagon.ai/resources/designing-layered-guardrails-for-reliable-ai-agents
- Brex auto-approval policy: https://www.brex.com/product/expense-management
- EU AI Act Article 50: https://artificialintelligenceact.eu/article/50/ ; Commission FAQ: https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act ; FCC on AI voices under TCPA: https://www.fcc.gov/document/fcc-makes-ai-generated-voices-robocalls-illegal
- NIST AI agent standards initiative: https://www.nist.gov/artificial-intelligence/ai-agent-standards-initiative ; hijacking evaluations: https://www.nist.gov/news-events/news/2025/01/technical-blog-strengthening-ai-agent-hijacking-evaluations
- PocketOS agent deletion incident: https://mondoo.com/blog/5-lessons-from-9-seconds-ai-agent-deleted-production-database ; Gemini CLI file loss: https://github.com/google-gemini/gemini-cli/issues/4586
- Air Canada chatbot liability: https://www.cbc.ca/news/canada/british-columbia/air-canada-chatbot-lawsuit-1.7116416 ; Cursor support bot: https://www.theregister.com/special-features/2025/04/18/cursor-ai-support-bot-hallucinated-its-own-company-policy/1015579
- Supabase MCP lethal trifecta: https://simonwillison.net/2025/Jul/6/supabase-mcp-lethal-trifecta/
- FINOS agent decision audit: https://air-governance-framework.finos.org/mitigations/mi-21_agent-decision-audit-and-explainability.html

**Change, preview, simulation, and observability**

- Cursor checkpoints and agent review: https://docs.cursor.com/agent/chat/checkpoints ; https://cursor.com/docs/agent/agent-review
- Replit Agent 3 self-testing: https://blog.replit.com/automated-self-testing
- Lovable visual edits: https://lovable.dev/guides/lovable-vs-bolt-vs-v0
- Shopify Sidekick into Flow drafts: https://changelog.shopify.com/posts/create-flow-automations-with-sidekick ; Flow extension contract: https://shopify.dev/docs/apps/build/flow
- Stripe Workbench, events, idempotency, test clocks, sandboxes: https://docs.stripe.com/workbench/overview ; https://docs.stripe.com/api/events/object ; https://docs.stripe.com/api/idempotent_requests ; https://docs.stripe.com/billing/testing/test-clocks ; https://docs.stripe.com/sandboxes
- Stripe Workflows: https://docs.stripe.com/workflows
- Temporal event history and web UI: https://docs.temporal.io/workflow-execution/event ; https://docs.temporal.io/web-ui
- OpenTelemetry agent spans and event sourcing: https://github.com/open-telemetry/semantic-conventions-genai/blob/main/docs/gen-ai/gen-ai-agent-spans.md ; https://oneuptime.com/blog/post/2026-02-06-observability-event-sourced-systems-opentelemetry/view
- OCEL 2.0 object-centric event logs: https://arxiv.org/abs/2403.01975
- PostHog funnels: https://posthog.com/docs/product-analytics/funnels
- Intercom Fin Operator explanations: https://www.intercom.com/help/en/articles/14707198-fin-operator-explained ; HubSpot agent output review: https://knowledge.hubspot.com/ai/review-agent-output
- Webflow publishing, page branching, and Source: https://webflow.com/webflow-way/collaboration/publishing ; https://university.webflow.com/lesson/page-branching ; https://www.globenewswire.com/news-release/2026/09/02/3355326/0/en/webflow-unveils-agentic-platform-source-by-webflow.html
- Framer staging and versions: https://www.framer.com/help/articles/staging-and-versions/
- Shopify theme publishing and test orders: https://help.shopify.com/en/manual/online-store/themes/managing-themes/publishing-themes ; https://help.shopify.com/en/manual/checkout-settings/test-orders
- Sanity content releases: https://www.sanity.io/docs/user-guides/content-releases ; Contentful environment aliases: https://www.contentful.com/developers/docs/concepts/environment-aliases/
- Zapier drafts and versions: https://help.zapier.com/hc/en-us/articles/9693520498445-Create-Zap-drafts-and-versions ; Zap history: https://help.zapier.com/hc/en-us/articles/8496241726989-Review-your-Zap-history
- Bubble version control: https://manual.bubble.io/help-guides/maintaining-an-application/version-control
- Figma branch review and merge: https://help.figma.com/hc/en-us/articles/5693123873687-Review-branch-changes
- Vercel instant rollback: https://vercel.com/docs/instant-rollback ; Netlify deploy management: https://docs.netlify.com/site-deploys/manage-deploys/
- PlanetScale deploy requests and revert: https://planetscale.com/docs/concepts/deploy-requests ; Neon branching: https://neon.com/docs/introduction/branching
- Salesforce Testing Center multi-turn testing: https://developer.salesforce.com/blogs/2025/11/automate-multi-turn-agent-testing-with-conversation-history-in-agentforce
- Sierra voice sims: https://sierra.ai/blog/voice-sims-test-agents-in-real-world-conditions-before-they-talk-to-your-customers ; tau-bench: https://arxiv.org/abs/2406.12045 ; tau2-bench: https://arxiv.org/abs/2506.07982
- Intercom simulations, batch tests, previews: https://www.intercom.com/help/en/articles/14077180-simulations-vs-batch-tests-vs-previews ; evals and releases: https://www.intercom.com/blog/announcing-evals-and-releases/
- Simulated people research: https://arxiv.org/abs/2411.10109 ; limits: https://arxiv.org/abs/2402.01908
- LangWatch Scenario: https://github.com/langwatch/scenario
- Twilio test credentials: https://www.twilio.com/docs/iam/test-credentials ; Resend test addresses: https://resend.com/docs/dashboard/emails/send-test-emails ; Google Business Profile has no sandbox: https://developers.google.com/my-business/content/faq
- Palantir ontology, action types, scenarios, branching: https://www.palantir.com/docs/foundry/architecture-center/ontology-system ; https://www.palantir.com/docs/foundry/action-types/submission-criteria ; https://www.palantir.com/docs/foundry/workshop/scenarios-overview ; https://palantir.com/docs/foundry/ontologies/test-changes-in-ontology/
- Unity play mode tint and Unreal Blueprint debugging: https://whitepotstudios.com/blog/unity-tip-play-mode-tint/ ; https://dev.epicgames.com/documentation/unreal-engine/blueprint-debugging-example-in-unreal-engine
- Figma variables and modes: https://help.figma.com/hc/en-us/articles/15343816063383-Modes-for-variables
- Devin DeepWiki and playbooks: https://docs.devin.ai/work-with-devin/deepwiki ; https://cognition.com/blog/devin-2
- Nielsen Norman on ChatGPT agent narration: https://www.nngroup.com/articles/impressions-chatgpt-agent/

**Business model, market, and moat**

- Palantir ontology core concepts: https://www.palantir.com/docs/foundry/ontology/core-concepts
- Glean permission-aware graph: https://www.glean.com/enterprise-context/enterprise-graph ; Microsoft semantic index: https://learn.microsoft.com/en-us/microsoftsearch/semantic-index-for-copilot
- Salesforce Data 360 semantic layer: https://www.salesforce.com/blog/semantic-layer-ai-agents-data-360/
- HubSpot custom objects: https://knowledge.hubspot.com/object-settings/create-custom-objects
- Rippling employee graph: https://www.rippling.com/blog/a-bizarro-world-salesforce-parker-conrad-talks-compound-startups-with-strictly-vc
- Gartner digital twin of an organization: https://www.gartner.com/en/documents/4004172
- Event sourcing for agent explainability: https://www.axoniq.io/blog/ai-agent-explainability-event-sourcing-infrastructure
- MCP 2026-07-28 spec and roadmap: https://blog.modelcontextprotocol.io/posts/2026-07-28/ ; https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/
- SMB tool use and CRM adoption (reported): https://sbecouncil.org/wp-content/uploads/2025/10/SBE-Tech-Survey-October-2025-Ver-2.0.pdf ; https://quickbooks.intuit.com/r/small-business-data/april-2025-survey/ ; https://wavecnct.com/blogs/crm-statistics
- Google Business Profile statistics (reported): https://newmedia.com/blog/google-business-profile-statistics
- Google Business Profile API prerequisites and limits: https://developers.google.com/my-business/content/prereqs ; https://developers.google.com/my-business/content/limits
- MLS and IDX access (reported): https://saigontechnology.com/blog/real-estate-mls-software-development/
- Salesforce Slack API restrictions: https://www.computerworld.com/article/4005509/salesforce-changes-slack-api-terms-to-block-bulk-data-access-for-llms.html
- Platform agent launches: https://openai.com/index/introducing-agentkit/ ; https://cloud.google.com/blog/products/ai-machine-learning/introducing-gemini-enterprise-agent-platform ; https://www.microsoft.com/en-us/microsoft-365/blog/2025/12/02/microsoft-365-copilot-business-the-future-of-work-for-small-businesses/ ; https://www.shopify.com/news/spring-26-edition-dev
- Agentforce pricing and adoption (reported): https://www.default.com/post/salesforce-agentforce-review-and-pricing
- HubSpot outcome pricing: https://www.hubspot.com/company-news/hubspots-customer-agent-and-prospecting-agent-now-you-pay-when-the-task-is-complete
- a16z on systems of action and AI apps: https://a16z.com/notes-on-ai-apps-in-2026/ ; https://a16z.com/context-is-king/
- Sarah Tavel, sell work not software: https://sarahtavel.medium.com/ai-startups-sell-work-not-software-99f365c592c ; rebuttal: https://newsletter.angularventures.com/p/the-problem-with-selling-the-work
- YC AI-native agencies (reported): https://www.forbes.com/sites/josipamajic/2026/02/04/ycs-2026-roadmap-signals-a-shift-from-human-augmented-to-ai-native-startups/
- Elad Gil on AI rollups: https://techcrunch.com/2025/06/01/early-ai-investor-elad-gil-finds-his-next-big-bet-ai-powered-rollups
- AI services rollups (reported): https://www.newcomer.co/p/inside-the-vc-roll-up-craze-that ; https://blog.pebblous.ai/blog/ai-rollup-workflow-records-diligence/en/
- Agent token cost: https://www.ey.com/en_us/insights/ai/agentic-ai-token-costs
- SMB churn benchmarks (reported): https://optif.ai/learn/questions/b2b-saas-churn-rate-benchmark/
- AI code maintenance evidence: https://arxiv.org/pdf/2606.14796
- Agency and workflow preference surveys (reported): https://zapier.com/blog/ai-agents-survey/ ; https://aiagentindex.mit.edu/data/2025-AI-Agent-Index.pdf
