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
 * AI-search presence is the differentiated wedge, so being absent from the AI
 * answer is the highest-severity gap; organic + local-pack gaps follow.
 */
export function diagnoseVisibility(snapshot: VisibilitySnapshot): VisibilityFinding[] {
  const findings: VisibilityFinding[] = [];

  for (const ai of snapshot.aiResults) {
    if (!ai.probed) continue;
    if (!ai.tenantMentioned) {
      findings.push({
        query: ai.query,
        surface: "ai_answer",
        problem: `Not cited in the AI answer for "${ai.query}".`,
        recommendation: `Add a direct, factual answer to "${ai.query}" in your site copy or FAQ so AI assistants have something to quote. Clear, specific, first-person business facts get cited.`,
        severity: "high",
        actionable: "on_site",
      });
    }
  }

  for (const serp of snapshot.serpResults) {
    if (serp.skipped) continue;

    if (serp.tenantPosition === null) {
      findings.push({
        query: serp.query,
        surface: "serp_organic",
        problem: `Not ranking on page 1 of Google for "${serp.query}".`,
        recommendation: `Target "${serp.query}" with a dedicated section or FAQ and clear, specific on-page copy that uses the phrase a customer would search.`,
        severity: "medium",
        actionable: "on_site",
      });
    }

    if (!serp.tenantInLocalPack) {
      findings.push({
        query: serp.query,
        surface: "serp_local_pack",
        problem: `Not in the local 3-pack for "${serp.query}".`,
        recommendation: `Local-pack ranking is driven mostly by your Google Business Profile and reviews, not the site — keep NAP consistent and grow reviews.`,
        severity: "medium",
        actionable: "off_site",
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
