/**
 * Benchmark orchestrator. Runs the active case set serially against the
 * agent-executor surface, evaluates each, prints a console summary, and
 * writes a Markdown report.
 *
 * Use the CLI in scripts/run-benchmark.ts to invoke this end-to-end.
 */

import path from "node:path";
import { CASES, getActiveCases, getPendingCases } from "./cases";
import { evaluateCase, type CaseGrade } from "./evaluator";
import {
  printConsoleSummary,
  renderMarkdown,
  summarize,
  writeReport,
} from "./reporter";
import {
  BENCHMARK_TENANT_ID,
  cleanupBenchmarkFixture,
  runCase,
  type CaseRun,
} from "./runner";

export interface BenchmarkOptions {
  /** Filter to only cases whose id starts with these prefixes. */
  filter?: string[];
  /** Reports directory; defaults to benchmarks/reports. */
  reportsDir?: string;
  /** Skip the actual report file write. */
  skipReportFile?: boolean;
  /** Override model name in the report metadata (the runner does not change models). */
  modelLabel?: string;
}

function shouldRun(caseId: string, filter?: string[]): boolean {
  if (!filter || filter.length === 0) return true;
  return filter.some((prefix) => caseId.startsWith(prefix));
}

export async function runBenchmark(options: BenchmarkOptions = {}): Promise<{
  reportPath: string | null;
  passing: number;
  total: number;
}> {
  const startedAt = new Date().toISOString();
  const active = getActiveCases().filter((c) => shouldRun(c.id, options.filter));
  const pending = getPendingCases();

  if (active.length === 0) {
    console.log("No active cases to run with the given filter.");
    return { reportPath: null, passing: 0, total: 0 };
  }

  console.log(`Running ${active.length} active case${active.length === 1 ? "" : "s"}…`);
  if (pending.length > 0) {
    console.log(
      `  (${pending.length} case${pending.length === 1 ? "" : "s"} marked pending and skipped — see benchmarks/cases.ts.)`,
    );
  }

  const combined: Array<{ caseDef: (typeof CASES)[number]; run: CaseRun; grade: CaseGrade }> = [];

  for (const caseDef of active) {
    process.stdout.write(`  · ${caseDef.id} ${caseDef.description}…`);
    const run = await runCase(caseDef);
    const grade = evaluateCase(caseDef, run);
    combined.push({ caseDef, run, grade });
    process.stdout.write(grade.pass ? " ✓\n" : ` ✗ (${grade.failures.length} fail)\n`);
  }

  await cleanupBenchmarkFixture();

  const summary = summarize(combined);
  printConsoleSummary(combined, summary);

  let reportPath: string | null = null;
  if (!options.skipReportFile) {
    const markdown = renderMarkdown(combined, summary, {
      startedAt,
      model: options.modelLabel ?? "gemini-2.5-flash",
      tenantId: BENCHMARK_TENANT_ID,
    });
    const reportsDir = options.reportsDir ?? path.join(process.cwd(), "benchmarks", "reports");
    reportPath = await writeReport(markdown, reportsDir, startedAt);
    console.log(`Report written to ${reportPath}`);
  }

  return {
    reportPath,
    passing: summary.passing,
    total: summary.totalCases,
  };
}
