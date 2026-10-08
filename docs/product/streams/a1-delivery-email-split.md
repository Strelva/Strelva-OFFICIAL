# Delivery email split (#482)

Historical standalone record on `f3097dd6`, recovered verbatim before this note
was added. Its checks describe the original slice. The current reconstructed
`e9ac136f` candidate is qualified only by the [recovery record](./a1-482-recovery.md).

Prepared locally from `integrate/reborn-1.0` at `f3097dd6` on October 8, 2026.
This is the delivery-email portion of [#482](https://github.com/Strelva/Strelva-OFFICIAL/issues/482),
not a release or permission to send email. The separate shared-public-fetch
slice owns the import-baseline reduction.

## Ownership

`src/lib/delivery-email.ts` is now a 23-line compatibility export surface. Its
16 public functions and two public types remain available at the same path,
so existing callers and module mocks do not change.

Tenant-specific notice copy and orchestration stay in `src/lib/delivery-email/`:

- `site-lifecycle.ts`: approved/live updates, welcome, site-live and site-health notices.
- `bookings.ts`: end-customer confirmation and the separate owner booking notice.
- `billing.ts`: owner dunning and operator signup/payment alerts.
- `leads.ts`: owner lead notices, marketing-intake alerts and prospect status receipts.
- `reviews.ts`: owner review-link nudges and governed reply decision links.
- `crm-log.ts`: the existing lazy, fail-soft post-send CRM activity.
- `operator-recipients.ts`: the existing environment recipient list and fallback.

The five business modules range from 127 to 275 lines. The two small helpers
are shared policies, not wrapper senders. All 37 moved function/interface
declarations preserve their original text; only the shared CRM helper gains
an export for internal use.

`src/platform/infra/email/send.ts` remains the sole transport and owns audience,
tenant override and provider gates. No new workspace-to-lib or lib-to-workspace
crossing is added. Owner-recipient resolution, review approval execution,
booking persistence, provider authority, and the ops-digest implementation are
unchanged. In particular this slice does not touch the files owned by PRs
[#583](https://github.com/Strelva/Strelva-OFFICIAL/pull/583) or
[#584](https://github.com/Strelva/Strelva-OFFICIAL/pull/584), or the #326 work.

## Local evidence

- New `delivery-email-parity.test.ts`: 116 tests pass. Its 30 snapshots were
  recorded against the unsplit `f3097dd6` source and pass unchanged after the
  split. They pin sender input, readable template options/text, rendered
  HTML/text SHA-256 values, and CRM effects for every sender and its key
  optional-field branches.
- Failure coverage includes suppressed/failed sends never recording delivery,
  CRM failure never reversing an accepted send, missing tenant IDs, recipient
  fallback/order/duplicates, approval links requiring a drafted reply, and the
  rolling-out copy never claiming confirmed publication.
- Broader focused run: 36 files, 505 tests passed, one intentionally skipped
  PostgreSQL booking-store test. It includes existing caller mocks, four
  audience gates, per-tenant overrides, provider gates, owner recipients,
  approval route, shared layout and HTML tests.
- The first focused run hit the existing booking-store test's 5-second timeout
  during concurrent local compilation. The complete focused run passed with
  the repository-supported `STRELVA_LOCAL_TEST_TIMEOUT_MS=30000` and one worker.
- Full ESLint passes, and the final changed files pass focused ESLint.
  Full `next typegen` plus `tsc --noEmit` passes with a 4 GB Node heap.
  `git diff --check` passes.
- Boundary checking finds only the pre-existing
  `src/products/connected-sites/schema-conflicts.ts:3` import of
  `@/lib/pinned-public-text`. The sibling shared-public-fetch slice addresses
  that dependency. This split leaves the baseline unchanged.

Reproduce the focused run:

```sh
FILES=$(rg -l 'delivery-email' src/__tests__ --glob '*.test.ts' --glob '*.test.tsx')
STRELVA_LOCAL_TEST_WORKERS=1 STRELVA_LOCAL_TEST_TIMEOUT_MS=30000 \
  pnpm exec vitest run $FILES \
  src/__tests__/email-audience-routing.test.ts \
  src/__tests__/client-email-override-send.test.ts \
  src/__tests__/acting-provider-gates.test.ts \
  src/__tests__/owner-recipient.test.ts \
  src/__tests__/approve-route.test.ts \
  src/__tests__/email-layout.test.ts src/__tests__/email-html.test.ts
```

All email providers and CRM storage are mocked in the new parity suite. No
live message, deployment, migration, provider write or production verification
was performed. Publishing and integration remain separate steps.
