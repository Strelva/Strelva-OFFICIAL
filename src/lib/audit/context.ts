import type * as cheerio from "cheerio";

/**
 * Everything a single-fetch audit module needs, gathered once by the audit
 * runner so each module stays pure and cheap (no module makes its own network
 * call). All free, no API key, no client login — this is the lean engine ported
 * from OWSH Systems into Strelva's health/audit layer.
 *
 * The runner fetches the homepage (html + response headers) plus the three
 * well-known files (robots.txt, sitemap.xml, llms.txt); any that 404 or error
 * come through as null so a module degrades a finding instead of throwing.
 */
export interface AuditContext {
  /** Final URL after redirects (https-normalized). */
  url: string;
  /** Raw homepage HTML. */
  html: string;
  /** Pre-parsed cheerio handle (parsed once, shared across modules). */
  $: cheerio.CheerioAPI;
  /** Response headers from the homepage fetch (security header checks). */
  headers: Headers;
  /** /robots.txt body, or null if missing/unreachable. */
  robotsTxt: string | null;
  /** /sitemap.xml body, or null if missing/unreachable. */
  sitemapXml: string | null;
  /** /llms.txt body, or null if missing (the 2026 AI-visibility signal). */
  llmsTxt: string | null;
}

/** Signature every ported audit module implements: pure, context in, category out. */
export type AuditModule = (ctx: AuditContext) => import("./types").CategoryResult;
