/**
 * enrich-leads.ts — Enrich raw Angi leads with AI visibility scores,
 * email extraction from prospect websites, and personalized openers.
 *
 * Usage:
 *   pnpm exec tsx scripts/enrich-leads.ts
 *
 * Reads:  ~/.leverage/store/angi-leads/angi-raw.json
 * Writes: ~/.leverage/store/angi-leads/angi-enriched.json
 *
 * Per row:
 * - Runs scoreAiVisibility() against their domain (skip if no website)
 * - Scrapes their own website contact page for a real email address
 * - Also checks for email in mailto: links on the home page
 * - Generates a one-sentence opener using Gemini, grounded in a REAL
 *   failing signal from their score output (no invented observations)
 * - Builds a reportUrl: https://strelva.com/discovery/report?...
 *
 * Email rules:
 * - Only real scraped addresses — no pattern inference
 * - emailSource: "contact-page" | "listing" | null
 * - Rows with no email keep email: null (usable for phone/DM channels)
 *
 * Opener rules:
 * - One sentence, plain English, no em dashes
 * - Must reference a specific failing signal from the score
 * - openerBasis field records which signal drove the opener
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { scoreAiVisibility, type AiVisibilityResult } from "../src/products/ai-visibility/server";
import type { RawLead } from "./scrape-angi";

const OUT_DIR = join(homedir(), ".leverage", "store", "angi-leads");
const IN_FILE = join(OUT_DIR, "angi-raw.json");
const OUT_FILE = join(OUT_DIR, "angi-enriched.json");

const CONCURRENCY = 3; // parallel score runs (polite)
const FETCH_TIMEOUT_MS = 10000;

export interface EnrichedLead extends RawLead {
  // AI visibility
  score: number | null;
  grade: string | null;
  topFix: string | null;
  scoreSignals: Array<{ id: string; label: string; pass: boolean; detail: string }> | null;
  noWebsiteFlag: boolean;

  // Email enrichment
  email: string | null;
  emailSource: "contact-page" | "listing" | null;

  // Personalization
  opener: string | null;
  openerBasis: string | null;

  // URLs
  reportUrl: string;
  enrichedAt: string;
}

// ─── Email extraction from prospect website ───────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const SKIP_EMAIL_DOMAINS = [
  "angi.com", "sentry.io", "sentry-next.wixpress.com", "wixpress.com",
  "example.com", "schema.org", "w3.org",
  "google.com", "facebook.com", "instagram.com", "twitter.com", "x.com",
  "wix.com", "squarespace.com", "wordpress.com", "godaddy.com",
  "cloudflare.com", "amazonaws.com", "jquery.com", "bootstrap.com",
  "doubleclick.net", "googletagmanager.com", "hotjar.com",
];

const PLACEHOLDER_EMAILS = new Set([
  "youremail@yourbusiness.com",
  "email@example.com",
  "info@example.com",
  "your@email.com",
  "name@domain.com",
  "contact@yourbusiness.com",
  "hello@yourdomain.com",
]);

function isRealEmail(email: string): boolean {
  if (email.length > 80) return false;
  if (PLACEHOLDER_EMAILS.has(email.toLowerCase())) return false;
  const domain = email.split("@")[1] ?? "";
  if (SKIP_EMAIL_DOMAINS.some((skip) => domain.includes(skip))) return false;
  // Avoid common false positives from JS/CSS
  if (/\.(js|css|png|jpg|jpeg|gif|svg|webp|woff|2x|3x)$/i.test(email)) return false;
  // Placeholder patterns: domain is literally "yourbusiness.com" or "yourdomain.com"
  if (/your(business|domain|company|email|name)\.(com|net|org)/i.test(domain)) return false;
  return true;
}

function extractEmailsFromHtml(html: string): string[] {
  const raw = html.match(EMAIL_RE) ?? [];
  return [...new Set(raw.filter(isRealEmail))];
}

async function fetchWithTimeout(url: string, ms = FETCH_TIMEOUT_MS): Promise<string | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
      redirect: "follow",
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Try to find a real email from the prospect's website.
 * Strategy:
 * 1. Check mailto: links on the homepage (most reliable)
 * 2. Regex scan homepage HTML
 * 3. Find a /contact or /contact-us page link and repeat there
 */
async function scrapeEmailFromWebsite(
  websiteUrl: string
): Promise<{ email: string; source: "contact-page" } | null> {
  let baseUrl: string;
  try {
    const u = new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`);
    baseUrl = u.origin;
  } catch {
    return null;
  }

  // Step 1: homepage
  const homeHtml = await fetchWithTimeout(baseUrl);
  if (!homeHtml) return null;

  // Check mailto: href attributes first (most reliable)
  const mailtoMatches = homeHtml.match(/mailto:([^\s"'<>?&]+)/g);
  if (mailtoMatches) {
    for (const m of mailtoMatches) {
      const raw = m.replace("mailto:", "").split("?")[0] ?? "";
      const email = decodeURIComponent(raw).trim();
      if (isRealEmail(email)) return { email, source: "contact-page" };
    }
  }

  // Regex scan homepage
  const homeEmails = extractEmailsFromHtml(homeHtml);
  if (homeEmails.length > 0) return { email: homeEmails[0]!, source: "contact-page" };

  // Step 2: find contact page link
  const contactPatterns = [
    "/contact",
    "/contact-us",
    "/contact.html",
    "/contact-us.html",
    "/contactus",
    "/get-in-touch",
  ];

  const linkMatches = homeHtml.match(/href="([^"]*contact[^"]*)"/gi) ?? [];
  const contactPaths = [
    ...contactPatterns,
    ...linkMatches.map((m) => m.replace(/href="([^"]*)"/i, "$1").split("?")[0] ?? ""),
  ];

  for (const path of contactPaths) {
    let contactUrl: string;
    try {
      contactUrl = path.startsWith("http") ? path : `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
      // Validate it's on the same domain
      if (!contactUrl.includes(new URL(baseUrl).hostname)) continue;
    } catch {
      continue;
    }

    const contactHtml = await fetchWithTimeout(contactUrl);
    if (!contactHtml) continue;

    const mailtoOnContact = contactHtml.match(/mailto:([^\s"'<>?&]+)/g);
    if (mailtoOnContact) {
      for (const m of mailtoOnContact) {
        const raw = m.replace("mailto:", "").split("?")[0] ?? "";
        const email = decodeURIComponent(raw).trim();
        if (isRealEmail(email)) return { email, source: "contact-page" };
      }
    }

    const contactEmails = extractEmailsFromHtml(contactHtml);
    if (contactEmails.length > 0) return { email: contactEmails[0]!, source: "contact-page" };

    break; // only check the first found contact URL
  }

  return null;
}

// ─── Report URL builder ───────────────────────────────────────────────────────

function buildReportUrl(lead: RawLead, domain: string | null): string {
  const base = "https://strelva.com/discovery/report";
  const params = new URLSearchParams({
    b: lead.business,
    t: lead.trade,
    town: lead.city,
    ref: "angi",
  });
  if (domain) params.set("d", domain);
  return `${base}?${params.toString()}`;
}

function domainFromWebsite(website: string | null): string | null {
  if (!website) return null;
  try {
    return new URL(website.startsWith("http") ? website : `https://${website}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

// ─── Opener generation ────────────────────────────────────────────────────────

/**
 * Generate a one-sentence personalized opener grounded in a real failing
 * signal from the score output. Uses Gemini if key is available; falls back
 * to a deterministic template using the topFix signal.
 *
 * Rules:
 * - One sentence only
 * - Must reference a specific factual finding (signal.detail)
 * - No em dashes
 * - Plain English
 * - Returns { opener, basis } where basis names the signal used
 */
async function generateOpener(
  lead: RawLead,
  score: AiVisibilityResult
): Promise<{ opener: string; basis: string }> {
  const failingSignals = score.signals
    .filter((s) => !s.pass)
    .sort((a, b) => b.weight - a.weight);

  if (failingSignals.length === 0) {
    if (score.signals.length === 0) {
      // No signals at all — website was unreachable. Use the no-website variant.
      return {
        opener: `${lead.business} doesn't appear to have a reachable website, so anyone searching for ${lead.trade.toLowerCase()} in ${lead.city} can't find them outside of the Angi listing`,
        basis: "no-reachable-website",
      };
    }
    // All signals pass — this is a well-optimised site
    return {
      opener: `${lead.business} scores well on AI readiness, but most local contractors in ${lead.city} don't, so your window to stand out is now.`,
      basis: "all-signals-pass",
    };
  }

  const topSignal = failingSignals[0]!;
  const secondSignal = failingSignals[1] ?? null;

  // Try Gemini for a natural sentence
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (apiKey) {
    try {
      const { google } = await import("@ai-sdk/google");
      const { generateText } = await import("ai");

      const findingDescription = secondSignal
        ? `${topSignal.detail}; also ${secondSignal.detail}`
        : topSignal.detail;

      const prompt = `Write ONE sentence of cold outreach for a contractor named "${lead.business}" in ${lead.city} who provides ${lead.trade} services.

The sentence must:
- Reference this specific finding about their online presence: "${findingDescription}"
- Be plain English, no jargon, no em dashes, no hyphens used as dashes
- Be direct but not condescending
- Not mention "Strelva" or any company name
- Not make a promise or claim a result
- Be 1 sentence only (no period at the end is fine)

Output only the sentence, nothing else.`;

      const { text } = await generateText({
        model: google("gemini-2.5-flash"),
        prompt,
      });

      const cleaned = text.trim().replace(/^["']|["']$/g, "").replace(/\s+/g, " ").trim();

      if (cleaned.length > 20 && cleaned.length < 300 && !cleaned.includes("—")) {
        return { opener: cleaned, basis: topSignal.id };
      }
    } catch (err) {
      console.warn("  Gemini opener failed, using deterministic fallback:", err instanceof Error ? err.message : String(err));
    }
  }

  // Deterministic fallback: use topSignal.detail directly as the hook
  const opener = buildDeterministicOpener(lead, topSignal.id, topSignal.detail);
  return { opener, basis: topSignal.id };
}

function buildDeterministicOpener(
  lead: RawLead,
  signalId: string,
  detail: string
): string {
  const biz = lead.business;
  const city = lead.city;

  switch (signalId) {
    case "ai_crawlers":
      return `${biz}'s website has told AI search engines not to read it, so when someone in ${city} searches for ${lead.trade.toLowerCase()} help, the listing is invisible by its own instruction`;

    case "structured_data":
      return `${biz}'s website has no structured business data for AI to read, so local AI search results for ${lead.trade.toLowerCase()} in ${city} have nothing to attribute to them`;

    case "nap":
      return `${biz}'s website is missing the phone number and address format that AI needs to connect the site to the local listing in ${city}`;

    case "answerable":
      return `${biz}'s website has no FAQ or question-format content, so AI search responses for ${lead.trade.toLowerCase()} in ${city} have nothing to quote from them`;

    case "identity":
      return `${biz}'s website title and description don't clearly identify what they do or where they are, making it hard for AI search to include them in ${city} results`;

    default:
      return `${biz}'s online presence has a gap that prevents AI search from recommending them when someone in ${city} looks for ${lead.trade.toLowerCase()} help: ${detail.toLowerCase().slice(0, 100)}`;
  }
}

// ─── Enrichment runner ────────────────────────────────────────────────────────

async function enrichLead(lead: RawLead): Promise<EnrichedLead> {
  const domain = domainFromWebsite(lead.website);
  const noWebsiteFlag = !lead.website;
  const reportUrl = buildReportUrl(lead, domain);

  let scoreResult: AiVisibilityResult | null = null;
  let email: string | null = lead.emailOnListing ?? null;
  let emailSource: "contact-page" | "listing" | null =
    lead.emailOnListing ? "listing" : null;
  let opener: string | null = null;
  let openerBasis: string | null = null;

  // Score the website if it exists
  if (lead.website && domain) {
    try {
      scoreResult = await scoreAiVisibility({
        business: lead.business,
        url: lead.website,
        category: lead.trade,
        location: lead.city + ", NY",
      });
    } catch (err) {
      console.warn(`  Score failed for ${lead.business}:`, err instanceof Error ? err.message : String(err));
    }

    // Find email from website (only if we don't already have one from the listing)
    if (!email) {
      const found = await scrapeEmailFromWebsite(lead.website);
      if (found) {
        email = found.email;
        emailSource = found.source;
      }
    }
  }

  // Generate opener if we have a score
  if (scoreResult) {
    try {
      const result = await generateOpener(lead, scoreResult);
      opener = result.opener;
      openerBasis = result.basis;
    } catch (err) {
      console.warn(`  Opener failed for ${lead.business}:`, err instanceof Error ? err.message : String(err));
    }
  } else if (noWebsiteFlag) {
    // No website at all — opener focuses on the absence
    opener = `${lead.business} doesn't appear to have a website, so anyone searching for ${lead.trade.toLowerCase()} in ${lead.city} can't find them through anything other than the Angi listing`;
    openerBasis = "no-website";
  }

  return {
    ...lead,
    score: scoreResult?.score ?? null,
    grade: scoreResult?.grade ?? null,
    topFix: scoreResult?.topFix ?? null,
    scoreSignals: scoreResult?.signals.map((s) => ({ id: s.id, label: s.label, pass: s.pass, detail: s.detail })) ?? null,
    noWebsiteFlag,
    email,
    emailSource,
    opener,
    openerBasis,
    reportUrl,
    enrichedAt: new Date().toISOString(),
  };
}

async function processBatch<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

async function main() {
  if (!existsSync(IN_FILE)) {
    console.error(`Input file not found: ${IN_FILE}`);
    console.error("Run scripts/scrape-angi.ts first.");
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const raw: RawLead[] = JSON.parse(readFileSync(IN_FILE, "utf-8"));
  console.log(`Enriching ${raw.length} leads...`);
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    console.log("Note: GOOGLE_GENERATIVE_AI_API_KEY not set — using deterministic openers.");
  }

  let done = 0;
  const enriched = await processBatch(
    raw,
    async (lead) => {
      console.log(`[${++done}/${raw.length}] ${lead.business} (${lead.trade})`);
      return enrichLead(lead);
    },
    CONCURRENCY
  );

  writeFileSync(OUT_FILE, JSON.stringify(enriched, null, 2), "utf-8");

  // Funnel summary
  const total = enriched.length;
  const hasWebsite = enriched.filter((l) => l.website).length;
  const hasEmail = enriched.filter((l) => l.email).length;
  const hasGrade = enriched.filter((l) => l.grade).length;
  const gradeBreakdown: Record<string, number> = {};
  for (const l of enriched) {
    if (l.grade) gradeBreakdown[l.grade] = (gradeBreakdown[l.grade] ?? 0) + 1;
  }

  console.log(`\nEnrichment complete. ${total} leads written to ${OUT_FILE}`);
  console.log(`  Has website:        ${hasWebsite}/${total}`);
  console.log(`  Has email (real):   ${hasEmail}/${total}`);
  console.log(`  Has grade:          ${hasGrade}/${total}`);
  console.log(`  Grade breakdown:    ${JSON.stringify(gradeBreakdown)}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
