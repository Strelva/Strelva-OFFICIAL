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

/** Operational data stores read/write Postgres when DATA_SOURCE=postgres. */
export function dataSourceIsPostgres(): boolean {
  return process.env.DATA_SOURCE === "postgres";
}

/** Tenant config reads/writes Postgres when TENANTS_SOURCE=postgres. */
export function tenantsSourceIsPostgres(): boolean {
  return process.env.TENANTS_SOURCE === "postgres";
}
