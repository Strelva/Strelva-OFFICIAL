# L10 public UI integration · October 9, 2026

Branch: `ui/1.0-l10-public`, based on `ui/1.0-design`.

Source implementation is prepared for all nine assigned frames. No frame is
visually qualified: the local browser proof was blocked before a screenshot
could be captured. API routes, storage contracts, authorization and release
flags are unchanged. No provider, production, dependency or deployment action
was performed. The preview content is explicitly fictional.

## Frame disposition

| Frame | Source and route | Remaining limitation |
| --- | --- | --- |
| HOF2u | `/ai-visibility`; `/preview/strelva/answer-check?state=entry` | API requires a business name; the frame shows only a website. Kept the name instead of inferring it. Desktop/phone unobserved. |
| yJgHU | Existing saved check renderer; preview `?state=result` | Live result saves citation booleans and note, not the sampled answer or inaccurate claims. Sample and two wrong claims remain fixture-only. Desktop/phone unobserved. |
| PJXvf | Existing `/workspace?save=<scan id>` continuation retained; preview `?state=continue` | Email entry and carried-result workspace are simulated in preview. No new account, weekly monitoring or automatic fix is promised. Desktop/phone unobserved. |
| F4QvgT | `/biz/[handle]`; `/preview/strelva/business-profile` | Live published facts/JSON-LD preserved. Granular sources/dates available only for policies; other facts cite the published record. Action methods and MCP binding remain fictional. Desktop/phone unobserved. |
| eHDuU | `/connect` and existing assistant connections; `/preview/strelva/assistants` | Live OAuth permissions/revoke retained. Public-operation permission marks and receipt feed are read-only fixtures. Desktop/phone unobserved. |
| vnQLw | `/workspace/units`; `/preview/strelva/locations` | Live hierarchy has no clinic manager, health or standards-coverage projection. Canon overview is fixture-only. Desktop/phone unobserved. |
| XqBAV | `/preview/strelva/locations?view=push` | Per-location preview, required date, hold and draft are local simulation. No managers contacted or standards applied. Desktop/phone unobserved. |
| TfToL | `/workspace/access-review`; `/preview/strelva/access-review`; locations preview `?view=access-review` | Live scope/revoke preserved. Quarterly keep/remove/audit CSV is fixture-only; fixture has five actual rows and says five rather than illustrative fourteen. Desktop/phone unobserved. |
| NsutT | `/pay/business`; `/preview/strelva/deposit` | Live payment retains hosted Stripe checkout. Business retreat, spots, refund wording and read-only embedded card specimen are fictional. No payment or reservation made. Desktop/phone unobserved. |

Completed frames: none under the contract's rendered-proof requirement.
Prepared source: all nine. None of the assigned frames has a dark variant. The kit's light/dark specimen was extended, but not rendered in L10.

## Preview states

- Answer check: `state=entry|result|continue|loading|empty|error|permission|unavailable`.
- Profile and Assistants: `state=ready|loading|empty|error|permission`.
- Locations, push and quarterly review: `state=ready|loading|empty|error|permission`.
- Existing access review: `state=ready|loading|empty|error|permission`.
- Deposit: `state=ready|loading|empty|error|denied|paid`.
- Existing OAuth connection fixture preserves its loading, empty, error,
  permission, expired, authority-removed and disconnect recovery modes.

Fictional data and response fixtures live under
`src/experience/workspace/preview`. Fixture actions do not call live providers.

## Verification

Final combined Vitest command:

```bash
pnpm vitest run src/__tests__/answer-check-ui.test.tsx \
  src/__tests__/ai-visibility-work-ui.test.ts \
  src/__tests__/ai-visibility-results.test.ts \
  src/__tests__/ai-visibility-routes.test.ts \
  src/__tests__/ai-visibility-usecase.test.ts \
  src/__tests__/assistants-public-ui.test.tsx \
  src/__tests__/business-pages-routes.test.ts \
  src/__tests__/agent-connections.test.ts \
  src/__tests__/public-deposit-ui.test.tsx \
  src/__tests__/connect-money.test.ts \
  src/__tests__/pay-links-routes.test.ts \
  src/__tests__/enterprise-ui.test.tsx \
  src/__tests__/enterprise-units.test.ts \
  src/__tests__/access-review-ui.test.tsx \
  src/__tests__/access-review-routes.test.ts \
  src/__tests__/access-review.test.ts
```

```text
Test Files  16 passed (16)
     Tests  125 passed (125)
Duration  5.42s
ESLint exit 0 · 42 changed TS/TSX files (no warnings)
```

`pnpm typecheck`: exit 0; final output:

```text
✓ Types generated successfully
```

No TypeScript diagnostics. After restoring the type import, the renderer's
focused suite also passed (1 file, 6 tests) and its ESLint check exited 0.
`git diff --check`: clean.
Logs: `/tmp/l10-tests-final.log`, `/tmp/l10-lint-final.log`,
`/tmp/l10-typecheck-final.log`.

Retained initial failures: one new assertion used a fixture verdict already
containing “things wrong” while testing a result without claim evidence; changed
that test input to an ordinary saved verdict. Initial typecheck caught a typed
mock with no declared input parameter and an intermediate fixture's `label`
instead of `title` pinned item property; both corrected. A later typecheck caught
a missing type import in the private assessment renderer; restored it. Duplicate lane
compilers were canceled. Dev startup generated repeated EMFILE watcher errors
and restarts; it was stopped after browser denial.

## Browser proof blocker and exact continuation

The prescribed `CH=1 node .../code-shots/shoot.mjs` attempt exited 1 when Chrome
terminated with SIGABRT, before any capture. The browser-tool fallback rejected
`http://localhost:3120/preview/strelva/kit`, stating that the user declined
permission for localhost access and prohibiting workaround access. No later
browser attempt was made. The temporary browser viewport was reset and the
3120 dev server stopped.

Screenshot paths: none. Intended output directory is
`../design/foundation/code-shots/L10-public/`; it contains no screenshots.
All nine supplied canon renders were opened and inspected as design sources.
The implemented app and kit were not observed in a rendered browser.

Next: once local browser access is available, start the exact four-flag dev
server on 3120. Capture the nine ready views and each applicable state at
1440×900 and 390×844, inspect every capture against its assigned render, repair
composition/overflow/focus issues, then stop the server. Verify keyboard,
loading, empty, error and permission behavior before calling these frames done.
Real Gemini, OAuth clients, standard delivery and Stripe operation remain
outside this lane's local proof and authorization.

## Commit blocker

The requested commit is not created. `git add` was refused by the filesystem
sandbox before staging:

```text
fatal: Unable to create '/Users/jacobrhinehart/Desktop/strelva/REB/.git/worktrees/REB-ui-L10-public/index.lock': Operation not permitted
```

No approval escalation is available in this session. The fifty-one changed files
remain in this worktree. Once Git metadata writes are available, stage only the
manifest below and commit with `Integrate Strelva public UI and canon previews`;
no Co-Authored-By trailer. Do not merge, push or deploy. A portable binary patch
is retained at `../design/foundation/code-shots/L10-public/lane.patch`.

## Shared changes and spec conflicts

Shared kit additions: `StField`, `StCopy`, `StHead.titleRef`, and `StTable`.
The kit specimen and component inventory are updated. ProductShell changes
only the answer-check route family to the public paper header; audit keeps its
existing shell. No global shell, tokens, API, migrations or flags changed.

The contract's 28/500 kit titles win over larger illustrative public headings.
The existing API and saved evidence win over URL-only identity, invented sampled
answers, per-fact provenance, public assistant operations, quarterly use tracking,
standards delivery and embedded card collection. Those absent projections remain
preview-only, without new dependencies or API changes. `/b` is booking management;
the actual public profile is `/biz`. `/pay/[slug]` sells Strelva services and
`/pay/rohlax` is a unique deal; both were left untouched.

Canonical product model reconciliation stays with the integration coordinator.
This handoff records presentation preparation and its limits; it creates no
competing model or activated product bet.

## Files changed

- `docs/design/component-system.md`
- `docs/design/ui-1.0-l10-public.md`
- `src/__tests__/ai-visibility-work-ui.test.ts`
- `src/__tests__/answer-check-ui.test.tsx`
- `src/__tests__/assistants-public-ui.test.tsx`
- `src/__tests__/enterprise-ui.test.tsx`
- `src/__tests__/public-deposit-ui.test.tsx`
- `src/app/(product)/ai-visibility/[id]/page.tsx`
- `src/app/(product)/ai-visibility/page.tsx`
- `src/app/biz/[handle]/page.tsx`
- `src/app/connect/page.tsx`
- `src/app/pay/business/BusinessPayment.tsx`
- `src/app/preview/strelva/access-review/page.tsx`
- `src/app/preview/strelva/agent-oauth/ConnectionPreview.tsx`
- `src/app/preview/strelva/agent-oauth/page.tsx`
- `src/app/preview/strelva/answer-check/page.tsx`
- `src/app/preview/strelva/assistants/page.tsx`
- `src/app/preview/strelva/business-profile/page.tsx`
- `src/app/preview/strelva/deposit/page.tsx`
- `src/app/preview/strelva/kit/KitSpecimen.tsx`
- `src/app/preview/strelva/locations/page.tsx`
- `src/components/ui/strelva/Kit.tsx`
- `src/components/ui/strelva/Table.tsx`
- `src/components/ui/strelva/kit.module.css`
- `src/components/ui/strelva/table.module.css`
- `src/experience/enterprise/Units.tsx`
- `src/experience/enterprise/enterprise.module.css`
- `src/experience/product/ProductShell.tsx`
- `src/experience/product/PublicFrame.tsx`
- `src/experience/product/assistants/PublicBusinessProfile.tsx`
- `src/experience/product/assistants/assistants.module.css`
- `src/experience/product/public-frame.module.css`
- `src/experience/product/public-payment/PaymentLayout.tsx`
- `src/experience/product/public-payment/payment.module.css`
- `src/experience/workspace/AccessReview.tsx`
- `src/experience/workspace/AssistantConnections.tsx`
- `src/experience/workspace/preview/AccessReviewPreview.tsx`
- `src/experience/workspace/preview/AnswerCheckPreview.tsx`
- `src/experience/workspace/preview/AssistantConnectionPreview.tsx`
- `src/experience/workspace/preview/AssistantsPreview.tsx`
- `src/experience/workspace/preview/DepositPreview.tsx`
- `src/experience/workspace/preview/EnterprisePreview.tsx`
- `src/experience/workspace/preview/answer-check-fixture.ts`
- `src/experience/workspace/preview/assistants-fixture.ts`
- `src/experience/workspace/preview/deposit-fixture.ts`
- `src/experience/workspace/preview/enterprise-fixture.ts`
- `src/products/ai-visibility/AiVisibilityAssessmentForm.tsx`
- `src/products/ai-visibility/AiVisibilityAssessmentResult.tsx`
- `src/products/ai-visibility/AiVisibilityPage.tsx`
- `src/products/ai-visibility/AiVisibilityResultView.tsx`
- `src/products/ai-visibility/answer-check.module.css`
