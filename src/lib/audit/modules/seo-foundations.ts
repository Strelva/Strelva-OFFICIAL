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
    const stripped = line.split("#")[0];
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
      : "Search engines look for robots.txt to learn which pages they may crawl. Add one at /robots.txt.",
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
      ? "Your robots.txt is blocking search engines from your whole site."
      : "Search engines are allowed to crawl the site.",
    details: blocking.blocked
      ? `These rules block crawling and keep your pages out of search results: ${blocking.patterns.join("; ")}. Remove the blanket "Disallow: /" lines.`
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
      : "A sitemap helps search engines discover and index all of your pages faster. Add one at /sitemap.xml.",
  });

  // -------------------------------------------------------------------------
  // Sitemap valid XML
  // -------------------------------------------------------------------------
  const sitemapValid =
    hasSitemap &&
    (sitemapXml.includes("<?xml") ||
      sitemapXml.includes("<urlset") ||
      sitemapXml.includes("<sitemapindex")) &&
    (sitemapXml.includes("<url>") || sitemapXml.includes("<sitemap>"));
  checks.push({
    name: "Sitemap is valid",
    status: sitemapValid ? "pass" : hasSitemap ? "warn" : "fail",
    score: sitemapValid ? 100 : 0,
    message: sitemapValid
      ? "The sitemap is valid XML with listed pages."
      : hasSitemap
        ? "The sitemap was found but does not look like valid XML with page entries."
        : "No sitemap to validate.",
    details: sitemapValid
      ? undefined
      : "A sitemap should be XML and list page URLs so search engines can read it.",
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
      : "A canonical tag tells search engines which version of a page is the main one and prevents duplicate-content problems.",
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
      : "The meta description is the snippet shown under your title in search results. Add one to improve click-through.",
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
        : "The H1 heading tells search engines and AI assistants the main topic of the page.",
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
          : `The page has ${h1Count} H1 headings. Use one H1 per page.`,
    details:
      h1Count > 1
        ? "Multiple H1 tags can confuse search engines about your main topic. Keep one H1 and demote the rest to H2."
        : undefined,
  });

  // -------------------------------------------------------------------------
  // Server-rendered content — SPA root with little server HTML is a risk
  // -------------------------------------------------------------------------
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const hasSubstantialContent = bodyText.length > 500;
  const hasSpaRoot =
    $("#root, #app, #__next, [data-reactroot]").length > 0;
  const jsRisk = hasSpaRoot && !hasSubstantialContent;
  checks.push({
    name: "Server-rendered content",
    status: jsRisk ? "warn" : "pass",
    score: jsRisk ? 40 : 100,
    message: jsRisk
      ? "The page may need JavaScript to show its content."
      : "The page content is readable in the server HTML.",
    details: jsRisk
      ? "A single-page-app shell was found with little text in the HTML. Search engines and AI assistants may not see content that only appears after JavaScript runs. Server-render the key content."
      : undefined,
  });

  // -------------------------------------------------------------------------
  // Weighted score (raw weights normalized to /100)
  // -------------------------------------------------------------------------
  const weighted: Array<[number, number]> = [
    [WEIGHTS.robotsTxt, checks[0].score],
    [WEIGHTS.crawlersAllowed, checks[1].score],
    [WEIGHTS.sitemap, checks[2].score],
    [WEIGHTS.sitemapValid, checks[3].score],
    [WEIGHTS.canonical, checks[4].score],
    [WEIGHTS.title, checks[5].score],
    [WEIGHTS.metaDescription, checks[6].score],
    [WEIGHTS.h1Present, checks[7].score],
    [WEIGHTS.h1Single, checks[8].score],
    [WEIGHTS.serverRendered, checks[9].score],
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
