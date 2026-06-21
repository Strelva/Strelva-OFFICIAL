import type { AuditContext } from "../context";
import type { CategoryResult, CheckResult } from "../types";
import { averageCheckScores } from "../scoring";

/**
 * Accessibility module — WCAG 2.1 AA cheerio checks.
 *
 * Ported from OWSH Systems' analyzeAccessibility (web/src/lib/accessibilityAnalysis.ts),
 * replacing Strelva's thin lang + alt-only check with 13 real DOM-based checks.
 *
 * Reads ONLY from ctx (ctx.$, the shared cheerio handle). No network calls.
 *
 * Scoring follows the OWSH weighting model: each underlying WCAG finding carries
 * a severity (critical / serious / moderate / pass) with weights
 * { critical: 0, serious: 0.5, moderate: 0.8, pass: 1.0 }. The category score is
 * (weightedSum / issueCount) * 100, and any critical issue caps the score at 60.
 * When there are no scored findings we fall back to averageCheckScores.
 */

type Severity = "critical" | "serious" | "moderate" | "pass";

const SEVERITY_WEIGHTS: Record<Severity, number> = {
  critical: 0,
  serious: 0.5,
  moderate: 0.8,
  pass: 1.0,
};

/** Internal WCAG finding, mirroring the OWSH issue list used for scoring. */
interface Finding {
  severity: Severity;
}

export function checkAccessibility(ctx: AuditContext): CategoryResult {
  const $ = ctx.$;
  const checks: CheckResult[] = [];
  // Each APPLICABLE check feeds the score: a pass or an issue. Checks for an
  // element type that is absent (no images/forms/iframes/tables) record nothing,
  // so a missing element neither helps nor hurts the score.
  const findings: Finding[] = [];

  const record = (severity: Severity): void => {
    findings.push({ severity });
  };

  // -------------------------------------------------------------------------
  // Check 1: Document language (WCAG 3.1.1, critical)
  // -------------------------------------------------------------------------
  const lang = ($("html").attr("lang") || "").trim();
  if (!lang) {
    record("critical");
    checks.push({
      name: "Document Language",
      status: "fail",
      score: 0,
      message: "The page is missing a lang attribute on the html tag.",
      details:
        "Add a language to the html tag, for example html lang=\"en\", so screen readers use the right pronunciation.",
    });
  } else {
    record("pass");
    checks.push({
      name: "Document Language",
      status: "pass",
      score: 100,
      message: `The page declares its language (${lang}).`,
    });
  }

  // -------------------------------------------------------------------------
  // Check 2: Page title (WCAG 2.4.2, critical / serious)
  // -------------------------------------------------------------------------
  const pageTitle = ($("title").first().text() || "").trim();
  if (!pageTitle) {
    record("critical");
    checks.push({
      name: "Page Title",
      status: "fail",
      score: 0,
      message: "The page has no title element.",
      details:
        "Add a descriptive title element in the head so screen readers and browser tabs can identify the page.",
    });
  } else if (
    pageTitle.length < 10 ||
    pageTitle === "Untitled" ||
    pageTitle === "Document"
  ) {
    record("serious");
    checks.push({
      name: "Page Title",
      status: "warn",
      score: 50,
      message: "The page title is generic or too short.",
      details: `Current title: "${pageTitle}". Use a unique, descriptive title that identifies the page content.`,
    });
  } else {
    record("pass");
    checks.push({
      name: "Page Title",
      status: "pass",
      score: 100,
      message: "The page has a descriptive title.",
    });
  }

  // -------------------------------------------------------------------------
  // Check 3: Image alt text (WCAG 1.1.1, critical for missing / serious for generic)
  // -------------------------------------------------------------------------
  const genericAltPatterns =
    /^(image|photo|picture|img|graphic|icon|logo|banner|placeholder|untitled|null|undefined|\d+|image\d+|img\d+)$/i;
  let totalImages = 0;
  const missingAltExamples: string[] = [];
  const genericAltExamples: string[] = [];

  $("img").each((_, el) => {
    totalImages++;
    const $el = $(el);
    const alt = $el.attr("alt");
    const src = $el.attr("src") || $el.attr("data-src") || "";
    if (alt === undefined) {
      if (missingAltExamples.length < 5) missingAltExamples.push(src || "img");
    } else if (alt !== "" && genericAltPatterns.test(alt.trim())) {
      if (genericAltExamples.length < 5) genericAltExamples.push(alt.trim());
    }
  });

  if (missingAltExamples.length > 0) {
    record("critical");
    checks.push({
      name: "Image Alt Text",
      status: "fail",
      score: 0,
      message: `${missingAltExamples.length} image(s) are missing an alt attribute.`,
      details: `Add alt text describing each image, or alt="" if decorative. Examples: ${missingAltExamples.join(", ")}.`,
    });
  } else if (genericAltExamples.length > 0) {
    record("serious");
    checks.push({
      name: "Image Alt Text",
      status: "warn",
      score: 50,
      message: `${genericAltExamples.length} image(s) use generic alt text.`,
      details: `Generic alt text provides no meaning. Replace values like: ${genericAltExamples.join(", ")}.`,
    });
  } else {
    // Only credit a pass when there were images to evaluate. A page with no
    // images has nothing to pass here, so (like forms/iframes/tables) it records
    // no scoring finding and just shows an informational check.
    if (totalImages > 0) record("pass");
    checks.push({
      name: "Image Alt Text",
      status: "pass",
      score: 100,
      message:
        totalImages > 0
          ? `All ${totalImages} image(s) have meaningful alt text.`
          : "No images found on the page.",
    });
  }

  // -------------------------------------------------------------------------
  // Check 4: Link text (WCAG 2.4.4, critical for empty / serious for generic)
  // -------------------------------------------------------------------------
  const genericLinkPatterns = /^(click here|here|click|this|link)$/i;
  let emptyLinks = 0;
  let genericLinks = 0;
  const genericLinkExamples: string[] = [];

  $("a[href]").each((_, el) => {
    const $el = $(el);
    const text = (
      $el.attr("aria-label") ||
      $el.text() ||
      $el.attr("title") ||
      $el.find("img").attr("alt") ||
      ""
    ).trim();
    if (!text) {
      emptyLinks++;
    } else if (genericLinkPatterns.test(text)) {
      genericLinks++;
      if (genericLinkExamples.length < 5) genericLinkExamples.push(text);
    }
  });

  if (emptyLinks > 0) {
    record("critical");
    checks.push({
      name: "Link Text",
      status: "fail",
      score: 0,
      message: `${emptyLinks} link(s) have no accessible text.`,
      details:
        "Add descriptive text or an aria-label to each link so screen reader users know where it goes.",
    });
  } else if (genericLinks > 0) {
    record("serious");
    checks.push({
      name: "Link Text",
      status: "warn",
      score: 50,
      message: `${genericLinks} link(s) use generic text like "click here".`,
      details: `Use text that describes the destination. Examples found: ${genericLinkExamples.join(", ")}.`,
    });
  } else {
    record("pass");
    checks.push({
      name: "Link Text",
      status: "pass",
      score: 100,
      message: "Links use descriptive text.",
    });
  }

  // -------------------------------------------------------------------------
  // Check 5: Form labels (WCAG 1.3.1, critical)
  // -------------------------------------------------------------------------
  let totalFields = 0;
  let unlabeledFields = 0;
  $(
    'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]), select, textarea',
  ).each((_, el) => {
    totalFields++;
    const $el = $(el);
    const id = $el.attr("id");
    const hasProperLabel =
      $el.attr("aria-label") ||
      $el.attr("aria-labelledby") ||
      (id && $(`label[for="${id}"]`).length > 0) ||
      $el.closest("label").length > 0;
    if (!hasProperLabel) unlabeledFields++;
  });

  if (totalFields === 0) {
    checks.push({
      name: "Form Labels",
      status: "pass",
      score: 100,
      message: "No form fields found on the page.",
    });
  } else if (unlabeledFields > 0) {
    record("critical");
    checks.push({
      name: "Form Labels",
      status: "fail",
      score: 0,
      message: `${unlabeledFields} of ${totalFields} form field(s) have no label.`,
      details:
        "Add a label element with a for attribute, or an aria-label, so users know what each field is for.",
    });
  } else {
    record("pass");
    checks.push({
      name: "Form Labels",
      status: "pass",
      score: 100,
      message: `All ${totalFields} form field(s) are labeled.`,
    });
  }

  // -------------------------------------------------------------------------
  // Check 6: Heading structure (WCAG 1.3.1, serious)
  //   Combines skipped levels + H1 presence/count into one check.
  // -------------------------------------------------------------------------
  // Walk all headings in document order, reading the tag name off each element
  // without depending on a domhandler type import.
  const orderedLevels: number[] = [];
  $("h1, h2, h3, h4, h5, h6").each((_, el) => {
    const name = ((el as { tagName?: string; name?: string }).tagName ||
      (el as { name?: string }).name ||
      "").toLowerCase();
    const level = parseInt(name[1] || "0", 10);
    if (level >= 1 && level <= 6) orderedLevels.push(level);
  });

  let lastLevel = 0;
  let skippedHeadings = 0;
  let h1Count = 0;
  for (const level of orderedLevels) {
    if (level === 1) h1Count++;
    if (lastLevel > 0 && level > lastLevel + 1) skippedHeadings++;
    lastLevel = level;
  }

  const headingProblems: string[] = [];
  if (skippedHeadings > 0) {
    headingProblems.push(`${skippedHeadings} skipped heading level(s)`);
  }
  if (h1Count === 0) {
    headingProblems.push("no H1 heading");
  } else if (h1Count > 1) {
    headingProblems.push(`${h1Count} H1 headings (expected one)`);
  }

  if (headingProblems.length === 0) {
    record("pass");
    checks.push({
      name: "Heading Structure",
      status: "pass",
      score: 100,
      message: "Headings follow a single, sequential structure.",
    });
  } else {
    record("serious");
    checks.push({
      name: "Heading Structure",
      status: "warn",
      score: 50,
      message: "The heading structure has problems.",
      details: `Fix the following: ${headingProblems.join("; ")}. Use one H1 and do not skip levels.`,
    });
  }

  // -------------------------------------------------------------------------
  // Check 7: Landmarks (WCAG 1.3.1, moderate)
  // -------------------------------------------------------------------------
  const landmarkDefs: Array<{ name: string; selector: string }> = [
    { name: "main", selector: 'main, [role="main"]' },
    { name: "nav", selector: 'nav, [role="navigation"]' },
    { name: "header", selector: 'header, [role="banner"]' },
    { name: "footer", selector: 'footer, [role="contentinfo"]' },
  ];
  const missingLandmarks = landmarkDefs.filter(
    (l) => $(l.selector).length === 0,
  );
  const hasMain = $('main, [role="main"]').length > 0;

  if (!hasMain) {
    record("moderate");
    checks.push({
      name: "Landmark Regions",
      status: "warn",
      score: 60,
      message: "The page has no main landmark.",
      details: missingLandmarks.length
        ? `Wrap the primary content in a main element. Also missing: ${missingLandmarks
            .map((l) => l.name)
            .filter((n) => n !== "main")
            .join(", ") || "none"}.`
        : "Wrap the primary content in a main element.",
    });
  } else {
    record("pass");
    checks.push({
      name: "Landmark Regions",
      status: "pass",
      score: 100,
      message: "The page uses a main landmark for navigation.",
    });
  }

  // -------------------------------------------------------------------------
  // Check 8: Skip-to-content link (WCAG 2.4.1, serious)
  // -------------------------------------------------------------------------
  let hasSkipLink = false;
  const firstLinks = $("a[href]").toArray().slice(0, 10);
  for (const link of firstLinks) {
    const $link = $(link);
    const href = $link.attr("href") || "";
    if (href.startsWith("#")) {
      const text = ($link.text() || $link.attr("aria-label") || "").toLowerCase();
      if (
        text.includes("skip") ||
        text.includes("main") ||
        text.includes("content")
      ) {
        hasSkipLink = true;
        break;
      }
    }
  }
  if (hasSkipLink) {
    record("pass");
    checks.push({
      name: "Skip Navigation Link",
      status: "pass",
      score: 100,
      message: "The page has a skip-to-content link.",
    });
  } else {
    record("serious");
    checks.push({
      name: "Skip Navigation Link",
      status: "warn",
      score: 50,
      message: "The page has no skip-to-content link.",
      details:
        "Add a 'Skip to main content' link at the top so keyboard users can bypass navigation.",
    });
  }

  // -------------------------------------------------------------------------
  // Check 9 + 10: Button names (WCAG 4.1.2, critical)
  //   Empty buttons + SVG-only icon buttons without a label, one check.
  // -------------------------------------------------------------------------
  let emptyButtons = 0;
  $('button, [role="button"], input[type="button"], input[type="submit"]').each(
    (_, el) => {
      const $el = $(el);
      const text = (
        $el.text() ||
        $el.attr("aria-label") ||
        $el.attr("title") ||
        $el.attr("value") ||
        ""
      ).trim();
      if (!text) emptyButtons++;
    },
  );

  let svgIconButtons = 0;
  $('a[href], button, [role="button"]').each((_, el) => {
    const $el = $(el);
    const hasSvg = $el.find("svg").length > 0;
    const hasText = !!$el.text()?.trim();
    if (hasSvg && !hasText) {
      const name = (
        $el.attr("aria-label") ||
        $el.attr("title") ||
        $el.find("svg title").text() ||
        ""
      ).trim();
      if (!name) svgIconButtons++;
    }
  });

  const namelessControls = emptyButtons + svgIconButtons;
  if (namelessControls > 0) {
    record("critical");
    checks.push({
      name: "Button and Control Names",
      status: "fail",
      score: 0,
      message: `${namelessControls} button(s) or icon control(s) have no accessible name.`,
      details:
        "Add text content or an aria-label to every button and icon-only control so screen readers can announce them.",
    });
  } else {
    record("pass");
    checks.push({
      name: "Button and Control Names",
      status: "pass",
      score: 100,
      message: "Buttons and icon controls have accessible names.",
    });
  }

  // -------------------------------------------------------------------------
  // Check 11: Iframe titles (WCAG 2.4.1, serious)
  // -------------------------------------------------------------------------
  let iframesWithoutTitle = 0;
  let totalIframes = 0;
  $("iframe").each((_, el) => {
    totalIframes++;
    const title = $(el).attr("title");
    if (!title || !title.trim()) iframesWithoutTitle++;
  });
  if (totalIframes === 0) {
    checks.push({
      name: "Iframe Titles",
      status: "pass",
      score: 100,
      message: "No iframes found on the page.",
    });
  } else if (iframesWithoutTitle > 0) {
    record("serious");
    checks.push({
      name: "Iframe Titles",
      status: "warn",
      score: 50,
      message: `${iframesWithoutTitle} of ${totalIframes} iframe(s) have no title.`,
      details:
        "Add a title attribute describing each iframe, for example title=\"YouTube video player\".",
    });
  } else {
    record("pass");
    checks.push({
      name: "Iframe Titles",
      status: "pass",
      score: 100,
      message: `All ${totalIframes} iframe(s) have titles.`,
    });
  }

  // -------------------------------------------------------------------------
  // Check 12: Valid ARIA roles (WCAG 4.1.2, serious)
  // -------------------------------------------------------------------------
  const validRoles = new Set([
    "alert", "alertdialog", "application", "article", "banner", "button", "cell",
    "checkbox", "columnheader", "combobox", "complementary", "contentinfo", "definition",
    "dialog", "directory", "document", "feed", "figure", "form", "grid", "gridcell",
    "group", "heading", "img", "link", "list", "listbox", "listitem", "log", "main",
    "marquee", "math", "menu", "menubar", "menuitem", "menuitemcheckbox", "menuitemradio",
    "navigation", "none", "note", "option", "presentation", "progressbar", "radio",
    "radiogroup", "region", "row", "rowgroup", "rowheader", "scrollbar", "search",
    "searchbox", "separator", "slider", "spinbutton", "status", "switch", "tab",
    "table", "tablist", "tabpanel", "term", "textbox", "timer", "toolbar", "tooltip",
    "tree", "treegrid", "treeitem",
  ]);
  let invalidRoles = 0;
  const invalidRoleExamples: string[] = [];
  $("[role]").each((_, el) => {
    const role = $(el).attr("role")?.toLowerCase().trim();
    if (role && !validRoles.has(role)) {
      invalidRoles++;
      if (invalidRoleExamples.length < 5) invalidRoleExamples.push(role);
    }
  });
  if (invalidRoles > 0) {
    record("serious");
    checks.push({
      name: "ARIA Roles",
      status: "warn",
      score: 50,
      message: `${invalidRoles} element(s) use an invalid ARIA role.`,
      details: `Assistive technology ignores invalid roles. Fix values like: ${invalidRoleExamples.join(", ")}.`,
    });
  } else {
    record("pass");
    checks.push({
      name: "ARIA Roles",
      status: "pass",
      score: 100,
      message: "ARIA roles are valid.",
    });
  }

  // -------------------------------------------------------------------------
  // Check 13: Data table headers (WCAG 1.3.1, serious)
  // -------------------------------------------------------------------------
  let tablesWithoutHeaders = 0;
  let totalDataTables = 0;
  $("table").each((_, el) => {
    const $el = $(el);
    const cellCount = $el.find("td").length;
    const headerCount = $el.find("th").length;
    if (cellCount > 2) {
      totalDataTables++;
      if (headerCount === 0) tablesWithoutHeaders++;
    }
  });
  if (totalDataTables === 0) {
    checks.push({
      name: "Table Headers",
      status: "pass",
      score: 100,
      message: "No data tables found on the page.",
    });
  } else if (tablesWithoutHeaders > 0) {
    record("serious");
    checks.push({
      name: "Table Headers",
      status: "warn",
      score: 50,
      message: `${tablesWithoutHeaders} of ${totalDataTables} data table(s) have no header cells.`,
      details:
        "Add th elements with a scope attribute so screen reader users can understand the table structure.",
    });
  } else {
    record("pass");
    checks.push({
      name: "Table Headers",
      status: "pass",
      score: 100,
      message: `All ${totalDataTables} data table(s) have header cells.`,
    });
  }

  // -------------------------------------------------------------------------
  // Category score: OWSH severity weighting + critical cap, else average.
  // -------------------------------------------------------------------------
  let score: number;
  if (findings.length > 0) {
    const weightedSum = findings.reduce(
      (sum, f) => sum + SEVERITY_WEIGHTS[f.severity],
      0,
    );
    score = Math.round((weightedSum / findings.length) * 100);
    if (findings.some((f) => f.severity === "critical")) {
      score = Math.min(score, 60);
    }
    score = Math.max(0, Math.min(100, score));
  } else {
    score = averageCheckScores(checks.map((c) => c.score));
  }

  return {
    name: "Accessibility",
    slug: "a11y",
    weight: 0, // runner overrides with the category weight
    score,
    checks,
  };
}
