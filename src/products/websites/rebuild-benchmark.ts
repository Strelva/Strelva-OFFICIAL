/** Opt-in local benchmark helpers. No tenant writes and no implicit providers. */
import { createHash } from "node:crypto";
import { composeRebuildSite, verifyRebuildSite, type SiteComposer, type SiteVerifier, type VerificationDecision } from "./rebuild-composer";
import { validateWrittenContent, writeSourceContent, type BusinessFacts, type RebuildWriter } from "./rebuild-pipeline";
import type { RebuildProviderAdmission, RebuildProviderRequest } from "./rebuild-providers";
import type { SiteDocument } from "./site-document";
import type { CrawlResult } from "./rebuild-crawl";
import { isHighRiskWebsiteClaim } from "./rebuild-risk";

export type BenchmarkMode = "rules" | "model" | "jev";
export interface BenchmarkCall {
  mode: BenchmarkMode | "shared_writer"; purpose: RebuildProviderRequest["purpose"] | "writing";
  model: string; inputBytes: number; status: "completed" | "failed" | "denied";
  elapsedMs: number; reason?: "paid_not_enabled" | "call_cap" | "input_cap" | "provider_failed";
  actualCostUsd: null;
}
export interface BenchmarkLimits { allowPaid: boolean; maxCalls?: number; maxInputBytes?: number }
export function validateBenchmarkLimits(limits: BenchmarkLimits) {
  if (limits.allowPaid && (!Number.isInteger(limits.maxCalls) || limits.maxCalls! < 1 || limits.maxCalls! > 30)) throw new Error("Paid benchmarks require --max-calls between 1 and 30.");
  if (limits.maxInputBytes !== undefined && (!Number.isInteger(limits.maxInputBytes) || limits.maxInputBytes < 1 || limits.maxInputBytes > 250_000)) throw new Error("The benchmark input cap must be between 1 and 250000 bytes.");
}
/** Attempts are reserved synchronously before work starts, including concurrent
 * callers and primary/fallback attempts. Failed/timed-out requests consume a
 * slot. No dollar budget is claimed without actual provider billing receipts. */
export function createBenchmarkAdmission(limits: BenchmarkLimits) {
  validateBenchmarkLimits(limits);
  const calls: BenchmarkCall[] = []; let admittedCalls = 0;
  const forMode = (mode: BenchmarkMode | "shared_writer") => async <T>(request: { model: string; purpose: BenchmarkCall["purpose"]; inputBytes: number }, call: () => Promise<T>): Promise<T> => {
    const reason = !limits.allowPaid ? "paid_not_enabled" : admittedCalls >= limits.maxCalls! ? "call_cap" : !Number.isInteger(request.inputBytes) || request.inputBytes < 0 || request.inputBytes > (limits.maxInputBytes ?? 250_000) ? "input_cap" : undefined;
    const record: BenchmarkCall = { mode, purpose: request.purpose, model: request.model.slice(0, 120), inputBytes: request.inputBytes, status: reason ? "denied" : "failed", elapsedMs: 0, actualCostUsd: null, ...(reason ? { reason } : {}) };
    calls.push(record);
    if (reason) throw new Error(`Benchmark admission denied: ${reason}.`);
    admittedCalls++; const started = performance.now();
    try { const value = await call(); record.status = "completed"; return value; }
    catch { record.reason = "provider_failed"; throw new Error("Benchmark provider request failed; credentials and provider error bodies are not recorded."); }
    finally { record.elapsedMs = Math.round(performance.now() - started); }
  };
  return {
    calls,
    provider: (mode: BenchmarkMode): RebuildProviderAdmission => forMode(mode),
    writer: (mode: BenchmarkMode | "shared_writer", inputBytes: number) => <T>(model: string, call: () => Promise<T>) => forMode(mode)({ model, purpose: "writing", inputBytes }, call),
    get admittedCalls() { return admittedCalls; },
  };
}
export interface BenchmarkProviderFactories {
  writer: (admit: <T>(label: string, call: () => Promise<T>) => Promise<T>) => RebuildWriter;
  composer: (mode: "model" | "jev", admit: RebuildProviderAdmission) => SiteComposer;
  verifier: (mode: "model" | "jev", admit: RebuildProviderAdmission) => SiteVerifier;
}
export interface BenchmarkProbe { id: string; sentence: string; factId: string; construction: "exact_source_quote" | "unsupported_test_claim"; decision?: VerificationDecision; status: "completed" | "failed" | "not_executed" }
export interface BenchmarkLane {
  mode: BenchmarkMode; status: "completed" | "completed_with_flags" | "provider_failed" | "not_executed";
  elapsedMs: number; document?: SiteDocument; probes: BenchmarkProbe[];
  provenance?: { composer: SiteDocument["provenance"]["composer"]; writer: "source" | "model" };
  supported?: number; review?: number; reason?: "provider_not_enabled" | "provider_unavailable_or_invalid" | "composition_fell_back" | "verification_incomplete" | "shared_writer_failed";
}
/** Same source facts and page plan for every lane. Probe constructions are
 * evidence, not human accuracy labels; no quality score is inferred here. */
export async function runRebuildBenchmark(facts: BusinessFacts, crawl: CrawlResult | undefined, limits: BenchmarkLimits, factories?: BenchmarkProviderFactories) {
  const admission = createBenchmarkAdmission(limits); const baseline = writeSourceContent(facts);
  const writerInputBytes = Buffer.byteLength(JSON.stringify({ facts, plan: baseline.pages })) + 1500;
  const representative = Object.entries(facts.facts).find(([, fact]) => fact.sources.length && fact.text.length > 20);
  if (!representative) throw new Error("The benchmark requires public-source facts with exact quoted provenance.");
  const probes = (): BenchmarkProbe[] => [
    { id: "exact_quote", sentence: representative[1].text, factId: representative[0], construction: "exact_source_quote", status: "not_executed" },
    { id: "unsupported_claim", sentence: "This business guarantees a full refund of $999 for every inquiry.", factId: representative[0], construction: "unsupported_test_claim", status: "not_executed" },
  ];
  let sharedContent = baseline; let sharedWriterFailed = false;
  if (limits.allowPaid) {
    try {
      if (!factories) throw new Error("Explicit provider configuration is missing.");
      sharedContent = validateWrittenContent(await factories.writer(admission.writer("shared_writer", writerInputBytes))(facts, baseline), facts, baseline);
    } catch { sharedWriterFailed = true; }
  }
  const lanes: BenchmarkLane[] = [];
  for (const mode of ["rules", "model", "jev"] as const) {
    const lane: BenchmarkLane = { mode, status: "not_executed", elapsedMs: 0, probes: probes() }; lanes.push(lane);
    if (mode !== "rules" && !limits.allowPaid) { lane.reason = "provider_not_enabled"; continue; }
    if (mode !== "rules" && sharedWriterFailed) { lane.status = "provider_failed"; lane.reason = "shared_writer_failed"; continue; }
    const started = performance.now(); const firstCall = admission.calls.length;
    try {
      if (mode !== "rules" && !factories) throw new Error("Explicit provider configuration is missing.");
      const verifier = mode === "rules" ? undefined : factories!.verifier(mode, admission.provider(mode));
      const content = mode === "rules" ? baseline : sharedContent;
      const document = await composeRebuildSite(facts, content, crawl, mode === "rules" ? [] : [factories!.composer(mode, admission.provider(mode))]);
      lane.document = await verifyRebuildSite(document, facts, content, verifier);
      lane.provenance = { composer: document.provenance.composer, writer: content.writer };
      lane.supported = Object.values(lane.document.facts).filter(fact => fact.verification?.supported).length;
      lane.review = Object.values(lane.document.facts).filter(fact => fact.highRisk || !fact.verification?.supported).length;
      lane.status = mode !== "rules" && document.provenance.composer !== mode ? "provider_failed" : lane.review ? "completed_with_flags" : "completed";
      if (lane.status === "provider_failed") lane.reason = "composition_fell_back";
      for (const probe of lane.probes) {
        const fact = facts.facts[probe.factId]!;
        try {
          probe.decision = verifier ? await verifier({ sentence: probe.sentence, facts: [{ id: probe.factId, text: fact.text, quotes: fact.sources.map(source => source.quote), origin: fact.origin }] }) : { supported: fact.sources.some(source => source.quote === probe.sentence), confidence: fact.sources.some(source => source.quote === probe.sentence) ? 1 : 0, highRisk: isHighRiskWebsiteClaim(probe.sentence) };
          probe.status = "completed";
        } catch { probe.status = "failed"; }
      }
      if (lane.probes.some(probe => probe.status !== "completed") || admission.calls.slice(firstCall).some(call => call.status !== "completed")) {
        lane.status = "provider_failed"; lane.reason = "verification_incomplete";
      }
    } catch { lane.status = "provider_failed"; lane.reason = "provider_unavailable_or_invalid"; }
    finally { lane.elapsedMs = Math.round(performance.now() - started); }
  }
  return { lanes, calls: admission.calls, admittedCalls: admission.admittedCalls, actualCostUsd: limits.allowPaid ? null : 0, mode: limits.allowPaid ? "paid_opt_in" : "dry_run", qualityJudgment: "Not measured. Independent human review required; provider agreement is not accuracy." };
}
/** Reproducible opaque labels. The seed and returned mapping belong only in
 * the private judge key, never in the blind page or participant artifacts. */
export function blindBenchmarkMapping(seed: string): Record<"A" | "B" | "C", BenchmarkMode> {
  if (!seed || seed.length > 200) throw new Error("Provide a nonempty blind seed of at most 200 characters.");
  const order = (["rules", "model", "jev"] as const).map(mode => ({ mode, order: createHash("sha256").update(`${seed}:${mode}`).digest("hex") })).sort((left, right) => left.order.localeCompare(right.order));
  return { A: order[0]!.mode, B: order[1]!.mode, C: order[2]!.mode };
}
