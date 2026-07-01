/**
 * Issue prioritization — turns an `AuditResult` into a single ranked action
 * list for Jacob / super-admins.
 *
 * Ported (and de-scoped) from the archived OWSH Systems issue-prioritization
 * engine: same impact/effort intent, but it ranks the checks the audit already
 * produced rather than re-modeling revenue (revenue impact is intentionally
 * out of scope). Pure transform over `AuditResult` — adds NO store and NO cron;
 * audit history stays owned by `scan.ts` / `scan-store.ts`.
 *
 * This is an ADMIN surface. The client dashboard shows positive health numbers;
 * the raw failing/warning issues live here, admin-side, per the product rule.
 *
 * Relationship to `impact.ts` `topFixes`: `topFixes` is the lighter,
 * client-facing "Fix these first" list (flatten non-passing checks, worst score
 * first) used on the public audit + client health card. `prioritizeIssues` is
 * the richer ADMIN sibling — it adds priority bands + counts and a composite
 * score (status × explicit priority × category weight × severity). Kept
 * separate on purpose: different surface, different audience, different shape.
 */

import type { AuditResult, CategoryResult, CheckResult, CheckStatus } from "./types";

export type IssuePriority = "high" | "medium" | "low";

export interface PrioritizedIssue {
  category: string;
  categorySlug: string;
  check: string;
  status: Extract<CheckStatus, "warn" | "fail">;
  message: string;
  details?: string;
  /** Plain-English "what this costs you", when the check carries it. */
  impact?: string;
  quantified?: string;
  priority: IssuePriority;
  /** Composite ranking score — higher means fix sooner. */
  score: number;
}

export interface PrioritizedActionList {
  issues: PrioritizedIssue[];
  highCount: number;
  mediumCount: number;
  lowCount: number;
  /** Total failing + warning checks considered. */
  total: number;
}

const PRIORITY_WEIGHT: Record<IssuePriority, number> = { high: 3, medium: 2, low: 1 };

/** A check's priority, falling back to status when the module didn't set one. */
function resolvePriority(check: CheckResult): IssuePriority {
  if (check.priority) return check.priority;
  return check.status === "fail" ? "high" : "medium";
}

function scoreIssue(check: CheckResult, category: CategoryResult): number {
  const statusWeight = check.status === "fail" ? 2 : 1;
  const priorityWeight = PRIORITY_WEIGHT[resolvePriority(check)];
  // Category weight nudges cross-category ties; a low check score (further from
  // 100) means a worse problem, so it ranks higher.
  const categoryFactor = 0.5 + Math.max(0, Math.min(1, category.weight));
  const severity = 0.5 + (1 - Math.max(0, Math.min(100, check.score)) / 100);
  return Math.round(statusWeight * priorityWeight * categoryFactor * severity * 100) / 100;
}

/**
 * Rank every failing/warning check across an audit into one ordered list,
 * high-impact first. Passing checks are excluded.
 */
export function prioritizeIssues(audit: AuditResult): PrioritizedActionList {
  const issues: PrioritizedIssue[] = [];

  for (const category of audit.categories) {
    for (const check of category.checks) {
      if (check.status === "pass") continue;
      issues.push({
        category: category.name,
        categorySlug: category.slug,
        check: check.name,
        status: check.status,
        message: check.message,
        details: check.details,
        impact: check.impact,
        quantified: check.quantified,
        priority: resolvePriority(check),
        score: scoreIssue(check, category),
      });
    }
  }

  issues.sort((a, b) => b.score - a.score);

  return {
    issues,
    highCount: issues.filter((i) => i.priority === "high").length,
    mediumCount: issues.filter((i) => i.priority === "medium").length,
    lowCount: issues.filter((i) => i.priority === "low").length,
    total: issues.length,
  };
}
