// Single source of truth for Strelva brand + domain constants.
// This is the go-forward source of truth and replaces hardcoded
// scaffoldweb.com literals scattered across the codebase. Import from
// here instead of inlining brand names, domains, hosts, or emails so a
// future rebrand or domain change is a one-line edit.

export const BRAND_NAME = "Strelva" as const;
export const ROOT_DOMAIN = "strelva.com" as const;

export const APP_HOST = `app.${ROOT_DOMAIN}` as const;
export const APP_URL = `https://app.${ROOT_DOMAIN}` as const;
export const MARKETING_URL = `https://${ROOT_DOMAIN}` as const;
export const CLERK_HOST = `clerk.${ROOT_DOMAIN}` as const;
export const EMAIL_DOMAIN = `updates.${ROOT_DOMAIN}` as const;
export const SUPPORT_EMAIL = `support@${ROOT_DOMAIN}` as const;
