import type { AuditContext } from "../context";
import type { CategoryResult, CheckResult } from "../types";
import { averageCheckScores } from "../scoring";

/**
 * SEO Foundations audit module.
 *
 * Ported from OWSH Systems' `technical-seo-foundations.js`. Focuses on the
 * crawl + index foundations search engines and AI agents need to reach and
 * understand the site: robots.txt, XML sitemap, canonical, title, meta
 * description, H1 structure, and server-rendered content.
 *
 * Reads ONLY from the AuditContext the runner already gathered — no fetches.
 * Schema / structured data is intentionally left to the AI-readability module
 * (this one complements it, it does not duplicate it).
 */

// Raw weights from the OWSH module. Normalized to /100 at the end.
const WEIGHTS = {
  robotsTxt: 10,
  crawlersAllowed: 15, // critical
  sitemap: 12,
  sitemapValid: 8,
  canonical: 12,
  title: 15, // critical
  metaDescription: 10,
  h1Present: 10,
  h1Single: 5,
  serverRendered: 8,
} as const;

function statusForScore(score: number): CheckResult["status"] {
  if (score >= 80) return "pass";
  if (score >= 50) return "warn";
  return "fail";
}

/**
 * Parse robots.txt for blanket blocks of major crawlers.
 * Returns the blocking user-agent groups and the matched Disallow lines.
 */
function findBlockingRules(robotsTxt: string): {
  blocked: boolean;
  patterns: string[];
} {
  const blockingAgents = new Set(["*", "googlebot", "bingbot", "gptbot"]);
  const lines = robotsTxt.split("\n");
  const patterns: string[] = [];
  let currentAgent: string | null = null;
  let blocked = false;

  for (const line of lines) {
    // Strip inline comments, then trim and lowercase for matching.
    const stripped = line.split("#")[0] ?? "";
    const trimmed = stripped.trim().toLowerCase();

    if (trimmed.startsWith("user-agent:")) {
      currentAgent = trimmed.replace("user-agent:", "").trim();
    } else if (trimmed.startsWith("disallow:")) {
      const path = trimmed.replace("disallow:", "").trim();
      // A bare "Disallow: /" under a major crawler blocks the whole site.
      if (path === "/" && currentAgent && blockingAgents.has(currentAgent)) {
        blocked = true;
        patterns.push(`User-agent: ${currentAgent} -> Disallow: /`);
      }
    }
  }

  return { blocked, patterns };
}

export function checkSeoFoundations(ctx: AuditContext): CategoryResult {
  const { $, robotsTxt, sitemapXml } = ctx;
  const checks: CheckResult[] = [];

  // -------------------------------------------------------------------------
  // robots.txt present
  // -------------------------------------------------------------------------
  const hasRobots = robotsTxt != null;
  checks.push({
    name: "robots.txt",
    status: hasRobots ? "pass" : "warn",
    score: hasRobots ? 100 : 0,
    message: hasRobots
      ? "A robots.txt file is present."
      : "No robots.txt file was found.",
    details: hasRobots
      ? undefined
      : "A robots.txt is the note that tells search engines which pages they may read. Ask Strelva to add one so crawlers get clear guidance.",
  });

  // -------------------------------------------------------------------------
  // Crawlers allowed (critical) — robots.txt not blocking major bots
  // -------------------------------------------------------------------------
  const blocking = hasRobots
    ? findBlockingRules(robotsTxt)
    : { blocked: false, patterns: [] };
  checks.push({
    name: "Crawlers allowed",
    status: blocking.blocked ? "fail" : "pass",
    score: blocking.blocked ? 0 : 100,
    message: blocking.blocked
      ? "Your site is currently blocking search engines from reading it at all."
      : "Search engines are allowed to read the site.",
    details: blocking.blocked
      ? `A setting is telling search engines to skip your whole site, which keeps you out of results: ${blocking.patterns.join("; ")}. Ask Strelva to remove the blanket block so you can be found.`
      : undefined,
  });

  // -------------------------------------------------------------------------
  // XML sitemap present
  // -------------------------------------------------------------------------
  const hasSitemap = sitemapXml != null;
  checks.push({
    name: "XML sitemap",
    status: hasSitemap ? "pass" : "warn",
    score: hasSitemap ? 100 : 0,
    message: hasSitemap
      ? "An XML sitemap is present."
      : "No XML sitemap was found.",
    details: hasSitemap
      ? undefined
      : "A sitemap is the index you hand search engines so they find every page faster. Ask Strelva to add one.",
  });

  // -------------------------------------------------------------------------
  // Sitemap valid XML. A MISSING sitemap is ALREADY fully penalized by the "XML
  // sitemap" check above — so when there's none, this check is a neutral pass
  // (score 100, no message impact) rather than a second score-0 fail. That was
  // double-docking the SEO category (20% for one absent file) AND emitting a
  // nonsense high-priority "Sitemap is valid: No sitemap to validate." action.
  // (Kept in the array unconditionally — the category score is positional.)
  // -------------------------------------------------------------------------
  const sitemapValid =
    hasSitemap &&
    (sitemapXml.includes("<?xml") ||
      sitemapXml.includes("<urlset") ||
      sitemapXml.includes("<sitemapindex")) &&
    (sitemapXml.includes("<url>") || sitemapXml.includes("<sitemap>"));
  checks.push({
    name: "Sitemap is valid",
    status: !hasSitemap || sitemapValid ? "pass" : "warn",
    score: !hasSitemap || sitemapValid ? 100 : 0,
    message: !hasSitemap
      ? "No sitemap yet — its format is checked once you add one."
      : sitemapValid
        ? "The sitemap is valid XML with listed pages."
        : "The sitemap was found but does not look like valid XML with page entries.",
    details: sitemapValid || !hasSitemap
      ? undefined
      : "The sitemap needs to list your page addresses in a format search engines can read. Ask Strelva to fix its format.",
  });

  // -------------------------------------------------------------------------
  // Canonical tag present
  // -------------------------------------------------------------------------
  const canonical = $('link[rel="canonical"]').attr("href")?.trim() ?? "";
  const hasCanonical = canonical.length > 0;
  checks.push({
    name: "Canonical tag",
    status: hasCanonical ? "pass" : "warn",
    score: hasCanonical ? 100 : 0,
    message: hasCanonical
      ? "A canonical tag is set."
      : "No canonical tag was found.",
    details: hasCanonical
      ? canonical
      : "A canonical tag tells search engines which version of a page is the main one, so your ranking strength lands on one address instead of being split. Ask Strelva to add it.",
  });

  // -------------------------------------------------------------------------
  // Title tag present + reasonable length (critical)
  // -------------------------------------------------------------------------
  const title = $("title").first().text().trim();
  const titleLength = title.length;
  let titleScore: number;
  let titleMessage: string;
  if (titleLength === 0) {
    titleScore = 0;
    titleMessage = "No page title was found.";
  } else if (titleLength > 60) {
    titleScore = 70;
    titleMessage = `The page title is long (${titleLength} characters) and may be cut off in search results.`;
  } else if (titleLength < 30) {
    titleScore = 70;
    titleMessage = `The page title is short (${titleLength} characters). Aim for 30 to 60 characters.`;
  } else {
    titleScore = 100;
    titleMessage = `The page title is present and a good length (${titleLength} characters).`;
  }
  checks.push({
    name: "Title tag",
    status: statusForScore(titleScore),
    score: titleScore,
    message: titleMessage,
    details: titleLength === 0 ? undefined : title,
  });

  // -------------------------------------------------------------------------
  // Meta description present
  // -------------------------------------------------------------------------
  const metaDesc =
    $('meta[name="description"]').attr("content")?.trim() ?? "";
  const hasMetaDesc = metaDesc.length > 0;
  checks.push({
    name: "Meta description",
    status: hasMetaDesc ? "pass" : "warn",
    score: hasMetaDesc ? 100 : 0,
    message: hasMetaDesc
      ? "A meta description is present."
      : "No meta description was found.",
    details: hasMetaDesc
      ? undefined
      : "The description is the sentence shown under your title in search results: free ad space. Ask Strelva to write one so you control that first impression.",
  });

  // -------------------------------------------------------------------------
  // H1 heading present + exactly one
  // -------------------------------------------------------------------------
  const h1Count = $("h1").length;
  checks.push({
    name: "H1 heading",
    status: h1Count > 0 ? "pass" : "fail",
    score: h1Count > 0 ? 100 : 0,
    message:
      h1Count > 0
        ? "The page has an H1 heading."
        : "No H1 heading was found.",
    details:
      h1Count > 0
        ? $("h1").first().text().trim().slice(0, 100)
        : "The main heading tells search engines and AI what the page is about in one line. Ask Strelva to add a clear one.",
  });
  checks.push({
    name: "Single H1",
    status: h1Count === 1 ? "pass" : "warn",
    score: h1Count === 1 ? 100 : 0,
    message:
      h1Count === 1
        ? "The page uses a single H1 heading."
        : h1Count === 0
          ? "There is no H1 heading to count."
          : `The page has ${h1Count} main headings. A page reads clearest with one.`,
    details:
      h1Count > 1
        ? "Several top-level headings can blur what your page is mainly about. Ask Strelva to keep one main heading and make the others sub-headings."
        : undefined,
  });

  // -------------------------------------------------------------------------
  // Server-rendered content — SPA root with little server HTML is a risk
  // -------------------------------------------------------------------------
  // visibleText (script/style stripped) — raw $("body").text() includes inline
  // JSON/JS, so any SPA shipping kilobytes of inline state trivially cleared the
  // 500-char bar and always "passed" server-rendered content.
  const hasSubstantialContent = ctx.visibleText.length > 500;
  const hasSpaRoot =
    $("#root, #app, #__next, [data-reactroot]").length > 0;
  const jsRisk = hasSpaRoot && !hasSubstantialContent;
  checks.push({
    name: "Server-rendered content",
    status: jsRisk ? "warn" : "pass",
    score: jsRisk ? 40 : 100,
    message: jsRisk
      ? "Your page may need JavaScript to run before its content appears."
      : "Your content is readable right in the page, the way search engines prefer.",
    details: jsRisk
      ? "There is very little text in the page until scripts run, and search engines and AI may not wait for them. Ask Strelva to serve your key content directly in the page so it is always readable."
      : undefined,
  });

  // -------------------------------------------------------------------------
  // Weighted score (raw weights normalized to /100)
  // -------------------------------------------------------------------------
  const weighted: Array<[number, number]> = [
    [WEIGHTS.robotsTxt, checks[0]!.score],
    [WEIGHTS.crawlersAllowed, checks[1]!.score],
    [WEIGHTS.sitemap, checks[2]!.score],
    [WEIGHTS.sitemapValid, checks[3]!.score],
    [WEIGHTS.canonical, checks[4]!.score],
    [WEIGHTS.title, checks[5]!.score],
    [WEIGHTS.metaDescription, checks[6]!.score],
    [WEIGHTS.h1Present, checks[7]!.score],
    [WEIGHTS.h1Single, checks[8]!.score],
    [WEIGHTS.serverRendered, checks[9]!.score],
  ];
  const totalWeight = weighted.reduce((sum, [w]) => sum + w, 0);
  const score =
    totalWeight > 0
      ? Math.round(
          weighted.reduce((sum, [w, s]) => sum + w * s, 0) / totalWeight
        )
      : averageCheckScores(checks.map((c) => c.score));

  return {
    name: "SEO Foundations",
    slug: "seo",
    weight: 0, // runner overrides
    score,
    checks,
  };
}
