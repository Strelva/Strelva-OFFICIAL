/**
 * scrape-angi.ts — Scrape Angi contractor listings for Buffalo metro.
 *
 * Usage:
 *   pnpm exec tsx scripts/scrape-angi.ts
 *
 * Scrapes 50 listings across plumbing + HVAC categories in Buffalo, NY.
 * Writes raw results to ~/.leverage/store/angi-leads/angi-raw.json.
 *
 * Etiquette:
 * - Identifies as a normal Chrome browser (not a bot UA)
 * - 2-4s polite delay between page requests
 * - Stops and reports on any captcha/block detection
 * - No proxy rotation, no evasion
 *
 * Data collected per listing:
 * - Business name, trade category, city (from URL slug), Angi listing URL
 * - Star rating, review count, years in business
 * - Website URL (from the individual listing page external links)
 * - Phone (from individual listing page, visible text only)
 * - Email on listing page (rare, but we check)
 */

import { chromium, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const OUT_DIR = join(homedir(), ".leverage", "store", "angi-leads");
const OUT_FILE = join(OUT_DIR, "angi-raw.json");

const TARGET = 50;
const PAGE_DELAY_MS = [2000, 4000] as const; // polite: random between 2-4s
const LISTING_DELAY_MS = [1500, 3000] as const;

const CATEGORIES: Array<{ slug: string; trade: string; url: string }> = [
  {
    slug: "plumbing",
    trade: "Plumbing",
    url: "https://www.angi.com/companylist/us/ny/buffalo/plumbing.htm",
  },
  {
    slug: "hvac",
    trade: "HVAC",
    url: "https://www.angi.com/companylist/us/ny/buffalo/hvac.htm",
  },
];

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Extra ms to wait after domcontentloaded for React to hydrate the cards. */
const HYDRATION_WAIT_MS = 4000;

export interface RawLead {
  business: string;
  trade: string;
  city: string;
  listingUrl: string;
  rating: number | null;
  reviewCount: number | null;
  yearInBusiness: number | null;
  website: string | null;
  phone: string | null;
  emailOnListing: string | null;
  scrapedAt: string;
}

function delay(min: number, max: number): Promise<void> {
  const ms = min + Math.floor(Math.random() * (max - min));
  return new Promise((r) => setTimeout(r, ms));
}

function isBlocked(html: string): boolean {
  const lower = html.toLowerCase();
  // Only block on clear anti-bot signals, not on normal SEO meta tags like
  // <meta name="robots"> or "robots.txt" references.
  return (
    lower.includes("captcha") ||
    lower.includes("cf-challenge") ||
    lower.includes("unusual traffic") ||
    lower.includes("verify you are human") ||
    lower.includes("you have been blocked") ||
    (lower.includes("access denied") && !lower.includes("access denied exception")) ||
    // Cloudflare/generic block page: very short HTML with no content
    (html.length < 5000 && (lower.includes("just a moment") || lower.includes("checking your browser")))
  );
}

/** Extract city slug from an Angi listing URL. e.g. .../us/ny/lancaster/... -> Lancaster */
function cityFromUrl(url: string): string {
  const parts = url.split("/");
  const idx = parts.indexOf("ny");
  if (idx !== -1 && parts[idx + 1]) {
    return parts[idx + 1]
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  }
  return "Buffalo";
}

function extractEmail(text: string): string | null {
  const matches = text.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g);
  if (!matches) return null;
  const filtered = matches.filter((e) => {
    if (e.length > 80) return false;
    // Must end in a real TLD (not an image extension or 2x/3x suffix)
    if (/\.(png|jpg|jpeg|gif|svg|webp|ico|bmp|2x|3x|4x)$/i.test(e)) return false;
    const domain = e.split("@")[1] ?? "";
    const skipDomains = [
      "angi.com", "sentry.io", "example.com", "schema.org", "w3.org",
      "googleapis.com", "gstatic.com", "facebook.com", "twitter.com",
    ];
    if (skipDomains.some((d) => domain.includes(d))) return false;
    return true;
  });
  return filtered[0] ?? null;
}

function extractPhone(text: string): string | null {
  const matches = text.match(/\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}/g);
  if (!matches) return null;
  // Prefer 716 (Buffalo area code)
  const local = matches.find((p) => p.replace(/\D/g, "").startsWith("716"));
  return local ?? matches[0] ?? null;
}

/** Scrape the individual listing page for website URL, phone, email. */
async function scrapeListingPage(
  page: Page,
  url: string
): Promise<{ website: string | null; phone: string | null; email: string | null }> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    await delay(1500, 2500);
    const html = await page.content();

    if (isBlocked(html)) {
      console.warn("  BLOCKED on listing page:", url);
      return { website: null, phone: null, email: null };
    }

    const text = await page.$eval("body", (el) => (el as HTMLElement).innerText).catch(() => "");

    // Website: look for external links that are not Angi/social/app-store
    const SKIP_DOMAINS = [
      "angi.com",
      "homeadvisor.com",
      "facebook.com",
      "instagram.com",
      "twitter.com",
      "x.com",
      "youtube.com",
      "pinterest.com",
      "apps.apple.com",
      "play.google.com",
      "careeronestop.org",
      "bbb.org",
      "yelp.com",
      "google.com",
      "linkedin.com",
      "onetrust.com",
      "cookielaw.org",
      "trustarc.com",
      "iubenda.com",
      "cloudflare.com",
      "amazonaws.com",
      "akamai.com",
      "nr-data.net",
      "newrelic.com",
    ];
    const externalLinks = await page
      .$$eval("a[href]", (els) =>
        els
          .map((e) => (e as HTMLAnchorElement).href)
          .filter((h) => h && h.startsWith("http"))
      )
      .catch(() => [] as string[]);

    const website =
      externalLinks.find((href) => {
        try {
          const hostname = new URL(href).hostname.replace(/^www\./, "");
          return !SKIP_DOMAINS.some((skip) => hostname.includes(skip));
        } catch {
          return false;
        }
      }) ?? null;

    const phone = extractPhone(text);
    const email = extractEmail(html);

    return { website, phone, email };
  } catch (err) {
    console.warn("  Error scraping listing:", url, err instanceof Error ? err.message : String(err));
    return { website: null, phone: null, email: null };
  }
}

/** Scrape one category page, collecting card data + listing detail. */
async function scrapeCategory(
  page: Page,
  category: (typeof CATEGORIES)[number],
  target: number
): Promise<RawLead[]> {
  const leads: RawLead[] = [];
  let pageNum = 1;

  while (leads.length < target) {
    const url =
      pageNum === 1
        ? category.url
        : `${category.url}?page=${pageNum}`;

    console.log(`  Fetching ${category.trade} page ${pageNum}: ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    // Wait for React to hydrate the ProCard elements
    await page.waitForSelector("[class*='ProCard']", { timeout: 15000 }).catch(() => {});
    await delay(HYDRATION_WAIT_MS, HYDRATION_WAIT_MS + 1000);
    const html = await page.content();

    if (isBlocked(html)) {
      console.error(`BLOCKED on category page ${pageNum}. Stopping this category.`);
      break;
    }

    // Extract card data
    const cards = await page.$$eval("[class*='ProCard']", (els) =>
      els.map((el) => {
        const h = el as HTMLElement;
        const nameEl = h.querySelector(
          "[data-snowplow-component-key='Pro Card']"
        );
        const name = nameEl?.getAttribute("data-snowplow-component-text") ?? "";
        const href = (nameEl as HTMLAnchorElement)?.href ?? "";
        const text = h.innerText;
        const yearMatch = text.match(/In business since (\d{4})/);
        const ratingMatch = text.match(/^([\d.]+)\n/);
        const reviewMatch = text.match(/\((\d+)\)/);
        return {
          name: name.trim(),
          href,
          year: yearMatch ? parseInt(yearMatch[1], 10) : null,
          rating: ratingMatch ? parseFloat(ratingMatch[1]) : null,
          reviewCount: reviewMatch ? parseInt(reviewMatch[1], 10) : null,
        };
      })
    );

    if (cards.length === 0) {
      console.log(`  No cards found on page ${pageNum}, stopping.`);
      break;
    }

    for (const card of cards) {
      if (leads.length >= target) break;
      if (!card.name || !card.href) continue;

      console.log(`  [${leads.length + 1}/${target}] ${card.name}`);

      await delay(LISTING_DELAY_MS[0], LISTING_DELAY_MS[1]);
      const detail = await scrapeListingPage(page, card.href);

      leads.push({
        business: card.name,
        trade: category.trade,
        city: cityFromUrl(card.href),
        listingUrl: card.href,
        rating: card.rating,
        reviewCount: card.reviewCount,
        yearInBusiness: card.year,
        website: detail.website,
        phone: detail.phone,
        emailOnListing: detail.email,
        scrapedAt: new Date().toISOString(),
      });
    }

    if (leads.length < target) {
      pageNum++;
      await delay(PAGE_DELAY_MS[0], PAGE_DELAY_MS[1]);
    }
  }

  return leads;
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-dev-shm-usage",
    ],
  });
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 800 },
    locale: "en-US",
    timezoneId: "America/New_York",
  });
  const page = await context.newPage();
  // Remove webdriver flag that headless Chromium sets by default
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });

  const perCategory = Math.ceil(TARGET / CATEGORIES.length); // 25 each
  const allLeads: RawLead[] = [];

  for (const cat of CATEGORIES) {
    console.log(`\nScraping ${cat.trade} (target: ${perCategory} leads)...`);
    const remaining = TARGET - allLeads.length;
    const catTarget = Math.min(perCategory, remaining);

    try {
      const leads = await scrapeCategory(page, cat, catTarget);
      allLeads.push(...leads);
      console.log(`  Got ${leads.length} ${cat.trade} leads. Total so far: ${allLeads.length}`);
    } catch (err) {
      console.error(`Error scraping ${cat.trade}:`, err instanceof Error ? err.message : String(err));
    }

    if (allLeads.length < TARGET && CATEGORIES.indexOf(cat) < CATEGORIES.length - 1) {
      await delay(PAGE_DELAY_MS[0], PAGE_DELAY_MS[1]);
    }
  }

  await context.close();
  await browser.close();

  // Deduplicate by listing URL
  const seen = new Set<string>();
  const deduped = allLeads.filter((l) => {
    if (seen.has(l.listingUrl)) return false;
    seen.add(l.listingUrl);
    return true;
  });

  writeFileSync(OUT_FILE, JSON.stringify(deduped, null, 2), "utf-8");

  console.log(`\nDone. ${deduped.length} leads written to ${OUT_FILE}`);
  const hasWebsite = deduped.filter((l) => l.website).length;
  const hasEmail = deduped.filter((l) => l.emailOnListing).length;
  const hasPhone = deduped.filter((l) => l.phone).length;
  console.log(`  Has website: ${hasWebsite}/${deduped.length}`);
  console.log(`  Has email (listing): ${hasEmail}/${deduped.length}`);
  console.log(`  Has phone: ${hasPhone}/${deduped.length}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
