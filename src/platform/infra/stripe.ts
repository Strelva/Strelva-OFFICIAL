import Stripe from "stripe";

/**
 * Single source of truth for the Stripe API version used across all billing
 * routes. Import and pass to every `new Stripe(key, { apiVersion })` call so
 * a version bump is a one-line change here, not a 7-file search.
 */
export const STRIPE_API_VERSION = "2026-03-25.dahlia" as Stripe.LatestApiVersion;

export class BillingConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingConfigurationError";
  }
}

/**
 * Construct a Stripe client. Throws a BillingConfigurationError (not the `!`
 * assertion's TypeError) when STRIPE_SECRET_KEY is absent, so callers that
 * forget to guard get a legible error rather than a confusing null-deref crash.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new BillingConfigurationError(
      "Stripe not configured. Set STRIPE_SECRET_KEY.",
    );
  }
  return new Stripe(key, { apiVersion: STRIPE_API_VERSION });
}

