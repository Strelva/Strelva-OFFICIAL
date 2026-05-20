/**
 * Benchmark runner. Sets up the benchmark tenant, seeds a fixture, runs the
 * agent against a single prompt, captures the tool trace plus the live
 * content diff, and returns a structured result.
 *
 * Hermetic-ish: every case starts from a freshly written
 * `dev-content-benchmark.json` and runs against a known tenant config. The
 * runner deliberately uses the dev-file storage path (no Sanity, no Redis
 * required) so it can run anywhere a Google API key is available.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { ContentMap, ContentSection } from "../src/lib/types";
import type { BenchmarkCase } from "./cases";
import { buildFixture } from "./fixtures";

export const BENCHMARK_TENANT_ID = "benchmark";

interface RawToolCall {
  name: string;
  input: unknown;
  output?: unknown;
  error?: string;
  success: boolean;
  stepNumber: number;
}

export interface AgentUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface CaseRun {
  caseId: string;
  status: "ok" | "agent-threw";
  durationMs: number;
  agentText: string;
  finishReason: string;
  toolCalls: RawToolCall[];
  contentBefore: ContentMap;
  contentAfter: ContentMap;
  agentUsage?: AgentUsage;
  errorMessage?: string;
}

function devContentPath(): string {
  return path.join(process.cwd(), `dev-content-${BENCHMARK_TENANT_ID}.json`);
}

function devTenantsPath(): string {
  return path.join(process.cwd(), "dev-tenants.json");
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

/**
 * Register a synthetic "benchmark" tenant in dev-tenants.json if it isn't
 * already there. Idempotent. Preserves existing tenants.
 */
export async function ensureBenchmarkTenant(): Promise<void> {
  const existing = await readJson<Array<{ id?: string }>>(devTenantsPath(), []);
  if (existing.some((t) => t?.id === BENCHMARK_TENANT_ID)) return;

  const tenant = {
    id: BENCHMARK_TENANT_ID,
    subdomain: BENCHMARK_TENANT_ID,
    siteName: "Benchmark Studio",
    ownerName: "Benchmark Owner",
    ownerEmail: "benchmark@example.com",
    industry: "wellness",
    template: "wellness",
    active: true,
    createdAt: "2026-01-01",
    deliveryModel: "platform_template",
    // autoPublish intentionally unset so the governance heuristics decide.
  };

  await writeJson(devTenantsPath(), [...existing, tenant]);
}

export async function seedFixture(caseDef: BenchmarkCase): Promise<ContentMap> {
  const content = buildFixture(caseDef.fixture);
  await writeJson(devContentPath(), content);
  return content;
}

export async function readCurrentContent(): Promise<ContentMap> {
  return readJson<ContentMap>(devContentPath(), {} as ContentMap);
}

export async function cleanupBenchmarkFixture(): Promise<void> {
  try {
    await fs.unlink(devContentPath());
  } catch {
    // ignore — file may not exist
  }
}

/**
 * Run a single case end-to-end.
 *
 * NOTE: agent-executor is imported lazily so that any env-var manipulation
 * done by the caller (clearing Sanity vars to force dev-file mode) is in
 * effect before the storage layer's `hasSanity` constant is evaluated.
 */
export async function runCase(caseDef: BenchmarkCase): Promise<CaseRun> {
  await ensureBenchmarkTenant();
  const contentBefore = await seedFixture(caseDef);

  const started = Date.now();
  let agentText = "";
  let finishReason = "unknown";
  let toolCalls: RawToolCall[] = [];
  let agentUsage: AgentUsage | undefined;
  let status: "ok" | "agent-threw" = "ok";
  let errorMessage: string | undefined;

  try {
    const { executeAgentPromptDetailed } = await import("../src/lib/agent-executor");
    const trace = await executeAgentPromptDetailed(
      BENCHMARK_TENANT_ID,
      caseDef.prompt,
    );
    agentText = trace.text;
    finishReason = trace.finishReason;
    toolCalls = trace.toolCalls.map((call) => ({
      name: call.name,
      input: call.input,
      output: call.output,
      error: call.error,
      success: call.success,
      stepNumber: call.stepNumber,
    }));
    if (trace.usage) {
      agentUsage = {
        inputTokens: trace.usage.inputTokens,
        outputTokens: trace.usage.outputTokens,
        totalTokens: trace.usage.totalTokens,
      };
    }
  } catch (err) {
    status = "agent-threw";
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Date.now() - started;
  const contentAfter = await readCurrentContent();

  return {
    caseId: caseDef.id,
    status,
    durationMs,
    agentText,
    finishReason,
    toolCalls,
    contentBefore,
    contentAfter,
    agentUsage,
    errorMessage,
  };
}

/**
 * Compute which fields differ between two section snapshots. Returns the
 * names of top-level fields whose JSON values changed.
 */
export function diffSectionFields(
  before: unknown,
  after: unknown,
): string[] {
  if (!before || !after) return [];
  if (typeof before !== "object" || typeof after !== "object") return [];
  const beforeRec = before as Record<string, unknown>;
  const afterRec = after as Record<string, unknown>;
  const keys = new Set([...Object.keys(beforeRec), ...Object.keys(afterRec)]);
  const diffs: string[] = [];
  for (const key of keys) {
    if (JSON.stringify(beforeRec[key]) !== JSON.stringify(afterRec[key])) {
      diffs.push(key);
    }
  }
  return diffs;
}

export function sectionDiffer(
  before: ContentMap,
  after: ContentMap,
  section: string,
): { changed: boolean; changedFields: string[] } {
  const beforeSection = (before as Record<string, unknown>)[section];
  const afterSection = (after as Record<string, unknown>)[section];
  const changedFields = diffSectionFields(beforeSection, afterSection);
  return { changed: changedFields.length > 0, changedFields };
}

export type ContentSectionName = ContentSection;
