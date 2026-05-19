# Rohlax Wellness Choose-and-Pay Handoff

## Original Request

Rohlax Wellness is going to pay somewhere from $300 to $1,000. Jacob wants them to choose the amount and pay, and wants this prepped for an email.

## Interpreted Outcome

Create a simple payment handoff for Rohlax Wellness that lets them choose a one-time payment amount between $300 and $1,000, then send a warm email that makes the choice feel easy and low-pressure.

## Repo Facts Found

- Rohlax Wellness maps to the `rohlax` tenant via `CUSTOM_DOMAIN_MAP`.
- Rohlax currently has founder-comp style access in subscription gating, so this should not use the normal app subscription checkout.
- The app's built-in subscription checkout is fixed to the single Scaffold Web monthly plan price.
- Stripe supports "Customers choose what to pay" Payment Links / Checkout with minimum and maximum bounds for one-time payments.

## Payment Setup Recommendation

Use the dedicated app payment flow outside the app's `$149/mo` subscription path:

- URL: `https://scaffoldweb.com/pay/rohlax`
- API: `/api/pay/rohlax`
- Product/title in Stripe: `Website payment`
- Type: one-time payment
- Initial amount shown in the form: `$600`
- Customer-facing framing: no default or expected amount
- Minimum: `$300`
- Maximum: `$1,000`, framed as a ceiling rather than a target
- Metadata: `tenantId=rohlax`, `paymentPurpose=website_setup_contribution`

## Completion Proof

- `/pay/rohlax` lets Rohlax choose a one-time amount between `$300` and `$1,000`.
- `/api/pay/rohlax` rejects amounts outside `$300` to `$1,000`.
- The email draft in `notes/T001-email-draft.md` has the production payment URL inserted.
- The sent email clearly says they can choose the amount in that range and pay through the link.
- After payment, Stripe shows the payment succeeded and the amount is recorded.

## Likely Misfire To Avoid

Do not send the existing Scaffold Web subscription checkout link. That path is for the fixed monthly plan, not this one-time Rohlax payment range.

## Starter Command

`/goal Follow docs/goals/rohlax-payment-choice/goal.md.`
