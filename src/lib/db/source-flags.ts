/**
 * Data-source flags (legacy of the Sanity -> Postgres migration). Each subsystem
 * reads Postgres when its flag is `postgres`, else uses the local dev-file path.
 * Postgres is the source of truth in prod; Sanity has been decommissioned.
 *
 * - CONTENT_SOURCE  : content sections (live; see content-store.ts)
 * - DATA_SOURCE     : the operational stores (drafts, audit, activity, analytics,
 *                     suggestions, reviews, page-config) — flipped together.
 * - TENANTS_SOURCE  : tenant config (the spine; see tenants.ts).
 */

/**
 * Content sections read/write Postgres when CONTENT_SOURCE=postgres.
 *
 * RUNTIME GUARD (not just advisory): `setContent` is Postgres-only, so serving
 * content from any non-Postgres source in production means serving the dev-file /
 * defaults (empty in prod) instead of the real content. Failing loudly beats
 * serving silently-wrong content, so in a PRODUCTION Vercel deploy this
 * HARD-FAILS when the resolved source is not Postgres instead of falling back.
 *
 * Gated STRICTLY on `VERCEL_ENV === "production"`: local dev, preview deploys,
 * and tests (VERCEL_ENV unset, or a dev-file source is legitimate) are never
 * affected — the guard can only fire in prod + non-postgres.
 */
export function contentSourceIsPostgres(): boolean {
  const isPostgres = process.env.CONTENT_SOURCE === "postgres";
  if (!isPostgres && process.env.VERCEL_ENV === "production") {
    throw new Error(
      `CONTENT_SOURCE is "${process.env.CONTENT_SOURCE ?? "unset"}" in a production ` +
        `Vercel deploy, but content is Postgres-only. Serving non-Postgres content in ` +
        `prod would silently serve the dev-file / defaults instead of the real content. ` +
        `Refusing to serve — set CONTENT_SOURCE=postgres. Content rollback is ` +
        `restore-from-backup, not a flag-flip.`,
    );
  }
  return isPostgres;
}

/** Operational data stores read/write Postgres when DATA_SOURCE=postgres. */
export function dataSourceIsPostgres(): boolean {
  return process.env.DATA_SOURCE === "postgres";
}

/** Tenant config reads/writes Postgres when TENANTS_SOURCE=postgres. */
export function tenantsSourceIsPostgres(): boolean {
  return process.env.TENANTS_SOURCE === "postgres";
}
