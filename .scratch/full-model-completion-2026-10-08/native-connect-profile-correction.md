# Prepared native Connect read-profile correction

Prepared source correction following the second Auth run's actual Payments
404: only `full-native` now sets `STRELVA_CONNECT=1`. Both full-dark variants and
held full-provider remain zero. The exact 34-case native inventory is unchanged.
No production activation, financial terms, liability configuration or provider
credential is introduced.

The required Payments page otherwise calls `notFound()` before reading any
actor or money record. Its server read invokes native RPCs only. The fixture
observes the merchant prerequisite button and never clicks onboarding.

Reviewed admission paths:

- `onboardConnectedAccount` validates the approved Connect liability profile
  before `manage_connected_account(...reserve)` or accessing the Stripe SDK.
  The clean profile has none of the three liability fields, so it refuses here.
- `stripeClient` refuses when the Stripe secret key is absent.
- A pending, unconfigured merchant fails `getConnectedMerchant` before payment
  reservation, checkout preparation or provider access.
- Agent payments, revenue splits, platform collection, payout execution and
  seller-terms approval switches remain zero. `providerActions` remains held.
- The existing runner uses `env -i`; the owned environment parser rejects
  provider fields. The profile adds no Stripe keys, webhook secrets or approved
  liability fields. No broad gate or handler changes are necessary.

Evidence from this lane: 11 pure profile tests and 17 focused Connect/admission
mock tests passed; scoped ESLint and diff check passed. The focused test applies
the actual native profile, observes the actor-scoped money read, and confirms
onboarding and pending-merchant checkout reject before DB/provider effects.
These are mocked admission checks; they do not prove native SQL permissions or
successful browser rendering. Neither a server nor database was started.

Coordinator next: compose the isolated correction after its current freeze,
retain the clean environment and unchanged manifest, then rerun the actual
Payments journey. Preserve payer acceptance/withdrawal, current actor checks,
merchant prerequisite and subsequent billing/payments access-withdrawal checks.

The local baseline commit copying the coordinator's existing profile test file
is only to make the correction a clean patch. Do not cherry-pick that baseline;
cherry-pick the subsequent correction commit containing the small test changes.
