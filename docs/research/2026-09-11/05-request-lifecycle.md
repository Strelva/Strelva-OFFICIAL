# Request lifecycle UX

Research stream 5: agentic work with human authority

Research date: 2026-09-11

## 1. Executive answer

A Request should be a durable case file, not a chat transcript or a spinner. It moves through five user-facing landmarks: Problem, Work, Result, Your system, and Handled. Each landmark must answer what is known, what will happen, what is waiting, what changed, and what proves it.

Show scope before consequential work. Make approvals explicit and scoped to an actor, target, and action. During work, show the plan, current checkpoint, last completed step, next decision, budget, and a clear pause or steer control. Show a reviewable result before publishing or deploying. After application, separate provider acceptance from verification. “Handled” means the target system has the intended result and the evidence is attached, not merely that the agent stopped.

For businesses, lead with outcome, preview, risk, cost, and next action. For agencies, add the multi-client queue, diff, logs, releases, evidence, and audit trail. Strelva already has strong governance and recovery primitives. The product needs a durable Request layer that links them together and replaces the current coarse synthetic stage model as the user-facing source of truth.

## 2. Evidence

### 2.1 The current product pattern

The strongest recent agent products are converging on the same trust sequence:

1. Establish the goal and scope.
2. Show a plan or a short assessment before making consequential changes.
3. Work in an isolated or recoverable environment.
4. Show progress as meaningful checkpoints, not only a spinner.
5. Present a result, diff, preview, or evidence bundle.
6. Ask for approval at the boundary that changes an external system.
7. Verify the result and leave a durable record.

The important distinction is between approval to begin work, approval of a proposed result, and authorization to change a live system. Products often combine these in one “approve” button. Strelva should keep them separate because the three approvals have different risks and different actors.

### 2.2 Product research, 2025-2026

| Product | What it shows | Trust pattern and implication for Strelva |
| --- | --- | --- |
| Devin | Interactive Planning starts with an assessment of relevant files, findings, open questions, citations, and a detailed plan. The user can comment before execution, or ask Devin to wait for approval. Devin’s session UI exposes task, plan, PR, and summary views. | A plan is useful when it explains the why, affected scope, and unresolved questions. Devin also shows confidence scores and can pause on yellow or red confidence. This supports a visible “scope ready” checkpoint, but confidence cannot replace evidence. Sources: [Interactive Planning](https://docs.devin.ai/work-with-devin/interactive-planning) and [2025 release notes](https://docs.devin.ai/release-notes/2025), both accessed 2026-09-11. |
| OpenAI Codex cloud | Each cloud task runs in an isolated environment and can work in parallel. Codex reports terminal logs, file citations, tests, linters, type checks, and, in later updates, browser screenshots. Users can review, refine, retry, cancel, and export a patch or PR. | The result is inspectable because the agent attaches evidence to the task. The product also makes clear that review is still required before production. Strelva should attach verification evidence to the Request, not leave it in a hidden execution transcript. Sources: [Introducing Codex](https://openai.com/index/introducing-codex/), 2025-05-16; [Codex system card addendum](https://openai.com/index/o3-o4-mini-codex-system-card-addendum/), 2025-05-16; [Codex upgrades](https://openai.com/index/introducing-upgrades-to-codex/), 2025-09-15; [Codex changelog](https://help.openai.com/en/articles/11428266-codex-changelog/), accessed 2026-09-11. |
| Claude Code on the web | Cloud sessions persist after the browser closes. The user can monitor from another device, steer the task, answer questions, move between web and terminal, and inspect or share the session. Expired work can be reopened with its history. | Persistence and steering make background work feel accountable. Claude also has permissions and isolated environment controls, which makes “what can this run touch?” part of the experience. Strelva should show target, access, and wait reason next to progress. Sources: [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web), accessed 2026-09-11; [Enabling Claude Code to work more autonomously](https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously), 2025-09-29. |
| Cursor background agents, now Cloud Agents | Each agent works in an isolated VM on its own branch. The dashboard exposes environment, build, commits, logs, screenshots, videos, and other artifacts that show what changed and how it was verified. Users can take over the remote desktop and share a read-only agent link. | A progress screen earns trust when it is also an evidence screen. Cursor’s spend limit prompt and model-based pricing show that budget must be set before work starts. Its approval agents add risk scoring and policy gates, but still defer to human review when risk is high. Sources: [Cloud Agents](https://cursor.com/docs/cloud-agent), [Cloud Agent builds](https://cursor.com/docs/cloud-agent/builds), and [Approval Agents](https://cursor.com/docs/approval-agents), accessed 2026-09-11. |
| Replit Agent | Plan mode presents what will be done, why, success criteria, what is out of scope, and numbered steps before files change. Replit recommends previewing the app, testing the main action and mobile behavior, and reviewing checkpoints. History can show and roll back code, workspace, conversation, tasks, and database state. | The explicit out-of-scope section is especially valuable for business owners. “Checkpoint” is a better mental model than a percentage complete because it tells the user what can be reviewed or recovered. Sources: [Build with Agent](https://docs.replit.com/learn/build-with-agent), accessed 2026-09-11; [Agent v2](https://replit.com/blog/agent-v2), 2025-02-25; [Secure vibe coding](https://replit.com/blog/doubling-down-on-our-commitment-to-secure-vibe-coding), 2025-07-29. |
| Lovable | Agent Mode explores the codebase, uses logs and other context, makes changes, auto-fixes, and gives a summary. The product publishes an explicit per-message or per-agent usage signal, with cost visible in history. | The concise summary and visible cost are appropriate for a non-technical owner. The risk is that a fluent summary can hide changes, so the Request must pair summary with before/after preview, affected resources, and checks. Source: [Agent Mode beta](https://lovable.dev/blog/agent-mode-beta), 2025-06-30. |
| GitHub Copilot coding agent | GitHub exposes live session progress, token usage, session length, logs, test and linter environments, commits, and linked PRs. Users can steer, stop, archive, share read-only sessions, and ask what changed, what was validated, and why. | The agency pattern is strong: work is attached to a branch and PR, not trapped in chat. GitHub also documents clear prompts, acceptance criteria, repository instructions, and iterative PR comments. Strelva should give agencies the same evidence depth while keeping a plain-language client view. Sources: [Agent management](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/agent-management), [Manage and track agents](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/manage-and-track-agents), and [Get the best results](https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results), accessed 2026-09-11. |
| Manus | Plan Mode creates an editable Markdown plan with goals, steps, and constraints, and asks for confirmation before building. Manus supports branches, rollback, version history, browser takeover, and checkpoints for websites. Its credits account for model tokens, virtual machines, and third-party APIs. | Plan confirmation and rollback are good boundaries for agentic work. The user needs to see whether a branch is only a draft, whether it was published, and what the credits bought. Sources: [Plan Mode](https://manus.im/blog/manus-plan-mode), 2026-07-22; [Website API and checkpoints](https://open.manus.ai/docs/v2/website), accessed 2026-09-11; [Credit consumption](https://help.manus.im/en/articles/11711097-what-are-the-rules-for-credits-consumption-and-how-can-i-obtain-them), 2026-06-18. |
| Operator-style browsing agents | OpenAI Operator and ChatGPT agent show progress in the conversation, pause for sign-in, CAPTCHA, or user input, require confirmation before consequential actions such as purchases or submissions, and let the user take over at any point. Cloud Browser separates permission to access a site from approval to perform a consequential action. | Permission to enter a system is not permission to change it. Strelva should distinguish access, scope approval, and publish or deploy approval. The user must be able to pause, take over, and see exactly what action is waiting. Sources: [Operator](https://openai.com/index/introducing-operator/), 2025-01-23; [ChatGPT agent](https://openai.com/index/introducing-chatgpt-agent/), 2025-07-17; [Using Cloud Browser](https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt), accessed 2026-09-11. |
| ChatGPT Tasks | A scheduled task has a confirmation card, schedule and condition, push or email notification, and controls to review, pause, resume, edit, or delete. Tasks that need approval pause and ask for action. | Background work needs a durable record and a notification contract. A Request should tell the user when it started, when it needs attention, and when a result is ready, rather than relying on the user to reopen a chat. Source: [Tasks in ChatGPT](https://help.openai.com/en/articles/10291617), accessed 2026-09-11. |
| Shopify Sidekick | Sidekick previews changes before applying them. Longer work can continue after the merchant leaves and notify the merchant when it is ready. Pulse recommendations open a to-do list where each action is reviewed and approved. Shopify’s app guidance says an action extension stages a mutation and the merchant clicks Save. | “Review before Save” is a strong business interaction. Shopify also explicitly advises users to state what is in scope and to ask for confirmation before irreversible changes. Strelva should use the same language for content, domain, billing, and other external writes. Sources: [Sidekick](https://help.shopify.com/en/manual/ai-powered-tools/sidekick), [best practices](https://help.shopify.com/en/manual/ai-powered-tools/best-practices), [Sidekick Pulse](https://help.shopify.com/en/manual/ai-powered-tools/sidekick/pulse), and [Sidekick app actions](https://shopify.dev/docs/apps/build/sidekick/build-app-actions), accessed 2026-09-11. |

### 2.3 Cost, notifications, and recovery are part of trust

The products expose cost in different ways, but the direction is consistent:

- Devin uses ACU estimates, session spend controls, review spend limits, and auto-reload controls. Its self-serve documentation lists plan and credit prices, so the user can connect work to a real budget. See [Devin self-serve plans](https://docs.devin.ai/admin/billing/self-serve), accessed 2026-09-11.
- Replit moved from a simple checkpoint price to effort-based pricing. It describes simple requests as often below $0.25 and complex requests as potentially costing several dollars, with one meaningful checkpoint per request. See [Effort-based pricing](https://replit.com/blog/effort-based-pricing), 2025-06-18.
- Lovable shows usage in the message history. Cursor prompts for a spend limit and charges according to the selected model and context. Manus credits include active model, VM, and third-party API use. GitHub agentic workflows document both AI credit cost and Actions minutes. See [Cursor Cloud Agents](https://cursor.com/docs/cloud-agent), [Manus credit consumption](https://help.manus.im/en/articles/11711097-what-are-the-rules-for-credits-consumption-and-how-can-i-obtain-them), and [GitHub agentic workflows](https://docs.github.com/en/copilot/concepts/agents/about-github-agentic-workflows), all accessed 2026-09-11.
- Claude Code on the web does not add a separate cloud VM charge in its current documentation, but cloud use shares account rate limits. OpenAI describes Codex usage as included within plan allowances with additional business and enterprise credit options. That is still a budget boundary, even when the product does not show a per-task dollar price.

For Strelva, cost should be a Request field with an expected range before start, current consumption during work, and actual cost or usage after completion. If the product absorbs the cost, show “included” but still show time, model, provider, or run units where those affect limits or scheduling.

### 2.4 What users distrust

The 2025 Stack Overflow AI survey reports that 66% of developers find “almost right, but not quite” output the biggest frustration, 45% say debugging AI-generated code takes more time, 75% still ask a person when they do not trust an AI answer, and 87% have at least some concern about AI accuracy. The survey also reports that 81% have security or privacy concerns. See [Stack Overflow 2025 AI survey](https://survey.stackoverflow.co/2025/ai), accessed 2026-09-11.

Anthropic identifies the same risk in more operational terms: autonomous systems can misread intent, produce unintended consequences, and be manipulated by prompt injection. Its trust principles are human control, values, secure interactions, transparency, and privacy. See [Trustworthy agents](https://www.anthropic.com/research/trustworthy-agents), accessed 2026-09-11. A 2025 Capgemini study similarly reports that many organizations do not fully trust autonomous enterprise agents and names transparency, reliability, privacy, safety, and human oversight as trust factors. See [AI agents report](https://www.capgemini.com/wp-content/uploads/2025/07/AI-Agents_Final_210725.pdf), 2025-07.

The product implications are a synthesis of this evidence and the product patterns above. Users distrust:

- a result that is “almost right” without a clear list of what is uncertain;
- scope drift, especially a broad action hidden behind a small request;
- a “done” label that means the agent finished thinking, not that the live system changed;
- an approval that does not name the target, action, actor, and affected content;
- verification claims that contain no receipt, preview, test, or read-back;
- hidden cost, credit use, or time spent while the user was away;
- silent background work that has no notification or attention state;
- failures that offer only retry, even when a retry could duplicate an external write;
- a history that cannot be shared with an agency or audited later.

## 3. What the repository already has

The repository has most of the control primitives needed for a trustworthy lifecycle. They are distributed across event actions, agent gates, workspace operations, and an interface-only Request prototype.

| Existing primitive | Evidence in the repository | What it contributes to a Request |
| --- | --- | --- |
| Governance decision before content or external writes | [`ai-governance.ts`](../../src/lib/ai-governance.ts#L3-L33) defines publish, review, and block decisions. [`ai-governance.ts`](../../src/lib/ai-governance.ts#L137-L194) blocks structural changes, requires review for high-risk facts and marketing sections, and only permits factual auto-publish when the policy allows it. | A Request can carry risk, reason, proposed action, and approval audience before work starts or before a result is applied. |
| Owner escalation without publishing | [`event-actions.ts`](../../src/lib/event-actions.ts#L72-L90) escalates a pending event to the owner while keeping it pending. | The lifecycle can show “waiting for owner” without pretending that work is complete. |
| Action claim, stale checks, and durable workflow statuses | [`event-actions.ts`](../../src/lib/event-actions.ts#L93-L203) handles accepted, in-progress, shipped, declined, claim, finish, and stale or duplicate action protection. | A Request can show a named checkpoint and an actor, not only a transient agent status. |
| External acceptance marker and no-duplicate recovery | [`event-actions.ts`](../../src/lib/event-actions.ts#L212-L249) performs external work before resolving the action. If a provider accepts the write but read-back verification fails, it records separate verification-failure evidence and marks the external effect accepted so retry cannot duplicate it. | The Request needs a distinct `external_accepted` or `verification_gap` evidence state. “Resolved” cannot by itself mean “fully verified.” |
| Structural handoff is not a live publish | [`event-actions.ts`](../../src/lib/event-actions.ts#L251-L259) resolves a structural handoff with `structural_handoff`; the UI must not claim that the change was made live. | The system already knows that a handoff and a deployment are different outcomes. The Request UI should make that distinction visible. |
| Stale draft protection and content versioning | [`event-actions.ts`](../../src/lib/event-actions.ts#L261-L311) rejects stale overwrites, writes live content, records the diff and version, revalidates the client site, and clears the draft. | Website Requests can show before and after, the exact version, and a rollback path. |
| Shared agent gates | [`agent-shared.ts`](../../src/lib/agent-shared.ts#L7-L14) requires streaming and background execution to use the same gates. [`agent-shared.ts`](../../src/lib/agent-shared.ts#L97-L159) queues Google Business writes rather than writing directly, with audience and high-risk-fact rules. | A Request can have one authority policy regardless of whether the work starts in chat or in a background executor. |
| Undo uses the same governed path | [`agent-shared.ts`](../../src/lib/agent-shared.ts#L177-L205) and [`agent-shared.ts`](../../src/lib/agent-shared.ts#L244-L294) route undo through the normal section update, force review, and return diffs and source proof. | Recovery can be an explicit Request action with the same audit and approval rules, not a hidden destructive shortcut. |
| Interface Request stages | [`model.ts`](../../src/experience/delivery/model.ts#L1-L19) currently exposes `draft`, `scoping`, `building`, `review`, and `delivered`. [`request-session.ts`](../../src/experience/delivery/request-session.ts#L3-L8) states that this is a local interface session, not the production persistence or auth boundary. | This is a useful visual seed, but it is too coarse and is not the production Request state. In particular, it has no waiting reason, approval target, result version, external receipt, or verification state. |
| Review is distinct from publish | [`request-session.ts`](../../src/experience/delivery/request-session.ts#L39-L80) supports editing a draft and reviewing it, and its approval note explicitly says preview and publishing are separate. | Preserve this distinction and make it a first-class lifecycle gate. |
| Durable workspace operations | [`operations.ts`](../../src/platform/workspaces/operations.ts#L6-L49) models running, ready, failed, and completed operations, uses a lease and claim, checkpoints results, marks failures, completes atomically, and does not re-score a ready result during recovery. | Workspace operations provide a strong execution and recovery substrate for Request attempts. The user-facing model should link to these operations instead of inventing another runner. |
| Saved work and agency handoff | [`types.ts`](../../src/platform/workspaces/types.ts#L1-L78) defines work, product, resource, handoff, delegation, expiry, and verified recipients. [`repository.ts`](../../src/platform/workspaces/repository.ts#L238-L290) protects workspace access and saves work. [`repository.ts`](../../src/platform/workspaces/repository.ts#L297-L378) creates verified, expiring agency handoffs and copies or delegates work on acceptance. | Agency review can be read-only, verified, time-bounded, and client-controlled. This should become part of the Request access model rather than a separate link with no Request context. |

### 3.1 The main gap

The repository has several correct local state machines, but no single Request state that joins them. The interface prototype’s “Delivered” can be mistaken for a result that is live, while the event system can be resolved after a structural handoff or an accepted external write with a separate read-back failure. Those are valid backend outcomes, but they are not the same business outcome.

The recommendation is not to replace the existing storage or execution systems in one step. Add a durable Request record as the product-facing overlay. It should reference the existing event ID, workspace operation ID, saved work ID, approval decision, external receipt, and verification evidence. Existing subsystems remain authoritative for their own boundaries; the Request becomes the readable case file that explains how they relate.

## 4. Recommended single Request state model

Use two dimensions instead of one long list of backend statuses:

- `phase`: one of `problem`, `work`, `result`, `system`, or `handled`. These are the five stable landmarks in the user journey.
- `state`: a precise state such as `captured`, `scoping`, `ready_to_work`, `working`, `waiting`, `result_ready`, `awaiting_approval`, `applying`, `verifying`, `handled`, `failed`, `cancelled`, or `superseded`.

Keep `attention` separate from `state`. A Request can be `scoping` and waiting for business details, `working` and waiting for a provider, or `verifying` and waiting for a human check. The user should see the reason in plain language.

### 4.1 Canonical states and transitions

| State | Phase and user meaning | Entry and exit rules |
| --- | --- | --- |
| `captured` | Problem. The need has been recorded, but the outcome is not yet precise. | Entry from a business or agency submission. Exit when the request has an owner, target resource, and initial outcome. |
| `scoping` | Problem. Strelva is clarifying the goal, constraints, affected resources, risk, budget, and success criteria. | The system may ask questions or produce a proposed scope. No consequential external write occurs. |
| `ready_to_work` | Work. The scope is specific enough to start. | Requires either an authorized scope approval or an explicit low-risk policy exemption. It records who approved, what they approved, and until when the approval is valid. |
| `working` | Work. An attempt is running through meaningful checkpoints such as research, drafting, building, checking, or preparing a release. | Each checkpoint records the last completed step, next step, actor or agent, timestamp, and evidence link. |
| `waiting` | Overlay on any phase. The Request is paused for user input, approval, access, provider completion, agency review, or a scheduled time. | Do not show a generic spinner. Explain what is needed, who can act, and what happens after the action. |
| `result_ready` | Result. A draft assessment, proposed content, build, or other artifact is ready to inspect. It is not yet live unless the product policy explicitly says no external approval is needed. | The Request must have an immutable result version, summary, affected-resource list, and acceptance checklist. |
| `awaiting_approval` | Result. A named authority must approve the specific next action. | The gate names the actor or role, action, target, expiry, and whether approval means save, publish, deploy, or only continue. Requesting changes returns to `working` or `scoping` with feedback attached. |
| `applying` | Your system. The approved result is being written, published, deployed, or handed to an external operator. | The target and release or provider operation are fixed. Do not allow an approval to silently expand its scope during this state. |
| `verifying` | Your system. Strelva is checking that the intended result exists in the target system. | Use product-specific read-back, render, health, or saved-artifact checks. A provider acceptance receipt alone may be sufficient evidence of acceptance, but it is not the same as read-back. |
| `handled` | Handled. The intended outcome is present, authorized, and evidenced. | Requires the product’s acceptance criteria, target receipt or saved artifact, verification result, and audit record. Provide a next action such as view, undo, reopen, or share. |
| `failed` | Exception. Work could not finish, or verification found a material problem. | Show the failure point, whether any external effect was accepted, the safe recovery action, and whether retry is safe. A failed pre-write attempt may retry; an accepted non-idempotent write must not be blindly retried. |
| `cancelled` or `superseded` | Terminal exception. The user stopped the work, or a newer scope or result replaced it. | Preserve the record and reason. Allow reopening or creating a new Request from the prior context without hiding the old evidence. |

The normal path is:

`captured` → `scoping` → `ready_to_work` → `working` → `result_ready` → `awaiting_approval` → `applying` → `verifying` → `handled`

The approval step can be skipped only when the governance policy says the action is safe to auto-apply. The result and verification record should still exist. An assessment that only saves a report can usually move from `result_ready` to `handled` after the saved artifact and access checks pass. A website change or build normally needs the full result, approval, apply, and verify path.

### 4.2 The five landmark screens

Every Request should have one persistent detail screen with a five-part rail:

`Problem` → `Work` → `Result` → `Your system` → `Handled`

The rail is a summary, not the only status. The current state, waiting reason, and next action sit directly below it.

| State | Business owner view | Agency review view |
| --- | --- | --- |
| `captured` | “What do you need handled?” Show the request in plain language, client, target, owner, and a way to add context. | Queue entry with client, priority, request source, target resource, missing fields, and assignment. |
| `scoping` | Proposed outcome, what will change, what will not change, assumptions, questions, estimated time, and expected cost. | Scope diff, resource map, policy classification, risk reason, affected repositories or providers, acceptance criteria, and open questions. |
| `ready_to_work` | A simple scope card with “Start work,” “Change scope,” and the approving person. | Approval record, role and permission, expiry, budget, policy exception if any, and the exact version of the scope. |
| `working` | Current plain-language milestone, last completed step, next step, expected finish, usage or budget, and Pause or Steer. Hide raw logs by default. | Live timeline with attempt ID, checkpoints, changed resources, branch or operation, logs on demand, agent or operator, and links to the evidence generated so far. |
| `waiting` | “We need you to confirm the hours,” “We need Google access,” or “Your agency is reviewing this.” One clear action and notification setting. | Waiting owner, SLA or age, permission boundary, provider status, who was notified, and escalation or reassignment controls. |
| `result_ready` | Before and after, preview, short result summary, what is uncertain, and “Request changes” or “Approve this result.” | Full diff, source inputs, plan-to-result comparison, screenshots, tests, logs, comments, and proposed release. |
| `awaiting_approval` | “Approve publishing this change to [target]” with the target, exact action, affected content, and rollback explanation. | Approval matrix, client or agency decision, high-risk facts, structural changes, comments, and whether another gate remains. |
| `applying` | “Publishing to your website” or “Saving your assessment.” Show target, started time, and what the user can safely do while it runs. | Release ID, commit or provider operation ID, claimed action, idempotency marker, executor, and live progress. |
| `verifying` | “Checking the live result.” Show each check as passed, failed, or still running. | Read-back payload or content version, render or smoke test, health result, external receipt, verification timestamp, and exceptions. |
| `handled` | Outcome headline, live or saved location, what changed, proof, cost, and View, Undo, Reopen, or Share. | Complete evidence bundle, audit trail, exact artifacts and versions, approval chain, verification details, and client handoff record. |
| `failed` or `superseded` | What happened, whether anything changed, whether retry is safe, and the one recommended recovery action. | Failure point, attempt history, external acceptance status, logs, rollback or re-plan controls, and impact on the client’s live system. |

### 4.3 Approval gates

Approval should be a typed record, not a boolean:

```text
gate = {
  gate_id,
  kind: scope | result | publish | deploy | external_write,
  actor_or_role,
  target,
  approved_version,
  decision: pending | approved | changes_requested | declined | expired,
  note,
  decided_at,
  expires_at,
}
```

The business owner generally approves the outcome and external effect. An agency may prepare scope, review technical evidence, or approve on behalf of a client only when its delegation permits that action. An operator can execute a handoff without claiming that the client’s live system changed. The interface should display these roles in one sentence, such as “Your agency approved the draft. Your approval is still required before it publishes to Google.”

### 4.4 Progress and notifications

Progress should be a small set of meaningful events:

- Request received.
- Scope ready for review.
- Work started.
- Checkpoint completed.
- Input or access needed.
- Result ready.
- Approval needed.
- External write started.
- Verification passed, failed, or needs attention.
- Handled, with a link to proof.

Notify in the user’s chosen channel when a Request starts, waits, becomes reviewable, fails, or is handled. Allow “all updates,” “attention only,” and “handled only.” For an agency, route notifications by client and assignee. Do not notify on every tool call or intermediate checkpoint.

## 5. Evidence required before “Handled”

The Request should not reach clean `handled` merely because the agent completed its run. The minimum evidence bundle is:

1. The approved scope or the documented low-risk policy that allowed auto-application.
2. A versioned result artifact with its inputs, source or prompt context, and creation time.
3. Acceptance criteria with each item marked pass, fail, not applicable, or not checked.
4. A before and after view, diff, or report appropriate to the product.
5. A target receipt: saved artifact ID, content version, commit or deployment ID, or provider operation ID.
6. A post-action verification performed after application, with timestamp and environment.
7. The approval and execution audit trail, including actor, role, and permission basis.
8. Cost or usage against the expected budget.
9. Any failure, exception, or verification gap, with safe recovery instructions.

“AI says it passed” is not evidence. A test result, read-back, render, provider receipt, or saved artifact is evidence.

### 5.1 Assessment

An assessment is primarily analysis and saved work. It usually has no external publish step.

Required evidence:

- the exact business, URL, category, location, or other inputs used;
- source list and source freshness;
- method, coverage, limitations, confidence, and unresolved unknowns;
- run or operation ID and the saved work artifact ID;
- result access for the authorized workspace or recipient;
- a clear distinction between observed facts, inference, and recommendation.

For the current repository, [`recovery.ts`](../../src/products/assessment/recovery.ts#L12-L40) already requires server-owned operation input and reruns recovery using the existing operation request rather than trusting browser-substituted inputs. That should appear as provenance in the assessment screen. Assessment “Handled” means the result is saved, accessible, and complete against its acceptance criteria. It does not mean the recommendation has been implemented.

### 5.2 Website change

A website change is a governed mutation of a live resource.

Required evidence:

- affected section, page, field, and tenant;
- before and after preview or field-level diff;
- governance reason and required approval audience;
- live version or deployment receipt;
- live URL or resource identifier;
- post-change render, content read-back, or targeted smoke check;
- rollback version or undo Request;
- for Google Business or other external providers, provider acceptance ID and read-back result.

The repository already keeps the important no-duplicate behavior when an external provider accepts a write but the read-back check fails. The Request should show “Provider accepted. Verification needs attention,” preserve the acceptance marker, and block an automatic retry. It should not present a clean “Handled” badge until the read-back passes or an explicitly authorized operator records an exception.

### 5.3 Build

A build is a multi-step implementation that may create a preview, PR, deployment, or handoff.

Required evidence:

- scope, acceptance criteria, out-of-scope items, and affected repository or resource;
- branch, commit, PR, or version identifier;
- changed-file or component summary;
- preview or staging URL;
- build, test, lint, typecheck, security, and relevant browser checks;
- deployment receipt and target health check if deployed;
- rollback or revert path;
- access, secret, network, and budget boundaries;
- client or agency approval for the release boundary.

For a business owner, most of this should be summarized as “what changed, where to see it, what passed, and what you need to decide.” The agency view should be able to expand every claim into its underlying commit, log, screenshot, or check.

### 5.4 What all three share, and what they do not

All three should share:

- a Request ID, workspace and client context, owner, resource, and product type;
- an approved scope snapshot and acceptance criteria;
- a durable attempt and checkpoint history;
- a versioned result artifact;
- explicit authority gates;
- evidence, notifications, cost, and recovery;
- a final statement of what is handled and what remains open.

They should not share one generic meaning of “done”:

- An assessment is handled when an evidence-backed report is saved and accessible.
- A website change is handled when the approved content is present in the intended live target and the target is verified.
- A build is handled when the accepted implementation is available at the agreed release target and its checks and rollback path are recorded.

They also differ in default approval:

- An assessment can usually auto-run after valid inputs, then ask the user to interpret or accept the result.
- A website change needs content governance. Low-risk factual updates may follow the current auto-publish policy, while high-risk facts, marketing copy, structural sections, and external writes need review.
- A build needs a release boundary. It may be safe to create a branch or preview automatically, but production deployment should be separately approved unless the tenant has explicitly granted that authority.

## 6. Concrete recommendations

### Keep

- **Keep the governance taxonomy.** The publish, review, and block decisions in [`ai-governance.ts`](../../src/lib/ai-governance.ts#L3-L33) are understandable policy primitives. Surface their reason in the Request scope and approval card.
- **Keep shared agent gates.** Continue to use the shared factories in [`agent-shared.ts`](../../src/lib/agent-shared.ts#L7-L14) so chat and background work cannot diverge in their authority rules.
- **Keep accepted-write protection.** Preserve the external acceptance marker and no-duplicate recovery in [`event-actions.ts`](../../src/lib/event-actions.ts#L212-L249). Add a clear Request-level verification-gap state around it.
- **Keep stale-draft and version protection.** The stale overwrite guard, diff, content version, and revalidation in [`event-actions.ts`](../../src/lib/event-actions.ts#L261-L311) are exactly the foundation needed for a trustworthy website Result and rollback path.
- **Keep durable operation recovery.** Reuse the lease, claim, checkpoint, failure, and atomic completion behavior in [`operations.ts`](../../src/platform/workspaces/operations.ts#L6-L49). A Request should reference an operation rather than create another executor.
- **Keep verified agency handoffs.** Continue using expiring, recipient-verified, read-only delegation in [`repository.ts`](../../src/platform/workspaces/repository.ts#L297-L378). Place the handoff inside the Request evidence and access panel.

### Change

- **Change the role of `RequestStage`.** Treat `draft`, `scoping`, `building`, `review`, and `delivered` in [`model.ts`](../../src/experience/delivery/model.ts#L1-L19) as an interface prototype, not the production lifecycle. Replace it at the product layer with `phase`, `state`, and `attention` as described above.
- **Change “resolved” into a backend fact, not a user-facing outcome.** An event can be resolved because a structural handoff was recorded or because a provider accepted a non-idempotent write. The Request should still distinguish handed, handed with verification attention, and handed off for manual work.
- **Change approval wording.** “Approve” must state whether it approves scope, saving a result, publishing, deploying, or an external write. Preserve the existing separation between preview approval and publishing in [`request-session.ts`](../../src/experience/delivery/request-session.ts#L39-L80).
- **Change progress from activity to checkpoints.** Show meaningful milestones, target, next action, and wait reason. Keep raw logs and tool traces available to an agency, but do not make them the default business view.
- **Change the final status rule.** Only show clean “Handled” after the relevant target or saved artifact has passed its acceptance and verification policy. Show a visible warning state for provider accepted but read-back unconfirmed outcomes.

### Add

- **Add a durable Request record.** At minimum it should contain `request_id`, workspace and customer, product and resource, problem statement, phase, state, attention reason, scope versions, acceptance criteria, authority gates, attempts, checkpoints, result artifact, system receipt, verification, cost, notifications, actors, and recovery links.
- **Add an evidence bundle.** Every result should expose a short trust brief first, then the source inputs, diff or preview, checks, receipt, audit trail, and known gaps. This is the shared evidence shape across assessment, website change, and build.
- **Add an explicit scope checkpoint.** Show goal, in-scope, out-of-scope, affected resources, assumptions, risk, expected cost, success criteria, and required approvals before the Request starts consequential work.
- **Add a two-level detail view.** The business view should lead with outcome, preview, decision, and proof. The agency view should add client queue, assignment, exact diff, logs, release information, tests, provider receipts, and client handoff.
- **Add typed authority gates.** Store the actor or role, target, approved version, action, decision, note, and expiry. A client or agency should be able to see which approval is still missing.
- **Add product-specific verification adapters.** Assessment, website change, and build should each declare their own acceptance and verification rules while writing to the same Request evidence schema.
- **Add recovery actions.** Offer Resume from checkpoint, Retry safe step, Request changes, Re-plan, Roll back, Reopen, and Contact Strelva. Hide or disable Retry when an external write has already been accepted.
- **Add cost and notification controls.** Show expected and actual usage, pause at a per-Request limit where possible, and notify on start, wait, review, failure, and handled. Support all updates, attention only, and handled only.
- **Add provenance to assessment recovery.** Expose the server-owned operation input, operation ID, and saved work ID so a recovered assessment is visibly the same operation, not a new score from browser-provided data.

### Drop

- **Drop generic “Delivered” as the final meaning.** It is too easy to confuse a saved result, a handoff, a provider acceptance, and a live verified change.
- **Drop agent confidence as a substitute for proof.** Confidence can prioritize review or explain uncertainty, but it must never be the only reason to trust a change.
- **Drop silent automatic publish for risky work.** Keep the existing review path for high-risk facts, marketing copy, structural changes, and external writes.
- **Drop a generic spinner or percentage as the progress model.** Users need checkpoints, waiting reason, target, and recovery, not synthetic precision.
- **Drop the assumption that a chat transcript is an audit trail.** A Request needs durable scope, decisions, versions, receipts, and evidence that can be shared with an agency.
- **Drop intermediate checkpoint noise from the business history.** Keep detailed logs for agency review and debugging, but summarize them into meaningful milestones for the owner.

## 7. Open questions

1. What is Strelva’s contractual definition of “Handled” for an external provider when the provider accepts a write but read-back is unavailable or fails? Should that be a separate terminal status with a follow-up obligation?
2. Which actor may approve scope, result, publish, and deploy for each tenant? Can an agency approve on behalf of a client, and can a client require a second approval?
3. Should low-risk work auto-start, or should every Request show a scope checkpoint first? The product can use policy to auto-apply safe factual work, but the user still needs a visible scope and evidence record.
4. What budget unit should businesses see: dollars, credits, included usage, time, or a simple estimated range? What is the per-Request pause limit?
5. What verification checks are mandatory for each resource type, and how long is each check considered fresh?
6. Which notification channels are in scope for owners, agencies, and operators, and what is the escalation rule for a Request waiting too long?
7. Should an agency’s default access be read-only, or can the client grant approval and publish authority per Request? How should that authority expire?
8. For builds, what is the normal release object: preview, pull request, deployment, or operator handoff? When does client approval trigger deployment?
9. Should assessment completion create a reusable Saved Work artifact automatically, and what is the path from assessment recommendation to a new implementation Request?
10. How should legacy event IDs, workspace operation IDs, saved work IDs, and handoff IDs be exposed and migrated into the Request case file without changing their existing authority boundaries?

## 8. Sources

The source links below are the primary product documentation and official research used for this report. “Accessed 2026-09-11” means the page was reviewed on the research date. Product plans, pricing, and product behavior can change.

### Agent products

- [Devin Interactive Planning](https://docs.devin.ai/work-with-devin/interactive-planning), accessed 2026-09-11.
- [Devin 2025 release notes](https://docs.devin.ai/release-notes/2025), accessed 2026-09-11.
- [Devin Review](https://docs.devin.ai/work-with-devin/devin-review), accessed 2026-09-11.
- [Devin self-serve plans](https://docs.devin.ai/admin/billing/self-serve), accessed 2026-09-11.
- [Devin scheduled sessions](https://docs.devin.ai/product-guides/scheduled-sessions), accessed 2026-09-11.
- [OpenAI Introducing Codex](https://openai.com/index/introducing-codex/), 2025-05-16.
- [OpenAI Codex system card addendum](https://openai.com/index/o3-o4-mini-codex-system-card-addendum/), 2025-05-16.
- [OpenAI Codex upgrades](https://openai.com/index/introducing-upgrades-to-codex/), 2025-09-15.
- [OpenAI Codex changelog](https://help.openai.com/en/articles/11428266-codex-changelog/), accessed 2026-09-11.
- [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web), accessed 2026-09-11.
- [Anthropic: Enabling Claude Code to work more autonomously](https://www.anthropic.com/news/enabling-claude-code-to-work-more-autonomously), 2025-09-29.
- [Cursor Cloud Agents](https://cursor.com/docs/cloud-agent), accessed 2026-09-11.
- [Cursor Cloud Agent builds](https://cursor.com/docs/cloud-agent/builds), accessed 2026-09-11.
- [Cursor Approval Agents](https://cursor.com/docs/approval-agents), accessed 2026-09-11.
- [Cursor checkpoints](https://docs.cursor.com/en/agent/chat/checkpoints), accessed 2026-09-11.
- [Replit: Build with Agent](https://docs.replit.com/learn/build-with-agent), accessed 2026-09-11.
- [Replit Agent v2](https://replit.com/blog/agent-v2), 2025-02-25.
- [Replit effort-based pricing](https://replit.com/blog/effort-based-pricing), 2025-06-18.
- [Replit secure vibe coding](https://replit.com/blog/doubling-down-on-our-commitment-to-secure-vibe-coding), 2025-07-29.
- [Lovable Agent Mode beta](https://lovable.dev/blog/agent-mode-beta), 2025-06-30.
- [GitHub Copilot agent management](https://docs.github.com/en/copilot/concepts/agents/cloud-agent/agent-management), accessed 2026-09-11.
- [GitHub manage and track agents](https://docs.github.com/en/copilot/how-tos/copilot-on-github/use-copilot-agents/manage-and-track-agents), accessed 2026-09-11.
- [GitHub get the best results](https://docs.github.com/en/copilot/tutorials/cloud-agent/get-the-best-results), accessed 2026-09-11.
- [GitHub agentic workflows](https://docs.github.com/en/copilot/concepts/agents/about-github-agentic-workflows), accessed 2026-09-11.
- [Manus Plan Mode](https://manus.im/blog/manus-plan-mode), 2026-07-22.
- [Manus website versions and checkpoints](https://open.manus.ai/docs/v2/website), accessed 2026-09-11.
- [Manus credit consumption](https://help.manus.im/en/articles/11711097-what-are-the-rules-for-credits-consumption-and-how-can-i-obtain-them), 2026-06-18.

### Browsing agents and consumer approval patterns

- [OpenAI Operator](https://openai.com/index/introducing-operator/), 2025-01-23.
- [OpenAI ChatGPT agent](https://openai.com/index/introducing-chatgpt-agent/), 2025-07-17.
- [OpenAI using Cloud Browser](https://help.openai.com/en/articles/20001280-using-cloud-browser-in-chatgpt), accessed 2026-09-11.
- [OpenAI Tasks in ChatGPT](https://help.openai.com/en/articles/10291617), accessed 2026-09-11.
- [OpenAI Work and Codex](https://help.openai.com/en/articles/20001275/), accessed 2026-09-11.
- [Shopify Sidekick](https://help.shopify.com/en/manual/ai-powered-tools/sidekick), accessed 2026-09-11.
- [Shopify Sidekick best practices](https://help.shopify.com/en/manual/ai-powered-tools/best-practices), accessed 2026-09-11.
- [Shopify Sidekick Pulse](https://help.shopify.com/en/manual/ai-powered-tools/sidekick/pulse), accessed 2026-09-11.
- [Shopify Sidekick app actions](https://shopify.dev/docs/apps/build/sidekick/build-app-actions), accessed 2026-09-11.
- [Shopify connecting AI tools considerations](https://help.shopify.com/en/manual/ai-powered-tools/connecting-ai-tools/considerations), accessed 2026-09-11.

### Trust and user concerns

- [Stack Overflow 2025 AI survey](https://survey.stackoverflow.co/2025/ai), accessed 2026-09-11.
- [Anthropic: Trustworthy agents](https://www.anthropic.com/research/trustworthy-agents), accessed 2026-09-11.
- [Capgemini AI agents report](https://www.capgemini.com/wp-content/uploads/2025/07/AI-Agents_Final_210725.pdf), 2025-07.

### Repository sources reviewed

- [`src/lib/ai-governance.ts`](../../src/lib/ai-governance.ts)
- [`src/lib/event-actions.ts`](../../src/lib/event-actions.ts)
- [`src/lib/agent-shared.ts`](../../src/lib/agent-shared.ts)
- [`src/experience/delivery/request-session.ts`](../../src/experience/delivery/request-session.ts)
- [`src/experience/delivery/model.ts`](../../src/experience/delivery/model.ts)
- [`src/products/assessment/recovery.ts`](../../src/products/assessment/recovery.ts)
- [`src/platform/workspaces/operations.ts`](../../src/platform/workspaces/operations.ts)
- [`src/platform/workspaces/types.ts`](../../src/platform/workspaces/types.ts)
- [`src/platform/workspaces/repository.ts`](../../src/platform/workspaces/repository.ts)
