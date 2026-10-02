import { describe, expect, it, vi } from "vitest";
import { blindBenchmarkMapping, createBenchmarkAdmission, runRebuildBenchmark, validateBenchmarkLimits, type BenchmarkProviderFactories } from "@/products/websites/rebuild-benchmark";
import type { BusinessFacts } from "@/products/websites/rebuild-pipeline";
import { RuleComposer } from "@/products/websites/rebuild-composer";

const text = "The practice offers workplace mediation.";
const facts: BusinessFacts = { name: "Public Practice", nameFactId: "name", facts: {
  name: { text: "Public Practice", kind: "claim", highRisk: false, origin: "source", sources: [{ sourceId: "https://example.com/#sha256=test", quote: "Public Practice" }], verification: { supported: true, confidence: 1 } },
  statement: { text, kind: "claim", highRisk: false, origin: "source", sources: [{ sourceId: "https://example.com/#sha256=test", quote: text }], verification: { supported: true, confidence: 1 } },
}, services: [], people: [], contact: [], hours: [], locations: [], reviews: [], claims: ["name", "statement"], brandColors: [], oldPaths: [], sourcePages: [{ sourceId: "https://example.com/#sha256=test", url: "https://example.com/", title: "Public Practice", factIds: ["name", "statement"] }] };

describe("opt-in website benchmark", () => {
  it("defaults to no provider construction or calls and keeps paid lanes unexecuted", async () => {
    const factories: BenchmarkProviderFactories = { writer: vi.fn(), composer: vi.fn(), verifier: vi.fn() };
    const result = await runRebuildBenchmark(facts, undefined, { allowPaid: false }, factories);
    expect(result.admittedCalls).toBe(0); expect(result.actualCostUsd).toBe(0);
    expect(result.lanes[0]!.document?.provenance.composer).toBe("rules");
    expect(result.lanes.slice(1).map(lane => lane.status)).toEqual(["not_executed", "not_executed"]);
    Object.values(factories).forEach(factory => expect(factory).not.toHaveBeenCalled());
    expect(result.qualityJudgment).toContain("Independent human review");
  });
  it("denies dry-run, oversized and excess calls before executing callbacks", async () => {
    const call = vi.fn(async () => "executed");
    const dry = createBenchmarkAdmission({ allowPaid: false });
    await expect(dry.provider("jev")({ model: "typesafe-ai/jev", purpose: "verification", inputBytes: 5 }, call)).rejects.toThrow("paid_not_enabled");
    const capped = createBenchmarkAdmission({ allowPaid: true, maxCalls: 1, maxInputBytes: 10 });
    await expect(capped.provider("jev")({ model: "typesafe-ai/jev", purpose: "verification", inputBytes: 11 }, call)).rejects.toThrow("input_cap");
    expect(await capped.writer("model", 10)("primary", call)).toBe("executed");
    await expect(capped.writer("model", 10)("fallback", call)).rejects.toThrow("call_cap");
    expect(call).toHaveBeenCalledTimes(1); expect(capped.admittedCalls).toBe(1);
    expect(capped.calls.map(record => record.status)).toEqual(["denied", "completed", "denied"]);
  });
  it("reserves concurrent and failed requests against the same exact cap and redacts error bodies", async () => {
    const admission = createBenchmarkAdmission({ allowPaid: true, maxCalls: 1 });
    const call = vi.fn(async () => { await Promise.resolve(); throw new Error("Bearer private-credential and confidential provider body"); });
    const results = await Promise.allSettled([admission.writer("model", 10)("primary", call), admission.writer("model", 10)("fallback", call)]);
    expect(call).toHaveBeenCalledTimes(1); expect(admission.admittedCalls).toBe(1);
    expect(JSON.stringify(admission.calls)).not.toContain("private-credential");
    results.forEach(result => { expect(result.status).toBe("rejected"); if (result.status === "rejected") expect(String(result.reason)).not.toContain("private-credential"); });
    expect(admission.calls.map(record => record.actualCostUsd)).toEqual([null, null]);
  });
  it("validates named call limits and produces a reproducible complete private mapping", () => {
    for (const maxCalls of [undefined, 0, 31, 1.5, NaN]) expect(() => validateBenchmarkLimits({ allowPaid: true, maxCalls })).toThrow();
    const mapping = blindBenchmarkMapping("private reproducible seed");
    expect(mapping).toEqual(blindBenchmarkMapping("private reproducible seed"));
    expect(new Set(Object.values(mapping))).toEqual(new Set(["rules", "model", "jev"]));
    expect(Object.keys(mapping)).toEqual(["A", "B", "C"]);
  });
  it("records provider fallback as failure, rather than counting rules as a successful paid result", async () => {
    const result = await runRebuildBenchmark(facts, undefined, { allowPaid: true, maxCalls: 1 }, {
      writer: () => async (_facts, baseline) => ({ pages: baseline.pages }),
      composer: mode => ({ name: mode, compose: async () => { throw Error("unavailable"); } }),
      verifier: () => async () => ({ supported: false, confidence: 0 }),
    });
    expect(result.lanes.slice(1).map(lane => lane.status)).toEqual(["provider_failed", "provider_failed"]);
    expect(result.lanes.slice(1).every(lane => lane.provenance?.composer === "rules")).toBe(true);
    expect(result.actualCostUsd).toBeNull();
  });
  it("uses the same public facts and structured plan for paid lanes without claiming probe agreement is accuracy", async () => {
    const writer = vi.fn(async (_facts, baseline) => ({ pages: baseline.pages }));
    const result = await runRebuildBenchmark(facts, undefined, { allowPaid: true, maxCalls: 10 }, {
      writer: () => writer,
      composer: mode => ({ name: mode, compose: (questions, context) => new RuleComposer().compose(questions, context) }),
      verifier: () => async () => ({ supported: false, confidence: .9 }),
    });
    expect(writer).toHaveBeenCalledTimes(1);
    expect(writer).toHaveBeenCalledWith(facts, expect.objectContaining({ writer: "source" }));
    expect(result.lanes[1]!.provenance).toEqual({ composer: "model", writer: "model" });
    expect(result.lanes[2]!.provenance).toEqual({ composer: "jev", writer: "model" });
    expect(result.lanes[1]!.probes[0]!.construction).toBe("exact_source_quote");
    expect(result.lanes[1]!.probes[0]!.decision?.supported).toBe(false);
    expect(result.qualityJudgment).toContain("provider agreement is not accuracy");
  });
  it("marks denied verification probes incomplete instead of silently succeeding", async () => {
    const result = await runRebuildBenchmark(facts, undefined, { allowPaid: true, maxCalls: 2 }, {
      writer: admit => async (_facts, baseline) => admit("primary", async () => ({ pages: baseline.pages })),
      composer: mode => ({ name: mode, compose: (questions, context) => new RuleComposer().compose(questions, context) }),
      verifier: (_mode, admit) => async () => admit({ model: "typesafe-ai/jev", purpose: "verification", inputBytes: 20 }, async () => ({ supported: true, confidence: 1 })),
    });
    expect(result.admittedCalls).toBe(2);
    expect(result.lanes.slice(1).map(lane => lane.status)).toEqual(["provider_failed", "provider_failed"]);
    expect(result.lanes.slice(1).every(lane => lane.reason === "verification_incomplete")).toBe(true);
    expect(result.calls.some(call => call.reason === "call_cap")).toBe(true);
  });
});
