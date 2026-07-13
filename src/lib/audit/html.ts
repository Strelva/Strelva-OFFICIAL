/**
 * Sendable one-pager renderer for the site-health audit.
 *
 * Turns an `AuditResult` into a clean, self-contained one-page HTML document
 * (inline CSS, no external assets, print-friendly) that a prospect or client
 * can be sent or print to PDF. Modeled on the AI-Visibility artifact
 * (`src/lib/ai-visibility/html.ts`) for branding consistency: muted palette,
 * calm typography, no emojis, no em dashes, a single clear CTA.
 *
 * Pure function: same input -> same output, no IO, no env reads. Safe to call
 * from a public route that renders only the body it is given.
 */

import type { AuditResult, CategoryResult, CheckResult, LetterGrade } from "./types";
import { topFixes } from "./impact";

const GRADE_HEX: Record<LetterGrade, string> = {
  A: "#137a3e",
  B: "#137a3e",
  C: "#9a6a00",
  D: "#c1530f",
  F: "#b3261e",
};

const GRADE_VERDICT: Record<LetterGrade, string> = {
  A: "This site is in strong shape. A few refinements would keep it ahead of competitors.",
  B: "A solid site with clear room to gain ground. The fixes below are the fastest wins.",
  C: "This site is losing customers to avoidable issues. The fixes below are where to start.",
  D: "This site has real gaps that are costing visibility and trust right now. Address the items below first.",
  F: "This site is working against you. The issues below are turning visitors and search engines away today.",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function scoreHex(score: number): string {
  if (score >= 80) return "#137a3e";
  if (score >= 60) return "#9a6a00";
  if (score >= 40) return "#c1530f";
  return "#b3261e";
}

/** Format a host for display: strip protocol + trailing slash. */
function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

/** Look up the original check (for its `quantified` line) behind a top fix. */
function findCheck(
  categories: CategoryResult[],
  categoryName: string,
  checkName: string
): CheckResult | undefined {
  const cat = categories.find((c) => c.name === categoryName);
  return cat?.checks.find((c) => c.name === checkName);
}

/**
 * Render an `AuditResult` into a self-contained, sendable one-page HTML report.
 */
export function renderAuditReport(result: AuditResult): string {
  const accent = GRADE_HEX[result.grade] ?? "#9a6a00";
  const url = displayUrl(escapeHtml(result.url));
  const verdict = escapeHtml(GRADE_VERDICT[result.grade] ?? GRADE_VERDICT.C);

  let scannedDate = result.scannedAt;
  try {
    scannedDate = new Date(result.scannedAt).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    // fall back to the raw string
  }
  scannedDate = escapeHtml(scannedDate);

  // Score ring as a conic-gradient dial so it prints cleanly with no canvas/JS.
  const ringPct = Math.max(0, Math.min(100, result.overallScore));

  const fixes = topFixes(result.categories, 5);
  const fixRows = fixes
    .map((fix, i) => {
      const check = findCheck(result.categories, fix.category, fix.name);
      const quantified = check?.quantified
        ? `<span class="fix-cost">${escapeHtml(check.quantified)}</span>`
        : "";
      const impact = fix.impact
        ? `<p class="fix-impact">${escapeHtml(fix.impact)}</p>`
        : `<p class="fix-impact">${escapeHtml(fix.message)}</p>`;
      return `        <li class="fix">
          <span class="fix-rank">${i + 1}</span>
          <span class="fix-body">
            <span class="fix-head">
              <span class="fix-name">${escapeHtml(fix.name)}</span>
              <span class="fix-cat">${escapeHtml(fix.category)}</span>
            </span>
            ${impact}
            ${quantified}
          </span>
        </li>`;
    })
    .join("\n");

  const fixesBlock = fixes.length
    ? `      <ol class="fixes">\n${fixRows}\n      </ol>`
    : `      <p class="muted">No priority issues were found. This site already covers the fundamentals we check.</p>`;

  const categoryRows = result.categories
    .map((cat) => {
      const hex = scoreHex(cat.score);
      const pct = Math.max(0, Math.min(100, cat.score));
      return `        <li class="cat">
          <div class="cat-head">
            <span class="cat-name">${escapeHtml(cat.name)}</span>
            <span class="cat-score" style="color:${hex}">${cat.score}</span>
          </div>
          <div class="bar"><span class="bar-fill" style="width:${pct}%;background:${hex}"></span></div>
        </li>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Site Health Report — ${url}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: #f4f5f7;
    color: #1a1d21;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  h1, h2, .verdict, .grade-letter {
    font-family: "Spectral", Georgia, "Times New Roman", serif;
  }
  .page {
    max-width: 720px;
    margin: 32px auto;
    background: #ffffff;
    border: 1px solid #e3e6ea;
    border-radius: 14px;
    padding: 40px 44px;
  }
  .topbar { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
  .eyebrow {
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #6b7280;
    font-weight: 600;
    margin: 0;
  }
  .scanned { font-size: 12px; color: #9aa0a6; white-space: nowrap; }
  h1 { font-size: 27px; margin: 10px 0 0; font-weight: 600; }
  .url { color: #6b7280; font-size: 14px; margin-top: 4px; word-break: break-all; }
  .score-row {
    display: flex;
    align-items: center;
    gap: 26px;
    margin: 30px 0 4px;
    padding: 24px 26px;
    background: #fafbfc;
    border: 1px solid #e3e6ea;
    border-radius: 12px;
  }
  .ring {
    position: relative;
    width: 116px;
    height: 116px;
    flex: none;
    border-radius: 50%;
    background:
      conic-gradient(${accent} ${ringPct}%, #e7eaee ${ringPct}% 100%);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .ring::after {
    content: "";
    position: absolute;
    inset: 11px;
    background: #fafbfc;
    border-radius: 50%;
  }
  .ring-inner { position: relative; text-align: center; z-index: 1; }
  .ring-score { font-size: 32px; font-weight: 700; line-height: 1; color: #1a1d21; }
  .ring-of { font-size: 12px; color: #9aa0a6; margin-top: 2px; }
  .grade-block { display: flex; flex-direction: column; gap: 4px; }
  .grade-letter { font-size: 52px; font-weight: 700; line-height: 1; color: ${accent}; }
  .grade-label { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #6b7280; font-weight: 600; }
  .verdict { font-size: 17px; font-weight: 500; margin: 24px 0 4px; color: #2a2e33; }
  h2 {
    font-size: 13px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #6b7280;
    font-weight: 600;
    margin: 32px 0 14px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  }
  .fixes { list-style: none; margin: 0; padding: 0; counter-reset: fix; }
  .fix { display: flex; gap: 14px; padding: 14px 0; border-top: 1px solid #eef0f3; }
  .fix:first-child { border-top: none; }
  .fix-rank {
    flex: none;
    width: 26px; height: 26px;
    border-radius: 50%;
    background: ${accent};
    color: #ffffff;
    font-size: 13px;
    font-weight: 700;
    display: flex; align-items: center; justify-content: center;
    margin-top: 1px;
  }
  .fix-body { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .fix-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
  .fix-name { font-weight: 600; font-size: 15px; }
  .fix-cat { font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase; color: #9aa0a6; }
  .fix-impact { margin: 0; font-size: 14px; color: #4a5057; }
  .fix-cost {
    align-self: flex-start;
    font-size: 12px;
    font-weight: 600;
    color: #8a4a00;
    background: #fcf3e6;
    border: 1px solid #f0dcc0;
    border-radius: 999px;
    padding: 2px 10px;
  }
  .cats { list-style: none; margin: 0; padding: 0; }
  .cat { padding: 11px 0; border-top: 1px solid #eef0f3; }
  .cat:first-child { border-top: none; }
  .cat-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 7px; }
  .cat-name { font-size: 14px; font-weight: 500; color: #2a2e33; }
  .cat-score { font-size: 14px; font-weight: 700; }
  .bar { height: 7px; width: 100%; background: #eef0f3; border-radius: 999px; overflow: hidden; }
  .bar-fill { display: block; height: 100%; border-radius: 999px; }
  .muted { color: #6b7280; font-size: 14px; }
  .cta {
    margin-top: 34px;
    padding: 24px 26px;
    border: 1px solid #d7dbe0;
    border-radius: 12px;
    background: #fafbfc;
    text-align: center;
  }
  .cta-title { font-size: 17px; font-weight: 600; margin: 0; color: #1a1d21; }
  .cta-sub { font-size: 14px; color: #525860; margin: 8px auto 16px; max-width: 440px; }
  .cta-link {
    display: inline-block;
    font-size: 14px;
    font-weight: 600;
    color: #ffffff;
    background: #1a1d21;
    border-radius: 999px;
    padding: 11px 24px;
    text-decoration: none;
  }
  footer {
    margin-top: 30px;
    padding-top: 18px;
    border-top: 1px solid #eef0f3;
    color: #9aa0a6;
    font-size: 12px;
    text-align: center;
  }
  footer a { color: #6b7280; text-decoration: none; }
  @media print {
    body { background: #ffffff; }
    .page { margin: 0; border: none; border-radius: 0; max-width: none; padding: 24px 28px; }
    .ring { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .bar-fill, .fix-rank, .fix-cost, .cta-link { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <main class="page">
    <div class="topbar">
      <p class="eyebrow">Strelva · Site Health Report</p>
      <span class="scanned">Scanned ${scannedDate}</span>
    </div>
    <h1>Site Health Report</h1>
    <div class="url">${url}</div>

    <div class="score-row">
      <div class="ring">
        <div class="ring-inner">
          <div class="ring-score">${result.overallScore}</div>
          <div class="ring-of">out of 100</div>
        </div>
      </div>
      <div class="grade-block">
        <span class="grade-letter">${result.grade}</span>
        <span class="grade-label">Overall grade</span>
      </div>
    </div>

    <p class="verdict">${verdict}</p>

    <h2>Fix these first</h2>
${fixesBlock}

    <h2>Category scores</h2>
    <ul class="cats">
${categoryRows}
    </ul>

    <div class="cta">
      <p class="cta-title">We can do all of this for you.</p>
      <p class="cta-sub">Strelva builds and manages your site end to end — every issue in this report fixed, and kept that way. AI-powered updates, health monitoring, and a plain-English weekly report. You own your domain and content from day one.</p>
      <a class="cta-link" href="https://strelva.com/access-request?ref=audit-report">Let Strelva handle it</a>
    </div>

    <footer>
      Prepared by Strelva. <a href="https://strelva.com">strelva.com</a>
    </footer>
  </main>
</body>
</html>
`;
}
