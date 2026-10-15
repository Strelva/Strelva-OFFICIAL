import { describe, expect, it } from "vitest";
import { boundedProviderRequest, listPriceCeiling } from "@/platform/infra/model-price-ceiling";
import { estimateModelCost, MODEL_MAX_THINKING_TOKENS } from "@/platform/infra/model-prices";

const label = "google/gemini-2.5-flash";
const text = (value: string) => ({ role: "user", content: [{ type: "text", text: value }] });
const base = { prompt: [{ role: "system", content: "Be brief." }, text("hi")], maxOutputTokens: 4096 };
const tool = { type: "function", name: "read", description: "Read", inputSchema: { type: "object" } };
const ceiling = listPriceCeiling(label);

describe("list-price ceiling", () => {
  it("bounds a text-only request at or above the estimate of its own bytes and limits", () => {
    const value = ceiling(base, "stream");
    expect(value).toMatch(/^\d+\.\d{8}$/);
    expect(Number(value)).toBeGreaterThan(0);
    const bytes = new TextEncoder().encode(JSON.stringify({ p: base.prompt, t: null, r: null, c: null })).length;
    const floor = estimateModelCost(label, { inputTokens: bytes, outputTokens: base.maxOutputTokens + MODEL_MAX_THINKING_TOKENS[label]! });
    expect(Number(value)).toBeGreaterThanOrEqual(Number(floor.costUsd));
  });

  it("accepts function tools with tool-call and json tool-result parts", () => {
    const request = {
      ...base,
      tools: [tool],
      prompt: [
        ...base.prompt,
        { role: "assistant", content: [{ type: "tool-call", toolCallId: "1", toolName: "read", input: {} }] },
        { role: "tool", content: [{ type: "tool-result", toolCallId: "1", toolName: "read", output: { type: "json", value: { ok: true } } }] },
      ],
    };
    expect(boundedProviderRequest(request, { allowTools: true })).toBe(true);
    expect(ceiling(request, "generate")).not.toBeNull();
    expect(boundedProviderRequest(request, { allowTools: false })).toBe(false);
  });

  it.each([
    ["provider tools", { ...base, tools: [{ type: "provider", id: "x" }] }],
    ["file parts", { ...base, prompt: [{ role: "user", content: [{ type: "file", data: "x", mediaType: "image/png" }] }] }],
    ["media tool results", { ...base, prompt: [{ role: "tool", content: [{ type: "tool-result", toolCallId: "1", toolName: "r", output: { type: "content", value: [] } }] }] }],
    ["no output limit", { ...base, maxOutputTokens: undefined }],
    ["provider options", { ...base, providerOptions: { google: { thinkingConfig: {} } } }],
  ])("has no ceiling for %s", (_name, request) => {
    expect(ceiling(request, "stream")).toBeNull();
  });

  it("has no ceiling for an unpriced label", () => {
    expect(listPriceCeiling("test/unpriced")(base, "stream")).toBeNull();
  });

  it("rounds up to eight decimals", () => {
    const table = { "t/m": { inputUsdPerMillion: 0.0000003, outputUsdPerMillion: 0, source: "fixture" } };
    const tiny = listPriceCeiling("t/m", table, {})({ prompt: [text("a")], maxOutputTokens: 1 }, "generate")!;
    // About 3e-10 dollars of input rounds up to the next cent-millionth, never down to zero.
    expect(tiny).toBe("0.00000001");
  });
});
