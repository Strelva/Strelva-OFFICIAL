# L6 business: prepared source integration

October 9, 2026. Branch `ui/1.0-l6-business`, based on `ui/1.0-design`.

The existing business, owner billing, payments, access, account, authentication,
export and exit surfaces now compose from the paper kit. Current API bodies,
authorization, releases, optimistic revisions, payer acceptance and provider
approval paths remain in place. No dependencies, migrations, production changes,
provider calls, live messages, pushes or merges were performed.

**UI acceptance remains unfinished.** All 17 reference PNGs were opened and
inspected; no implementation screenshot was produced. Neither desktop nor phone,
light/dark, overflow, contrast or browser journeys have been visually qualified.
This is prepared source with local type, DOM and contract evidence.

## Frame coverage

Every row is partial pending rendered proof. “Existing” means an existing data
path has been recomposed, not that hosted behavior was exercised.

| Frame | Source / preview entry | Existing behavior and remaining gap |
| --- | --- | --- |
| ZdtUM | `/workspace?view=settings`; existing settings previews | Business overview, website links, usage, payer, ownership and navigation use current reads. No invented live usage counts. |
| PKGTo | `/workspace?view=access`; `/preview/strelva/access-review`; `/preview/strelva/owner-invitations` | Members, delegations, grants, invitation roles/revocation and read-only access retain existing handlers. Agency/personal access branches retain their separate presentation. |
| EgfjN | `/workspace/business-details`; `/preview/strelva/places?place=business-details`; `/preview/strelva/business-record` | Actual facts show source and confirmation, native revision-based editing, changed-value comparison, other facts, services and publishing receipts. Cross-place usage counts and coordinated website/Google/calendar updates are fictional preview only. |
| TFMBf | `/preview/strelva/business-record?surface=facts` | Fictional confirmation list and local receipts only. No new discovery/confirmation backend or outside writes. |
| BpbyP | existing Who decides panel; `/preview/strelva/who-decides` | Real four-route policy contract retained; forbidden choices are disabled with reasons; reset, undo and version semantics retained. Original operator specimen is available with `?operator=1`. |
| uJaBT | `/workspace/export`; `/preview/strelva/portability?surface=export` | Existing bounded JSON/schema-3 background build, polling, owner download, expiry and error handling. Actual counts remain in downloaded manifest; illustrated page counts are fictional. |
| t3V6Mm | `/workspace/exit`; `/preview/strelva/portability?surface=exit` | Existing pause/cancel, agency participation, successor/stop, retained obligations and handoff receipts, now with hold confirmation. `state=actual` previews that contract. Default canon consequences are fictional; no automatic domain/Stripe/disconnection or 30-day deletion promise added. |
| gM93P | `/workspace/billing`; `/preview/strelva/billing` | Actual agreement, grandfathered terms, payer and payment status retained. Card digits, next charge, decline/retry dates and receipt history are unavailable in the read model; canon example is fictional. |
| ra178 | `/workspace/payments`; `/preview/strelva/payments` | Existing money reads, merchant controls and payment/refund commands retained. Stripe checking dates and payout timeline are fictional; no Stripe action was executed. |
| b1nRhW | `/preview/strelva/invoices` | Fictional owner invoice list/review only. No qualified business invoice read/sending contract exists in this lane. |
| msVLx | `/sign-up`; `/preview/strelva/entry?view=sign-up` | Supabase OTP/Google, invitation continuation, account return and agency-release choice retained. Agency choice remains release-gated. |
| a0RLm | Supabase sign-in receipt; `/preview/strelva/entry?view=check-email` | Email-link receipt, resend and different-email controls use existing Supabase calls. Failure handling tested with mocks; no real email sent. |
| VlBD5 | existing invitation acceptance; `/preview/strelva/entry?view=invite` | Existing invitation identity/role/token acceptance, revoked/unsigned states retained. Frame-specific agency creator context is fictional only. |
| WpFcd | `/no-access`; `/preview/strelva/entry?view=no-access` | Existing identity switching and account selection retained. Request-access note is fictional because a qualified note-to-owner contract is absent. `/access-request` remains the separate managed-build request. |
| WpI2O | `/workspace/account`; `/preview/strelva/workspace/account` | Actual identity, email verification, continuation, workspace access, payer inbox and existing sign-out retained in the entry layout. Profile edit, global sign-out and account deletion are fictional local controls only. `state=actual` and prior state queries retain actual projection fixtures. |
| dYd78 | trusted tenant-host sign-in; `/preview/strelva/entry?view=admin-host` | Existing trusted tenant routing and return destination retained; host/business are presentation only. |
| I6CkkR | old `/dashboard` layout; `/preview/strelva/entry?view=back-bar` | Existing “Back to the business” destination retained. The frame’s separate bookings shortcut is absent because no exact qualified destination was supplied. |

## States and kit

New record/facts, Who decides, owner money and entry fixtures expose
`state=loading`, `empty`, `error` and `permission` where meaningful. Existing
access, invitation, account and portability state fixtures remain available.
Billing/payments/business-details routes have paper loading shells. Existing
error and permission gates remain authoritative. These are source paths, not a
claim that every state was viewed. Owner money fixtures also accept `mode=dark`.

Kit extensions: `StSplit`, `StField`, `StEntry` (form/account width), `StRow.value`,
`StSurface.selected`, `StNotice.action`, link target/rel preservation,
segmented keyboard navigation that skips disabled choices, and canon 800 ms hold.
The specimen and [component inventory](./component-system.md) document them.
The inventory's original kit render evidence does not qualify these extensions.

Shared changes are limited to the kit/specimen/inventory, the old dashboard bar,
and the business-details branch of the existing places preview. Other lanes must
reconcile kit additions when integrating this branch. Publishing-record fields
were recomposed because the business record renders them; their commands and
approvals are unchanged. No marketing components were imported.

## Local verification

Commands completed after the final source edits:

```text
pnpm typecheck
next typegen && tsc --noEmit
✓ Types generated successfully
exit 0

pnpm vitest run <26 relevant files> --maxWorkers=1 --testTimeout=30000
Test Files  26 passed (26)
Tests       189 passed | 1 skipped (190)

npx eslint <65 changed TypeScript files>
ESLint exit 0 for 65 changed TypeScript files

git diff --check
exit 0
```

The skipped test is the existing retired Clerk auth-page assertion in
`dashboard-route-redirects.test.ts` (Supabase is the current sign-in). No hosted
assertion is claimed. Typecheck
reports the existing Sentry `disableLogger` deprecation warning. Full build,
full-suite checks and browser proofs were not run. Relevant tests cover native
record revisions/cancel/read-only behavior, segmented keyboard decisions,
authentication continuations and thrown failures, invitations/access, billing
and payer transitions, export failures, hold-to-exit and publishing boundaries.

Retained evidence directory:
`/Users/jacobrhinehart/Desktop/strelva/design/foundation/code-shots/L6-business/`.
It contains `typecheck.txt`, `tests.txt`, `eslint.txt`, `diff-check.txt` and
`proof-blocked.txt`, **no screenshots**. Earlier compiler/test failures found
null fact attribution, strict indexing and lost entry source assertions; these
were fixed and rerun. Their earlier logs are retained as `failures/` evidence.

## Browser blocker and exact next action

The requested local server on port 3116 became ready, then reported repeated
EMFILE watcher failures. The prescribed `CH=1` screenshot runner failed to launch
Chrome (SIGABRT, cleanup EPERM) before capturing a page. Connected Chrome then
explicitly rejected opening the local kit because the user declined permission;
its security response forbids alternate surfaces and indirect workarounds. No
further browser attempt followed that rejection. The dev session exited after
interruption; no server is claimed left running.

Once browser access is authorized and the local watcher limit is resolved, start:

```bash
STRELVA_UI_PREVIEW=1 STRELVA_SYSTEMS_RELEASE=1 \
STRELVA_NEEDS_YOU_RELEASE=1 STRELVA_WORKSPACE_RELEASE=1 pnpm dev -p 3116
```

Open `/preview/strelva/kit` first. Capture each table entry at 1440 and 390,
including its available loading/empty/error/permission states; compare each
against its canon PNG and fix actual layout differences. Use the prescribed
`shoot.mjs` with `CH=1`, and `W=390 H=844` for phone. Inspect dark owner money and
kit previews as well. Verify focus/keyboard/hold, error recovery and no cross-scope
navigation. Stop the dev server. Do not merge or release until those checks are
qualified; production still requires Jacob's authorization.

## Spec conflicts and integration questions

- Who decides has four real policy routes. “After notice” waits before acting;
  folding it into “tell me after” would misstate authority. The fourth option is
  retained, and forbidden relaxations remain visible with reasons.
- Business record propagation/usage counts, facts-to-confirm and per-place
  receipts need a qualified backend before promoting their fictional controls.
  Actual saves disclose that connected sites need separate review.
- Existing exit does not cancel billing, disconnect providers or impose a
  30-day retention period. Actual receipts say so; the richer canon is isolated.
- Owner card history, Stripe progress, invoices, profile mutations, global
  sign-out, account deletion and request-access notes remain fixture-only where
  existing contracts are absent.
- Real standalone places do not yet receive L1's scoped Ask Strelva transport.
  Fixtures demonstrate the composer locally; no fake write or approval route was
  introduced to simulate that integration.

## Changed files

- [docs/design/component-system.md](../../docs/design/component-system.md)
- [src/__tests__/auth-access-pages.test.ts](../../src/__tests__/auth-access-pages.test.ts)
- [src/__tests__/authenticated-sign-in-continuation.test.ts](../../src/__tests__/authenticated-sign-in-continuation.test.ts)
- [src/__tests__/business-details-kit.test.tsx](../../src/__tests__/business-details-kit.test.tsx)
- [src/__tests__/business-entry-ui.test.tsx](../../src/__tests__/business-entry-ui.test.tsx)
- [src/__tests__/needs-you-policy-settings-ui.test.tsx](../../src/__tests__/needs-you-policy-settings-ui.test.tsx)
- [src/__tests__/owner-billing-presentation.test.tsx](../../src/__tests__/owner-billing-presentation.test.tsx)
- [src/__tests__/strelva-kit-controls.test.tsx](../../src/__tests__/strelva-kit-controls.test.tsx)
- [src/__tests__/w6-export-ui.test.tsx](../../src/__tests__/w6-export-ui.test.tsx)
- [src/__tests__/workspace-account-page.test.ts](../../src/__tests__/workspace-account-page.test.ts)
- [src/__tests__/workspace-exit-component.test.tsx](../../src/__tests__/workspace-exit-component.test.tsx)
- [src/app/dashboard/layout.tsx](../../src/app/dashboard/layout.tsx)
- [src/app/no-access/page.tsx](../../src/app/no-access/page.tsx)
- [src/app/preview/strelva/access-review/page.tsx](../../src/app/preview/strelva/access-review/page.tsx)
- [src/app/preview/strelva/billing/page.tsx](../../src/app/preview/strelva/billing/page.tsx)
- [src/app/preview/strelva/business-record/page.tsx](../../src/app/preview/strelva/business-record/page.tsx)
- [src/app/preview/strelva/entry/page.tsx](../../src/app/preview/strelva/entry/page.tsx)
- [src/app/preview/strelva/invoices/page.tsx](../../src/app/preview/strelva/invoices/page.tsx)
- [src/app/preview/strelva/kit/KitSpecimen.tsx](../../src/app/preview/strelva/kit/KitSpecimen.tsx)
- [src/app/preview/strelva/payments/page.tsx](../../src/app/preview/strelva/payments/page.tsx)
- [src/app/preview/strelva/places/page.tsx](../../src/app/preview/strelva/places/page.tsx)
- [src/app/preview/strelva/portability/PortabilityFixture.tsx](../../src/app/preview/strelva/portability/PortabilityFixture.tsx)
- [src/app/preview/strelva/who-decides/page.tsx](../../src/app/preview/strelva/who-decides/page.tsx)
- [src/app/preview/strelva/workspace/account/page.tsx](../../src/app/preview/strelva/workspace/account/page.tsx)
- [src/app/sign-in/[[...sign-in]]/page.tsx](../../src/app/sign-in/[[...sign-in]]/page.tsx)
- [src/app/sign-up/[[...sign-up]]/page.tsx](../../src/app/sign-up/[[...sign-up]]/page.tsx)
- [src/app/workspace/billing/loading.tsx](../../src/app/workspace/billing/loading.tsx)
- [src/app/workspace/billing/page.tsx](../../src/app/workspace/billing/page.tsx)
- [src/app/workspace/business-details/loading.tsx](../../src/app/workspace/business-details/loading.tsx)
- [src/app/workspace/business-details/page.tsx](../../src/app/workspace/business-details/page.tsx)
- [src/app/workspace/exit/page.tsx](../../src/app/workspace/exit/page.tsx)
- [src/app/workspace/export/page.tsx](../../src/app/workspace/export/page.tsx)
- [src/app/workspace/payments/MerchantControls.tsx](../../src/app/workspace/payments/MerchantControls.tsx)
- [src/app/workspace/payments/PaymentManager.tsx](../../src/app/workspace/payments/PaymentManager.tsx)
- [src/app/workspace/payments/RefundManager.tsx](../../src/app/workspace/payments/RefundManager.tsx)
- [src/app/workspace/payments/loading.tsx](../../src/app/workspace/payments/loading.tsx)
- [src/app/workspace/payments/page.tsx](../../src/app/workspace/payments/page.tsx)
- [src/components/auth/SupabaseSignIn.tsx](../../src/components/auth/SupabaseSignIn.tsx)
- [src/components/auth/UseInvitedEmailButton.tsx](../../src/components/auth/UseInvitedEmailButton.tsx)
- [src/components/ui/strelva/Kit.tsx](../../src/components/ui/strelva/Kit.tsx)
- [src/components/ui/strelva/kit.module.css](../../src/components/ui/strelva/kit.module.css)
- [src/experience/places/BusinessDetailsForm.tsx](../../src/experience/places/BusinessDetailsForm.tsx)
- [src/experience/places/WorkspaceBusinessDetails.tsx](../../src/experience/places/WorkspaceBusinessDetails.tsx)
- [src/experience/places/business-details-presentation.ts](../../src/experience/places/business-details-presentation.ts)
- [src/experience/publishing/RecordPublishingFields.tsx](../../src/experience/publishing/RecordPublishingFields.tsx)
- [src/experience/workspace/AccessReview.tsx](../../src/experience/workspace/AccessReview.tsx)
- [src/experience/workspace/AccountPayerInbox.tsx](../../src/experience/workspace/AccountPayerInbox.tsx)
- [src/experience/workspace/DashboardBackBar.tsx](../../src/experience/workspace/DashboardBackBar.tsx)
- [src/experience/workspace/DecisionPolicySettings.tsx](../../src/experience/workspace/DecisionPolicySettings.tsx)
- [src/experience/workspace/WorkspaceAccess.tsx](../../src/experience/workspace/WorkspaceAccess.tsx)
- [src/experience/workspace/WorkspaceAccountView.tsx](../../src/experience/workspace/WorkspaceAccountView.tsx)
- [src/experience/workspace/WorkspaceBusinessSettings.tsx](../../src/experience/workspace/WorkspaceBusinessSettings.tsx)
- [src/experience/workspace/WorkspaceExit.tsx](../../src/experience/workspace/WorkspaceExit.tsx)
- [src/experience/workspace/WorkspaceExport.tsx](../../src/experience/workspace/WorkspaceExport.tsx)
- [src/experience/workspace/WorkspaceInvitationAcceptance.tsx](../../src/experience/workspace/WorkspaceInvitationAcceptance.tsx)
- [src/experience/workspace/WorkspaceInvitationManager.tsx](../../src/experience/workspace/WorkspaceInvitationManager.tsx)
- [src/experience/workspace/WorkspacePayerTransition.tsx](../../src/experience/workspace/WorkspacePayerTransition.tsx)
- [src/experience/workspace/WorkspaceSignIn.tsx](../../src/experience/workspace/WorkspaceSignIn.tsx)
- [src/experience/workspace/billing/BusinessBillingView.tsx](../../src/experience/workspace/billing/BusinessBillingView.tsx)
- [src/experience/workspace/preview/AccessReviewPreview.tsx](../../src/experience/workspace/preview/AccessReviewPreview.tsx)
- [src/experience/workspace/preview/AccountCanonPreview.tsx](../../src/experience/workspace/preview/AccountCanonPreview.tsx)
- [src/experience/workspace/preview/BusinessRecordPreview.tsx](../../src/experience/workspace/preview/BusinessRecordPreview.tsx)
- [src/experience/workspace/preview/EntryPreview.tsx](../../src/experience/workspace/preview/EntryPreview.tsx)
- [src/experience/workspace/preview/OwnerMoneyPreview.tsx](../../src/experience/workspace/preview/OwnerMoneyPreview.tsx)
- [src/experience/workspace/preview/OwnerPolicyPreview.tsx](../../src/experience/workspace/preview/OwnerPolicyPreview.tsx)
- [src/experience/workspace/preview/PortabilityExitCanon.tsx](../../src/experience/workspace/preview/PortabilityExitCanon.tsx)
- [src/experience/workspace/preview/portability-fixture.ts](../../src/experience/workspace/preview/portability-fixture.ts)
- [This handoff](./ui-1.0-l6-business-handoff.md)
