# Horizontal audit and staged plan

September 11, 2026. Source audit by two bounded Sol medium agents, reviewed by
the coordinator. No new runtime tests or production inspection were performed.
The [confirmed brief](./horizontal-product-brief-2026-09-11.md) is the direction.
This is an implementation proposal, not a selected replacement architecture.

## Assets and gaps

| Concern | Existing evidence | Remaining work |
| --- | --- | --- |
| Shared experience | [WorkspaceApp](../src/experience/workspace/WorkspaceApp.tsx), shared frame and inquiry experience | Integrate active inquiry work into the shared journey; preserve existing saved work and links |
| Work and relationships | [Workspace types](../src/platform/workspaces/types.ts) include saved work, handoffs and revocable read delegation; [customer types](../src/platform/customers/types.ts) include organizations, resource assignments and provenance | Active collaboration, task-specific write grants, sponsored agents, and consistent ownership through handoff |
| Actions and proof | [Shared tools](../src/lib/agent-shared.ts), [governance](../src/lib/ai-governance.ts), [publication](../src/products/inquiries/publication.ts) | Compare common transaction rules without moving domain policies into a universal field-name heuristic |
| Durable progress | Assessment recovery and inquiry publication have checkpoints and recovery; see [current context](../CONTEXT.md) | General waiting, resumption, cancellation, attempts, scheduling, and reconciliation across work types |
| Installations | [Inquiry patterns](../src/products/inquiries/inquiry-engine-pattern.ts), [installation projection](../src/platform/customers/installation.ts), [client starter](../custom-repo-starter/README.md) | Desired/current versions, shared versus local configuration, staged updates, drift, rollback and uninstall semantics |
| Economics | Existing product billing; no common job accounting was established in this bounded audit | Payer, estimate acceptance, reservation, actual provider usage, settlement, refunds and failure attribution |
| Vertical R&D | Product acceptance documents and tests | Experiment records, baselines, candidate comparisons, real human costs and promotion evidence |

Correction to the first delegated audit: absence of organization and resource
grants across the repository was too broad. The coordinator inspected workspace
and customer types and store queries. Those foundations exist; their current
delegation/assignment contracts are narrow read scopes, not general collaborative
execution. Do not introduce a second organization model on the basis of that audit.

The existing inquiry checkpoint reports local tests and an incomplete lifecycle.
This audit did not rerun those checks or verify current production state. It
does not support a percentage complete for the horizontal product.

## Compare these designs before extracting a runtime

1. Product-owned execution with a shared work projection. Small migration and
   clear native authority, but adapters may duplicate recovery and coordination.
2. A shared execution-attempt module with product-owned actions and policies.
   Candidate recommendation: centralize waiting/checkpoints/cancellation while
   retaining native command, approval, result and compensation authority.
3. A universal workflow and capability runtime. Broad flexibility but the
   highest migration cost, failure concentration and risk of speculative interfaces.

Exercise the same two different jobs against each design. Compare public
interface complexity, duplicated invariants, operational dependencies, cost,
recovery behavior and migration effort. Do not select a vendor from a demo.

The action transaction and execution attempt are different responsibilities.
Restarting a job must not repeat a provider-accepted write. A task's current
worker is also distinct from its owner, approver, payer and beneficiary.

## Stages and acceptance

### 1. Preserve and unify existing work

Map workspace, inquiry, managed website, customer and account entries. Adopt one
navigation journey without a new duplicate work store. Document stable IDs and
links, native authority and compatibility mapping. Verify authenticated reload,
read-only access, revocation, desktop/mobile navigation and existing result links.

### 2. Prove shared participation and durable execution

Prepare versioned contracts for participants, permitted actions, decision owner,
sponsored agent, handoff brief, execution attempts and cancellation. Compare the
three designs above using inquiry plus a different bounded job selected from
R&D. Test crash after provider acceptance, stale approvals, revoked grants,
concurrent changes, delayed human response and cancellation during execution.
Extend existing authorization and event paths rather than bypassing them.

### 3. Add job economics before paid autonomous expansion

Define one payer per job, spending acceptance, reservation, provider cost records,
customer usage units and adjustment reasons. Verify duplicate usage events,
concurrent spending against one budget, exhausted limits, partial completion,
and retries attributable to Strelva. Do not change live Stripe plans or existing
agreements as part of a prototype. Numerical prices remain a user decision.

### 4. Build the R&D loop and test capability breadth

An experiment records a customer problem, consent/data scope, baseline, candidate
version, test cases, human minutes, provider cost, results, failures and promotion
decision. Compare candidates on the same workload. Separate simulated proof,
pilot evidence and repeatable customer results. R&D uses the same execution and
review system, with experimental status visible. See [experiments](./horizontal-capability-experiments-2026-09-11.md).

### 5. Prove reusable installations and outside-agent work

Copy definitions without data, credentials or grants. Define shared and local
fields, version pins and conflict handling. Rehearse updates per installation.
Test local edits surviving upgrades, rejected updates, rollback preserving new
records, and delegated tasks exceeding scope or budget. A protocol's task status
is not sufficient permission to act.

### 6. Qualify offerings and prepare a release

Test self-service with people outside the team. Record completion, correction,
support and maintenance costs. Establish separate enterprise requirements before
an enterprise claim: identity lifecycle, organizational policy, data handling,
audit/export, residency requirements and operational commitments are unresolved.
Prepare exact migration, provider configuration, compatibility checks and rollout
for separate production authorization. Completion requires user journeys and
failure-path evidence, not only a build or a demonstration.

## Documentation verification for this planning change

Inspect the complete newly written documents and tracked documentation diff,
check local Markdown targets, and run git diff --check. No source behavior is
changed, so runtime tests are not claimed for this turn. Existing uncommitted
work is preserved. This plan adds no release or deployment authorization.
