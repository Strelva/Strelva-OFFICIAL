# Payer parties and agency billing — local October 7, 2026

Base: `cdf5c31a10085b949c2ab25045f0d5dd4d270cb6`. Implements the remaining
party allowance and acceptance path in #278, agency accounts/client lines
(#279), unpriced retail/wholesale catalog (#280), persistent owner-accepted
agency retail subscription and invoice intents (#281/#282), and party billing
copy (#496). #294 remains dependent on the chosen provider-change policy and
priced wholesale/direct subscriptions; a future-job payer change does not
silently amend a legacy subscription or provider seat.

When `STRELVA_PROVIDER_CHANGE=1`, a business owner can request a provider
handoff from the currently accepted business/agency payer. The request carries
the durable accepted transition ID and its exact successor party into the
Connect lane's provider-change authority. It saves an `awaiting_policy` request
when no policy is selected. Completion still requires the provider notice and
response window, current joint party authority, and the same accepted payer.
The UI does not invent subscription prices or proration.

## Customer path

A business owner proposes a business, agency, or named business signer as future
payer. A current business owner or addressed agency owner/admin can accept the
party proposal in workspace billing or their account inbox. Existing budgets,
allowance receipts and provider-held costs remain on their original party.
SQL supplies current authority to the UI; historical signer IDs grant no agency
authority after demotion/removal.

Each agency has one account and wholesale subscription shell. One client line
is active for each business accepting that agency as payer. Wholesale amounts
are null; converted retail prices are untouched. Payer changes end old lines
without deleting historical financial records. Agency owners/admins read their
account, while ordinary staff and unrelated agencies are denied.

An agency owner/admin proposes exact monthly retail or one-off invoice terms.
The business owner accepts separately. A fulfillment command then creates a
connected-account checkout or direct subscription through `src/platform/connect`.
Customers and Prices for retail subscriptions are created in the merchant's
account scope, with stable intent-specific idempotency keys. No platform rate
is inferred. The resulting subscription identity is recorded before invoice
read-back; a read-back failure remains a known subscription with a missing
payment page, not a new creation request. Unknown attempts stop after 23 hours
rather than running beyond Stripe's idempotency retention. Signed provider
receipts arriving before local projection are preserved and reconciled after
provider identity lands. Checkout links are not payment receipts.

Agency retail records are Postgres-backed, RLS enabled, unavailable to browser
roles, and exposed through verified same-origin routes:

- `/api/agency/clients/[id]/rebill` — propose/review/accept/decline/fulfill exact
  client terms; addressed client context is rechecked before mutation.
- `/api/agency/pay-links` — the same bounded invoice lifecycle for one-off work.
- `/workspace/billing?workspaceId=…&invoiceId=…` — owner review and checkout link.

With `STRELVA_BUSINESS_BILLING=1`, super-admin POST minting is retired in favor
of the agency route. Existing legacy pay links remain readable and flag-off
behavior stays intact, including the independent Rohlax deal. Connect itself
remains default off. No migration, price, subscription, provider, email or site
was changed in a live system during this work.

## Evidence and limits

`PATH=/opt/homebrew/opt/postgresql@18/bin:$PATH bash scripts/check-payer-billing-sql.sh`
applies every current ordered migration in an isolated cluster and runs
`tests/payer-billing-completion-schema.sql`. It proves party allowance awards,
current agency cap acceptance across signers, reserve/settle by party,
renewal after historical signer demotion, owner-only invoice acceptance,
checkout receipt ordering/replay, ended wholesale lines and unchanged legacy
retail amounts. Focused Vitest covers the server ports, fail-closed provider
paths, unpriced plans and party decision sources. `pnpm typecheck` and scoped
ESLint are required before handoff.

The existing full upgrade runner reaches an unrelated retained
`workspace-authority-schema.sql:265` revocation assertion failure on this base;
the focused runner is separate evidence and does not rename that failure green.
The coordinator owns reconciliation of the aggregate runner.

Real Accounts v2 onboarding, connected account configuration, signed webhook
subscription/payment flow and hosted invoice collection need authorized Stripe
sandbox proof before activation. Stripe's official
[Connect subscriptions guide](https://docs.stripe.com/connect/subscriptions)
confirms connected-account scoped Customers/Prices/direct subscriptions and
`default_incomplete` for a customer without a default payment method. The
[hosted invoice guide](https://docs.stripe.com/invoicing/hosted-invoice-page)
describes the provider-hosted collection URL; mocked source behavior does not
prove the connected account's actual invoice settings or recurring payment
method persistence. Wholesale/direct prices and any application fee still need
#236; provider notice/proration/switching needs #240.

The coordinator must integrate the Connect lane first, wire
`syncAgencyInvoiceFromConnectEvent` after signature verification, and verify
combined typecheck, financial SQL and rendered authenticated routes. The local
preview covers composition and controls; it does not prove real login, billing
adoption or commercial acceptance.
