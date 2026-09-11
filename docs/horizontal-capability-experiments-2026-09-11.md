# Horizontal capability experiments

September 11, 2026. Exploratory candidates, not promised or implemented features.
The [brief](./horizontal-product-brief-2026-09-11.md) is confirmed; priority among
these experiments is open. Documentation establishes available mechanisms, not
customer value, universal reliability, or availability in the installed SDK.

## Current technical evidence

- Anthropic documents screenshot, mouse and keyboard tools in an application-run
  environment, with browser tooling for page-based work. This supports testing
  work in existing applications; success and safe operation remain task-specific.
  [Computer use](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
- Tool search can load deferred definitions when needed. This supports a broader
  collection of discoverable abilities without loading every definition into the
  model context. It does not grant permission to execute discovered tools.
  [Tool search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)
- A2A specifies tasks, result artifacts and requests for additional authorization.
  Implementations still own action scope, authorization validity and revocation.
  [A2A specification](https://a2a-protocol.org/latest/specification/)
- Temporal documents durable human waits, signals and updates. This is a candidate
  mechanism for resuming work after review or interruption, not a vendor selection
  or a guarantee that side effects execute exactly once.
  [Agent reference architecture](https://go.temporal.io/platform-hub/ai-engineering/ai-reference-architecture)
- Context7's Vercel AI SDK results document tool approval and workflow-based
  durable approval. Results mix API generations: the repository pins ai 6.0.116,
  while current main documentation distinguishes toolApproval from workflow
  needsApproval. Verify installed exports and version-specific docs before use.
  [Approval example](https://github.com/vercel/ai/blob/main/content/cookbook/01-next/75-human-in-the-loop.mdx)
  and [workflow agent documentation](https://github.com/vercel/ai/blob/main/content/docs/03-agents/07-workflow-agent.mdx).

## Experiments to compare

| Candidate experience | Possible value | First proof and hard question |
| --- | --- | --- |
| Show Strelva how you do a task | Turn a narrated walkthrough or supplied procedure into a proposed repeatable job | Compare against held-out examples; can it distinguish incidental clicks from actual business rules? |
| Finish work in the tools you already use | Avoid moving staff into replacement software | Test a permitted read/preparation task in a controlled browser; measure corrections, changed layouts, session expiry and completion time |
| Turn scattered files into a useful working product | A spreadsheet and documents become a reviewable portal, tracker or preparation process | Preserve source lineage, validate field mappings and show what data would move before publishing |
| Ask a specialist without restarting | A person or outside agent receives a scoped brief and returns a usable result | Measure context preparation and review time; revoke access mid-task and reject results outside the contract |
| Keep a job moving while everyone is offline | Wait for documents or decisions, then resume within limits | Restart workers during waits; verify no duplicate notifications or charges and test expired authority |
| Find costly friction from permitted activity | Suggest specific work worth delegating | Start from opt-in supplied records; compare suggestions with staff judgment and distinguish observed cost from estimates |
| Maintain many products together | Fix a shared issue while preserving local choices | Upgrade two different installations; exercise conflicts, per-client rehearsal and selective rollback |
| Compare approaches before committing | Try alternative models, tools or procedures on the same job | Use independent checks and a fixed experiment budget; compare acceptance quality, total cost and human review |
| A temporary interface for a particular job | Create a comparison table, exception queue or decision form when useful | Compose approved components from structured state; verify accessibility and identical permissions to other entry points |
| Turn a completed project into a reusable offering | Reduce effort for the next customer | Prepare a sanitized candidate, identify ownership and test on a different business before promotion |
| Ask what changed and why | Connect a business result to recorded actions and failures | Distinguish causal evidence from correlation and missing information; don't invent revenue attribution |
| Coordinate a bounded goal across several systems | Assemble a plan spanning documents, tools, people and agents | Test on one finite goal with explicit costs and stop conditions; prevent scope expansion when progress stalls |

These ideas need not become twelve products or sidebar destinations. Several may
be different interfaces over the same deep module. The discovery interface
should recommend abilities appropriate to the user's context and actual grants.

## Confirmed experiment direction

1. How should users teach Strelva: documents, examples, narrated demonstrations,
   or opt-in observation? Passive monitoring is not assumed authorized.
2. Should experimental abilities be available to users as explicit opt-in work,
   or stay internal until they pass promotion criteria?
3. How far may Strelva prepare improvements proactively before asking: suggestion,
   draft demonstration, or budgeted sandbox experiment?
4. Which capability families best test horizontal breadth now: knowledge and
   documents, building products, operating across tools, or coordination with
   people and outside agents? No vertical or agency-first scope is inferred.

Recommendations: begin with supplied examples and walkthroughs; offer a bounded
opt-in experimental tier; permit preparation within an agreed budget and data
scope; compare one creation task and one ongoing-operation task before choosing
the next implementation scope. Jacob accepted these recommendations in the
follow-up interview, then selected a connected shared-workspace and internal-R&D
slice, spreadsheet-to-tracker creation, and inquiry handling as the first ongoing
work experiment. See the [selected scope](./horizontal-first-scope-2026-09-11.md).
