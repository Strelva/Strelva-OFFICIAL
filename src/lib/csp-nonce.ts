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

/**
 * The enforced policy with only script-src swapped for the nonce version, so every
 * other directive reports exactly what enforcement would and the evidence is script-src only.
 */
export function buildNonceReportOnlyPolicy(params: { nonce: string; enforced: string; reportUri: string | null; dev: boolean }): string {
  const scriptSrc = `script-src 'self' 'nonce-${params.nonce}' 'strict-dynamic' https://va.vercel-scripts.com${params.dev ? " 'unsafe-eval'" : ""}`;
  const directives = params.enforced.split("; ").filter((d) => !d.startsWith("report-uri "));
  const swapDirective = (list: string[], name: string, value: string) =>
    list.some((d) => d.startsWith(`${name} `)) ? list.map((d) => (d.startsWith(`${name} `) ? value : d)) : [...list, value];
  const swapped = swapDirective(swapDirective(directives, "script-src", scriptSrc), "object-src", "object-src 'none'");
  return [...swapped, ...(params.reportUri ? [`report-uri ${params.reportUri}`] : [])].join("; ");
}
