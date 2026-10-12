import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ text: vi.fn(), object: vi.fn(), stream: vi.fn(), rpc: vi.fn(), primary: null as unknown, fallback: null as unknown }));
vi.mock("ai", () => ({ generateText: mocks.text, generateObject: mocks.object, streamText: mocks.stream }));
vi.mock("@/platform/infra/ai-models", () => ({ getPrimaryModel: () => mocks.primary, getFallbackModel: () => mocks.fallback, isTransientModelError: () => true }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
import { createMemoryModelCallSink, generateModelObject, generateModelText, streamModelText, type ModelConfig } from "@/platform/infra/model-calls";
import { ModelBudgetPausedError, ModelBudgetUnavailableError } from "@/platform/infra/business-ai-budget";

const workspaceId = "a0000000-0000-4000-8000-000000000001";
const context = { purpose: "ask" as const, workspaceId };
const budget = { spentUsd: "0.2", reservedUsd: "0", since: "2026-10-01T00:00:00Z", resetsAt: "2026-11-01T00:00:00Z", capCents: 100, subscribed: true, unknownCostCalls: 0 };
const request = { prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }], maxOutputTokens: 20 };
const usage = { inputTokens: { total: 2 }, outputTokens: { total: 3 } };
function adapter(label = "google/gemini-2.5-flash") {
  const generate = vi.fn(async () => ({ usage }));
  const stream = vi.fn(async () => ({ stream: new ReadableStream({ start(controller) { controller.enqueue({ type: "finish", usage }); controller.close(); } }) }));
  const config: ModelConfig = { label, model: { doGenerate: generate, doStream: stream } as never,
    billingCeiling: { qualification: "disposable test adapter; no hosted billing claim", maximumCostUsd: value => JSON.stringify(value).length < 500 ? "0.1" : null } };
  return { config, generate, stream };
}
function reservations() { return mocks.rpc.mock.calls.filter(([name]) => name === "reserve_business_ai_budget"); }
beforeEach(() => {
  vi.stubEnv("STRELVA_BUSINESS_AI_BUDGET", "1");
  vi.clearAllMocks(); mocks.fallback = null;
  mocks.primary = adapter().config;
  let held = 0;
  mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "business_ai_budget" ? budget : { status: "reserved", reservationId: `d0000000-0000-4000-8000-${String(++held).padStart(12, "0")}`, budget } }));
  mocks.text.mockImplementation(async (options: { model: { doGenerate: (request: unknown) => Promise<unknown> }; maxRetries: number }) => {
    expect(options.maxRetries).toBe(0);
    const result = await options.model.doGenerate(request);
    return { text: "done", ...result as object };
  });
  mocks.object.mockImplementation(async (options: { model: { doGenerate: (request: unknown) => Promise<unknown> } }) => options.model.doGenerate(request));
  mocks.stream.mockImplementation((options: { model: { doStream: (request: unknown) => Promise<unknown> } }) => options.model.doStream(request));
});
afterEach(() => vi.unstubAllEnvs());

describe("provider-unit budget admission", () => {
  it("reserves every actual tool-step request and logs each original start/hold, with no completion-time reset shift", async () => {
    const sink = createMemoryModelCallSink();
    let now = Date.parse("2026-10-31T23:59:59Z");
    mocks.text.mockImplementation(async (options: { model: { doGenerate: (request: unknown) => Promise<unknown> } }) => {
      await options.model.doGenerate(request);
      await options.model.doGenerate(request);
      return { text: "done" };
    });
    const model = adapter();
    model.generate.mockImplementation(async () => { now = Date.parse("2026-11-01T00:00:01Z"); return { usage }; });
    await generateModelText(context, { prompt: "hi", maxRetries: 5 }, { models: [model.config], sink, now: () => now });
    expect(reservations()).toHaveLength(2);
    expect(reservations()[0]?.[1]).toMatchObject({ p_workspace_id: workspaceId, p_maximum_cost_usd: "0.1" });
    expect(sink.rows.map(row => [row.step, row.budgetReservationId, row.calledAt])).toEqual([
      [1, "d0000000-0000-4000-8000-000000000001", "2026-10-31T23:59:59.000Z"],
      [2, "d0000000-0000-4000-8000-000000000002", "2026-11-01T00:00:01.000Z"],
    ]);
  });
  it("holds failed primary and fallback separately, retaining unknown cost", async () => {
    const primary = adapter(), fallback = adapter("test/fallback"), sink = createMemoryModelCallSink();
    primary.generate.mockRejectedValueOnce(new Error("503 response lost"));
    mocks.primary = primary.config; mocks.fallback = fallback.config;
    await generateModelText(context, { prompt: "hi" }, { sink });
    expect(reservations()).toHaveLength(2);
    expect(sink.rows).toEqual([expect.objectContaining({ attempt: 1, outcome: "error", costUsd: null, budgetReservationId: expect.any(String) }), expect.objectContaining({ attempt: 2, outcome: "ok", budgetReservationId: expect.any(String) })]);
    expect(sink.rows[0]?.budgetReservationId).not.toBe(sink.rows[1]?.budgetReservationId);
  });
  it("does not reserve when the caller wrapper refuses before a provider request", async () => {
    await expect(generateModelObject(context, { prompt: "hi" }, { wrapAttempt: async () => { throw new Error("scope refused"); }, sink: createMemoryModelCallSink() })).rejects.toThrow("scope refused");
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.object).not.toHaveBeenCalled();
  });
  it.each(["missing", "lost", "paused"])("never starts or falls back after %s admission even with caller override", async mode => {
    const model = adapter(), fallback = adapter(); mocks.primary = model.config; mocks.fallback = fallback.config;
    mocks.rpc.mockImplementation(async (name: string) => ({ error: null, data: name === "business_ai_budget" && mode !== "missing" ? budget : mode === "paused" ? { status: "paused", reservationId: null, budget } : null }));
    await expect(generateModelText(context, { prompt: "hi" }, { shouldFallback: () => true, sink: createMemoryModelCallSink() })).rejects.toBeInstanceOf(mode === "paused" ? ModelBudgetPausedError : ModelBudgetUnavailableError);
    expect(model.generate).not.toHaveBeenCalled(); expect(fallback.generate).not.toHaveBeenCalled();
    expect(reservations()).toHaveLength(mode === "missing" ? 0 : 1);
  });
  it.each([
    { ...request, maxOutputTokens: undefined },
    { ...request, providerOptions: { search: true } },
    { ...request, tools: [{ type: "provider-defined" }] },
    { ...request, prompt: [{ role: "user", content: [{ type: "file", data: "x" }] }] },
    { ...request, prompt: [{ role: "user", content: [{ type: "text", text: "x".repeat(600) }] }] },
  ])("pauses requests without a qualified complete bound", async actualRequest => {
    const model = adapter(); mocks.primary = model.config;
    mocks.text.mockImplementation(async (options: { model: { doGenerate: (request: unknown) => Promise<unknown> } }) => options.model.doGenerate(actualRequest));
    await expect(generateModelText(context, { prompt: "hi" }, { sink: createMemoryModelCallSink() })).rejects.toBeInstanceOf(ModelBudgetUnavailableError);
    expect(model.generate).not.toHaveBeenCalled(); expect(reservations()).toHaveLength(0);
  });
  it("rejects model-substitution/tool-repair hooks and unbounded SDK tools before the SDK starts", async () => {
    for (const options of [{ prepareStep: () => ({}) }, { experimental_repairToolCall: async () => null }, { tools: {} }]) {
      await expect(generateModelText(context, { prompt: "hi", ...options } as never, { sink: createMemoryModelCallSink() })).rejects.toBeInstanceOf(ModelBudgetUnavailableError);
    }
    expect(mocks.text).not.toHaveBeenCalled(); expect(reservations()).toHaveLength(0);
  });
  it("never falls back when the SDK hides a budget refusal in a different error", async () => {
    const model = adapter(), fallback = adapter(); mocks.primary = model.config; mocks.fallback = fallback.config;
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.text.mockImplementation(async (options: { model: { doGenerate: (request: unknown) => Promise<unknown> } }) => {
      try { await options.model.doGenerate(request); } catch { throw new Error("503 SDK wrapped error"); }
    });
    await expect(generateModelText(context, { prompt: "hi" }, { shouldFallback: () => true, sink: createMemoryModelCallSink() })).rejects.toBeInstanceOf(ModelBudgetUnavailableError);
    expect(fallback.generate).not.toHaveBeenCalled(); expect(mocks.text).toHaveBeenCalledTimes(1);
  });
  it("leaves unqualified configured models paused while capped", async () => {
    const model = adapter(); delete model.config.billingCeiling; mocks.primary = model.config;
    await expect(generateModelText(context, { prompt: "hi" }, { sink: createMemoryModelCallSink() })).rejects.toBeInstanceOf(ModelBudgetUnavailableError);
    expect(model.generate).not.toHaveBeenCalled();
  });
  it("uncapped flagged and exempt calls use no reservation", async () => {
    const model = adapter(); delete model.config.billingCeiling; mocks.primary = model.config;
    mocks.rpc.mockResolvedValue({ data: { ...budget, capCents: null }, error: null });
    const sink = createMemoryModelCallSink();
    await generateModelText(context, { prompt: "hi" }, { sink });
    await generateModelText({ ...context, purpose: "operator" }, { prompt: "hi" }, { sink });
    expect(model.generate).toHaveBeenCalledTimes(2); expect(reservations()).toHaveLength(0);
    expect(sink.rows.map(row => row.budgetReservationId)).toEqual([null, null]);
  });
  it("logs stream start and reservation through a successful finish", async () => {
    const sink = createMemoryModelCallSink();
    await streamModelText(context, { prompt: "hi" }, async result => {
      const value = await result as unknown as { stream: ReadableStream<unknown> };
      const reader = value.stream.getReader(); while (!(await reader.read()).done) { /* consume */ }
    }, { sink, emitted: () => false });
    expect(sink.rows).toEqual([expect.objectContaining({ outcome: "ok", inputTokens: 2, outputTokens: 3, budgetReservationId: expect.any(String) })]);
    expect(mocks.stream.mock.calls[0]?.[0].maxRetries).toBe(0);
  });
});

it("retains a stream hold and unknown-cost error when its consumer fails before a finish", async () => {
  const sink = createMemoryModelCallSink(), model = adapter(); mocks.primary = model.config;
  model.stream.mockImplementation(async () => ({ stream: new ReadableStream({ start(controller) { controller.enqueue({ type: "text-delta", text: "partial" }); } }) }));
  await expect(streamModelText(context, { prompt: "hi" }, async result => {
    const value = await result as unknown as { stream: ReadableStream<unknown> };
    await value.stream.getReader().read(); throw new Error("consumer lost response");
  }, { sink, emitted: () => true })).rejects.toThrow("consumer lost response");
  expect(sink.rows).toEqual([expect.objectContaining({ outcome: "error", costUsd: null, budgetReservationId: expect.any(String) })]);
  expect(reservations()).toHaveLength(1);
});
