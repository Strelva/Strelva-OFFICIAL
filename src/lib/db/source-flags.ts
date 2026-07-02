/**
 * Data-source flags for the Sanity -> Postgres migration. Each subsystem reads
 * Postgres when its flag is `postgres`, else stays on Sanity/Redis. Default off
 * so merging migration code is inert in prod until the flag is flipped in env.
 *
 * - CONTENT_SOURCE  : content sections (already live; see content-store.ts)
 * - DATA_SOURCE     : the operational stores (drafts, audit, activity, analytics,
 *                     suggestions, reviews, page-config) — flipped together.
 * - TENANTS_SOURCE  : tenant config (the spine; flipped last, see tenants.ts).
 */

/**
 * Content sections read/write Postgres when CONTENT_SOURCE=postgres.
 *
 * RUNTIME GUARD (not just advisory): `setContent` is Postgres-only — it does NOT
 * dual-write Sanity — so serving content from any non-Postgres source in
 * production means serving content frozen at the 2026-06-20 cutover, silently
 * losing every edit since. Failing loudly beats serving silently-stale content,
 * so in a PRODUCTION Vercel deploy this HARD-FAILS when the resolved source is
 * not Postgres instead of quietly falling back.
 *
 * Gated STRICTLY on `VERCEL_ENV === "production"`: local dev, preview deploys,
 * and tests (VERCEL_ENV unset, or a dev-file/Sanity source is legitimate) are
 * never affected — the guard can only fire in prod + non-postgres.
 */
export function contentSourceIsPostgres(): boolean {
  const isPostgres = process.env.CONTENT_SOURCE === "postgres";
  if (!isPostgres && process.env.VERCEL_ENV === "production") {
    throw new Error(
      `CONTENT_SOURCE is "${process.env.CONTENT_SOURCE ?? "unset"}" in a production ` +
        `Vercel deploy, but content is Postgres-only (setContent does not dual-write ` +
        `Sanity). Serving non-Postgres content in prod would silently serve data frozen ` +
        `at the 2026-06-20 cutover and lose every edit since. Refusing to serve — set ` +
        `CONTENT_SOURCE=postgres. Content rollback is restore-from-backup, not a flag-flip.`,
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
