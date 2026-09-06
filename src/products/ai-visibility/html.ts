/**
 * HTML artifact renderer for the AI Visibility Score.
 *
 * Turns an `AiVisibilityResult` into a clean, self-contained one-page HTML
 * document (inline CSS, no external deps, dark-on-light, printable) that Jacob
 * can send to a warm prospect as a door-opener.
 *
 * Claims discipline (hard rule, mirrors score.ts):
 *   - The citation probe is a SINGLE Gemini call. When it ran, the artifact
 *     attributes the result to Gemini by name ("Gemini named / did not name
 *     this business"). It must NEVER say a generic "AI tools won't recommend
 *     you" when the only thing probed was one Gemini call.
 *   - When the probe did NOT run, the artifact uses readiness language only
 *     ("the live AI-citation probe hasn't been run") — never an unproven
 *     claim about what AI does or doesn't recommend.
 */

import type { AiVisibilityResult, CitationProbe, Grade, MeasurementStatus } from "./contracts";

/** URL-safe slug for the artifact filename. */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "business"
  );
}

const GRADE_HEX: Record<Grade, string> = {
  A: "#137a3e",
  B: "#137a3e",
  C: "#9a6a00",
  D: "#9a6a00",
  F: "#b3261e",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Honest, Gemini-attributed probe line for the artifact.
 *
 * Returns explicit Gemini attribution when `probed` is true, and readiness-only
 * language when it is false. This is intentionally derived from the structured
 * `CitationProbe` fields (not the free-text `note`) so attribution is always
 * correct and never drifts into a generic "AI won't recommend you" claim.
 */
export function probeStatusLine(
  citation: CitationProbe,
  business: string,
  measurementStatus?: MeasurementStatus,
): string {
  const name = escapeHtml(business);
  if (!citation.probed) {
    if (measurementStatus === "unavailable") {
      return `A live Gemini citation check wasn't available for ${name}, and website readiness couldn't be measured on this run.`;
    }
    return `The live AI-citation probe hasn't been run yet for ${name}. This grade reflects AI readiness: how well AI can read and understand the site. Run the Gemini probe to confirm whether AI actually names ${name}.`;
  }
  if (citation.mentioned) {
    return `Gemini named ${name} when asked to recommend the best option. The site is showing up in a live AI answer today.`;
  }
  return `Gemini did not name ${name} when asked to recommend the best option. A competitor got the recommendation in the live AI answer.`;
}

/** Short status label used in the probe card heading. */
function probeStatusLabel(citation: CitationProbe): string {
  if (!citation.probed) return "Not run";
  return citation.mentioned ? "Named by Gemini" : "Not named by Gemini";
}

/**
 * Render an `AiVisibilityResult` into a self-contained one-page HTML document.
 * Pure function: same input -> same output, no IO, no env reads.
 */
export function renderAiVisibilityHtml(result: AiVisibilityResult): string {
  const measured = result.readinessMeasured ?? result.measurementStatus !== "unavailable";
  const accent = measured ? GRADE_HEX[result.grade] : "#6b7280";
  const business = escapeHtml(result.business);
  const url = result.url ? escapeHtml(result.url) : "";
  const verdict = escapeHtml(result.verdict);
  const topFix = escapeHtml(result.topFix);
  const probeLine = probeStatusLine(result.citation, result.business, result.measurementStatus);
  const probeLabel = probeStatusLabel(result.citation);

  const signalRows = result.signals
    .map((s) => {
      const mark = s.pass ? "&#10003;" : "&#10007;";
      const markClass = s.pass ? "pass" : "fail";
      return `        <li class="signal">
          <span class="mark ${markClass}">${mark}</span>
          <span class="signal-body">
            <span class="signal-label">${escapeHtml(s.label)}<span class="weight">${s.weight} pts</span></span>
            <span class="signal-detail">${escapeHtml(s.detail)}</span>
          </span>
        </li>`;
    })
    .join("\n");

  const signalsBlock = result.signals.length
    ? `      <ul class="signals">\n${signalRows}\n      </ul>`
    : `      <p class="muted">No site was scanned, so AI-readiness signals weren't measured. Add <code>--site=yourdomain.com</code> to check the site.</p>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI Visibility Score: ${business}</title>
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
  .page {
    max-width: 720px;
    margin: 32px auto;
    background: #ffffff;
    border: 1px solid #e3e6ea;
    border-radius: 14px;
    padding: 40px 44px;
  }
  .eyebrow {
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #6b7280;
    font-weight: 600;
    margin: 0 0 6px;
  }
  h1 { font-size: 26px; margin: 0; font-weight: 700; }
  .url { color: #6b7280; font-size: 14px; margin-top: 4px; }
  .grade-row {
    display: flex;
    align-items: center;
    gap: 20px;
    margin: 28px 0 8px;
    padding: 20px 24px;
    background: #fafbfc;
    border: 1px solid #e3e6ea;
    border-radius: 12px;
  }
  .grade {
    font-size: 64px;
    font-weight: 800;
    line-height: 1;
    color: ${accent};
  }
  .grade-meta { display: flex; flex-direction: column; gap: 2px; }
  .grade-meta .score { font-size: 22px; font-weight: 700; }
  .grade-meta .label { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #6b7280; }
  .verdict { font-size: 17px; font-weight: 600; margin: 22px 0 4px; }
  h2 {
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: #6b7280;
    font-weight: 600;
    margin: 30px 0 12px;
  }
  .signals { list-style: none; margin: 0; padding: 0; }
  .signal { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid #eef0f3; }
  .signal:first-child { border-top: none; }
  .mark { font-size: 16px; font-weight: 700; line-height: 1.5; flex: none; width: 18px; }
  .mark.pass { color: #137a3e; }
  .mark.fail { color: #b3261e; }
  .signal-body { display: flex; flex-direction: column; gap: 2px; }
  .signal-label { font-weight: 600; font-size: 15px; }
  .signal-label .weight { color: #9aa0a6; font-weight: 500; font-size: 12px; margin-left: 8px; }
  .signal-detail { color: #525860; font-size: 14px; }
  .card {
    border: 1px solid #e3e6ea;
    border-radius: 12px;
    padding: 18px 20px;
    background: #fafbfc;
  }
  .card .card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 6px; }
  .card .card-title { font-weight: 700; font-size: 15px; }
  .card .badge {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #6b7280;
    border: 1px solid #d7dbe0;
    border-radius: 999px;
    padding: 2px 10px;
    white-space: nowrap;
  }
  .card p { margin: 0; font-size: 14px; color: #3d434a; }
  .topfix {
    border-left: 4px solid ${accent};
    background: #fafbfc;
    border-radius: 0 10px 10px 0;
    padding: 16px 20px;
  }
  .topfix .topfix-label { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; color: #6b7280; font-weight: 600; }
  .topfix .topfix-body { font-size: 16px; font-weight: 600; margin-top: 4px; }
  .muted { color: #6b7280; font-size: 14px; }
  code { background: #eef0f3; border-radius: 4px; padding: 1px 5px; font-size: 13px; }
  footer {
    margin-top: 36px;
    padding-top: 18px;
    border-top: 1px solid #eef0f3;
    color: #9aa0a6;
    font-size: 12px;
    text-align: center;
  }
  footer a { color: #6b7280; text-decoration: none; }
  @media print {
    body { background: #ffffff; }
    .page { margin: 0; border: none; border-radius: 0; max-width: none; }
  }
</style>
</head>
<body>
  <main class="page">
    <p class="eyebrow">Strelva · AI Visibility Score</p>
    <h1>${business}</h1>
    ${url ? `<div class="url">${url}</div>` : ""}

    <div class="grade-row">
      <div class="grade">${measured ? result.grade : "?"}</div>
      <div class="grade-meta">
        <span class="score">${measured ? `${result.score}/100` : "Not measured"}</span>
        <span class="label">${measured ? "AI Visibility Grade" : "Measurement unavailable"}</span>
      </div>
    </div>

    <p class="verdict">${verdict}</p>

    <h2>AI readiness signals</h2>
${signalsBlock}

    <h2>Live AI citation probe</h2>
    <div class="card">
      <div class="card-head">
        <span class="card-title">Gemini citation probe</span>
        <span class="badge">${escapeHtml(probeLabel)}</span>
      </div>
      <p>${probeLine}</p>
    </div>

    <h2>Top fix</h2>
    <div class="topfix">
      <div class="topfix-label">Do this first</div>
      <div class="topfix-body">${topFix}</div>
    </div>

    <footer>
      Prepared by Strelva. <a href="https://strelva.com">strelva.com</a>
    </footer>
  </main>
</body>
</html>
`;
}
