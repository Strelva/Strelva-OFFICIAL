/**
 * Lead audit — the reusable core behind the full-audit CLI, the lead-magnet
 * page, and the internal lead-audit board. One URL in, a structured, graded
 * result out. Wraps the existing audit engine (`src/lib/audit`) — the same
 * checks that power `/audit` — including the schema/structured-data
 * AI-readiness category. No re-implementation, no live AI-search (we don't have
 * those APIs); everything here is deterministic from the site's markup.
 */

import { runAudit } from "@/lib/audit/checks";
import { computeOverallScore, scoreToGrade } from "@/lib/audit/scoring";
import type { AuditResult, CheckResult, LetterGrade } from "@/lib/audit/types";

/** One specific, actionable finding — what's wrong AND the exact fix, straight
 *  from the check (e.g. issue: "LocalBusiness schema is missing required
 *  field(s): address", fix: "Add address so AI tools can describe you"). This
 *  is the detail an agent needs to actually change the site. */
export interface LeadAuditFinding {
  category: string;
  name: string;
  status: "warn" | "fail";
  score: number;
  priority: NonNullable<CheckResult["priority"]>;
  /** The granular technical finding (check.message) — the exact problem. */
  issue: string;
  /** The specific fix instruction (check.details), when the check gives one. */
  fix?: string;
  /** Plain-English business impact, when quantified. */
  impact?: string;
  quantified?: string;
}

export interface LeadAuditResult {
  url: string;
  scannedAt: string;
  score: number;
  grade: LetterGrade;
  /** Per-category name → score, for at-a-glance status across leads. */
  categories: { name: string; slug: string; score: number }[];
  /** EVERY non-passing check, worst-first — the full "exactly what's wrong +
   *  how to fix it" list an agent acts on. */
  findings: LeadAuditFinding[];
  /** The full engine result, for the sendable HTML report. */
  full: AuditResult;
}

const PRIORITY_RANK: Record<NonNullable<CheckResult["priority"]>, number> = { high: 0, medium: 1, low: 2 };

/** Every non-passing check across all categories, worst-first, with its granular
 *  finding (issue) + exact fix. Shared by the CLI, the scan API, and the report. */
export function findingsFromCategories(categories: AuditResult["categories"]): LeadAuditFinding[] {
  return categories
    .flatMap((cat) => cat.checks.filter((c) => c.status !== "pass").map((c) => ({ cat, c })))
    .sort((a, b) => {
      const pa = PRIORITY_RANK[a.c.priority ?? "low"];
      const pb = PRIORITY_RANK[b.c.priority ?? "low"];
      if (pa !== pb) return pa - pb;
      if (a.c.status !== b.c.status) return a.c.status === "fail" ? -1 : 1;
      return a.c.score - b.c.score;
    })
    .map(({ cat, c }) => ({
      category: cat.name,
      name: c.name,
      status: c.status as "warn" | "fail",
      score: c.score,
      priority: c.priority ?? "low",
      issue: c.message,
      fix: c.details,
      impact: c.impact,
      quantified: c.quantified,
    }));
}

/** Run the full audit for one URL and shape it for lists, agents, and reports. */
export async function auditUrl(url: string): Promise<LeadAuditResult> {
  const categories = await runAudit(url);
  const score = computeOverallScore(categories);
  const grade = scoreToGrade(score);
  const full: AuditResult = { url, scannedAt: new Date().toISOString(), overallScore: score, grade, categories };

  return {
    url,
    scannedAt: full.scannedAt,
    score,
    grade,
    categories: categories.map((c) => ({ name: c.name, slug: c.slug, score: c.score })),
    findings: findingsFromCategories(categories),
    full,
  };
}

/** Audit many URLs with a small concurrency cap (external fetches + PageSpeed,
 *  so don't hammer). Failures resolve to null rather than sinking the batch. */
export async function auditUrls(
  urls: string[],
  opts: { concurrency?: number; onResult?: (r: LeadAuditResult | { url: string; error: string }) => void } = {},
): Promise<Array<LeadAuditResult | { url: string; error: string }>> {
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, 8));
  const queue = [...urls];
  const out: Array<LeadAuditResult | { url: string; error: string }> = [];

  async function worker() {
    for (;;) {
      const url = queue.shift();
      if (!url) return;
      let r: LeadAuditResult | { url: string; error: string };
      try {
        r = await auditUrl(url);
      } catch (e) {
        r = { url, error: e instanceof Error ? e.message : String(e) };
      }
      out.push(r);
      opts.onResult?.(r);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  // preserve input order
  const byUrl = new Map(out.map((r) => [r.url, r]));
  return urls.map((u) => byUrl.get(u)).filter(Boolean) as typeof out;
}
