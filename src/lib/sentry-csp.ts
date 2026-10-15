// Edge-safe helpers that turn the public browser DSN into CSP pieces.
// URL parsing only: no Sentry import, so the proxy can use it.

function parseDsn(dsn: string | undefined): URL | null {
  if (!dsn) return null;
  try {
    const url = new URL(dsn);
    return url.protocol === "https:" && url.username ? url : null;
  } catch {
    return null;
  }
}

/** Origin browser events are sent to, or null when the DSN is unset or unusable. */
export function sentryIngestOrigin(dsn: string | undefined): string | null {
  const url = parseDsn(dsn);
  return url ? `${url.protocol}//${url.host}` : null;
}

/** Sentry's CSP report endpoint for this DSN, or null when the DSN is unusable. */
export function sentrySecurityReportUri(dsn: string | undefined, environment?: string): string | null {
  const url = parseDsn(dsn);
  if (!url) return null;
  const projectId = url.pathname.split("/").filter(Boolean).pop() ?? "";
  if (!/^\d+$/.test(projectId)) return null;
  const base = `https://${url.host}/api/${projectId}/security/?sentry_key=${url.username}`;
  return environment ? `${base}&sentry_environment=${encodeURIComponent(environment)}` : base;
}
