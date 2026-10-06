import { beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
  streamText: vi.fn(),
}));
const models = vi.hoisted(() => ({
  fallback: null as null | { model: unknown; label: string },
}));

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => sdk.generateText(...args),
  generateObject: (...args: unknown[]) => sdk.generateObject(...args),
  streamText: (...args: unknown[]) => sdk.streamText(...args),
}));
vi.mock("@/lib/ai-models", () => ({
  getPrimaryModel: () => ({ model: { id: "primary" }, label: "google/gemini-2.5-flash" }),
  getFallbackModel: () => models.fallback,
  getGoogleModel: (id: string) => ({ model: { id }, label: `google/${id}` }),
  isTransientModelError: (error: unknown) => error instanceof Error && error.message.includes("503"),
}));

import {
  createMemoryModelCallSink,
  generateModelObject,
  generateModelText,
  ModelCallConfigurationError,
  streamModelText,
} from "@/platform/infra/model-calls";
import { estimateModelCost } from "@/platform/infra/model-prices";

const context = { purpose: "ask" as const, workspaceId: "ws-1", systemId: "sys-1", tenantId: "gldf", actorKind: "owner" as const };

beforeEach(() => {
  sdk.generateText.mockReset();
  sdk.generateObject.mockReset();
  sdk.streamText.mockReset();
  models.fallback = null;
});

describe("price table", () => {
  it("estimates a priced model from tokens", () => {
    expect(estimateModelCost("google/gemini-2.5-flash", { inputTokens: 1_000_000, outputTokens: 1_000_000 })).toEqual({
      costUsd: "2.80000000", source: "estimate", priceTableVersion: "2026-10-06",
    });
  });
  it("records an unpriced model as unknown, never zero", () => {
    expect(estimateModelCost("anthropic/some-model", { inputTokens: 10, outputTokens: 10 })).toEqual({ costUsd: null, source: "unknown", priceTableVersion: null });
  });
  it("records missing tokens as unknown", () => {
    expect(estimateModelCost("google/gemini-2.5-flash", { inputTokens: 10 }).source).toBe("unknown");
  });
});

describe("generateModelText", () => {
  it("writes one row per provider step with tokens, cost and context", async () => {
    sdk.generateText.mockImplementation(async (options: { onStepFinish: (e: unknown) => Promise<void> }) => {
      await options.onStepFinish({ usage: { inputTokens: 100, outputTokens: 20 } });
      await options.onStepFinish({ usage: { inputTokens: 300, outputTokens: 40 } });
      return { text: "done", steps: [{}, {}] };
    });
    const sink = createMemoryModelCallSink();
    const outcome = await generateModelText(context, { prompt: "hi" }, { sink });
    expect(outcome.modelLabel).toBe("google/gemini-2.5-flash");
    expect(sink.rows).toHaveLength(2);
    expect(sink.rows.map((row) => [row.step, row.inputTokens, row.outputTokens, row.outcome, row.costSource])).toEqual([
      [1, 100, 20, "ok", "estimate"],
      [2, 300, 40, "ok", "estimate"],
    ]);
    expect(sink.rows[0]).toMatchObject({ purpose: "ask", workspaceId: "ws-1", systemId: "sys-1", tenantId: "gldf", actorKind: "owner", attempt: 1 });
  });

  it("logs the failed primary and the fallback, each as its own row", async () => {
    models.fallback = { model: { id: "fallback" }, label: "anthropic/fallback" };
    sdk.generateText
      .mockRejectedValueOnce(new Error("503 unavailable"))
      .mockResolvedValueOnce({ text: "ok", usage: { inputTokens: 5, outputTokens: 5 } });
    const sink = createMemoryModelCallSink();
    const outcome = await generateModelText(context, { prompt: "hi" }, { sink });
    expect(outcome).toMatchObject({ modelLabel: "anthropic/fallback", attempt: 2 });
    expect(sink.rows.map((row) => [row.attempt, row.modelLabel, row.outcome, row.errorKind, row.costUsd, row.costSource])).toEqual([
      [1, "google/gemini-2.5-flash", "error", "provider_5xx", null, "unknown"],
      [2, "anthropic/fallback", "ok", null, null, "unknown"],
    ]);
  });

  it("does not fall back on a non-transient error", async () => {
    models.fallback = { model: { id: "fallback" }, label: "anthropic/fallback" };
    sdk.generateText.mockRejectedValueOnce(new Error("bad request"));
    const sink = createMemoryModelCallSink();
    await expect(generateModelText(context, { prompt: "hi" }, { sink })).rejects.toThrow("bad request");
    expect(sdk.generateText).toHaveBeenCalledTimes(1);
    expect(sink.rows).toHaveLength(1);
  });

  it("never fails the call when the log write fails", async () => {
    sdk.generateText.mockResolvedValue({ text: "ok", usage: { inputTokens: 1, outputTokens: 1 } });
    const sink = { record: vi.fn().mockRejectedValue(new Error("db down")) };
    await expect(generateModelText(context, { prompt: "hi" }, { sink })).resolves.toMatchObject({ result: { text: "ok" } });
    expect(sink.record).toHaveBeenCalledTimes(1);
  });

  it("only lets a visibility probe pin a model", async () => {
    sdk.generateText.mockResolvedValue({ text: "ok" });
    const pinned = { model: { id: "gemini-2.5-flash" } as never, label: "google/gemini-2.5-flash" };
    await expect(generateModelText(context, { prompt: "hi" }, { pinnedModel: pinned })).rejects.toBeInstanceOf(ModelCallConfigurationError);
    const sink = createMemoryModelCallSink();
    await generateModelText({ purpose: "visibility_probe" }, { prompt: "hi" }, { pinnedModel: pinned, sink });
    expect(sink.rows[0]).toMatchObject({ purpose: "visibility_probe", modelLabel: "google/gemini-2.5-flash", costSource: "unknown" });
  });

  it("replaces the estimate with a trusted receipt", async () => {
    sdk.generateText.mockResolvedValue({ text: "ok", usage: { inputTokens: 10, outputTokens: 10 } });
    const sink = createMemoryModelCallSink();
    await generateModelText(context, { prompt: "hi" }, { sink, receipt: () => ({ costUsd: "0.00123400" }) });
    expect(sink.rows[0]).toMatchObject({ costUsd: "0.00123400", costSource: "provider_receipt", priceTableVersion: null });
  });
});

describe("generateModelObject", () => {
  it("adds no row when a wrapper refuses before the provider call", async () => {
    const sink = createMemoryModelCallSink();
    await expect(generateModelObject(context, { prompt: "x", schema: {} as never }, {
      sink, wrapAttempt: async () => { throw new Error("over budget"); }, shouldFallback: () => true,
    })).rejects.toThrow("over budget");
    expect(sdk.generateObject).not.toHaveBeenCalled();
    expect(sink.rows).toHaveLength(0);
  });

  it("falls back once when the wrapper rejects the output, logging both provider calls", async () => {
    models.fallback = { model: { id: "fallback" }, label: "anthropic/fallback" };
    sdk.generateObject
      .mockResolvedValueOnce({ object: { bad: true }, usage: { inputTokens: 1, outputTokens: 1 } })
      .mockResolvedValueOnce({ object: { good: true }, usage: { inputTokens: 1, outputTokens: 1 } });
    const sink = createMemoryModelCallSink();
    const outcome = await generateModelObject<{ object: Record<string, boolean> }>(context, { prompt: "x", schema: {} as never }, {
      sink,
      shouldFallback: () => true,
      wrapAttempt: async (_model, run) => {
        const result = await run();
        if (result.object.bad) throw new Error("invalid output");
        return result;
      },
    });
    expect(outcome.result.object).toEqual({ good: true });
    expect(sink.rows.map((row) => [row.attempt, row.outcome])).toEqual([[1, "ok"], [2, "ok"]]);
  });
});

describe("streamModelText", () => {
  it("falls back only while nothing reached the person", async () => {
    models.fallback = { model: { id: "fallback" }, label: "anthropic/fallback" };
    sdk.streamText.mockReturnValue({ fullStream: [] });
    let emitted = false;
    let calls = 0;
    const sink = createMemoryModelCallSink();
    await expect(streamModelText(context, { prompt: "x" }, async () => {
      calls += 1;
      emitted = true;
      throw new Error("503 mid-stream");
    }, { sink, emitted: () => emitted })).rejects.toThrow("503");
    expect(calls).toBe(1);
    expect(sink.rows).toHaveLength(1);

    emitted = false;
    calls = 0;
    const outcome = await streamModelText(context, { prompt: "x" }, async () => {
      calls += 1;
      if (calls === 1) throw new Error("503 before output");
    }, { sink, emitted: () => emitted });
    expect(outcome).toEqual({ modelLabel: "anthropic/fallback", attempt: 2 });
  });

  it("writes a row with unknown cost when the stream reported no steps", async () => {
    sdk.streamText.mockReturnValue({ fullStream: [] });
    const sink = createMemoryModelCallSink();
    await streamModelText(context, { prompt: "x" }, async () => {}, { sink, emitted: () => false });
    expect(sink.rows).toEqual([expect.objectContaining({ outcome: "ok", inputTokens: null, costUsd: null, costSource: "unknown" })]);
  });
});

describe("lint rule", () => {
  it("rejects a direct model call import outside the helper", async () => {
    const { ESLint } = await import("eslint");
    const eslint = new ESLint();
    const [direct] = await eslint.lintText('import { generateText } from "ai";\nexport const x = generateText;\n', { filePath: "src/lib/example-direct.ts" });
    expect(direct!.messages.some((m) => m.ruleId === "no-restricted-imports")).toBe(true);
    const [dynamic] = await eslint.lintText('export async function x() { return import("@ai-sdk/google"); }\n', { filePath: "src/lib/example-dynamic.ts" });
    expect(dynamic!.messages.some((m) => m.ruleId === "no-restricted-syntax")).toBe(true);
    const [allowed] = await eslint.lintText('import { tool } from "ai";\nexport const t = tool;\n', { filePath: "src/lib/example-tool.ts" });
    expect(allowed!.messages.filter((m) => m.ruleId?.startsWith("no-restricted"))).toHaveLength(0);
  }, 60_000);
});
