# The Frontier Feel

Research stream 1: The frontier feel
Research date: September 11, 2026
Scope: shared interface direction for Strelva

This report studies the named products through their shipped product surfaces, release notes, documentation, and pricing pages. Prices are directional snapshots taken on or near the research date, not a pricing recommendation. For the three newer examples, “acclaimed” means high-salience product attention and a distinctive interface direction. It is not a claim about a formal award.

## 1. Executive answer

Frontier software in 2026 does not need neon, gradients, or a chat bubble. It feels frontier when it turns an intention into durable work, shows meaningful progress, and leaves the user with an inspectable result.

The strongest products share five traits:

- Work has a name and a return path.
- Progress appears as stages, not a spinner or fake percentage.
- The result is an artifact, preview, diff, report, or live environment with evidence.
- Side effects have a boundary: plan, preview, review, approve, apply, verify.
- Context stays visible while the interface stays calm, fast, and keyboard-friendly.

Strelva should borrow this operating model. Home starts or resumes a Request. In progress, it shows a phase rail and short event stream. Result is the visual center, not the transcript. The Business panel keeps scope, access, integrations, and work-in-flight visible. Chat can help in governed contexts, but it is not the main object.

## 2. What “frontier feel” means in 2026

### The core distinction

The frontier is not a visual style. It is a change in the unit of interaction.

Older business software asks a person to navigate to a module, fill in a form, inspect a dashboard, and manually move information between systems. Newer software lets a person state an outcome, then provides a controlled workspace where the system prepares, changes, checks, and packages the work. The interface still exposes the important decisions. It simply removes the need to supervise every low-level step.

That makes the frontier feel closer to a small studio or mission control than to a dashboard:

1. The user names an outcome.
2. The product establishes the subject, scope, and available resources.
3. The system works in visible stages.
4. The user gets a tangible result.
5. The result can be reviewed, approved, shared, applied, verified, or reopened.

The interface feels advanced when those stages are clear and fast. It feels dated when the system claims intelligence but leaves the user with a blank chat, an opaque spinner, a grid of summary cards, or an unverified “success” state.

### Pattern crosswalk

| Pattern | Strong examples | What it contributes | Strelva guardrail |
| --- | --- | --- | --- |
| Command palette and keyboard-first control | Linear, Raycast, Arc, Dia, Cursor | Reduces navigation cost and makes the product feel close to the user’s work | Add a global command layer, but keep the main product object visible and understandable without shortcuts |
| Inline agent progress | Linear Agent Interaction SDK, Devin, Cursor, ChatGPT deep research | Makes a long-running task legible without turning it into a transcript | Show plan, phase, meaningful event, and evidence. Do not show raw chain of thought |
| Artifacts and canvases | Claude Artifacts, ChatGPT Canvas, Figma Make, Lovable, Replit Agent | Gives generated work a surface where it can be edited, inspected, and shared | Make the Result the working area. Let the Request explain the result, not replace it |
| Review and approval | Raycast AI Extensions, Cursor sandboxing and review, Manus Plan Mode, Dia Skills | Keeps consequential actions inside a visible trust boundary | Show the exact consequence, affected resource, and provider state before approval |
| Ambient status | Cursor menu bar status, Vercel Toolbar, Granola’s meeting indicator, ChatGPT Scheduled tasks, Perplexity Computer | Lets work continue without forcing the user to stare at the current page | Preserve a quiet in-progress indicator and a reliable return path |
| Streaming | Devin’s inline plan, ChatGPT research progress, Cursor agent events, Granola live transcription | Makes the product feel alive and reduces uncertainty during waiting | Stream useful events and artifacts, not simulated typing or theatrical “thinking” |
| Optimistic but honest state | Vercel preview deployments, Replit checkpoints, Lovable previews | Lets the user keep moving before every external confirmation arrives | Distinguish preparing, accepted, live, failed, and accepted-but-unverified |
| Generative UI | Figma Make, Lovable Visual Edits, Replit Design Mode, Claude Artifacts | Turns an instruction into a visual object rather than a paragraph | Generate within Strelva’s object model: Request, Result, Resource, Business, approval |
| Provenance and source jumps | Granola, Devin Search, Vercel preview comments, Linear updates | Connects a conclusion to its source and makes review faster | Every important recommendation should point to source, timestamp, change, and verification |
| Editorial typography and restrained motion | Granola, Raycast, Dia, Vercel Toolbar | Gives the product a point of view and a sense of care | Use motion to mark state changes and typography to establish hierarchy, never as decoration |

The important combination is not “AI plus chat.” It is intent plus context plus visible execution plus a result that can stand on its own.

## 3. Evidence from products

### Price and date snapshot

The dates below identify a relevant launch or interface change. Price values are current page snapshots where available.

| Product | Relevant date | Price signal found |
| --- | --- | --- |
| Linear | Linear for Agents, May 20, 2025; Agent Interaction SDK, July 30, 2025 | Free; Basic $10/user/month billed yearly; Business $16/user/month billed yearly |
| Vercel | Compact dynamic Toolbar, January 14, 2025 | Hobby $0; Pro $20/month; Enterprise custom |
| Cursor | Cursor 3, April 2, 2026 | Hobby free; Pro $20/month; Pro+ $60/month; Ultra $200/month; Teams $40/user/month |
| Claude | Claude Projects and Artifacts earlier; Create Files, September 9, 2025 | Free; Pro $20/month or $200/year; Max $100 or $200/month |
| Claude Code web | Public web research preview documented March 16, 2026 | Included with eligible Claude Pro, Max, Team, and Enterprise plans |
| ChatGPT | Deep Research, February 2, 2025; Agent, July 17, 2025 | Plus $20/month; Pro tiers $100 and $200/month, with new $200 sign-ups paused September 10, 2026; Business Standard $20 annual or $25 monthly |
| Granola | New visual system, February 2, 2026 | Basic $0; Business $14/user/month; Enterprise $35/user/month |
| Notion | Notion 3.0 Agents, September 18, 2025 | Free; Plus $10/member/month; Business $20/member/month; Enterprise custom |
| Raycast | New Raycast, May 14, 2026 | Free; Pro $10/month or $8/month billed annually; Teams Pro $15 monthly or $12 annually |
| Lovable | Agent Mode beta, June 30, 2025; unified credits, June 13, 2026 | Free to start with build, Cloud, and AI credits; paid plans use a shared credit pool |
| Replit Agent | Agent v2, February 25, 2025; Agent 3, September 2025 | Starter free; Core $20/month or $18 annual; Pro $100/month or $90 annual |
| Devin | Devin 2.0, April 3, 2025 | Free; Pro $20/month; Max $200/month; Teams starts at $80/user/month |
| Arc and Dia | Dia general availability, October 8, 2025 | Dia free; Better Answers $20/month; Better Days $100/month |
| Figma Make | Public launch, May 7, 2025; general availability, July 24, 2025 | Starter free; Professional Full $16/month; Organization $55/month; Enterprise $90/month |
| Perplexity Computer | Introduced February 25, 2026 | Pro $20/month; Max $200/month; Computer has separate usage credits; entitlement varies by account |
| Manus | Public beta reported March 2025; Plan Mode documented July 22, 2026 | Free; Pro starts at $20/month; Team starts at $20/seat/month |

The price pattern is itself useful. Products that do long-running work increasingly expose either a higher fixed tier, a credit balance, or a spend boundary. That makes usage part of the interaction model. Strelva should show the scope and consequence of a Request before work begins, even if Strelva does not expose usage credits to its customers.

### Linear

Linear’s core unit is the issue, project, or initiative, not a conversation. The search surface is keyboard-first: the slash key opens search, a command menu is available through the keyboard, and issue selection supports J/K movement, X selection, and bulk actions. The Space key opens a quick “peek” without taking the user away from the current list. These are small interactions, but together they create the feeling that the product is always close at hand. See [Linear search](https://linear.app/docs/search), [peek](https://linear.app/docs/peek), and [issue selection](https://linear.app/docs/select-issues), all retrieved September 11, 2026.

Linear also treats status as structured work. Project updates include a health indicator, rich text, progress, and a chronological history. Its Agent Interaction SDK defines states such as actively working, waiting, error, and completed, plus activity and clarification events. Agents are identifiable contributors inside the normal work model. See the [initiative and project updates](https://linear.app/docs/initiative-and-project-updates), [Linear for Agents release note from May 20, 2025](https://linear.app/changelog/2025-05-20-linear-for-agents), and [Agent Interaction SDK release note from July 30, 2025](https://linear.app/changelog/2025-07-30-agent-interaction-guidelines-and-sdk).

The anti-pattern it avoids, in my reading, is the generic dashboard that summarizes work without giving the user a fast way to enter the real object. It also avoids pretending that completion can be inferred perfectly. Linear’s documentation says project status is manually updated and does not automatically become complete just because all issues are complete. That restraint is important for Strelva: a provider write or a completed subtask must not silently become a verified business outcome. See [Linear project status](https://linear.app/docs/project-status).

**Strelva lesson:** make Request the durable work object, give it fast keyboard access, and let status describe the real lifecycle. A Request needs a title, Business, target Resource, current phase, evidence, and a return path.

### Vercel

Vercel makes the deployed environment part of the design. Every deployment gets a unique URL and a clear Local, Preview, or Production state. Deployment details expose logs, errors, resources, and the path from preview to production. This is stronger than a dashboard saying “deployed” because the user can open the thing that was produced. See [Vercel deployments overview](https://vercel.com/docs/deployments/overview), last updated July 18, 2025.

Its Toolbar is another useful pattern. It is compact, dynamic, and quiet when inactive. It can attach comments to a real part of a preview, connect those comments to discussion, and expose tools for layout shifts, interaction timing, feature flags, and accessibility. The toolbar can be activated by keyboard and does not run in the background. See the [Toolbar documentation](https://vercel.com/docs/vercel-toolbar), the [January 14, 2025 compact Toolbar release](https://vercel.com/changelog/the-vercel-toolbar-is-now-more-compact-and-dynamic), and [comments on previews](https://vercel.com/docs/comments), last updated September 15, 2025.

The anti-pattern it avoids is the screenshot and email loop. A comment is tied to the exact live preview, not to an image whose context may go stale. It also avoids leaving a large tool palette permanently in the way. The product keeps the control layer available without making it the main content.

**Strelva lesson:** a Result should be openable in its real context. For a Website Result, that may be a preview URL or a before-and-after view. For a report, it may be a source-linked working area. “Finished” should mean the user can inspect the result, not merely read an activity log.

### Cursor

Cursor’s frontier move is to make agents persistent, parallel, and portable. Cursor 3, announced April 2, 2026, puts agents in a unified workspace across local, cloud, mobile, web, Slack, GitHub, and Linear. Users can run multiple agents, hand work between local and cloud environments, inspect diffs, use an integrated browser, and annotate a live UI through Design Mode. See [Cursor 3](https://cursor.com/blog/cursor-3) and the [Cursor 3 release note](https://cursor.com/changelog/3-0).

The older Background Agent surface already established the pattern: start work in a sidebar, see status, follow up, or take over later. The agent runs in a remote isolated environment. Cursor’s review surface exposes additions and deletions with accept and reject controls, while checkpoints make it possible to restore the agent’s changes. See [Background Agent](https://docs.cursor.com/background-agent), [agent review](https://docs.cursor.com/en/agent/review), and [checkpoints](https://docs.cursor.com/en/agent/chat/checkpoints).

Cursor’s sandboxing work is also a lesson in approval design. The February 18, 2026 post argues that agents should be able to work inside a controlled environment and ask for approval only when they cross the boundary. Cursor reported that this reduced permission prompts by 40 percent in its internal testing. See [Cursor agent sandboxing](https://cursor.com/blog/agent-sandboxing). The anti-pattern avoided is approval fatigue: a product that asks for permission on every harmless step trains users to approve blindly. The other avoided anti-pattern is blind editing. Diffs, checkpoints, and review bars make the actual change visible.

**Strelva lesson:** use a bounded execution environment for ordinary inspection and preparation. Interrupt only for a meaningful side effect. Give every material change a reviewable diff or exact field-level summary, plus a recovery point.

### Claude on claude.ai

Claude’s strongest interface pattern is the Artifact. The chat remains an input surface, but the output moves into a dedicated window beside the conversation. An Artifact can be code, a flowchart, an SVG, a website, or an interactive dashboard. It can be edited, previewed, shared, and remixed. Claude’s June 25, 2025 Build with Claude Artifacts update made the space more persistent and app-like, rather than leaving the output as a block in a transcript. See [Artifacts](https://www.anthropic.com/news/artifacts), [Build with Claude Artifacts](https://www.anthropic.com/news/build-artifacts), and [Projects](https://www.anthropic.com/news/projects).

Claude also moved from generated text to real files. Its September 9, 2025 Create Files release lets Claude create and edit Excel, Word, PowerPoint, and PDF files. That matters because a file can be opened, sent, revised, or used outside the chat. See [Create Files](https://www.anthropic.com/news/create-files).

The anti-pattern avoided is the chat transcript as the final deliverable. Claude can still be used as a chat product, but the most important work exits the conversation and becomes a separate object. It also avoids forcing every output into a text-only format.

**Strelva lesson:** a Result needs its own working area. The Request can retain the conversation or instruction history, but the report, assessment, preview, or governed action should have a stable surface, title, state, evidence, and next action.

### Claude Code web

Claude Code web treats coding as an asynchronous job with a persistent environment. The user selects a GitHub repository, describes the task, and Claude runs in a remote environment. When the browser closes, the session continues. When it finishes, it can produce a branch or pull request. The March 16, 2026 support article describes the flow as selecting a repository, describing the task, letting the remote environment run without supervision, and receiving a pull request when finished. See [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web) and [Claude Code web support](https://support.claude.com/en/articles/12618689-claude-code-on-the-web).

The security boundary is part of the experience. Anthropic describes an isolated sandbox, a custom proxy, restricted network access, and credentials that do not enter the sandbox. Its October 20, 2025 engineering post reports an 84 percent reduction in permission prompts in internal testing after sandboxing. See [Claude Code sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing).

The anti-pattern avoided is the forced local setup followed by an opaque result. The user gets a durable session, a branch, and a pull request. The product also avoids pretending that “the agent ran” is enough proof. The branch and review surface are the handoff.

**Strelva lesson:** a long Request should survive leaving the page. The user should be able to return to the same Request from Home, an email, or a notification and find the current phase, prepared result, approval state, and verification state.

### ChatGPT

ChatGPT is the clearest example of a product that started as chat but is moving toward a set of work surfaces. Canvas is a separate side-by-side window for writing and code. Users can highlight a section for focused instruction, edit directly, use a shortcut menu, and restore earlier versions. See [Introducing Canvas](https://openai.com/index/introducing-canvas/), October 3, 2024.

Projects add files, instructions, memory, and chats to a durable context. Deep Research turns a request into a multi-step report, and the February 10, 2026 update added connectors, trusted sites, real-time progress, interruption, and refinement. Agent mode, introduced July 17, 2025, combines research, browser work, and terminal work and can resume where it left off. Scheduled tasks use a confirmation card and a dedicated page to review, pause, resume, edit, or delete tasks. See [Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt), [Deep Research](https://openai.com/index/introducing-deep-research/), [ChatGPT Agent](https://openai.com/index/introducing-chatgpt-agent/), and [Scheduled tasks](https://help.openai.com/en/articles/10291617).

OpenAI’s current Pro help page says new sign-ups and upgrades to the $200 Pro 20X tier are paused as of September 10, 2026. This is a reminder that product entitlements and prices can change faster than interface patterns. See [ChatGPT Pro tier update](https://help.openai.com/en/articles/9793128-what-is-chatgpt-pro/).

The anti-pattern it is working away from is the stateless chat. Projects, Canvas, tasks, and agent runs give the conversation a place, memory, and follow-up action. The remaining risk is that chat is still the default visual metaphor. Strelva should learn from the durable surfaces, not copy the blank composer.

**Strelva lesson:** use natural language to begin a Request, then move the user into an object with a plan, context, progress, and result. Do not ask the user to rediscover the work by scrolling through messages.

### Granola

Granola has a different frontier posture. It deliberately avoids putting a meeting bot into the call. Its June 1, 2026 post says the product works through the user’s own computer audio and microphone, keeps the experience private, and avoids a visible bot participant. The live state is a small floating meeting indicator with green dancing bars, not a large assistant panel. See [Why Granola doesn’t use a bot](https://www.granola.ai/blog/why-granola-doesnt-use-a-bot) and [transcription](https://docs.granola.ai/help-center/taking-notes/transcription).

The product combines a human notepad with AI enhancement. Users can inspect the transcript, search it, and jump from an AI-enhanced note back to the raw source. Granola 2.0 added shared folders, source-linked chat, and navigation back to the exact meeting context. See [Granola 2.0](https://www.granola.ai/blog/two-dot-zero) and [AI-enhanced notes](https://docs.granola.ai/help-center/taking-notes/ai-enhanced-notes).

Its February 2, 2026 visual update is also instructive. Granola describes a calm, present visual system with an editorial display face and a neutral interface face. The product aims for “progress over process,” which means the useful note stays central while the system’s work remains available when needed. See [A new look for Granola](https://www.granola.ai/blog/a-new-look-for-granola).

The anti-pattern avoided is the invasive recorder or a generic assistant trying to perform the meeting for the user. Granola also avoids an ungrounded wall of AI text by keeping the raw note and source transcript close.

**Strelva lesson:** ambient status can be small and human. Use it to show that work is active, not to demand attention. Keep source evidence one step away from every important conclusion.

### Notion

Notion 3.0, released September 18, 2025, frames Agents as coworkers operating inside the workspace. An Agent can search, create pages and databases, update content, and execute multi-step work across many pages. It has instructions, memory, connectors, and permissions. Notion explicitly positions this as more than a chatbot that makes generic suggestions. See [Notion 3.0 Agents](https://www.notion.com/en-gb/blog/introducing-notion-3-0) and the [September 18, 2025 release note](https://www.notion.com/en-gb/releases/2025-09-18).

Notion’s meeting surface keeps the same principle. Notion 3.1, released November 17, 2025, put Meetings in the sidebar and linked meeting summaries to an exact transcript moment. That makes the generated note a working object with provenance. See [Notion 3.1](https://www.notion.com/releases/2025-11-17).

The anti-pattern avoided is the isolated AI sidebar that forgets the workspace. The Agent acts on real pages, databases, comments, and files, while permissions remain part of the model. The risk to watch is silent mutation across a large workspace. Strelva should keep the same persistent context but use narrower objects and stronger approval boundaries.

**Strelva lesson:** Business context is not metadata tucked into a settings page. It should determine what the Request can see, what the Result can affect, and who can approve it.

### Raycast

Raycast shows what a command layer can feel like when it is the product shell rather than an app page. The May 14, 2026 redesign added a custom indexer for responsiveness, Quick AI for a fast one-off action, and tags for snippets, quicklinks, and AI commands. The system stays close to the keyboard and lets a command be a reusable action instead of a new conversation. See [The new Raycast](https://www.raycast.com/blog/the-new-raycast) and [AI Commands](https://manual.raycast.com/ai/ai-commands).

Its AI Extensions make approvals concrete. A tool call can show an approval card with the exact command, permissions can be set to Ask, Auto, or Always Allow, and the user can allow, deny, or inspect the command. Screen Awareness names the frontmost window it is reading, which makes scope visible before the action begins. See [AI Extensions](https://manual.raycast.com/ai/ai-extensions) and [Screen Awareness](https://manual.raycast.com/ai/screen-awareness).

Raycast also separates Quick AI from a persistent Chat workspace. That is a useful restraint. The full chat surface exists, but it does not have to carry every small action. Its current pricing page lists a free tier and Pro at $10/month or $8/month billed annually. See [Raycast pricing](https://www.raycast.com/pricing).

The anti-pattern avoided is app switching, hidden scope, and a full chat interface for every action. The danger is overfitting to power users. Strelva should offer a command palette as a shortcut layer, while plain-language labels and visible buttons remain first-class.

**Strelva lesson:** the command palette should contain Strelva verbs: New Request, Search Requests, Switch Business, Open approvals, Find a Resource, and Help. It should not turn the whole product into a command prompt.

### Lovable

Lovable combines natural-language generation with direct visual editing. Visual Edits, announced March 13, 2025, let a user select a visible part of a site and change it in place. Agent Mode, announced June 30, 2025, added a more autonomous opt-in mode that gathers context, makes changes, auto-fixes errors, and reports what changed. See [Visual Edits](https://lovable.dev/blog/visual-edits) and [Agent Mode beta](https://lovable.dev/blog/agent-mode-beta).

The product also makes project knowledge persistent. Its Knowledge feature holds project-specific instructions and context, including information about the code and integrations. History, preview, publish, and revert keep the generated work from being a one-shot prompt. See [Lovable Knowledge](https://docs.lovable.dev/features/knowledge) and [Getting started](https://docs.lovable.dev/introduction/getting-started).

Lovable’s pricing model is part of the interaction. The current free offer includes five build credits per day up to 30 per month, 20 Cloud credits per month, and four AI credits. Its June 13, 2026 billing update describes a unified credit model for building and running the app. Agent and Plan modes make cost visible in the workflow. See [Lovable billing](https://lovable.dev/blog/simplifying-billing) and [Lovable pricing](https://lovable.dev/pricing).

The anti-pattern avoided is prompt-only trial and error. The user can act directly on the visual result and can see that work has a cost. The risk is that the whole product still resembles a chat-driven builder. Strelva should borrow direct result manipulation only where the result is a governed business artifact, not become a general website IDE.

**Strelva lesson:** let a user annotate or correct a Result in place when the correction is bounded. Keep the Request, Result, and approval state visible as separate objects.

### Replit Agent

Replit Agent makes the full loop visible: plan, build, preview, deploy, and roll back. Agent v2, released February 25, 2025, introduced a more autonomous workflow and a real-time design preview. Plan Mode is separate from Build Mode. Plan Mode asks questions and proposes an approach without changing the project. Build Mode makes the changes. A completed task creates a checkpoint that can be reviewed or rolled back. See [Plan Mode and Build Mode](https://docs.replit.com/learn/plan-vs-build-mode) and [Agent v2](https://replit.com/blog/agent-v2).

Replit’s 2025 review describes Agent 3 in September and Design Mode in November. Design Mode lets users work directly on interactive designs, while Plan Mode became more proactive and added automatic checkpoints. Replit also exposes real-time AI usage in the Agent tab and usage dashboard, with effort-based pricing. See [Replit’s 2025 review](https://replit.com/blog/2025-replit-in-review) and [AI billing](https://docs.replit.com/billing/ai-billing).

The anti-pattern avoided is “generate and pray.” The user sees a visual preview, a plan boundary, a checkpoint, and a path to deployment. The product does not make rollback an afterthought.

**Strelva lesson:** every consequential Request should have a preparation state and a recovery path. “Undo” is not enough for an external write. Strelva needs a clear draft, approval, accepted, live, failed, and accepted-but-unverified lifecycle.

### Devin

Devin 2.0, released April 3, 2025, presents agents as parallel workers in interactive cloud development environments. Users can steer, review, edit, and run tests. Devin Search returns cited code context. Interactive Planning turns the task into a plan that can be inspected before execution. See [Devin 2.0](https://cognition.com/blog/devin-2).

Devin’s later session UI makes the work lifecycle explicit. Release notes describe a session view that highlights Task, Plan, PR, and Summary, inline plans inside streaming content rather than hiding them in a modal, and keyboard navigation through progress. The August 25, 2026 renderer post explains that a session can contain messages, actions, diffs, artifacts, and testing videos over days and more than 100,000 events. See [Devin release notes](https://docs.devin.ai/release-notes/2025) and [the chat renderer rebuild](https://devin.ai/blog/rebuilding-devins-chat-renderer).

The anti-pattern avoided is the one giant chat transcript. A session has stages and proof objects. The user can jump to the plan, pull request, summary, or test evidence without reconstructing the sequence from prose.

**Strelva lesson:** a Request in progress should have named phases and a result summary even while work is streaming. A long activity log may exist, but it should not be the only way to understand what happened.

### Arc and Dia

Arc’s contribution is the contextual shell. Spaces separate browsing contexts and give each one its own pinned tabs, temporary tabs, theme, and icon. Split View lets the user compare two things, and Focus Mode hides the sidebar when the work itself should fill the screen. Command Bar actions create Spaces, move tabs, open Notes or Easel, and change context without a navigation maze. See [Arc Spaces](https://resources.arc.net/hc/en-us/articles/19228064149143-Spaces-Distinct-Browsing-Areas), [Split View](https://resources.arc.net/hc/en-us/articles/19335393146775-Split-View-View-Multiple-Tabs-at-Once), and [Command Bar](https://start.arc.net/command-bar-actions).

Dia carries that idea into an AI browser. Its October 8, 2025 general availability release added a Skill builder, Command Bar actions, and memory search. A later release exposed thinking details and source dropdowns while reading. Skills can be assembled in natural language, their steps are shown, and the user can choose to approve every run. Dia also added a loading chain with visible progress and recovery when attachments fail. See [Dia 1.0.1](https://www.diabrowser.com/changelog/1-0-1), [Dia 1.2.0](https://www.diabrowser.com/changelog/1-2-0), [Dia 0.43.0](https://www.diabrowser.com/changelog/0-43-0), and [Dia 1.5.0](https://www.diabrowser.com/changelog/1-5-0).

The anti-pattern avoided is tab overload and a static chatbot in a sidebar. Context is a visible space, and the system can be focused or expanded as needed. Dia’s small shimmer and loading details add motion without turning every task into a performance.

Dia’s current plans are Free, Better Answers at $20/month, and Better Days at $100/month, with task usage and top-up rules. See [Dia plans](https://www.diabrowser.com/plans).

**Strelva lesson:** Business should work like a Space. The user should always know which Business is active, what Resources belong to it, and what can be done in that scope. Switching context should be easy but explicit.

### Figma Make

Figma Make is a recent example of the canvas becoming the product. It launched May 7, 2025 as prompt-to-app prototyping and reached general availability July 24, 2025. Users can start from a prompt or existing design, see a high-fidelity interactive result, and continue editing it through code, prompt, and direct design actions. See [Introducing Figma Make](https://www.figma.com/blog/introducing-figma-make/) and [general availability](https://www.figma.com/blog/figma-make-general-availability/).

The May 28, 2026 local-code beta pushed the same interaction toward implementation. It added direct editing, annotations, chat, and pull request creation. Figma’s current pricing lists Starter free and Professional Full at $16/month, with AI credits attached to paid plans. The help documentation says credit consumption varies with model, complexity, and context, and shows the amount consumed after a task. See [Make on local code](https://www.figma.com/blog/figma-make-now-on-your-local-code/), [Figma pricing](https://www.figma.com/pricing/), and [AI credit guidance](https://help.figma.com/hc/en-us/articles/33459875669015-How-AI-credits-work).

The anti-pattern avoided is the static handoff. A design is not merely a screenshot for someone else to interpret. It is a live, editable, inspectable object that can move toward production. The remaining anti-pattern to avoid in Strelva is cost ambiguity. The system should state the scope of work before a Request starts.

**Strelva lesson:** when Strelva prepares a Website change, show the real surface, not a generic card that says “optimization complete.” Let the user inspect and annotate the proposed change before approval.

### Perplexity Computer

Perplexity Computer is a recent 2026 example of the “digital worker” model. Its product page describes a general-purpose worker that operates the same interfaces as the user, runs long workflows with subagents, works across connectors and skills, and produces artifacts, reports, and apps. The official workshop page says tasks continue in the background after the laptop is closed and can run across web, mobile, and Slack. See [Perplexity Computer](https://www.perplexity.ai/products/computer) and [Introducing Perplexity Computer](https://www.perplexity.ai/en-GB/hub/workshops/introducing-perplexity-computer).

The product was introduced February 25, 2026. Its product page lists Pro and Max subscribers, while an enterprise workshop describes Enterprise Pro and Max access, so entitlement appears to vary by account. Perplexity’s pricing pages list Pro at $20/month and Max at $200/month, while Computer usage has a separate credit balance and configurable spend. See the [Perplexity launch index](https://hub-prod.perplexity.ai/), [Perplexity pricing](https://www.perplexity.ai/enterprise/pricing), [Max pricing](https://www.perplexity.ai/help-center/en/articles/11680686-perplexity-max), and [Computer credit guidance](https://www.perplexity.ai/help-center/en/articles/13838041-how-credits-work).

The anti-pattern avoided is the answer-only search box. Computer owns the task after the prompt, keeps working, and returns a deliverable. That is a powerful model, but it can feel over-automated if the task boundary and side effects are not clear.

**Strelva lesson:** a Request should be able to run in the background, but the user must know what it is allowed to do, what is waiting for approval, and what evidence will count as verification.

### Manus

Manus was reported as entering limited public testing in March 2025. Its 2026 product surfaces show why it became a useful reference for agent interaction. Plan Mode creates a structured plan document before execution. The user can edit and approve the plan, and no changes happen until confirmation. Plan Mode supports mid-task changes, rollback, copying, and branches. See [Manus Plan Mode](https://manus.im/blog/manus-plan-mode), July 22, 2026. The initial public beta date is reported by [Axios](https://www.axios.com/2025/03/10/manus-chinese-ai-agent-deepseek), so it should be treated as a reported date rather than an official launch note.

Manus also treats the sandbox as a persistent place for files and artifacts. Users can view all files in a task and leave work running. Its January 2026 sandbox post describes persistence, while its Skills system turns a successful workflow into a reusable instruction package. See [Manus Sandbox](https://manus.im/blog/manus-sandbox) and [Manus Skills](https://manus.im/blog/manus-skills). The current help page lists Free, Pro starting at $20/month, and Team starting at $20/seat/month. See [Manus membership pricing](https://help.manus.im/en/articles/11711111-what-is-the-current-membership-pricing-for-manus).

The anti-pattern avoided is discovering after a long run that the system took the wrong direction. The plan is a visible, editable artifact. The other avoided pattern is the disposable workspace. Files, branches, and task history persist.

**Strelva lesson:** before a high-consequence Request runs, let the user approve a short plan that states target, intended change, boundary, and verification method. It should be editable without forcing a new chat.

## 4. Interface principles for Strelva

The design target is not an AI dashboard. It is a shared workspace where a person can move from problem to work to result to handled state.

### Principle 1: Make the Request the smallest durable unit of work

A Request should be a named object with:

- Business and user scope
- Desired outcome
- Target Resource
- Supporting sources or attachments
- Current phase
- Work history
- Result or results
- Approval and verification state
- Next action

The natural-language composer can create the first draft, but submission should create this object. “New chat” is too weak because it gives the user no clear unit to resume, share, approve, or measure.

### Principle 2: Show the system’s work without exposing private reasoning

The progress model should use plain phases that match Strelva’s trust boundaries:

1. Understanding the request
2. Checking the Business and available Resources
3. Preparing the Result
4. Waiting for your review
5. Applying the approved change
6. Verifying the external state
7. Ready, failed, or accepted-but-unverified

Each phase can show one current event, one source or tool label, and one piece of evidence. The user does not need an unfiltered event stream or a model’s hidden reasoning. A short event such as “Checked the current homepage and found the call-to-action section” is useful. “Thinking about the best approach” is not.

### Principle 3: Make the Result the visual center

A finished Result should feel closer to a document, preview, assessment, or reviewed change than to a message bubble. It should have:

- A strong title and plain-language outcome
- A summary of what changed or was found
- Evidence and source links
- Before and after views where relevant
- A visible lifecycle state
- The exact next action
- History, sharing, export, and recovery controls where allowed

The Request explains intent and process. The Result is where value becomes visible.

### Principle 4: Keep approvals narrow and consequences exact

The user should approve a consequence, not approve a vague agent mood. An approval surface should answer:

- Which Business is affected?
- Which Resource or provider is affected?
- What exact content, setting, or record will change?
- What will be public or externally visible?
- What can be rolled back?
- What does verification mean?
- What happens if the provider accepts the write but the read-back fails?

The approved state and the verified state must remain separate. Strelva’s existing accepted-but-unverified model is a frontier advantage because it is more honest than an instant success badge.

### Principle 5: Let context stay present but not noisy

Context should prevent scope errors, not become a second dashboard. The Business panel should be persistent on desktop, move below the main work on narrow screens, and be collapsible when the Result needs room. It should show the Business identity, domain or site, role, access, Resources, integrations, approvals, and work in flight. It should not fill the space with unrelated metrics.

### Principle 6: Put speed in the shell, not in visual noise

Use a command palette, fast search, keyboard hints, optimistic local saves, and background continuation. Use motion for a phase change, an updated Result, or a completed verification. Avoid animated orbs, fake typing, bounce, and decorative loading.

## 5. Four concrete surfaces

### Home: choose work, see work

Home should answer three questions within a few seconds:

1. Which Business am I acting for?
2. What work can I start or resume?
3. What needs my attention?

Recommended structure:

- Persistent text navigation: Home, Requests, Resources, Business, and Customers for agencies.
- A compact Business scope line near the top, with name, domain, and access role.
- One primary request brief: “What would you like Strelva to handle?” The input accepts natural language, but the surrounding fields make target and desired outcome explicit.
- Three or four useful starting examples tied to real Strelva work, such as “Check why the site is losing inquiries,” “Prepare a homepage improvement,” or “Review recent customer feedback.”
- A recent Requests list with title, Business, current state, last meaningful update, and Result thumbnail or evidence cue.
- A small “Needs you” area only when an approval, missing connection, or clarification is real.
- A quiet ambient indicator when work continues in the background.

The composer should not look like a full-width chat transcript. It should feel like opening a work brief. A user can type one sentence, but Strelva should then make the target, scope, and expected Result visible before execution.

Home should not lead with four metric cards, a fake “health score,” or a stream of invented activity. The selected Business Home direction in DESIGN.md already points toward a central request composer, recent work, a Business context panel, warm ivory, ink-teal, muted sage, purposeful work thumbnails, and a persistent text navigation. Keep that direction, but make the composer a Request creation surface rather than an assistant chat.

### Request in progress: a live work object

The top of the page should name the work:

- Request: Improve the homepage call to action
- Business: Example Business
- Resource: Public website
- State: Preparing Result

The main area should contain:

- A phase rail with the current phase clearly marked.
- One or two meaningful live events, newest first.
- The current working artifact, such as a site preview, draft copy, assessment section, or source comparison.
- A “What Strelva has found” or “What Strelva is preparing” summary.
- A control to add context or change direction without restarting the Request.

The side area should contain only relevant context:

- Sources checked
- Resources in scope
- What needs the user
- Approval state
- External provider state

When a user leaves, the Request should continue only within its permitted boundary. Home should show that it is active. The user should be able to return to the same page from a notification or recent work.

Use streaming for actual events and artifact updates. Do not stream a simulated internal monologue. Do not promise an exact completion time unless Strelva can support it. A short, reliable status is better than a progress bar that moves without evidence.

### Result: the work becomes useful

The Result page should feel like a calm handoff from a capable collaborator. The first screen should show:

- What Strelva found or prepared
- Why it matters to this Business
- The supporting evidence
- What is ready for review
- The next decision

For a Website Result, use a live or captured preview with annotations and a change summary. For an assessment, use a report with source links and prioritized findings. For a governed external action, use the exact proposed payload or content, the destination, and the approval control.

Use explicit states:

- Draft
- Ready for review
- Approved
- Applying
- Live
- Failed
- Accepted but unverified

Do not collapse all of these into “Complete.” A provider may accept a write while the read-back is unavailable. A draft may be ready but not public. A Result may be useful even when the intended external action failed, as long as the failure and recovery path are clear.

The main actions should be verbs: Review change, Approve, Ask for a revision, Open preview, Share result, Apply again, or View verification. The chat or follow-up input should be secondary and scoped to this Result.

### Business context panel: the answer to “for whom and what can this touch?”

The Business panel should be a quiet, persistent scope anchor. It should contain:

- Business name and logo or site thumbnail
- Domain and primary Resource
- Current user, role, and access scope
- Connected and unconnected integrations
- Work in progress
- Pending approvals
- Service or availability state
- Recent relevant history

The panel should make the difference between “connected,” “available,” “permitted,” and “paid” legible. It should not imply that an integration is active just because the integration type exists. Unconnected integrations should say so directly.

Business switching should be easy from the panel and command palette, but explicit. If a Request is open, Strelva should warn when switching would change its scope or discard an unsaved brief. Agencies need a client switcher and a clear access line without turning the panel into a CRM.

On mobile, move the panel below the main Result or open it as a deliberate sheet. Do not hide Business context entirely. Context confusion is a trust failure.

## 6. Keep, Change, Add, and Drop for Strelva

These recommendations are based on the root DESIGN.md decisions and the research above. They are interface direction, not a claim that every listed behavior is already implemented.

### Keep

- Keep the result-first premise. Making Work and the specific thing the visual center is exactly aligned with the frontier pattern.
- Keep one persistent interface with easy return, persistent navigation, and a real working area.
- Keep the decision not to make chat the mandatory main object. Ask Strelva should remain available where governed website work actually benefits from conversation.
- Keep explicit Business context, access, availability, and permission states.
- Keep exact consequences before approval, separate read-back failure, accepted-but-unverified status, recoverable history, and the ban on invented traffic or activity.
- Keep the small object vocabulary: product, Work, specific thing, Business or tenant, Resource, Request, Result, approval.
- Keep the warm ivory, ink-teal, muted-sage palette, editorial display type, direct UI text, soft controls, restrained depth, purposeful work thumbnails, and reduced-motion behavior.
- Keep the shared shell and semantic status tokens as the source of truth, including the StrelvaShell/AppFrame direction and the font-display utility for display type.
- Keep the prohibition on purple-blue AI gradients, hero-stat templates, icon-card grids, decorative glass, colored side stripes, and a generic dashboard as the main product.

### Change

- Change the Home composer from a possible chat-first interpretation into a Request brief. Natural language remains the fastest start, but target, Business, expected Result, and boundary must become visible before work begins.
- Change generic labels where they weaken the object model. Prefer Requests and Resources in the persistent product navigation. Keep Explore as a secondary catalog or discovery surface if it remains useful.
- Reconcile the DESIGN.md shell of Home, My work, Explore, Help & service, and Account with the emerging Home, Requests, Resources, Business, and Customers topology. Keep Help & service and Account in the account-level layer, and do not make My work and Requests compete as two names for the same destination.
- Change Ask Strelva from an omnipresent assistant promise into a contextual action. On Home it can start a Request. Inside a Result it can revise, explain, or prepare a bounded next step. It should not float as a universal chat bubble.
- Change “dark operations room” into a role-specific treatment. It can serve operator surfaces where dense evidence and system state are the job. It should not leak into the customer’s warm shared workspace or turn Business Home into a monitoring console.
- Change the use of soft outlined controls if every surface becomes equally quiet. Keep the visual language, but add clear hierarchy for the one primary action, strong focus states, and enough surface separation for dense work.
- Change editorial typography usage by reserving display type for page titles, Result summaries, and major narrative moments. Dense status, tables, and approval details should use the direct UI face.
- Change the thumbnail rule from “decorative preview” to “evidence cue.” A thumbnail should show a real Result, site area, report excerpt, or meaningful state.

### Add

- Add a global command palette with visible commands for New Request, Search, Switch Business, Open approvals, Find a Resource, and Help. Show shortcuts as hints, not as requirements.
- Add a Request lifecycle with phase rail, meaningful event stream, current evidence, and a stable return URL.
- Add a Result working area with source jumps, before-and-after views, approval details, sharing, history, and recovery.
- Add a small ambient status indicator for active background work. It must be based on real state and link back to the Request.
- Add a short pre-execution plan for Requests that may affect an external system. Make the plan editable and approveable without starting a new chat.
- Add checkpoints or recoverable snapshots for generated drafts and prepared changes. Keep external rollback claims precise.
- Add scope and permission summaries to every approval, including Business, Resource, destination, public visibility, and verification method.
- Add keyboard hints and fast search to the shell, while keeping ordinary buttons and labels clear for owners who never use shortcuts.
- Add a “What Strelva did for you” summary only when it is tied to live work, with the corresponding “What is waiting on you” and “What is being verified” states.

### Drop

- Drop any main Home layout that leads with a dashboard grid of stats or colored status cards.
- Drop a full-page blank chat composer as the shared product entrance.
- Drop animated AI orbs, typing dots used as fake progress, gradient text, decorative glass, and motion without a state change.
- Drop raw agent traces or private reasoning as the explanation for progress. Show useful events, sources, and decisions instead.
- Drop instant “success” after a provider write. Keep accepted, live, failed, and accepted-but-unverified distinct.
- Drop silent Business or tenant switching.
- Drop a static Activity page when the user needs a Result, preview, report, or approval.
- Drop Buffalo waterfront imagery as a persistent UI wallpaper. The faint local detail can support identity in a controlled place, but the work should remain primary.
- Drop the idea that every request needs a new conversation. A user should reopen and continue an existing Request.

## 7. What would make Strelva look dated

- Four large metric cards before the user can see or start real work.
- A purple-blue “AI” gradient, animated orb, or “Ask me anything” as the only clear action.
- A chat transcript standing in for a Request, progress history, and Result.
- A generic three-column SaaS layout with icon cards for every feature.
- A silent spinner, fake percentage, or vague “Strelva is thinking” state.
- A success badge that ignores provider verification.
- Hidden Business scope or a tenant switch that happens without confirmation.
- Mouse-only navigation with no fast search, command layer, or reopen path.
- Every control rendered as a large pill, with soft borders and shadows but no hierarchy.
- A static screenshot where a live preview, source link, or diff is possible.
- An approval modal that says “Allow” without naming the Business, Resource, consequence, or recovery.
- A page reload that kills a long-running Request.
- A dark monitoring room presented to small-business owners as the default workspace.
- A decorative local image competing with the Result.

## 8. Open questions

- Which Strelva actions may run in the background without approval, and which always require a human decision?
- What is the first durable Result for a free-start customer: an assessment, a site improvement proposal, a preview, or another object?
- Should Requests be shared by default with an agency team, a Business owner, or only the person who started them?
- How much of the plan and evidence should an owner see by default, and what belongs behind “show details”?
- How should the common Request model extend to the IDX Home Finder without turning the shared interface into a feature catalog?
- Which verification signals can Strelva guarantee for each external provider, and how should it communicate the ones it cannot?
- Does the customer audience need a persistent command palette at launch, or should it first appear as an optional accelerator after the object model is clear?

## 9. Sources

### Strelva

- [BRIEF.md](./BRIEF.md), read September 11, 2026.
- [DESIGN.md](../../DESIGN.md), read September 11, 2026.

### Linear

- [Search](https://linear.app/docs/search), current documentation retrieved September 11, 2026.
- [Peek](https://linear.app/docs/peek), current documentation retrieved September 11, 2026.
- [Issue selection](https://linear.app/docs/select-issues), current documentation retrieved September 11, 2026.
- [Initiative and project updates](https://linear.app/docs/initiative-and-project-updates), current documentation retrieved September 11, 2026.
- [Project status](https://linear.app/docs/project-status), current documentation retrieved September 11, 2026.
- [Linear for Agents](https://linear.app/changelog/2025-05-20-linear-for-agents), May 20, 2025.
- [Agent Interaction SDK](https://linear.app/changelog/2025-07-30-agent-interaction-guidelines-and-sdk), July 30, 2025.
- [Pricing](https://linear.app/pricing), current pricing retrieved September 11, 2026.

### Vercel

- [Deployments overview](https://vercel.com/docs/deployments/overview), last updated July 18, 2025.
- [Vercel Toolbar](https://vercel.com/docs/vercel-toolbar), last updated September 24, 2025.
- [Comments](https://vercel.com/docs/comments), last updated September 15, 2025.
- [Compact dynamic Toolbar](https://vercel.com/changelog/the-vercel-toolbar-is-now-more-compact-and-dynamic), January 14, 2025.
- [Pricing](https://vercel.com/pricing), current pricing retrieved September 11, 2026.

### Cursor

- [Cursor 3](https://cursor.com/blog/cursor-3), April 2, 2026.
- [Cursor 3 release note](https://cursor.com/changelog/3-0), April 2, 2026.
- [Background Agent](https://docs.cursor.com/background-agent), current documentation retrieved September 11, 2026.
- [Agent review](https://docs.cursor.com/en/agent/review), current documentation retrieved September 11, 2026.
- [Checkpoints](https://docs.cursor.com/en/agent/chat/checkpoints), current documentation retrieved September 11, 2026.
- [Agent sandboxing](https://cursor.com/blog/agent-sandboxing), February 18, 2026.
- [Pricing](https://cursor.com/pricing), current pricing retrieved September 11, 2026.

### Claude and Claude Code

- [Projects](https://www.anthropic.com/news/projects), June 25, 2024.
- [Artifacts](https://www.anthropic.com/news/artifacts), August 27, 2024.
- [Build with Claude Artifacts](https://www.anthropic.com/news/build-artifacts), June 25, 2025.
- [Create Files](https://www.anthropic.com/news/create-files), September 9, 2025.
- [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web), current documentation retrieved September 11, 2026.
- [Claude Code web support](https://support.claude.com/en/articles/12618689-claude-code-on-the-web), March 16, 2026.
- [Claude Code sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing), October 20, 2025.
- [Claude pricing](https://claude.com/pricing), current pricing retrieved September 11, 2026.
- [Claude plan help](https://support.claude.com/en/articles/11049762-choose-a-claude-plan), May 19, 2026.

### ChatGPT

- [Canvas](https://openai.com/index/introducing-canvas/), October 3, 2024.
- [Projects](https://help.openai.com/en/articles/10169521-projects-in-chatgpt), current documentation retrieved September 11, 2026.
- [Deep Research](https://openai.com/index/introducing-deep-research/), February 2, 2025.
- [Deep Research February 2026 update](https://help.openai.com/en/articles/10500283-deep-research-faq), current help documentation retrieved September 11, 2026.
- [ChatGPT Agent](https://openai.com/index/introducing-chatgpt-agent/), July 17, 2025.
- [Scheduled tasks](https://help.openai.com/en/articles/10291617), current documentation retrieved September 11, 2026.
- [ChatGPT pricing](https://openai.com/chatgpt/pricing), pricing page snapshot.
- [ChatGPT Pro tier update](https://help.openai.com/en/articles/9793128-what-is-chatgpt-pro/), updated September 10, 2026.

### Granola

- [Why Granola doesn’t use a bot](https://www.granola.ai/blog/why-granola-doesnt-use-a-bot), June 1, 2026.
- [A new look for Granola](https://www.granola.ai/blog/a-new-look-for-granola), February 2, 2026.
- [Granola 2.0](https://www.granola.ai/blog/two-dot-zero), May 14, 2025.
- [Transcription](https://docs.granola.ai/help-center/taking-notes/transcription), current documentation retrieved September 11, 2026.
- [AI-enhanced notes](https://docs.granola.ai/help-center/taking-notes/ai-enhanced-notes), current documentation retrieved September 11, 2026.
- [Pricing](https://www.granola.ai/pricing), current pricing retrieved September 11, 2026.

### Notion

- [Notion 3.0 Agents](https://www.notion.com/en-gb/blog/introducing-notion-3-0), September 18, 2025.
- [Notion 3.0 release note](https://www.notion.com/en-gb/releases/2025-09-18), September 18, 2025.
- [Notion 3.1](https://www.notion.com/releases/2025-11-17), November 17, 2025.
- [Pricing](https://www.notion.com/pricing), current pricing retrieved September 11, 2026.

### Raycast

- [The new Raycast](https://www.raycast.com/blog/the-new-raycast), May 14, 2026.
- [AI Extensions](https://manual.raycast.com/ai/ai-extensions), current documentation retrieved September 11, 2026.
- [AI Commands](https://manual.raycast.com/ai/ai-commands), current documentation retrieved September 11, 2026.
- [Screen Awareness](https://manual.raycast.com/ai/screen-awareness), current documentation retrieved September 11, 2026.
- [Pricing](https://www.raycast.com/pricing), current pricing retrieved September 11, 2026.

### Lovable

- [Agent Mode beta](https://lovable.dev/blog/agent-mode-beta), June 30, 2025.
- [Visual Edits](https://lovable.dev/blog/visual-edits), March 13, 2025.
- [Knowledge](https://docs.lovable.dev/features/knowledge), current documentation retrieved September 11, 2026.
- [Getting started](https://docs.lovable.dev/introduction/getting-started), current documentation retrieved September 11, 2026.
- [Simplifying billing](https://lovable.dev/blog/simplifying-billing), June 13, 2026.
- [Pricing](https://lovable.dev/pricing), current pricing retrieved September 11, 2026.

### Replit Agent

- [Try Agent](https://replit.com/blog/try-agent), February 4, 2025.
- [Agent v2](https://replit.com/blog/agent-v2), February 25, 2025.
- [Plan Mode and Build Mode](https://docs.replit.com/learn/plan-vs-build-mode), current documentation retrieved September 11, 2026.
- [Replit 2025 review](https://replit.com/blog/2025-replit-in-review), December 31, 2025.
- [Secure vibe coding](https://replit.com/blog/doubling-down-on-our-commitment-to-secure-vibe-coding), July 29, 2025.
- [AI billing](https://docs.replit.com/billing/ai-billing), current documentation retrieved September 11, 2026.
- [Pricing](https://replit.com/pricing), current pricing retrieved September 11, 2026.

### Devin

- [Devin 2.0](https://cognition.com/blog/devin-2), April 3, 2025.
- [Devin release notes](https://docs.devin.ai/release-notes/2025), 2025 release notes retrieved September 11, 2026.
- [Chat renderer rebuild](https://devin.ai/blog/rebuilding-devins-chat-renderer), August 25, 2026.
- [Pricing and self-serve billing](https://docs.devin.ai/admin/billing/self-serve), current documentation retrieved September 11, 2026.

### Arc and Dia

- [Arc Spaces](https://resources.arc.net/hc/en-us/articles/19228064149143-Spaces-Distinct-Browsing-Areas), current documentation retrieved September 11, 2026.
- [Arc Split View](https://resources.arc.net/hc/en-us/articles/19335393146775-Split-View-View-Multiple-Tabs-at-Once), current documentation retrieved September 11, 2026.
- [Arc Command Bar](https://start.arc.net/command-bar-actions), current documentation retrieved September 11, 2026.
- [Dia 1.0.1](https://www.diabrowser.com/changelog/1-0-1), October 8, 2025.
- [Dia 1.2.0](https://www.diabrowser.com/changelog/1-2-0), October 23, 2025.
- [Dia 0.43.0](https://www.diabrowser.com/changelog/0-43-0), August 20, 2025.
- [Dia 1.5.0](https://www.diabrowser.com/changelog/1-5-0), November 12, 2025.
- [Dia plans](https://www.diabrowser.com/plans), current pricing retrieved September 11, 2026.

### Recent 2025 and 2026 exemplars

- [Figma Make introduction](https://www.figma.com/blog/introducing-figma-make/), May 7, 2025.
- [Figma Make general availability](https://www.figma.com/blog/figma-make-general-availability/), July 24, 2025.
- [Figma Make on local code](https://www.figma.com/blog/figma-make-now-on-your-local-code/), May 28, 2026.
- [Figma pricing](https://www.figma.com/pricing/), current pricing retrieved September 11, 2026.
- [Figma AI credit guidance](https://help.figma.com/hc/en-us/articles/33459875669015-How-AI-credits-work), current documentation retrieved September 11, 2026.
- [Perplexity Computer](https://www.perplexity.ai/products/computer), current product page retrieved September 11, 2026.
- [Introducing Perplexity Computer](https://www.perplexity.ai/en-GB/hub/workshops/introducing-perplexity-computer), current workshop page retrieved September 11, 2026.
- [Perplexity launch index](https://hub-prod.perplexity.ai/), February 25, 2026 entry.
- [Perplexity pricing](https://www.perplexity.ai/enterprise/pricing), current pricing retrieved September 11, 2026.
- [Perplexity Computer credits](https://www.perplexity.ai/help-center/en/articles/13838041-how-credits-work), current documentation retrieved September 11, 2026.
- [Manus Plan Mode](https://manus.im/blog/manus-plan-mode), July 22, 2026.
- [Manus Sandbox](https://manus.im/blog/manus-sandbox), January 14, 2026.
- [Manus Skills](https://manus.im/blog/manus-skills), January 27, 2026.
- [Manus membership pricing](https://help.manus.im/en/articles/11711111-what-is-the-current-membership-pricing-for-manus), March 16, 2026.
- [Axios report on Manus public testing](https://www.axios.com/2025/03/10/manus-chinese-ai-agent-deepseek), March 10, 2025.
