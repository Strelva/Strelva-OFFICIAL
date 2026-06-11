/**
 * Single source of truth for the pay-link "two-door" customer-facing copy.
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
export const BUILD_INCLUDED_MONTHS = 3;
export const BUILD_AFTER_MONTHLY_CENTS = 9_900; // $99/mo
export const MANAGED_MONTHLY_CENTS = 19_900; // $199/mo
export const MANAGED_MINIMUM_MONTHS = 12;

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
  return door === "build" ? "One-time build" : "Managed plan · start payment";
}

/** The durable door terms shown above the form (page headline area). */
export function payLinkDoorTerms(config: PayLinkCopyConfig): string {
  const after = formatWholeDollarsUsd(BUILD_AFTER_MONTHLY_CENTS);
  const monthly = formatWholeDollarsUsd(MANAGED_MONTHLY_CENTS);
  if (config.door === "build") {
    return `This is the one-time payment to build your site. It includes your first ${BUILD_INCLUDED_MONTHS} months of management, then ${after}/mo.`;
  }
  const start = startAmountLabel(config);
  const startPhrase = start ? `This is your ${start} start payment. ` : "This is your start payment. ";
  return `${startPhrase}The managed plan is ${monthly}/mo with a ${MANAGED_MINIMUM_MONTHS}-month minimum — and after month ${MANAGED_MINIMUM_MONTHS} the site is yours.`;
}

/** The shorter reassurance line shown inside the form, under the amount. */
export function payLinkReassurance(config: PayLinkCopyConfig): string {
  const monthly = formatWholeDollarsUsd(MANAGED_MONTHLY_CENTS);
  if (config.door === "build") {
    return `A one-time payment to get your site built — and it includes your first ${BUILD_INCLUDED_MONTHS} months of management.`;
  }
  const start = startAmountLabel(config);
  const startPhrase = start ? `Your ${start} start payment. ` : "Your start payment. ";
  return `${startPhrase}The managed plan is ${monthly}/mo with a ${MANAGED_MINIMUM_MONTHS}-month minimum — and after month ${MANAGED_MINIMUM_MONTHS} the site is yours.`;
}

/** Stripe product display name for the door. */
export function payLinkProductName(config: PayLinkCopyConfig & { clientName: string }): string {
  return config.door === "build"
    ? `Website build — ${config.clientName}`
    : `Managed plan start — ${config.clientName}`;
}

/** Stripe product description for the door. */
export function payLinkProductDescription(config: PayLinkCopyConfig): string {
  const monthly = formatWholeDollarsUsd(MANAGED_MONTHLY_CENTS);
  return config.door === "build"
    ? `One-time build payment (includes your first ${BUILD_INCLUDED_MONTHS} months of management).`
    : `Start payment for your managed plan (${monthly}/mo, ${MANAGED_MINIMUM_MONTHS}-month minimum).`;
}
