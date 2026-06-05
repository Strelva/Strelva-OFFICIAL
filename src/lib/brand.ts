// Source of truth for Strelva brand identity, outbound/marketing URLs, and
// email domains. Import from here instead of inlining the brand name, the
// marketing/app URLs, or the email domain so a future rename or domain change
// is a one-line edit.
//
// Scope note: request-time host matching and the CSP allowlist in
// `src/proxy.ts` intentionally inline the host literals (`.strelva.com`,
// `clerk.strelva.com`). That is the edge routing path — it is changed during
// the infra cutover alongside Vercel/Clerk/DNS, not from this module — so this
// file deliberately does not own those routing constants.

export const BRAND_NAME = "Strelva" as const;
export const ROOT_DOMAIN = "strelva.com" as const;

// Outbound/marketing surfaces (metadata, sitemap, canonical URLs, email from-addresses).
export const MARKETING_URL = `https://${ROOT_DOMAIN}` as const;
export const EMAIL_DOMAIN = `updates.${ROOT_DOMAIN}` as const;
