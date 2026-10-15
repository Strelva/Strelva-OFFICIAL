// Edge-safe pieces of the report-only nonce CSP. The enforced CSP is unchanged:
// this policy only reports what a nonce-based policy would block, so the
// evidence exists before anyone decides to drop script-src 'unsafe-inline'.

export function cspNonceReportOnlyEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.STRELVA_CSP_NONCE_REPORT_ONLY === "1";
}

/** 16 random bytes, base64: a fresh value per request. */
export function createCspNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function buildNonceReportOnlyPolicy(params: { nonce: string; reportUri: string | null; dev: boolean }): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${params.nonce}' 'strict-dynamic' https://va.vercel-scripts.com${params.dev ? " 'unsafe-eval'" : ""}`,
    // React style attributes and inline styles cannot carry a nonce.
    "style-src 'self' 'unsafe-inline'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(params.reportUri ? [`report-uri ${params.reportUri}`] : []),
  ].join("; ");
}
