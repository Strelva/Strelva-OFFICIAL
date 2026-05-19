export const ROHLAX_PAYMENT_TENANT = "rohlax";
export const ROHLAX_PAYMENT_TITLE = "Website payment";
export const ROHLAX_PAYMENT_MIN_CENTS = 30_000;
export const ROHLAX_PAYMENT_MAX_CENTS = 100_000;
export const ROHLAX_PAYMENT_INITIAL_CENTS = 60_000;

export function formatRohlaxPaymentAmount(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export function parseRohlaxPaymentAmount(value: unknown): number | null {
  const amount =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value.replace(/[$,\s]/g, ""))
        : Number.NaN;

  if (!Number.isFinite(amount)) return null;

  const cents = Math.round(amount * 100);
  if (cents < ROHLAX_PAYMENT_MIN_CENTS || cents > ROHLAX_PAYMENT_MAX_CENTS) return null;
  return cents;
}
