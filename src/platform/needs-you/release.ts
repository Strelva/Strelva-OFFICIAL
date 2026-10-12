/**
 * Needs you and What changed are a 1.0.0 feature behind
 * STRELVA_NEEDS_YOU_RELEASE (off by default). Off: Home renders exactly as
 * before, the routes answer 503, workspace approve links refuse, and the
 * cron records a heartbeat and does nothing. On, email still goes through
 * src/lib/email/send.ts, so while client email is gated every delivery is
 * recorded as suppressed ("owner not told").
 */
export function needsYouReleaseEnabled(environment: { STRELVA_NEEDS_YOU_RELEASE?: string } = { STRELVA_NEEDS_YOU_RELEASE: process.env.STRELVA_NEEDS_YOU_RELEASE }): boolean {
  return environment.STRELVA_NEEDS_YOU_RELEASE === "1";
}

/** Connected-site published-fact observations: record only, off by default. */
export const schemaConflictReleaseEnabled = () => process.env.STRELVA_CONNECTED_SITE_SCHEMA_CONFLICTS_RELEASE === "1";
