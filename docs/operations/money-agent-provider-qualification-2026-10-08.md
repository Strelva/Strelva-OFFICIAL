# Money, assistant and Sandbox qualification packet

Prepared privately October 8. No provider/account inspection, writes, terms
acceptance, commercial choice, production activation or native-client proof is
claimed. The coordinator owns the final composed source and qualification run.

## Exact mechanisms

Installed Stripe 21.0.1 exposes `rawRequest`. Current official seller SPT docs
specify `2026-09-30.preview`, token retrieval and
`payment_method_data[shared_payment_granted_token]` on a confirmed PaymentIntent.
The new adapter uses those fields, exact merchant account scope, accepted amount,
currency, immutable payment ID metadata and a stable provider key. It checks
expiry/revocation/usage bounds before creation; processing/required-action is
never recorded as paid. [Seller protocol](https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=seller).

Direct charges require the connected merchant's Stripe profile. The context
endpoint discloses only its qualified server-owned profile and the immutable
request reached through the payment capability. Stripe says connected-account
profile management must be enabled by support/account representation. An owner
assistant OAuth grant cannot authorize a customer's spend.
[Connect protocol](https://docs.stripe.com/agentic-commerce/concepts/shared-payment-tokens.md?agent-seller=connect).

Accounts v2 responsibility settings are immutable when Merchant is added. The
existing onboarding path requests a full Dashboard and rejects application loss
responsibility; this integration does not choose a different liability model.
Customer sales use connected direct charges. Shares/royalties use only actual
platform-owned settled source funds, retaining existing fee/refund/dispute gates.
[Account configuration](https://docs.stripe.com/connect/accounts-v2/connected-account-configuration).

Standalone fees credit gross proceeds and apply fees separately; zero original
fee evidence cannot prove the transferable net. Existing source-settlement
guards remain, including countered-dispute fee uncertainty. Do not replace them
with nominal rates. [Fee settlement](https://docs.stripe.com/standalone-fees).

Sandbox uses the published 3.5.1 APIClient's fixed Vercel endpoint shapes through
Node HTTP/gzip, without installing a package. Each creation is attempted once;
unknown creation keeps its deterministic lookup name and full budget hold.
Commands bind to the exact session. Files use a bounded regular-file USTAR
archive; no credential, port, persistent storage or external source URL enters
the guest. The actual VM is 2048 MB; Node heap limits do not change that fact.
[SDK](https://vercel.com/docs/sandbox/sdk-reference),
[published APIClient](https://unpkg.com/@vercel/sandbox@3.5.1/dist/api-client/api-client.js),
[published validators](https://unpkg.com/@vercel/sandbox@3.5.1/dist/api-client/validators.js).

## Missing facts and concrete actions

| Gate | Required fact/decision | Reviewable next action |
|---|---|---|
| Connect account | Exact platform account/mode/API support, country, responsibilities, fee settlement and current capabilities/KYC | Obtain read-only account/configuration/webhook inventory. Compare it with `connectProfile()` before enabling any effect. Jacob chooses immutable liabilities/fee responsibility. |
| Merchant SPT | Connected profile-management enablement, each participating merchant profile, seller terms and supported token grant account | Prepare a support request to enable connected profiles; Jacob authorizes sending it. Create/read each actual profile only after authorization. Record an account-to-profile inventory, not an arbitrary platform fallback. |
| SPT runtime | Qualified protocol and actual customer spend approval | In an authorized nonproduction account, use Stripe's documented test helper with bounded currency/amount/expiry. Verify token retrieval, direct PaymentIntent account scope and signed webhook replay before configuring the runtime gates. Live Link spend approval is separate authorization. |
| Payer and rates | Current business or agency payer, accepted immutable price/profile/period, creator share/royalty and outgoing-provider response policy | Review exact unpriced billing homes and agreement inputs. Jacob supplies/accepts policy versions and amounts; populate only those accepted records. No defaults or draft vault terms activate charging. |
| Payout | Exact platform source charge, settled funds, fee/refund/dispute evidence and recipient KYC | Rehearse dry-run and mapped transfer/reversal against the source. An execution flag cannot substitute for the existing per-payout operator authorization. |
| Refund/support | Original-method refund authority, customer communication, handling of unknown effects, dispute fees and operator ownership | Review pending refund/reconciliation cases and assign an actual support owner/contact. Authorize provider writes and external messages separately; test duplicate, delayed and failed-provider recovery. |
| Sandbox commercial project | Selected team/project, commercial eligibility, supported image/helpers, actual resource footprint, spend ceiling and billing evidence | Jacob approves project/resource/spend policy. Qualify the real image in an authorized provider run; collect stop/usage and trusted itemized billing receipts. Provider counters alone do not close the held budget. |
| Sandbox source/reviewer | Actual qualified platform reviewer, exact source/candidate revision, policy version and all recorded checks | Use `qualify_custom_sandbox_runtime` only after the stated source/image/network/cleanup/resource/commercial checks are actually performed. No fixture receipt or flag supplies the reviewer. Revisions invalidate the exact qualification. |
| Native assistant | Exact HTTPS origin, OAuth metadata/callback support, public exposure/consent policy and actual Claude/Codex client behavior | Run connect → choose business → read → propose → review → renew → revoke on each actual client, including lost business/agency authority and replay. The HTTP/SQL harness is separate local proof. |

## Required qualification cases

1. Connect: fresh onboarding, refresh, revoked/restricted merchant, v2 thin and
   snapshot destinations, wrong mode/account, old subscription/terms parity.
2. SPT: wrong merchant/profile/currency, below-bound amount, expired/revoked token,
   declined/required-action/processing, consumed-token retry, create timeout,
   local binding failure plus signed webhook recovery, webhook-first/repeated
   success, expired idempotency window, concurrent hosted/agent channel selection.
3. Money: duplicate/partial refund, refund debit reversal, dispute withdrawal/win
   before and after source accrual/payout, actual countered fees, standalone fee
   rejection, insufficient recipient/source balance and transfer reversal replay.
4. Sandbox: pending session, failed/unknown create, mismatched image/resources or
   session, denied egress, malicious source/log/symlink/output, cancellation,
   cleanup failure, authority/reviewer removal, changed source/budget/payer,
   repeat start, retained-evidence rollback, actual billing reconciliation.
5. Assistant: exact callbacks, S256, expiry, rotating refresh/replay family revoke,
   narrower scope/step-up, origin/resource/workspace mismatch, owner replacement,
   ended agency seat, concurrent revocation/proposal and immutable proposal retry.

Native SQL/Auth/browser/provider qualification is pending the coordinator's
serialized window. No code, fixture pass or prior source proof closes these gates.
