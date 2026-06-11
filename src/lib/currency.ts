/**
 * Client-safe currency helpers. No server-only imports (Redis, env), so this
 * module is safe to pull into "use client" components.
 */

/**
 * Format a cents integer as a whole-dollar USD string (no cents shown), e.g.
 * 200_000 -> "$2,000". Used across the pay-link page, form, and lib so the
 * customer sees one consistent presentation.
 *
 * (Rohlax's own formatter is intentionally left untouched — grandfathered.)
 */
export function formatWholeDollarsUsd(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}
