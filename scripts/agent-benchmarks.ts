import { readFile } from "node:fs/promises";
import {
  agentBenchmarkCases,
  referenceAgentBenchmarkSubmissions,
  runAgentBenchmarkSuite,
  type AgentBenchmarkCase,
  type AgentBenchmarkSubmission,
} from "../src/lib/agent-benchmarks";

interface CliArgs {
  list: boolean;
  json: boolean;
  submissionPath?: string;
  liveTenant?: string;
  caseIds: string[];
  failUnder: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    list: false,
    json: false,
    caseIds: [],
    failUnder: 80,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--list") args.list = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--submission") args.submissionPath = argv[++i];
    else if (arg === "--live-tenant") args.liveTenant = argv[++i];
    else if (arg === "--case") args.caseIds.push(...argv[++i].split(",").map((value) => value.trim()).filter(Boolean));
    else if (arg === "--fail-under") args.failUnder = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`REB agent benchmark runner

Usage:
  pnpm bench:agent
  pnpm bench:agent -- --list
  pnpm bench:agent -- --submission .bench/agent-runs/latest.json
  REB_AGENT_BENCH_ALLOW_LIVE=1 pnpm bench:agent -- --live-tenant gldf --case reb-wellness-003

Options:
  --list                 Print benchmark cases
  --json                 Print machine-readable JSON
  --submission <path>    Grade a JSON file: { "runs": AgentBenchmarkSubmission[] }
  --live-tenant <id>     Run selected prompts through the real agent for an existing tenant
  --case <ids>           Comma-separated case ids to run or grade
  --fail-under <score>   Suite average floor, default 80
`);
}

function selectCases(caseIds: string[]): AgentBenchmarkCase[] {
  if (caseIds.length === 0) return agentBenchmarkCases;
  const selected = agentBenchmarkCases.filter((benchmarkCase) => caseIds.includes(benchmarkCase.id));
  const missing = caseIds.filter((caseId) => !selected.some((benchmarkCase) => benchmarkCase.id === caseId));
  if (missing.length) throw new Error(`Unknown benchmark case(s): ${missing.join(", ")}`);
  return selected;
}

async function readSubmission(path: string): Promise<AgentBenchmarkSubmission[]> {
  const raw = await readFile(path, "utf8");
  const parsed = JSON.parse(raw) as { runs?: AgentBenchmarkSubmission[] } | AgentBenchmarkSubmission[];
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.runs)) return parsed.runs;
  throw new Error(`Submission file must be an array or an object with a "runs" array: ${path}`);
}

async function runLiveTenant(cases: AgentBenchmarkCase[], tenantId: string): Promise<AgentBenchmarkSubmission[]> {
  if (process.env.REB_AGENT_BENCH_ALLOW_LIVE !== "1") {
    throw new Error("Live mode can mutate tenant data. Set REB_AGENT_BENCH_ALLOW_LIVE=1 to continue.");
  }
  if (
    (process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || process.env.SANITY_API_TOKEN) &&
    process.env.REB_AGENT_BENCH_ALLOW_REMOTE !== "1"
  ) {
    throw new Error("Sanity env is present. Set REB_AGENT_BENCH_ALLOW_REMOTE=1 only if you intend to benchmark against remote content.");
  }

  const { executeAgentPromptDetailed } = await import("../src/lib/agent-executor");
  const submissions: AgentBenchmarkSubmission[] = [];

  for (const benchmarkCase of cases) {
    const trace = await executeAgentPromptDetailed(tenantId, benchmarkCase.ownerPrompt);
    submissions.push({
      caseId: benchmarkCase.id,
      finalMessage: trace.text,
      toolCalls: trace.toolCalls.map((call) => ({
        name: call.name,
        input: call.input,
        output: call.output,
        status: call.success ? "ok" : "error",
        error: call.error,
      })),
      agentResult: trace.agentResult,
    });
  }

  return submissions;
}

function printList(cases: AgentBenchmarkCase[]) {
  for (const benchmarkCase of cases) {
    console.log(`${benchmarkCase.id}  ${benchmarkCase.vertical.padEnd(12)}  ${benchmarkCase.capability.padEnd(20)}  ${benchmarkCase.title}`);
  }
}

function printSummary(result: ReturnType<typeof runAgentBenchmarkSuite>) {
  console.log(`REB Agent Benchmarks: ${result.passedCases}/${result.totalCases} passed, avg ${result.averageScore}/100`);
  for (const grade of result.grades) {
    const mark = grade.pass ? "PASS" : "FAIL";
    console.log(`${mark} ${grade.caseId} ${grade.score}/100 ${grade.title}`);
    for (const failure of grade.criticalFailures) console.log(`  critical: ${failure}`);
    for (const issue of grade.issues.slice(0, 3)) console.log(`  issue: ${issue}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cases = selectCases(args.caseIds);

  if (args.list) {
    printList(cases);
    return;
  }

  const submissions = args.liveTenant
    ? await runLiveTenant(cases, args.liveTenant)
    : args.submissionPath
      ? await readSubmission(args.submissionPath)
      : referenceAgentBenchmarkSubmissions.filter((submission) => cases.some((benchmarkCase) => benchmarkCase.id === submission.caseId));

  const result = runAgentBenchmarkSuite({ cases, submissions, failUnder: args.failUnder });
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printSummary(result);
  }

  if (!result.pass) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
