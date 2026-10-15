import { connectDb, createDirectCheckout, stripeClient, type ConnectDependencies } from "@/platform/connect";
import { resolvePayLinkChargeCents } from "@/platform/infra/pay-links";
import { WorkspaceStoreError } from "@/platform/workspaces/types";
import { AgencyPayLinkClosedError, payLinkRpc, readPublicAgencyPayLink, toLegacyPayLinkConfig } from "./index";
import { agencyPayLinksEnabled } from "./release";

type Begun = { linkId: string; workspaceId: string; slug: string; description: string; currency: string; amountCents: number; generation: number; referenceId: string; idempotencyKey: string };

/**
 * Opens Checkout on the agency's own connected account. The amount is chosen
 * by the payer inside the link's bounds and re-checked in SQL; Strelva's fee is 0.
 */
export async function startAgencyPayLinkCheckout(input: { slug: string; submittedAmount: unknown; origin: string }, deps: ConnectDependencies = {}): Promise<{ checkoutUrl: string }> {
  if (!agencyPayLinksEnabled()) throw new AgencyPayLinkClosedError("Payment links are not available yet. Nothing was charged.", 404);
  const db = deps.db === undefined ? connectDb() : deps.db;
  const link = await readPublicAgencyPayLink(input.slug, db);
  if (!link || link.rail !== "connected_account") throw new AgencyPayLinkClosedError("This payment link was not found. Nothing was charged.", 404);
  const amountCents = link.amountCents != null ? link.amountCents : resolvePayLinkChargeCents(toLegacyPayLinkConfig(link), input.submittedAmount);
  if (amountCents == null) throw new AgencyPayLinkClosedError("Choose an amount this payment link allows. Nothing was charged.", 400);
  const open = async (): Promise<Begun> => payLinkRpc<Begun>("begin_agency_pay_link_checkout", { p_slug: input.slug, p_amount_cents: amountCents }, db, input.slug);
  const create = (begun: Begun) => createDirectCheckout({
    workspaceId: begun.workspaceId, idempotencyKey: begun.idempotencyKey, purpose: "checkout", amountCents: begun.amountCents, currency: begun.currency,
    referenceId: begun.referenceId, productName: begun.description,
    successUrl: `${input.origin}/pay/${input.slug}?payment=success`, cancelUrl: `${input.origin}/pay/${input.slug}?payment=cancelled`,
  }, {
    ...deps, db,
    // Runs after the payment is reserved and before Stripe is touched, so a revoked or paid link never opens a session.
    beforeProviderMutation: async paymentId => { await payLinkRpc("assert_agency_pay_link_checkout_open", { p_link_id: begun.linkId, p_payment_id: paymentId }, db, input.slug); },
  });
  let begun = await open();
  let result = await create(begun);
  if (!result.url) {
    // A reused Stripe session had expired: move to the next generation and open a fresh one.
    await payLinkRpc("advance_agency_pay_link_checkout", { p_link_id: begun.linkId, p_expected_generation: begun.generation }, db, input.slug);
    begun = await open();
    result = await create(begun);
  }
  if (!result.url) throw new WorkspaceStoreError("Checkout could not be opened. Nothing was charged. Try again.");
  return { checkoutUrl: result.url };
}

/** Closes Checkout sessions still open on a revoked link. Failures are counted, never thrown. */
export async function expireOpenAgencyPayLinkCheckouts(linkId: string, deps: ConnectDependencies = {}): Promise<{ closed: number; unconfirmed: number }> {
  if (!agencyPayLinksEnabled()) return { closed: 0, unconfirmed: 0 };
  const db = deps.db === undefined ? connectDb() : deps.db;
  const open = await payLinkRpc<Array<{ paymentId: string; accountId: string; sessionId: string }>>("read_agency_pay_link_open_checkouts", { p_link_id: linkId }, db);
  const stripe = deps.stripe ?? stripeClient();
  let closed = 0;
  let unconfirmed = 0;
  for (const row of open) {
    try { await stripe.checkout.sessions.expire(row.sessionId, { stripeAccount: row.accountId }); closed += 1; } catch { unconfirmed += 1; }
  }
  return { closed, unconfirmed };
}
