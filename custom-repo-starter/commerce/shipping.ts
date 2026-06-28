// Single source of truth for shipping. The cart, checkout page, and the Stripe
// checkout route all read from here so the customer never sees one total on the
// cart and a different one at payment. Flat-rate today; address-based rates
// (Shippo/USPS) are a later upgrade — keep this the one place rates live.

export const FREE_SHIPPING_THRESHOLD = 75; // USD
export const SHIPPING_RATE = 5.99; // USD, flat
export const SHIPPING_MIN_DAYS = 4; // 1-2 handling + 3-5 transit
export const SHIPPING_MAX_DAYS = 7;

/** Shipping charge in dollars for a given subtotal (free at/over the threshold). */
export function shippingFor(subtotal: number): number {
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_RATE;
}
