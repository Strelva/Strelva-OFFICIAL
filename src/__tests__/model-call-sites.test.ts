import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modelAdmissionRpc, modelAdmissionWorkspaceId } from "./support/model-admission";

const sdk = vi.hoisted(() => ({ generateText: vi.fn(), rpc: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: sdk.rpc }) }));
vi.mock("ai", () => ({ generateText: (...args: unknown[]) => sdk.generateText(...args) }));
vi.mock("@ai-sdk/google", () => ({ google: (id: string) => ({ modelId: id }) }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));
vi.mock("@/lib/reviews/reply-voice", () => ({
  getReplyVoice: async () => ({}),
  defaultReplyVoice: () => ({}),
  buildVoicePromptSection: () => "",
}));

import { draftReviewReply } from "@/lib/review-replies";
import { createMemoryModelCallSink, setModelCallSink, type ModelCallSink } from "@/platform/infra/model-calls";
import { setReleaseFlagsDb } from "@/platform/release-flags/store";

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : sources(file);
    return /\.(ts|tsx)$/.test(entry.name) ? [file] : [];
  });
}

describe("model call sites", () => {
  let previous: ModelCallSink;
  const sink = createMemoryModelCallSink();
  beforeEach(() => {
    vi.stubEnv("STRELVA_BUSINESS_AI_BUDGET", "1");
    setReleaseFlagsDb(null);
    sdk.rpc.mockReset().mockImplementation(modelAdmissionRpc);
    sink.rows.length = 0;
    previous = setModelCallSink(sink);
    sdk.generateText.mockReset();
  });
  afterEach(() => {
    setModelCallSink(previous);
    setReleaseFlagsDb(null);
    vi.unstubAllEnvs();
  });

  it("leaves no direct model call or hard-coded model outside the helper", () => {
    const offenders = sources(path.resolve(__dirname, "..")).filter((file) => {
      const relative = path.relative(path.resolve(__dirname, "../.."), file).split(path.sep).join("/");
      if (relative === "src/platform/infra/model-calls.ts" || relative === "src/platform/infra/ai-models.ts") return false;
      const source = readFileSync(file, "utf8");
      return /\b(generateText|streamText|generateObject|streamObject)\s*\(/.test(source) || /google\("gemini/.test(source);
    });
    expect(offenders).toEqual([]);
  });

  it("a former hard-coded Gemini caller now writes one cost row per call, with its tenant", async () => {
    sdk.generateText.mockResolvedValue({ text: "Thanks so much, Dana. We loved having you in.", usage: { inputTokens: 120, outputTokens: 18 } });
    await draftReviewReply({ reviewId: "r1", reviewerName: "Dana", rating: 5, comment: "Great visit" }, { id: "gldf", siteName: "GLDF" });
    expect(sdk.generateText).toHaveBeenCalledTimes(1);
    expect(sdk.generateText.mock.calls[0]![0]).toMatchObject({ model: { modelId: "gemini-2.5-flash" }, maxOutputTokens: 200 });
    expect(sink.rows).toEqual([expect.objectContaining({
      purpose: "review_reply", tenantId: "gldf", modelLabel: "google/gemini-2.5-flash",
      workspaceId: modelAdmissionWorkspaceId,
      inputTokens: 120, outputTokens: 18, outcome: "ok", costSource: "estimate",
    })]);
    expect(sdk.rpc).toHaveBeenCalledWith("resolve_billing_workspace", { p_workspace_id: null, p_tenant_id: "gldf" });
    expect(sdk.rpc).toHaveBeenCalledWith("business_ai_budget", { p_workspace_id: modelAdmissionWorkspaceId });
  });

  it("a failed call is still a row, and the caller's own fallback still runs", async () => {
    sdk.generateText.mockRejectedValue(new Error("400 bad request"));
    const reply = await draftReviewReply({ reviewId: "r2", reviewerName: "Sam", rating: 4 }, { id: "gldf", siteName: "GLDF" });
    expect(reply.length).toBeGreaterThan(0);
    expect(sink.rows).toEqual([expect.objectContaining({ purpose: "review_reply", tenantId: "gldf", workspaceId: modelAdmissionWorkspaceId, outcome: "error", costUsd: null, costSource: "unknown" })]);
  });

  it.each(["missing", "unavailable"])("uses an uncharged deterministic reply when the trusted workspace is %s", async state => {
    vi.stubEnv("STRELVA_BUSINESS_AI_BUDGET", "0");
    sdk.rpc.mockResolvedValue({ data: null, error: state === "unavailable" ? { message: "mapping unavailable" } : null });
    sdk.generateText.mockResolvedValue({ text: "must not be used" });
    const reply = await draftReviewReply({ reviewId: "r3", reviewerName: "Sam", rating: 4 }, { id: "gldf", siteName: "GLDF" });
    expect(reply.length).toBeGreaterThan(0);
    expect(reply).not.toBe("must not be used");
    expect(sdk.generateText).not.toHaveBeenCalled();
    expect(sink.rows).toEqual([]);
    expect(sdk.rpc).toHaveBeenCalledExactlyOnceWith("resolve_billing_workspace", { p_workspace_id: null, p_tenant_id: "gldf" });
  });
});

describe("single-shot text purposes", () => {
  it.each([
    ["weekly_brief", "src/lib/weekly-brief.ts"],
    ["suggestion", "src/lib/suggestions.ts"],
    ["report", "src/lib/reports.ts"],
  ])("%s carries an output token limit", (purpose, file) => {
    const source = readFileSync(path.resolve(__dirname, "../..", file), "utf8");
    expect(source).toContain(`maxOutputTokens: TEXT_PURPOSE_MAX_OUTPUT_TOKENS.${purpose}`);
  });
});
