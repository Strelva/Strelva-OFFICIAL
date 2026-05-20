/**
 * Benchmark reporter. Formats grades as a console summary and a Markdown
 * report. The Markdown report is the artifact you commit / diff between runs.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { BenchmarkCase } from "./cases";
import type { CaseGrade, CheckCategory, CheckResult } from "./evaluator";
import type { CaseRun } from "./runner";

/**
 * Public model pricing per 1M tokens (USD). Update when Google rates change.
 * Only used to estimate cost-per-resolved and per-case cost; the benchmark
 * does not depend on these numbers for any check.
 */
const MODEL_RATES: Record<string, { input: number; output: number }> = {
  "gemini-2.5-flash": { input: 0.075, output: 0.3 },
  "gemini-2.5-pro": { input: 1.25, output: 5.0 },
  "gemini-2.5-flash-lite": { input: 0.0375, output: 0.15 },
};

function costForUsage(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = MODEL_RATES[model];
  if (!rates) return 0;
  return (inputTokens * rates.input + outputTokens * rates.output) / 1_000_000;
}

function formatCost(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

const CATEGORY_LABEL: Record<CheckCategory, string> = {
  "tool-selection": "Tool selection",
  "tool-restraint": "Tool restraint",
  governance: "Governance",
  schema: "Schema",
  "state-change": "State change",
  "state-restraint": "State restraint",
  "response-content": "Response content",
  refusal: "Refusal / clarify",
  judge: "Judge (LLM)",
  "agent-runtime": "Agent runtime",
};

export interface BenchmarkSummary {
  totalCases: number;
  /** Cases the agent fully completed (all deterministic checks pass). */
  resolved: number;
  /** Cases where at least one judge rubric was evaluated. */
  judged: number;
  /** Of judged cases, how many passed all rubrics. */
  qualityPassing: number;
  /** Old binary "all checks pass" — for backward compat. */
  passing: number;
  failing: number;
  categories: Record<string, { resolved: number; total: number }>;
  difficulties: Record<"easy" | "medium" | "hard", { resolved: number; total: number }>;
  dimensions: Record<CheckCategory, { passing: number; failing: number }>;
  cost: {
    agentInputTokens: number;
    agentOutputTokens: number;
    agentCost: number;
    judgeInputTokens: number;
    judgeOutputTokens: number;
    judgeCost: number;
    totalCost: number;
    /** USD spent per resolved case. Infinity when 0 resolved. */
    costPerResolved: number;
  };
}

interface Combined {
  caseDef: BenchmarkCase;
  run: CaseRun;
  grade: CaseGrade;
}

export function summarize(
  combined: Combined[],
  agentModel: string,
): BenchmarkSummary {
  const summary: BenchmarkSummary = {
    totalCases: combined.length,
    resolved: 0,
    judged: 0,
    qualityPassing: 0,
    passing: 0,
    failing: 0,
    categories: {},
    difficulties: {
      easy: { resolved: 0, total: 0 },
      medium: { resolved: 0, total: 0 },
      hard: { resolved: 0, total: 0 },
    },
    dimensions: {
      "tool-selection": { passing: 0, failing: 0 },
      "tool-restraint": { passing: 0, failing: 0 },
      governance: { passing: 0, failing: 0 },
      schema: { passing: 0, failing: 0 },
      "state-change": { passing: 0, failing: 0 },
      "state-restraint": { passing: 0, failing: 0 },
      "response-content": { passing: 0, failing: 0 },
      refusal: { passing: 0, failing: 0 },
      judge: { passing: 0, failing: 0 },
      "agent-runtime": { passing: 0, failing: 0 },
    },
    cost: {
      agentInputTokens: 0,
      agentOutputTokens: 0,
      agentCost: 0,
      judgeInputTokens: 0,
      judgeOutputTokens: 0,
      judgeCost: 0,
      totalCost: 0,
      costPerResolved: Infinity,
    },
  };

  for (const { caseDef, run, grade } of combined) {
    if (grade.pass) summary.passing += 1;
    else summary.failing += 1;

    if (grade.resolved) summary.resolved += 1;
    if (grade.qualityPass !== null) {
      summary.judged += 1;
      if (grade.qualityPass) summary.qualityPassing += 1;
    }

    const cat = caseDef.category;
    if (!summary.categories[cat]) summary.categories[cat] = { resolved: 0, total: 0 };
    summary.categories[cat].total += 1;
    if (grade.resolved) summary.categories[cat].resolved += 1;

    const diff = summary.difficulties[caseDef.difficulty];
    diff.total += 1;
    if (grade.resolved) diff.resolved += 1;

    for (const check of grade.checks) {
      const dim = summary.dimensions[check.category];
      if (check.pass) dim.passing += 1;
      else dim.failing += 1;
    }

    // Cost aggregation. Agent and judge can use different models.
    if (run.agentUsage) {
      summary.cost.agentInputTokens += run.agentUsage.inputTokens;
      summary.cost.agentOutputTokens += run.agentUsage.outputTokens;
      summary.cost.agentCost += costForUsage(
        agentModel,
        run.agentUsage.inputTokens,
        run.agentUsage.outputTokens,
      );
    }
    if (grade.judgeUsage) {
      summary.cost.judgeInputTokens += grade.judgeUsage.inputTokens;
      summary.cost.judgeOutputTokens += grade.judgeUsage.outputTokens;
      summary.cost.judgeCost += costForUsage(
        grade.judgeUsage.judgeModel,
        grade.judgeUsage.inputTokens,
        grade.judgeUsage.outputTokens,
      );
    }
  }

  summary.cost.totalCost = summary.cost.agentCost + summary.cost.judgeCost;
  summary.cost.costPerResolved =
    summary.resolved > 0 ? summary.cost.totalCost / summary.resolved : Infinity;

  return summary;
}

function pct(passing: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((passing / total) * 100)}%`;
}

export function printConsoleSummary(
  combined: Combined[],
  summary: BenchmarkSummary,
): void {
  console.log("");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(
    `  Scaffold AI Benchmark — Resolved ${summary.resolved}/${summary.totalCases} (${pct(summary.resolved, summary.totalCases)})`,
  );
  if (summary.judged > 0) {
    console.log(
      `  Quality (judge): ${summary.qualityPassing}/${summary.judged} (${pct(summary.qualityPassing, summary.judged)})`,
    );
  }
  console.log("═══════════════════════════════════════════════════════════════");

  // Per-case
  for (const { caseDef, grade, run } of combined) {
    const resolvedIcon = grade.resolved ? "✓" : "✗";
    const resolvedColor = grade.resolved ? "\x1b[32m" : "\x1b[31m";
    const qualityIcon =
      grade.qualityPass === null ? " " : grade.qualityPass ? "★" : "·";
    const qualityColor = grade.qualityPass ? "\x1b[33m" : "\x1b[90m";
    const reset = "\x1b[0m";
    console.log(
      `${resolvedColor}${resolvedIcon}${reset}${qualityColor}${qualityIcon}${reset} [${caseDef.difficulty.padEnd(6)} ${caseDef.severity}] ${caseDef.id} — ${caseDef.description}  (${run.durationMs}ms)`,
    );
    for (const failure of grade.failures) {
      console.log(`    · ${CATEGORY_LABEL[failure.category]}: ${failure.name} — ${failure.detail}`);
    }
  }

  // Per-difficulty Resolved%
  console.log("");
  console.log("Resolved by difficulty:");
  for (const [diff, counts] of Object.entries(summary.difficulties)) {
    if (counts.total === 0) continue;
    console.log(
      `  ${diff.padEnd(8)} ${counts.resolved}/${counts.total}  ${pct(counts.resolved, counts.total)}`,
    );
  }

  // Per-category Resolved%
  console.log("");
  console.log("Resolved by category:");
  for (const [cat, counts] of Object.entries(summary.categories)) {
    console.log(
      `  ${cat.padEnd(22)} ${counts.resolved}/${counts.total}  ${pct(counts.resolved, counts.total)}`,
    );
  }

  // Per-dimension
  console.log("");
  console.log("Check dimensions:");
  for (const [dim, counts] of Object.entries(summary.dimensions)) {
    const total = counts.passing + counts.failing;
    if (total === 0) continue;
    console.log(
      `  ${CATEGORY_LABEL[dim as CheckCategory].padEnd(18)} ${counts.passing}/${total}  ${pct(counts.passing, total)}`,
    );
  }

  // Cost
  console.log("");
  console.log("Cost (Google AI):");
  console.log(
    `  Agent:           ${summary.cost.agentInputTokens}+${summary.cost.agentOutputTokens} tok = ${formatCost(summary.cost.agentCost)}`,
  );
  if (summary.cost.judgeCost > 0) {
    console.log(
      `  Judge:           ${summary.cost.judgeInputTokens}+${summary.cost.judgeOutputTokens} tok = ${formatCost(summary.cost.judgeCost)}`,
    );
  }
  console.log(`  Total:           ${formatCost(summary.cost.totalCost)}`);
  console.log(
    `  Per resolved:    ${summary.resolved > 0 ? formatCost(summary.cost.costPerResolved) : "n/a (0 resolved)"}`,
  );
  console.log("");
}

function renderCheckLine(check: CheckResult): string {
  const icon = check.pass ? "✅" : "❌";
  return `  ${icon} **${CATEGORY_LABEL[check.category]}** — ${check.name}: ${check.detail}`;
}

export function renderMarkdown(
  combined: Combined[],
  summary: BenchmarkSummary,
  meta: { startedAt: string; model: string; tenantId: string },
): string {
  const lines: string[] = [];
  lines.push(`# Scaffold AI Benchmark — ${meta.startedAt}`);
  lines.push("");
  lines.push(`## Headline`);
  lines.push("");
  lines.push(
    `**Resolved: ${summary.resolved} / ${summary.totalCases} (${pct(summary.resolved, summary.totalCases)})** — SWE-bench-style binary; deterministic checks only.`,
  );
  if (summary.judged > 0) {
    lines.push("");
    lines.push(
      `Quality (LLM judge): ${summary.qualityPassing} / ${summary.judged} (${pct(summary.qualityPassing, summary.judged)}) on cases with rubrics.`,
    );
  }
  lines.push("");
  lines.push(`- Agent model: \`${meta.model}\``);
  lines.push(`- Tenant: \`${meta.tenantId}\``);
  lines.push(`- Total cost: ${formatCost(summary.cost.totalCost)}`);
  lines.push(
    `- Cost per resolved: ${summary.resolved > 0 ? formatCost(summary.cost.costPerResolved) : "n/a"}`,
  );
  lines.push("");
  lines.push("## Resolved by difficulty");
  lines.push("");
  lines.push("| Difficulty | Resolved | Total | % |");
  lines.push("|---|---|---|---|");
  for (const [diff, counts] of Object.entries(summary.difficulties)) {
    if (counts.total === 0) continue;
    lines.push(
      `| ${diff} | ${counts.resolved} | ${counts.total} | ${pct(counts.resolved, counts.total)} |`,
    );
  }
  lines.push("");
  lines.push("## Resolved by category");
  lines.push("");
  lines.push("| Category | Resolved | Total | % |");
  lines.push("|---|---|---|---|");
  for (const [cat, counts] of Object.entries(summary.categories)) {
    lines.push(
      `| ${cat} | ${counts.resolved} | ${counts.total} | ${pct(counts.resolved, counts.total)} |`,
    );
  }
  lines.push("");
  lines.push("## Cost breakdown");
  lines.push("");
  lines.push("| Source | Input tokens | Output tokens | Cost |");
  lines.push("|---|---|---|---|");
  lines.push(
    `| Agent (\`${meta.model}\`) | ${summary.cost.agentInputTokens} | ${summary.cost.agentOutputTokens} | ${formatCost(summary.cost.agentCost)} |`,
  );
  if (summary.cost.judgeCost > 0) {
    lines.push(
      `| Judge | ${summary.cost.judgeInputTokens} | ${summary.cost.judgeOutputTokens} | ${formatCost(summary.cost.judgeCost)} |`,
    );
  }
  lines.push(
    `| **Total** | ${summary.cost.agentInputTokens + summary.cost.judgeInputTokens} | ${summary.cost.agentOutputTokens + summary.cost.judgeOutputTokens} | **${formatCost(summary.cost.totalCost)}** |`,
  );
  lines.push("");
  lines.push("## Per-dimension check pass rate");
  lines.push("");
  lines.push("| Dimension | Passing | Total | % |");
  lines.push("|---|---|---|---|");
  for (const [dim, counts] of Object.entries(summary.dimensions)) {
    const total = counts.passing + counts.failing;
    if (total === 0) continue;
    lines.push(
      `| ${CATEGORY_LABEL[dim as CheckCategory]} | ${counts.passing} | ${total} | ${pct(counts.passing, total)} |`,
    );
  }
  lines.push("");
  lines.push("## Per-case detail");
  lines.push("");

  for (const { caseDef, grade, run } of combined) {
    const resolvedIcon = grade.resolved ? "✅" : "❌";
    const qualityIcon =
      grade.qualityPass === null ? "—" : grade.qualityPass ? "✅" : "❌";
    lines.push(`### ${resolvedIcon} ${caseDef.id} — ${caseDef.description}`);
    lines.push("");
    lines.push(`- **Resolved:** ${grade.resolved ? "yes" : "no"}`);
    lines.push(`- **Quality (judge):** ${grade.qualityPass === null ? "n/a" : grade.qualityPass ? "pass" : "fail"} ${qualityIcon}`);
    lines.push(`- **Category:** ${caseDef.category}`);
    lines.push(`- **Difficulty:** ${caseDef.difficulty}`);
    lines.push(`- **Severity:** ${caseDef.severity}`);
    lines.push(`- **Prompt:** ${JSON.stringify(caseDef.prompt)}`);
    lines.push(`- **Duration:** ${run.durationMs}ms`);
    if (run.agentUsage) {
      lines.push(
        `- **Agent tokens:** ${run.agentUsage.inputTokens} in / ${run.agentUsage.outputTokens} out / ${run.agentUsage.totalTokens} total`,
      );
    }
    if (grade.judgeUsage) {
      lines.push(
        `- **Judge tokens (\`${grade.judgeUsage.judgeModel}\`):** ${grade.judgeUsage.inputTokens} in / ${grade.judgeUsage.outputTokens} out`,
      );
    }
    lines.push(`- **Finish reason:** ${run.finishReason}`);
    if (caseDef.notes) lines.push(`- **Notes:** ${caseDef.notes}`);
    lines.push("");
    lines.push("**Agent response:**");
    lines.push("```");
    lines.push(run.agentText || "(empty)");
    lines.push("```");
    lines.push("");
    lines.push("**Tool calls:**");
    if (run.toolCalls.length === 0) {
      lines.push("- (none)");
    } else {
      for (const call of run.toolCalls) {
        const status = call.success ? "ok" : "error";
        lines.push(
          `- step ${call.stepNumber}: \`${call.name}\` (${status})${call.error ? ` — ${call.error}` : ""}`,
        );
      }
    }
    lines.push("");
    lines.push("**Checks:**");
    if (grade.checks.length === 0) {
      lines.push("  (no checks defined)");
    } else {
      for (const check of grade.checks) {
        lines.push(renderCheckLine(check));
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export async function writeReport(
  markdown: string,
  reportsDir: string,
  startedAt: string,
): Promise<string> {
  await fs.mkdir(reportsDir, { recursive: true });
  const filename = `bench-${startedAt.replace(/[:.]/g, "-")}.md`;
  const fullPath = path.join(reportsDir, filename);
  await fs.writeFile(fullPath, markdown, "utf8");
  return fullPath;
}
