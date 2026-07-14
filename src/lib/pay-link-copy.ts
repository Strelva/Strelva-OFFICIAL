/**
 * Single source of truth for customer-facing one-off invoice copy.
 *
 * This copy is rendered in THREE places — the server page (page.tsx), the
 * client form (PayLinkForm.tsx), and the Stripe product on the checkout route
 * (api/pay/[slug]/route.ts). Keeping it here means the wording can't drift
 * between them, and the dollar figures are DERIVED FROM THE CONFIG so the copy
 * can never contradict what the link actually charges.
 *
 * Client-safe: no Redis/env imports (the form is a "use client" component).
 */

import { formatWholeDollarsUsd } from "./currency";

export type PayLinkDoorCopy = "build" | "managed_start";

/**
 * The amount-bearing fields the copy needs. A subset of PayLinkConfig so this
 * module stays free of any storage/server coupling and is safe on the client.
 */
export interface PayLinkCopyConfig {
  door: PayLinkDoorCopy;
  amountCents?: number;
  minCents?: number;
  maxCents?: number;
}

/** Recurring management price after the build's included months ($/mo). */

/**
 * The headline charge figure for a door, derived from the config: the fixed
 * amount, or the floor of a range. Used in copy like "Your {amount} start
 * payment" so the words always match the configured charge.
 */
export function payLinkStartAmountCents(config: PayLinkCopyConfig): number | undefined {
  if (typeof config.amountCents === "number") return config.amountCents;
  if (typeof config.minCents === "number") return config.minCents;
  return undefined;
}

function startAmountLabel(config: PayLinkCopyConfig): string | null {
  const cents = payLinkStartAmountCents(config);
  return typeof cents === "number" ? formatWholeDollarsUsd(cents) : null;
}

/** Short badge shown in the top-right of the page. */
export function payLinkDoorBadge(door: PayLinkDoorCopy): string {
  return door === "build" ? "One-time project" : "Legacy start payment";
}

/** The durable door terms shown above the form (page headline area). */
export function payLinkDoorTerms(config: PayLinkCopyConfig): string {
  if (config.door === "build") {
    return "This is a one-time project payment. It does not start or change a Strelva subscription.";
  }
  const start = startAmountLabel(config);
  const startPhrase = start ? `This is your ${start} start payment. ` : "This is your start payment. ";
  return `${startPhrase}This legacy payment follows the terms agreed directly with you; it does not create a new subscription.`;
}

/** The shorter reassurance line shown inside the form, under the amount. */
export function payLinkReassurance(config: PayLinkCopyConfig): string {
  if (config.door === "build") {
    return "A one-time project payment, separate from recurring Strelva service.";
  }
  const start = startAmountLabel(config);
  const startPhrase = start ? `Your ${start} start payment. ` : "Your start payment. ";
  return `${startPhrase}Your previously agreed terms remain unchanged.`;
}

/** Stripe product display name for the door. */
export function payLinkProductName(config: PayLinkCopyConfig & { clientName: string }): string {
  return config.door === "build"
    ? `One-time project: ${config.clientName}`
    : `Legacy start payment: ${config.clientName}`;
}

/** Stripe product description for the door. */
export function payLinkProductDescription(config: PayLinkCopyConfig): string {
  return config.door === "build"
    ? "One-time project payment; no subscription is created."
    : "Legacy start payment under separately agreed terms; no new subscription is created.";
}
