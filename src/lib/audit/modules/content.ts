import type { AuditContext } from "../context";
import type { CategoryResult, CheckResult } from "../types";
import { averageCheckScores } from "../scoring";

// ---------------------------------------------------------------------------
// Content Quality
//
// Ported from OWSH Systems (`src/services/content-quality.js` →
// `auditContentQuality`). Reads ONLY from the shared AuditContext (no fetch).
// The /100 weighting below is the OWSH module's own scoring; we surface it as
// the category score and map each signal to a plain-English CheckResult.
// ---------------------------------------------------------------------------

const CTA_PHRASES = [
  "contact us",
  "get started",
  "learn more",
  "call now",
  "request quote",
  "free estimate",
  "book now",
  "schedule",
  "get in touch",
];

interface ContentAnalysis {
  wordCount: number;
  readingGrade: number;
  headings: { h1: number; h2: number; h3: number; total: number };
  keyPages: { hasAbout: boolean; hasServices: boolean; hasContact: boolean; hasBlog: boolean };
  links: { internal: number; external: number };
  images: { withAlt: number; withoutAlt: number; total: number };
  listCount: number;
  ctaCount: number;
}

function statusFor(score: number): CheckResult["status"] {
  if (score >= 80) return "pass";
  if (score >= 50) return "warn";
  return "fail";
}

function countSyllables(rawWord: string): number {
  const word = rawWord.toLowerCase().replace(/[^a-z]/g, "");
  if (word.length <= 3) return 1;
  const trimmed = word
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "");
  const matches = trimmed.match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

// Flesch-Kincaid grade level (clamped 0-18), matching the OWSH approximation.
function calculateReadingGrade(text: string): number {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (words.length === 0 || sentences.length === 0) return 0;
  const syllables = words.reduce((count, word) => count + countSyllables(word), 0);
  const grade =
    0.39 * (words.length / sentences.length) +
    11.8 * (syllables / words.length) -
    15.59;
  return Math.max(0, Math.min(18, Math.round(grade)));
}

function analyze(ctx: AuditContext): ContentAnalysis {
  const $ = ctx.$;

  // Visible MAIN-content text only. Mirror the OWSH content audit: drop scripts,
  // styles, and the page chrome (nav/header/footer/sidebars) so boilerplate does
  // not inflate the word count, then read the primary content region when one
  // exists (otherwise the body). A thin page with a big footer should read thin.
  const $clone = $.root().clone();
  $clone
    .find(
      "script, style, nav, header, footer, .nav, .navigation, .menu, .sidebar, .footer, .header"
    )
    .remove();
  const $main = $clone
    .find("main, article, .content, .main-content, #content, #main")
    .first();
  // cheerio.load always wraps parsed HTML in a body, so $bodyEl is the reliable
  // fallback (typed Cheerio<Element>, unlike the document-level clone root).
  const $bodyEl = $clone.find("body");
  const $textRoot = $main.length ? $main : $bodyEl;
  const rawText = $textRoot.text();
  const bodyText = rawText.replace(/\s+/g, " ").trim();
  const wordCount = bodyText.split(/\s+/).filter((w) => w.length > 0).length;

  // Headings.
  const h1 = $("h1").length;
  const h2 = $("h2").length;
  const h3 = $("h3").length;

  // Key-page nav links — by href OR by anchor text.
  const linkText = (sel: string) =>
    $("a")
      .toArray()
      .some((el) =>
        ($(el).text() || "").toLowerCase().includes(sel.toLowerCase())
      );
  const hasAbout = $('a[href*="about"]').length > 0 || linkText("about");
  const hasServices = $('a[href*="service"]').length > 0 || linkText("service");
  const hasContact = $('a[href*="contact"]').length > 0 || linkText("contact");
  const hasBlog =
    $('a[href*="blog"]').length > 0 ||
    $('a[href*="news"]').length > 0 ||
    linkText("blog") ||
    linkText("news");

  // Internal vs external links.
  let baseHost = "";
  try {
    baseHost = new URL(ctx.url).hostname;
  } catch {
    baseHost = "";
  }
  let internal = 0;
  let external = 0;
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      if (href.startsWith("/") || href.startsWith("#")) {
        internal++;
      } else if (href.startsWith("http")) {
        const linkHost = new URL(href).hostname;
        if (
          linkHost === baseHost ||
          linkHost === `www.${baseHost}` ||
          baseHost === `www.${linkHost}`
        ) {
          internal++;
        } else {
          external++;
        }
      }
    } catch {
      // invalid URL, skip
    }
  });

  // Image alt coverage.
  let withAlt = 0;
  let withoutAlt = 0;
  $("img").each((_, el) => {
    const alt = $(el).attr("alt");
    if (alt && alt.trim().length > 0) withAlt++;
    else withoutAlt++;
  });

  // Lists and CTA phrases.
  const listCount = $("ul, ol").length;
  const bodyLower = bodyText.toLowerCase();
  const ctaCount = CTA_PHRASES.filter((p) => bodyLower.includes(p)).length;

  return {
    wordCount,
    readingGrade: calculateReadingGrade(bodyText),
    headings: { h1, h2, h3, total: h1 + h2 + h3 },
    keyPages: { hasAbout, hasServices, hasContact, hasBlog },
    links: { internal, external },
    images: { withAlt, withoutAlt, total: withAlt + withoutAlt },
    listCount,
    ctaCount,
  };
}

// ---------------------------------------------------------------------------
// /100 scoring (OWSH weighting). Each block returns its earned points so the
// matching CheckResult can report a 0-100 score against that block's max.
// ---------------------------------------------------------------------------

function scoreWordCount(words: number): number {
  if (words >= 800) return 25;
  if (words >= 500) return 20;
  if (words >= 300) return 15;
  if (words >= 150) return 10;
  return 5;
}

function scoreHeadings(h: ContentAnalysis["headings"]): number {
  let s = 0;
  if (h.h1 === 1) s += 5;
  if (h.h2 >= 2) s += 5;
  if (h.total >= 3) s += 5;
  return s;
}

function scoreKeyPages(k: ContentAnalysis["keyPages"]): number {
  let s = 0;
  if (k.hasAbout) s += 5;
  if (k.hasServices) s += 5;
  if (k.hasContact) s += 5;
  if (k.hasBlog) s += 5;
  return s;
}

function scoreReading(grade: number): number {
  if (grade >= 6 && grade <= 10) return 10;
  if (grade < 6) return 8;
  return 5;
}

function scoreInternalLinks(internal: number): number {
  if (internal >= 10) return 10;
  if (internal >= 5) return 7;
  if (internal >= 2) return 4;
  return 0;
}

function scoreImageAlt(images: ContentAnalysis["images"]): number {
  if (images.total === 0) return 5; // neutral when no images
  return Math.round((images.withAlt / images.total) * 10);
}

function scoreLists(count: number): number {
  if (count >= 2) return 5;
  if (count >= 1) return 3;
  return 0;
}

function scoreCta(count: number): number {
  if (count >= 2) return 5;
  if (count >= 1) return 3;
  return 0;
}

export function checkContent(ctx: AuditContext): CategoryResult {
  const a = analyze(ctx);
  const checks: CheckResult[] = [];

  // Enough content (max 25).
  const wordScore = Math.round((scoreWordCount(a.wordCount) / 25) * 100);
  checks.push({
    name: "Enough content",
    status: statusFor(wordScore),
    score: wordScore,
    message:
      a.wordCount >= 800
        ? `Plenty of content on the page (${a.wordCount} words).`
        : a.wordCount >= 300
          ? `Decent amount of content (${a.wordCount} words). Aim for 800 or more.`
          : `Thin content (${a.wordCount} words). Aim for at least 300 words.`,
    details: `${a.wordCount} words`,
  });

  // Heading structure (max 15).
  const headingScore = Math.round((scoreHeadings(a.headings) / 15) * 100);
  checks.push({
    name: "Heading structure",
    status: statusFor(headingScore),
    score: headingScore,
    message:
      a.headings.h1 === 1 && a.headings.h2 >= 2 && a.headings.total >= 3
        ? "Clear heading structure with one H1 and supporting H2s."
        : a.headings.h1 === 0
          ? "No H1 heading found. Add one main page heading."
          : "Limited heading structure. Use H2 and H3 headings to organize the page.",
    details: `H1: ${a.headings.h1}, H2: ${a.headings.h2}, H3: ${a.headings.h3}`,
  });

  // Key pages linked (max 20).
  const keyScore = Math.round((scoreKeyPages(a.keyPages) / 20) * 100);
  const missing = [
    !a.keyPages.hasAbout ? "About" : null,
    !a.keyPages.hasServices ? "Services" : null,
    !a.keyPages.hasContact ? "Contact" : null,
    !a.keyPages.hasBlog ? "Blog" : null,
  ].filter(Boolean);
  checks.push({
    name: "Key pages linked",
    status: statusFor(keyScore),
    score: keyScore,
    message:
      missing.length === 0
        ? "Links to About, Services, Contact, and Blog are all present."
        : `Missing links to: ${missing.join(", ")}.`,
    details: `About: ${a.keyPages.hasAbout ? "yes" : "no"}, Services: ${a.keyPages.hasServices ? "yes" : "no"}, Contact: ${a.keyPages.hasContact ? "yes" : "no"}, Blog: ${a.keyPages.hasBlog ? "yes" : "no"}`,
  });

  // Readability (max 10).
  const readScore = Math.round((scoreReading(a.readingGrade) / 10) * 100);
  checks.push({
    name: "Readability",
    status: statusFor(readScore),
    score: readScore,
    message:
      a.readingGrade >= 6 && a.readingGrade <= 10
        ? `Reading level is easy to follow (grade ${a.readingGrade}).`
        : a.readingGrade < 6
          ? `Reading level is very simple (grade ${a.readingGrade}).`
          : `Reading level is high (grade ${a.readingGrade}). Consider simplifying.`,
    details: `Grade ${a.readingGrade}`,
  });

  // Internal links (max 10).
  const linkScore = Math.round((scoreInternalLinks(a.links.internal) / 10) * 100);
  checks.push({
    name: "Internal links",
    status: statusFor(linkScore),
    score: linkScore,
    message:
      a.links.internal >= 10
        ? `Strong internal linking (${a.links.internal} links).`
        : a.links.internal >= 2
          ? `Some internal linking (${a.links.internal} links). More helps visitors navigate.`
          : "Limited internal linking. Link to other relevant pages on the site.",
    details: `${a.links.internal} internal, ${a.links.external} external`,
  });

  // Image alt coverage (max 10).
  const altScore = Math.round((scoreImageAlt(a.images) / 10) * 100);
  checks.push({
    name: "Image alt coverage",
    status: statusFor(altScore),
    score: altScore,
    message:
      a.images.total === 0
        ? "No images found on the page."
        : a.images.withoutAlt === 0
          ? `All ${a.images.total} image(s) have alt text.`
          : `${a.images.withoutAlt} of ${a.images.total} image(s) missing alt text.`,
    details: `${a.images.withAlt} with alt, ${a.images.withoutAlt} without`,
  });

  // Content organization - lists (max 5).
  const listScore = Math.round((scoreLists(a.listCount) / 5) * 100);
  checks.push({
    name: "Organized with lists",
    status: statusFor(listScore),
    score: listScore,
    message:
      a.listCount >= 2
        ? `Content is organized with ${a.listCount} lists.`
        : a.listCount === 1
          ? "One list found. Lists help break up dense content."
          : "No lists found. Use bullet or numbered lists to organize content.",
    details: `${a.listCount} list(s)`,
  });

  // Clear calls to action (max 5).
  const ctaScore = Math.round((scoreCta(a.ctaCount) / 5) * 100);
  checks.push({
    name: "Clear calls to action",
    status: statusFor(ctaScore),
    score: ctaScore,
    message:
      a.ctaCount >= 2
        ? `Clear calls to action present (${a.ctaCount} found).`
        : a.ctaCount === 1
          ? "One call to action found. Add more to guide visitors to act."
          : "No clear call to action detected. Tell visitors what to do next.",
    details: `${a.ctaCount} CTA phrase(s)`,
  });

  // Category score = the OWSH /100 weighting (sum of earned points, capped 100).
  const totalPoints =
    scoreWordCount(a.wordCount) +
    scoreHeadings(a.headings) +
    scoreKeyPages(a.keyPages) +
    scoreReading(a.readingGrade) +
    scoreInternalLinks(a.links.internal) +
    scoreImageAlt(a.images) +
    scoreLists(a.listCount) +
    scoreCta(a.ctaCount);
  // Primary score is the OWSH /100 weighting. If the points model ever yields
  // nothing (e.g. an empty document with zero signals), fall back to the shared
  // averageCheckScores helper used by the other audit categories.
  const score =
    totalPoints > 0
      ? Math.min(100, totalPoints)
      : averageCheckScores(checks.map((c) => c.score));

  return {
    name: "Content Quality",
    slug: "content",
    weight: 0, // runner overrides
    score,
    checks,
  };
}
