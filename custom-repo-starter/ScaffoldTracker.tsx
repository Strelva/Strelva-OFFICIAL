"use client";

/**
 * Scaffold Web tracking beacon for custom-repo client sites.
 *
 * Drop this file into a per-client repo (Rohlax, GLDF, …) and render
 * <ScaffoldTracker /> once in the root layout. It posts a `page-view` event to
 * the control plane's public `/api/v1/track/{tenant}` contract on every page
 * load, so the owner's weekly report shows real numbers.
 *
 * For booking CTAs, import `trackBookingClick` and call it from the button's
 * onClick (optionally with the service id) to record `booking-click` events.
 * For a storefront, import `trackOrder` and call it on checkout success to
 * record an `order` (revenue shows on the owner's dashboard Store).
 *
 * Self-contained on purpose: this file imports only React + standard browser
 * APIs (no `@/lib/...`), so it is a true single-file drop-in and typechecks
 * inside this control-plane repo as well as inside any client repo.
 *
 * Design rules (matches the offer's "weekly proof it's working" promise without
 * ever risking the client site):
 *   - Fail silent. Any network/DOM error is swallowed; the site never breaks.
 *   - Non-blocking. Uses `navigator.sendBeacon` when available, else a
 *     `keepalive` fetch — neither blocks render or navigation.
 *   - Respect prefers-reduced-data. If the visitor signals data saver, skip.
 *   - Dev-safe. Skips when NODE_ENV is "development" to avoid inflated counts.
 *
 * Env (set in the client repo, browser-inlined by Next.js):
 *   - NEXT_PUBLIC_TENANT_ID        the tenant slug (e.g. "gldf", "rohlax")
 *   - NEXT_PUBLIC_SCAFFOLD_API_URL https://app.strelva.com  (control plane)
 */

import { useEffect } from "react";

const CONTRACT_VERSION = "v1";

type TrackEvent = "page-view" | "booking-click" | "order";

/** Payload for an `order` beacon — mirrors the v1 track contract's order shape. */
export interface TrackOrder {
  amountCents: number;
  currency?: string;
  items?: Array<{ name: string; quantity: number }>;
  /** Provider order id — makes the beacon idempotent (a retried fire won't double-count). */
  externalId?: string;
}

/** Browser-safe control-plane base URL. Mirrors getPublicScaffoldBaseUrl in
 *  scaffold-client.ts; inlined here so this component has no cross-file dep.
 *
 *  Only NEXT_PUBLIC_* is read: Next.js inlines exactly those into the client
 *  bundle. Non-public vars (SCAFFOLD_API_URL / REB_API_URL) are `undefined` in
 *  the browser, so reading them here was dead code that masked a misconfigured
 *  client repo as "just not firing." */
function getBaseUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_SCAFFOLD_API_URL;
  return url?.replace(/\/$/, "") || null;
}

/** Browser-safe tenant slug. Never throws — a missing env var must not break
 *  the client site; it just disables tracking. Only the NEXT_PUBLIC_* var is
 *  readable in the browser. */
function getTenant(): string | null {
  return process.env.NEXT_PUBLIC_TENANT_ID || null;
}

function prefersReducedData(): boolean {
  try {
    return (
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-data: reduce)").matches
    );
  } catch {
    return false;
  }
}

/**
 * Fire a single tracking event at the control plane. Always fail silent.
 * `serviceId` is only meaningful for "booking-click"; `order` for "order".
 */
function sendEvent(event: TrackEvent, opts?: { serviceId?: string; order?: TrackOrder }): void {
  try {
    if (typeof window === "undefined") return;
    if (process.env.NODE_ENV === "development") {
      // Dev is a no-op for real beacons (avoids inflated counts), but surface a
      // misconfiguration here so a missing NEXT_PUBLIC_* var is caught locally
      // instead of silently never firing once deployed to production.
      if (!getBaseUrl() || !getTenant()) {
        console.warn(
          "[ScaffoldTracker] tracking is disabled: set NEXT_PUBLIC_SCAFFOLD_API_URL and NEXT_PUBLIC_TENANT_ID in this repo's env."
        );
      }
      return;
    }
    if (prefersReducedData()) return;

    const baseUrl = getBaseUrl();
    const tenant = getTenant();
    if (!baseUrl || !tenant) return;

    const url = `${baseUrl}/api/${CONTRACT_VERSION}/track/${tenant}`;
    const payload: Record<string, unknown> = { event };
    if (event === "booking-click" && opts?.serviceId) payload.serviceId = opts.serviceId;
    if (event === "order" && opts?.order) {
      payload.amountCents = opts.order.amountCents;
      if (opts.order.currency) payload.currency = opts.order.currency;
      if (opts.order.items) payload.items = opts.order.items;
      if (opts.order.externalId) payload.orderId = opts.order.externalId;
    }
    const body = JSON.stringify(payload);

    // sendBeacon is the most reliable on unload/navigation and is non-blocking.
    // Its Blob default content type is text/plain; the v1 endpoint parses the
    // raw text either way, so no CORS preflight is triggered.
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const ok = navigator.sendBeacon(url, new Blob([body], { type: "text/plain" }));
      if (ok) return;
    }

    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
      // The endpoint is a write-only beacon; don't send credentials.
      credentials: "omit",
    }).catch(() => {});
  } catch {
    // never throw from a tracker
  }
}

/**
 * Record a booking CTA click. Call from a button/link onClick:
 *
 *   <a href={bookingUrl} onClick={() => trackBookingClick(service.id)}>Book</a>
 *
 * Pass the service id when the click maps to a specific service so the weekly
 * report's "top services" breakdown populates; omit it for a generic CTA.
 */
export function trackBookingClick(serviceId?: string): void {
  sendEvent("booking-click", { serviceId });
}

/**
 * Record a completed order so the owner's dashboard Store shows revenue/orders.
 * Call it after a successful checkout:
 *
 *   trackOrder({ amountCents: 2499, currency: "USD",
 *                items: [{ name: "Dried Mango", quantity: 1 }],
 *                externalId: stripeSessionId });
 *
 * NOTE: a SERVER-side fire from your Stripe webhook (see
 * commerce/stripe-webhook-route.ts) is more reliable than this client call — the
 * browser can close before checkout returns. Use this only when you don't run
 * the webhook. Pass `externalId` so a retry can't double-count.
 */
export function trackOrder(order: TrackOrder): void {
  sendEvent("order", { order });
}

/**
 * Renders nothing. Mount once in the root layout to record a page view per load.
 */
export function ScaffoldTracker() {
  useEffect(() => {
    sendEvent("page-view");
    // Empty deps: one beacon per mount. In the App Router, a full navigation
    // remounts the layout subtree's client components on route change for most
    // setups; if your repo keeps this mounted across soft navigations and you
    // want per-route views, move <ScaffoldTracker /> into the page instead.
  }, []);

  return null;
}
