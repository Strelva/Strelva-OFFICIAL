// Source of truth for Strelva brand identity, outbound/marketing URLs, and
// email domains. Import from here instead of inlining the brand name, the
// marketing/app URLs, or the email domain so a future rename or domain change
// is a one-line edit.
//
// Scope note: request-time host matching and the CSP allowlist in
// `src/proxy.ts` intentionally inline host patterns because they execute on the
// routing boundary. This module owns outbound canonical URLs, not host parsing.

export const BRAND_NAME = "Strelva" as const;
export const ROOT_DOMAIN = "strelva.com" as const;

// Outbound/marketing surfaces (metadata, sitemap, canonical URLs, email from-addresses).
export const MARKETING_URL = `https://www.${ROOT_DOMAIN}` as const;
export const CONTROL_PLANE_URL = `https://app.${ROOT_DOMAIN}` as const;
export const OPERATOR_URL = `https://admin.${ROOT_DOMAIN}` as const;
export const EMAIL_DOMAIN = `updates.${ROOT_DOMAIN}` as const;
