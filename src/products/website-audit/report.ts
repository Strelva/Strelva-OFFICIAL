import type { AiVisibilityResult } from "@/products/ai-visibility/client";

const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);

/** Add the sampled Gemini finding without changing the website grade or API payload. */
export function withGeminiReportSection(html: string, result: AiVisibilityResult | null, unavailableNote?: string): string {
  const content = result
    ? `<h2>Gemini visibility for ${escape(result.business)}</h2><p>${result.citation.probed ? result.citation.mentioned ? "Gemini named the business." : "Gemini did not name the business." : "Gemini answer unavailable."}</p><p>${escape(result.citation.note)}</p>${result.measurementStatus === "partial" || result.measurementStatus === "unavailable" ? `<p>${escape(result.measurementNote || "Only part of this check completed.")}</p>` : ""}<p><strong>First fix:</strong> ${escape(result.topFix)}</p><p>One answer, sampled once. Asking again can give a different one. The full answer and claim-by-claim accuracy were not saved.</p>`
    : `<h2>Gemini visibility</h2><p>${escape(unavailableNote || "Gemini visibility was not included in this saved report.")}</p>`;
  const section = `<section aria-label="Gemini visibility">${content}</section>`;
  if (html.includes('<div class="cta">')) return html.replace('<div class="cta">', `${section}<div class="cta">`);
  if (html.includes("</main>")) return html.replace("</main>", `${section}</main>`);
  if (html.includes("</body>")) return html.replace("</body>", `${section}</body>`);
  return `${html}${section}`;
}
