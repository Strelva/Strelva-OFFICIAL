# Strelvav2 migration audit, September 18, 2026

This is a dated audit of the local working tree, not a release decision or a replacement for the product brief and acceptance ledger. It combines independent technical, experience, strategy and evidence reviews with primary-agent checks. Existing uncommitted work was preserved.

The migration has substantial local machinery for persistent business work. The unresolved transition is whether customers can use it independently, return voluntarily, and receive useful changes with less Strelva effort per result. The first-use experience currently makes that harder than the selected product direction intends.

## Directly verified findings

### 1. Plain-language entry depends on specific phrases

The entry router uses weighted regular expressions. With the relevant products available, direct execution of `planWorkspaceStart` returned:

| Request | Actual route |
| --- | --- |
| Build an app for staff requests | Applications, ready |
| Build a staff request app | Help |
| Help my staff request time off | Help |
| Keep track of overdue invoices | Help |
| Reconcile two spreadsheets | Investigations, ready |
| Draft a follow-up reply to this customer | Document, ready |
| Schedule follow-ups for unanswered inquiries | Scheduling, ready |

The fallback can prepare a model-backed plan, so this is not proof that the work is impossible. It is proof that equivalent language can introduce an extra step and conflicting guidance. The scheduling example also illustrates why a keyword should not settle an ambiguous business intention.

Evidence: [router](../../src/experience/workspace/workspace-start.ts#L136), [fallback and continuation controls](../../src/experience/workspace/WorkspaceStart.tsx#L188). The continuation label also defaults to “Continue to business assessment” for scheduling, investigations and operations despite distinct route types: [label selection](../../src/experience/workspace/WorkspaceStart.tsx#L42).

Recommended acceptance: a small set of naturally phrased customer goals and paraphrases should reach a relevant proposal or a useful clarification, preserve the request, and describe the actual next action. A model-assisted interpretation step is one implementation option; a clear intent chooser is another. Broadening regexes alone does not resolve ambiguous goals.

### 2. Business Settings still depends on a managed website

For a customer business without an assigned website, the surface says business information, connections and domains become available after a website installation is linked. This is a verified presentation limitation, not a claim that business identity is absent from the data model.

Evidence: [WorkspaceBusinessSettings](../../src/experience/workspace/WorkspaceBusinessSettings.tsx#L65). It conflicts with the broader experience selected in the [September 15 topology](../../docs/horizontal-product-brief-2026-09-11.md#september-15-product-topology).

Recommended acceptance: a business using only an application or tracker should have a coherent identity and settings experience. Website-specific domain and billing controls should remain attached to the website.

### 3. Planning is outside the dollar-budget execution path

Model generation has a shared 20-second deadline, 1,800-output-token ceiling, zero SDK retries and an authenticated five-per-minute route limit. Those are real protections. The generation function returns only the structured output and does not retain model usage or reserve a dollar budget. The acceptance ledger explicitly acknowledges this gap.

Evidence: [generation](../../src/products/work-plans/server.ts#L158), [route limit](../../src/app/api/work-plans/route.ts#L123), [recorded limit](../../docs/strelvav2-horizontal-acceptance.md#current-acceptance-gate). In contrast, [budgeted execution](../../src/platform/work-economics/runtime.ts#L83) retains uncertain effects and prevents blind replay.

Recommended acceptance: before paid planning is opened, record attempted generation cost, failures and fallback use against an accepted allowance or spending envelope. Execution accounting alone cannot establish the cost of the whole customer journey.

### 4. The accepted scope and older sequencing instructions disagree

The September 15 brief explicitly permits broader horizontal implementation and retains the staff application as a regression journey. The definition of done still says to finish that application before extending the interaction pattern. The later direction governs this audit; the older restriction is a documentation defect.

Evidence: [current direction](../../docs/horizontal-product-brief-2026-09-11.md#september-15-product-topology), [older sequence](../../docs/strelvav2-definition-of-done.md#sequence-and-current-implementation-limits).

Recommended action: update the older sequence in its owning document. Keep the application lifecycle test and the broader topology requirements visible together.

### 5. Foundation adoption remains incomplete

The shared tab primitive supplies tab roles and selection but lacks arrow-key navigation, a selected-only tab stop and generated panel relationships. Fields render helper/error text without automatically associating it to the control. These gaps are already recorded in the foundation inventory. They should not be reclassified as new aesthetic objections.

Evidence: [Tabs](../../src/components/ui/Tabs.tsx#L23), [TextInput](../../src/components/ui/TextInput.tsx#L19), [foundation adoption](../../docs/component-system.md#atoms-to-inspect-before-composing-a-page).

## Business judgment

The useful strategic possibility is continued control over something a business actually uses: create it, let employees use it, change it with retained records, authorize another operator, and recover when work fails. That gives the product a concrete proposition to test against the customer's current process and a capable general assistant. Source capability alone does not prove an advantage.

The nine transition hypotheses remain explicitly unvalidated in the [evidence register](../../docs/product-reality.md#september-16-transition-hypotheses). This is an evidence gap, not proof the direction will fail. More screens or a larger test count cannot close it.

Three possible starting points deserve comparison without becoming permanent product restrictions:

| Candidate | What it could establish | Main risk |
| --- | --- | --- |
| Existing website customer brings a second business need | Trust transfers into broader product use; lower acquisition friction | Founder relationships conceal poor independent usability |
| Business brings an existing spreadsheet or staff process | Useful transformation, employee use and adaptation with retained records | Setup and migration cost exceed the benefit |
| Agency installs an offering for a second independent business | Reuse reduces delivery effort while preserving customer ownership | Agency onboarding and support consume the expected savings |

Before choosing a public promise, compare the current process, a general assistant with the customer's available tools, and Strelva on a matched job. Count setup, review, correction, retries, maintenance and support alongside provider costs. Record useful time released separately from cash saved. Observe a second use and a real change request, not only the initial demonstration. Any pilot, spending or provider activation still needs its existing authority.

The next proof should connect owner creation, recipient use, a subsequent change, recovery and voluntary return. Retain the breadth of the selected product while using concrete jobs to determine where it earns a recurring relationship.

## Fresh primary-agent checks

- `pnpm typecheck`: passed.
- `pnpm check:boundaries`: passed, including untracked source.
- `pnpm version:check`: passed; app and marketing both v0.1.1.
- Four focused Vitest files: 27 tests passed across workspace entry, home projection, execution economics and product learning.
- Direct router probes reproduced the phrasing behavior above.
- `git diff --check`: passed before this audit artifact was added.

No production schema, release flag, provider action, billing state or deployment was changed. No full-suite, production-readiness or commercial-success claim follows from these checks. `PRODUCT_STRATEGY.md` was not located in the workspace or the checked global instruction locations; the current product brief and evidence register supplied the strategy constraints.

## Reconciled scores

These are judgments about the named dimension, not completion percentages or an average release score. For implementation and experience, 0 means absent, 5 means meaningful local capability with material gaps, and 10 means the intended journey has convincing operating and failure evidence. For business proof, 0 means no observed evidence and 10 means repeated customer and economic evidence. Confidence reflects the evidence inspected, not certainty about uninspected behavior.

| Dimension | Score | Confidence | Judgment |
| --- | ---: | --- | --- |
| Strategic direction and coherence | 7/10 | Medium | A clear transition with explicit hypotheses; first repeatable offering and customer proof remain open. |
| Local ownership, permissions and recovery | 7/10 | Medium-high | Substantial source and isolated SQL protections; not a complete security certification. |
| First-use experience | 4/10 | High | Reproduced wording-sensitive entry, stale help and continuation labels. |
| Connected customer experience | 6/10 | Medium-high | Shared frame and native reopen paths exist; setup handoffs and result labels remain incomplete. |
| Component-system adoption | 4/10 | High | Explicit partial adoption with unresolved field, tab and typography contracts. |
| Acceptance evidence coverage | 5/10 | Medium | Strong bounded local proofs; newer connected Auth journeys, scheduled operation and human acceptance remain open. |
| Repeat use and economic proof for the broader product | 2/10 | High | Accounting mechanisms exist; repeat value, paid continuation and fully loaded margin remain unproven. This does not score existing Managed Websites revenue. |
| Release readiness | 2/10 | High | The intended production hold is in place; full schema upgrade and hosted continuity proof remain outstanding. |

## Additional findings from the independent reviews

The experience review inspected fictional managed, business, agency, offering and website previews on port 3299 using the browser accessibility tree. It confirmed that Business Home can show an authorized but unassigned site while Settings offers no link to the existing assignment action in Explore offerings. The managed fixture also omits the newer horizontal products, so that fixture cannot demonstrate their available state.

Work rows can call supported horizontal records “Saved work · view unavailable” because `workMethod` does not label those product types. The native horizontal reopen mappings do exist in `result.ts` and `WorkspaceApp.tsx`. The primary-agent review therefore narrowed the specialist's initial retention claim to a misleading label and incomplete presentation; no failed reopen was established.

The agency attention queue checks at most eight clients and reports omitted clients. This is an explicit operational limit, not a permissions defect. It deserves a product decision before larger agencies rely on that queue for complete coverage.

The migration review freshly passed `PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH pnpm check:workspace-sql`. The harness applies selected migrations to a synthetic base. It cannot establish compatibility with every historical migration or data shape. A disposable full-chain upgrade rehearsal is the next migration proof; production remains separate.

Service-role authorization and tenant-rename catch-up remain important existing boundaries to exercise. The audit did not establish a new cross-tenant exploit or a reproduced rename data-loss defect. Treat the specialist's recommendations there as coverage and recovery work, not confirmed vulnerabilities.

The experience reviewer also passed 87 tests across seven files. These overlap the primary agent's four-file run, so the counts are not added together. The browser review establishes fixture behavior and accessible-tree content, not visual acceptance, physical-device performance, or human usability.

The evidence reviewer recommends tying accepted cases to a source revision and exact environment. Separate Vitest and browser commands are normal and are not themselves defects. The material issue is that a green unit suite does not execute the required opt-in authenticated journeys or prove them against the present working tree.

## Recommended order

1. Repair the customer entry and setup gaps: relevant intent clarification, route-specific next actions, accurate saved-work labels, and a direct assignment path from empty Settings.
2. Complete planning cost admission and receipts before opening paid provider generation.
3. Run the newer offering/assignment journeys against real isolated Auth/Postgres, plus one real local scheduled-work cycle with interruption and recovery. Attach exact evidence to the existing acceptance ledger.
4. Rehearse the full schema upgrade on disposable representative data, preserving existing website and customer authority.
5. Observe independent use, an employee's use, a subsequent change and voluntary second use across the chosen jobs. Measure all human and provider costs. Choose packaging and further investment from that evidence.

This order preserves the broad product direction. It does not select a narrower permanent market, change a commercial agreement, approve a release or substitute for Jacob's product judgment.

## Specialist reports

- [Migration integrity](./migration.md)
- [Customer experience](./experience.md), with primary-agent correction distinguishing labels from reopen behavior
- [Acceptance evidence](./evidence.md)
- [Business strategy](./strategy.md)

The consolidated judgment above governs where a specialist's wording is broader than the inspected proof. The strategy report's historical company records are not fresh production observations. Current market comparisons were not independently revalidated in this audit.
