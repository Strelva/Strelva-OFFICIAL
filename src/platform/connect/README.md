# Prepared Connect money chain

Status: implemented privately and verified with fake Stripe adapters and a throwaway PostgreSQL upgrade. Not deployed, operated, or commercially approved. No real provider writes or notifications were made.

Business customer money uses connected-merchant direct charges. Platform-priced obligations have a separate platform PaymentIntent rail: explicit operator-approved immutable price profile plus exact owner-accepted amount, currency, paying customer, invoice line, entitlement and period are frozen before creation. Agency/creator shares can spend only platform-owned settled source funds. The planner subtracts actual processing fees, refunds, unrelated transfers and durable reservations.

`STRELVA_CONNECT` gates the merchant/API/UI path. Onboarding also requires explicit approved `STRELVA_CONNECT_PROFILE_VERSION`, `STRELVA_CONNECT_FEES_COLLECTOR`, and `STRELVA_CONNECT_LOSSES_COLLECTOR`; there is no inferred liability profile. Snapshot and Accounts v2 thin destinations use separate `STRIPE_CONNECT_WEBHOOK_SECRET` and `STRIPE_CONNECT_THIN_WEBHOOK_SECRET`. Thin signature/mode/account identity is verified before fetching current account state. Billing invoice sync is supplied by the agency-billing lane and must be wired by the integrator after signature/account/mode verification.

`STRELVA_REVENUE_SPLITS`, `STRELVA_PLATFORM_COLLECTION`, `STRELVA_SPLIT_PAYOUTS_DRY_RUN`, `STRELVA_AGENT_PAYMENTS`, `STRELVA_PROVIDER_CHANGE`, and the per-tenant `STRELVA_CONNECT_CHECKOUT_TENANTS` allowlist are off by default. There are no seeded rates, collection terms, agent limits, response windows or payout authorizations. Fees on merchant charges remain zero. Production tenant activation needs a merchant/KYC/provider and existing store audit. Recurring tenant store sales fail closed pending their recurring-sale policy; agency recurring billing uses its separately accepted intent.

The cron runner only plans and reserves dry runs. `transfers.ts` prepares a genuine platform-source transfer/reversal adapter, but a live execution flag alone cannot pass the SQL requirement for a current operator's exact payout/profile approval. Unknown provider attempts older than 23 hours require reconciliation rather than reusing expired provider idempotency keys. Reversals subtract loss already deducted before the original payout. Dispute wins restore immutable accrued shares. A restored share after an already executed-and-reversed payout still needs a separately reviewed recovery payment; the current split journal will not silently pay it twice.

Owner-issued quotes and deposits retain immutable source records and terms. Agent quotes copy the canonical `agent_quote_receipts` exactly. Deposit confirmation requires an exact paid source/currency, expiry releases held capacity, cancellation/late success creates a refund obligation, and the owner can request the original-method refund from Payments. Refund commands retain conservative pending reservations on ambiguous provider failure. Needs you shows unpaid customer follow-up/refund review and closes it through the original lifecycle; it does not impersonate a customer or charge on owner acknowledgement. Outcomes link paid quotes and deposits to real confirmed/completed bookings.

Creator attribution reads `offering_installations.source_revision_id` and `creator_workspace_id`; missing historical lineage produces no creator entitlement. Human qualification and immutable revision/install lineage are owned by creator-apps. Maintenance history is append-only; takeover removes future creator eligibility, while taper/restored maintenance needs an explicit approved creator agreement. No rate is guessed.

Private seller Shared Payment Tokens remain unavailable without real provider preview access, an approved account-scoped protocol and an injected approved adapter. Tokens are never persisted or returned. Current installed SDK has no direct Stripe Shared Payment Token payment method; the documented custom third-party resolve flow introduces different processing responsibilities and is not invented here.

Provider changes use existing `workspace_providers`/seats/staff and their cleanup triggers. The response clock starts when the exact outgoing agency acknowledges its durable notice. A linked payer transition must be the latest accepted transition with both parties still authorized. The response policy is intentionally empty. Agency export initiation delivers to the owner only; agency handoff contains the agency's own source definitions and immutable receipt. Owner exports retain payments, terms, splits, transfer/reversal and merchant identifiers while omitting public payment capabilities and credentials.

Proof commands:

```
STRELVA_CONNECT_SQL_ONLY=1 ./scripts/check-workspace-upgrade.sh
pnpm exec vitest run src/__tests__/connect-money.test.ts src/__tests__/connect-thin-webhook.test.ts src/__tests__/billing-webhook-mode-guard.test.ts src/__tests__/business-billing.test.ts
pnpm typecheck
```

The focused SQL option applies every ordered historical migration before real money authority, replay, loss-before-accrual, fee/currency/source, deposit, export, provider-notice and READ ONLY proofs. The integrator must also run the complete baseline suite against all lanes. Preview `/preview/strelva/payments` uses the existing local `STRELVA_UI_PREVIEW` gate; `state=manager`, `paid`, `expired`, `cancelled` are synthetic visual fixtures, not production proof.

Primary provider evidence: [Accounts v2 configuration](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration), [thin events](https://docs.stripe.com/webhooks/migrate-snapshot-to-thin-events), [separate charges/transfers](https://docs.stripe.com/connect/separate-charges-and-transfers), [private seller custom integration](https://docs.stripe.com/agentic-commerce/sellers/custom).
