/**
 * Visibility diagnosis: turn a measured snapshot into "what's wrong + what to do".
 *
 * The visibility cron measures where a business shows up (SERP organic, local
 * 3-pack, and whether AI assistants cite it). This turns that raw snapshot into
 * actionable findings + a compact summary the portfolio brain and the Mission
 * Control attention flags read from. Deterministic — no model call — so it's
 * free, fast, and stable. (A later phase can have the agent DRAFT the actual
 * on-site fix for a finding, approval-gated.)
 *
 * Self-contained to the platform's own measurement (serper.dev + Gemini probes).
 * Does NOT depend on any external local-SEO data product.
 */

import type { VisibilitySnapshot } from "./snapshots";

export type VisibilitySurface = "ai_answer" | "serp_organic" | "serp_local_pack";

export interface VisibilityFinding {
  query: string;
  surface: VisibilitySurface;
  /** Plain-English statement of the gap. */
  problem: string;
  /** Plain-English recommended fix. */
  recommendation: string;
  severity: "high" | "medium" | "low";
  /** Whether this is fixable from the site (on_site) or driven by GBP/reviews (off_site). */
  actionable: "on_site" | "off_site";
  /**
   * Plain-English "so what" — who this gap costs the business. Always present:
   * it needs no external number, just the query we already probed.
   */
  impact: string;
  /**
   * A conservative, honestly-labeled figure — ONLY when a real measured signal
   * exists in the snapshot. We deliberately do NOT fabricate a dollar/traffic
   * figure here: unlike the site-health audit (which multiplies against a
   * client's real GA4 traffic), a visibility probe carries no per-query search
   * volume, so inventing "$X/mo" would be dishonest. The one real number we DO
   * have is the competitors the probe actually named/ranked ahead of the tenant,
   * so that (and only that) becomes the quantified line. Undefined when the
   * probe named no rivals for this query — qualitative `impact` still stands.
   */
  quantified?: string;
}

export interface VisibilitySummary {
  checkedAt: string;
  /** AI-answer probes that actually ran (not skipped). */
  aiProbed: number;
  /** ...of which the business was cited in. */
  aiPresent: number;
  /** SERP queries actually checked. */
  serpChecked: number;
  /** ...ranking on page 1 (tenantPosition !== null). */
  serpRanked: number;
  /** ...present in the local 3-pack. */
  localPackPresent: number;
  problemCount: number;
  /** Short messages for the attention flags / dashboard headline. */
  topProblems: string[];
}

/**
 * A conservative quantified line from a REAL measured competitor count, or
 * undefined when the probe named no rivals for this query (so we never imply a
 * gap we didn't observe). e.g. `rivalCount(3, "named instead of you")` →
 * `"3 competitors named instead of you"`.
 */
function rivalCount(n: number, tail: string): string | undefined {
  if (n <= 0) return undefined;
  return `${n} ${n === 1 ? "competitor" : "competitors"} ${tail}`;
}

/**
 * A one-line, opportunity-framed verdict for the panel summary — the "so what"
 * above the ratio tiles. Leads with the AI-answer wedge when AI probes actually
 * ran (only probed answers count toward the denominator), falls back to the
 * SERP signal when no AI probe ran, and names the specific wedge-gap query from
 * a REAL finding — never an invented one. Returns null when nothing measured.
 */
export function visibilityHeadline(
  summary: VisibilitySummary,
  findings: VisibilityFinding[]
): string | null {
  if (summary.aiProbed > 0) {
    const noun = summary.aiProbed === 1 ? "AI answer" : "AI answers";
    if (summary.aiPresent >= summary.aiProbed) {
      const scope = summary.aiProbed === 1 ? "the" : `all ${summary.aiProbed}`;
      return `Cited in ${scope} ${noun} we probed. You're who the assistant names.`;
    }
    const wedge = findings.find((f) => f.surface === "ai_answer");
    const tail = wedge ? `. The wedge gap is "${wedge.query}".` : ".";
    return `Cited in ${summary.aiPresent} of ${summary.aiProbed} ${noun}${tail}`;
  }
  if (summary.serpChecked > 0) {
    if (summary.serpRanked >= summary.serpChecked) {
      return `On page 1 for all ${summary.serpChecked} ${summary.serpChecked === 1 ? "search" : "searches"} checked. Hold it and grow reviews.`;
    }
    const wedge = findings.find((f) => f.surface === "serp_organic");
    const tail = wedge ? `. Start with "${wedge.query}".` : ".";
    return `On page 1 for ${summary.serpRanked} of ${summary.serpChecked} searches checked${tail}`;
  }
  return null;
}

/**
 * AI-search presence is the differentiated wedge, so being absent from the AI
 * answer is the highest-severity gap; organic + local-pack gaps follow.
 */
export function diagnoseVisibility(snapshot: VisibilitySnapshot): VisibilityFinding[] {
  const findings: VisibilityFinding[] = [];

  for (const ai of snapshot.aiResults) {
    if (!ai.probed) continue;
    if (!ai.tenantMentioned) {
      const namedRivals = ai.competitors.filter((c) => c.mentioned).length;
      findings.push({
        query: ai.query,
        surface: "ai_answer",
        problem: `Not cited in the AI answer for "${ai.query}".`,
        recommendation: `Add a direct, factual answer to "${ai.query}" in your site copy or FAQ so AI assistants have something to quote. Clear, specific, first-person business facts get cited.`,
        severity: "high",
        actionable: "on_site",
        impact: `Customers who ask AI "${ai.query}" get pointed to someone else.`,
        quantified: rivalCount(namedRivals, "named instead of you"),
      });
    }
  }

  for (const serp of snapshot.serpResults) {
    if (serp.skipped) continue;

    if (serp.tenantPosition === null) {
      const rankingRivals = serp.competitors.filter((c) => c.position !== null).length;
      findings.push({
        query: serp.query,
        surface: "serp_organic",
        problem: `Not ranking on page 1 of Google for "${serp.query}".`,
        recommendation: `Target "${serp.query}" with a dedicated section or FAQ and clear, specific on-page copy that uses the phrase a customer would search.`,
        severity: "medium",
        actionable: "on_site",
        impact: `People searching "${serp.query}" on Google don't find you on page 1.`,
        quantified: rivalCount(rankingRivals, "ranking on page 1 where you're not"),
      });
    }

    if (!serp.tenantInLocalPack) {
      const packRivals = serp.competitors.filter((c) => c.inLocalPack).length;
      findings.push({
        query: serp.query,
        surface: "serp_local_pack",
        problem: `Not in the local 3-pack for "${serp.query}".`,
        recommendation: `Local-pack ranking is driven mostly by your Google Business Profile and reviews, not the site. Keep NAP consistent and grow reviews.`,
        severity: "medium",
        actionable: "off_site",
        impact: `You're missing from the Google map for "${serp.query}", where nearby customers look first.`,
        quantified: rivalCount(packRivals, "in the 3-pack where you're not"),
      });
    }
  }

  const order = { high: 0, medium: 1, low: 2 } as const;
  findings.sort((a, b) => order[a.severity] - order[b.severity]);
  return findings;
}

export function summarizeVisibility(snapshot: VisibilitySnapshot): VisibilitySummary {
  const aiProbedResults = snapshot.aiResults.filter((r) => r.probed);
  const aiProbed = aiProbedResults.length;
  const aiPresent = aiProbedResults.filter((r) => r.tenantMentioned).length;

  const serpChecked = snapshot.serpResults.filter((r) => !r.skipped);
  const serpRanked = serpChecked.filter((r) => r.tenantPosition !== null).length;
  const localPackPresent = serpChecked.filter((r) => r.tenantInLocalPack).length;

  const findings = diagnoseVisibility(snapshot);

  return {
    checkedAt: snapshot.checkedAt,
    aiProbed,
    aiPresent,
    serpChecked: serpChecked.length,
    serpRanked,
    localPackPresent,
    problemCount: findings.length,
    topProblems: findings.slice(0, 3).map((f) => f.problem),
  };
}
