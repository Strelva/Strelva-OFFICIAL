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

export interface LeadAuditFix {
  title: string;
  category: string;
  detail: string;
  quantified?: string;
  priority: NonNullable<CheckResult["priority"]>;
}

export interface LeadAuditResult {
  url: string;
  scannedAt: string;
  score: number;
  grade: LetterGrade;
  /** Per-category name → score, for at-a-glance status across leads. */
  categories: { name: string; slug: string; score: number }[];
  /** Worst-first prioritized fixes across all categories. */
  topFixes: LeadAuditFix[];
  /** The full engine result, for the sendable HTML report. */
  full: AuditResult;
}

const PRIORITY_RANK: Record<NonNullable<CheckResult["priority"]>, number> = { high: 0, medium: 1, low: 2 };

/** Run the full audit for one URL and shape it for lists, agents, and reports. */
export async function auditUrl(url: string, limitFixes = 6): Promise<LeadAuditResult> {
  const categories = await runAudit(url);
  const score = computeOverallScore(categories);
  const grade = scoreToGrade(score);
  const full: AuditResult = { url, scannedAt: new Date().toISOString(), overallScore: score, grade, categories };

  const topFixes: LeadAuditFix[] = categories
    .flatMap((cat) => cat.checks.filter((c) => c.status !== "pass").map((c) => ({ cat, c })))
    .sort((a, b) => {
      const pa = PRIORITY_RANK[a.c.priority ?? "low"];
      const pb = PRIORITY_RANK[b.c.priority ?? "low"];
      if (pa !== pb) return pa - pb;
      if (a.c.status !== b.c.status) return a.c.status === "fail" ? -1 : 1;
      return a.c.score - b.c.score;
    })
    .slice(0, limitFixes)
    .map(({ cat, c }) => ({
      title: c.name,
      category: cat.name,
      detail: c.impact || c.message,
      quantified: c.quantified,
      priority: c.priority ?? "low",
    }));

  return {
    url,
    scannedAt: full.scannedAt,
    score,
    grade,
    categories: categories.map((c) => ({ name: c.name, slug: c.slug, score: c.score })),
    topFixes,
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
