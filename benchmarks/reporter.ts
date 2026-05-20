/**
 * Benchmark reporter. Formats grades as a console summary and a Markdown
 * report. The Markdown report is the artifact you commit / diff between runs.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { BenchmarkCase } from "./cases";
import type { CaseGrade, CheckCategory, CheckResult } from "./evaluator";
import type { CaseRun } from "./runner";

const CATEGORY_LABEL: Record<CheckCategory, string> = {
  "tool-selection": "Tool selection",
  "tool-restraint": "Tool restraint",
  governance: "Governance",
  schema: "Schema",
  "state-change": "State change",
  "state-restraint": "State restraint",
  "response-content": "Response content",
  refusal: "Refusal / clarify",
  "agent-runtime": "Agent runtime",
};

export interface BenchmarkSummary {
  totalCases: number;
  passing: number;
  failing: number;
  categories: Record<string, { passing: number; failing: number }>;
  dimensions: Record<CheckCategory, { passing: number; failing: number }>;
}

interface Combined {
  caseDef: BenchmarkCase;
  run: CaseRun;
  grade: CaseGrade;
}

export function summarize(combined: Combined[]): BenchmarkSummary {
  const summary: BenchmarkSummary = {
    totalCases: combined.length,
    passing: 0,
    failing: 0,
    categories: {},
    dimensions: {
      "tool-selection": { passing: 0, failing: 0 },
      "tool-restraint": { passing: 0, failing: 0 },
      governance: { passing: 0, failing: 0 },
      schema: { passing: 0, failing: 0 },
      "state-change": { passing: 0, failing: 0 },
      "state-restraint": { passing: 0, failing: 0 },
      "response-content": { passing: 0, failing: 0 },
      refusal: { passing: 0, failing: 0 },
      "agent-runtime": { passing: 0, failing: 0 },
    },
  };

  for (const { caseDef, grade } of combined) {
    if (grade.pass) summary.passing += 1;
    else summary.failing += 1;

    const cat = caseDef.category;
    if (!summary.categories[cat]) summary.categories[cat] = { passing: 0, failing: 0 };
    if (grade.pass) summary.categories[cat].passing += 1;
    else summary.categories[cat].failing += 1;

    for (const check of grade.checks) {
      const dim = summary.dimensions[check.category];
      if (check.pass) dim.passing += 1;
      else dim.failing += 1;
    }
  }
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
  console.log(`  Scaffold AI Benchmark — ${summary.passing}/${summary.totalCases} pass (${pct(summary.passing, summary.totalCases)})`);
  console.log("═══════════════════════════════════════════════════════════════");

  // Per-case
  for (const { caseDef, grade, run } of combined) {
    const icon = grade.pass ? "✓" : "✗";
    const color = grade.pass ? "\x1b[32m" : "\x1b[31m";
    const reset = "\x1b[0m";
    console.log(
      `${color}${icon}${reset} [${caseDef.severity}] ${caseDef.id} — ${caseDef.description}  (${run.durationMs}ms)`,
    );
    for (const failure of grade.failures) {
      console.log(`    · ${CATEGORY_LABEL[failure.category]}: ${failure.name} — ${failure.detail}`);
    }
  }

  // Per-dimension
  console.log("");
  console.log("Dimensions:");
  for (const [dim, counts] of Object.entries(summary.dimensions)) {
    const total = counts.passing + counts.failing;
    if (total === 0) continue;
    console.log(`  ${CATEGORY_LABEL[dim as CheckCategory].padEnd(18)} ${counts.passing}/${total}  ${pct(counts.passing, total)}`);
  }

  // Per-category
  console.log("");
  console.log("Categories:");
  for (const [cat, counts] of Object.entries(summary.categories)) {
    const total = counts.passing + counts.failing;
    console.log(`  ${cat.padEnd(22)} ${counts.passing}/${total}  ${pct(counts.passing, total)}`);
  }
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
  lines.push(`- Cases run: **${summary.totalCases}**`);
  lines.push(`- Passing: **${summary.passing} (${pct(summary.passing, summary.totalCases)})**`);
  lines.push(`- Failing: **${summary.failing}**`);
  lines.push(`- Model: \`${meta.model}\``);
  lines.push(`- Tenant: \`${meta.tenantId}\``);
  lines.push("");
  lines.push("## Per-dimension pass rate");
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
  lines.push("## Per-category pass rate");
  lines.push("");
  lines.push("| Category | Passing | Total | % |");
  lines.push("|---|---|---|---|");
  for (const [cat, counts] of Object.entries(summary.categories)) {
    const total = counts.passing + counts.failing;
    lines.push(`| ${cat} | ${counts.passing} | ${total} | ${pct(counts.passing, total)} |`);
  }
  lines.push("");
  lines.push("## Per-case detail");
  lines.push("");

  for (const { caseDef, grade, run } of combined) {
    const icon = grade.pass ? "✅" : "❌";
    lines.push(`### ${icon} ${caseDef.id} — ${caseDef.description}`);
    lines.push("");
    lines.push(`- **Category:** ${caseDef.category}`);
    lines.push(`- **Severity:** ${caseDef.severity}`);
    lines.push(`- **Prompt:** ${JSON.stringify(caseDef.prompt)}`);
    lines.push(`- **Duration:** ${run.durationMs}ms`);
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
