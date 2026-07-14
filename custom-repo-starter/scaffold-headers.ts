/**
 * Scaffold Web security headers for custom-repo client sites.
 *
 * The response headers our OWN audit engine checks for (Security category). A
 * build without them is marked down, and it's an inconsistent gap across repos —
 * some ship all of them, some ship one. Spread this into `next.config.ts` so
 * every client build passes the same way.
 *
 * The five returned by default are always safe (no site-specific tuning). CSP is
 * OPT-IN via `contentSecurityPolicy`, because a wrong Content-Security-Policy
 * silently breaks scripts/styles/images — set it deliberately per site once the
 * asset origins are known (or start report-only). Pure, no runtime deps.
 *
 * Usage — `next.config.ts`:
 *
 *   import type { NextConfig } from "next";
 *   import { scaffoldSecurityHeaders } from "./scaffold-headers";
 *
 *   const nextConfig: NextConfig = {
 *     async headers() {
 *       return [{ source: "/(.*)", headers: scaffoldSecurityHeaders() }];
 *     },
 *   };
 *   export default nextConfig;
 */

export interface ScaffoldSecurityHeader {
  key: string;
  value: string;
}

export interface ScaffoldHeadersOptions {
  /**
   * Set to add a Content-Security-Policy header. Site-specific — must list every
   * origin the site loads scripts/styles/images/fonts/frames from, or it breaks
   * the page. Leave unset until tuned.
   */
  contentSecurityPolicy?: string;
  /** Override the default HSTS max-age (seconds). Default 2 years. */
  hstsMaxAge?: number;
}

/**
 * The audit-checked security headers. The five always-safe ones are returned by
 * default; pass `contentSecurityPolicy` to add CSP once it's tuned for the site.
 */
export function scaffoldSecurityHeaders(
  options: ScaffoldHeadersOptions = {},
): ScaffoldSecurityHeader[] {
  const hstsMaxAge = options.hstsMaxAge ?? 63072000; // 2 years
  const headers: ScaffoldSecurityHeader[] = [
    { key: "Strict-Transport-Security", value: `max-age=${hstsMaxAge}; includeSubDomains; preload` },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  ];

  const csp = options.contentSecurityPolicy?.trim();
  if (csp) headers.push({ key: "Content-Security-Policy", value: csp });

  return headers;
}
