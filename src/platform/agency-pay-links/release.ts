/** Agency Payment links charge on the agency's own connected Stripe account. Off by default. */
type Env = Readonly<Record<string, string | undefined>>;

/**
 * Needs Connect, the pay-link switch and a test key. A live key also needs
 * STRELVA_AGENCY_PAY_LINKS_LIVE, which only Jacob sets.
 */
export function agencyPayLinksEnabled(env: Env = process.env): boolean {
  return env.STRELVA_AGENCY_PAY_LINKS === "1" && env.STRELVA_CONNECT === "1"
    && (env.STRIPE_SECRET_KEY?.startsWith("sk_test_") === true || env.STRELVA_AGENCY_PAY_LINKS_LIVE === "1");
}

/** Legacy Redis links are read from Postgres only after the backfill is verified. */
export function payLinkStore(env: Env = process.env): "postgres" | "redis" {
  return env.STRELVA_PAY_LINK_STORE === "postgres" ? "postgres" : "redis";
}
