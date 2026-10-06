import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({ generateText: vi.fn() }));
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
    sink.rows.length = 0;
    previous = setModelCallSink(sink);
    sdk.generateText.mockReset();
  });
  afterEach(() => {
    setModelCallSink(previous);
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
      inputTokens: 120, outputTokens: 18, outcome: "ok", costSource: "estimate",
    })]);
  });

  it("a failed call is still a row, and the caller's own fallback still runs", async () => {
    sdk.generateText.mockRejectedValue(new Error("400 bad request"));
    const reply = await draftReviewReply({ reviewId: "r2", reviewerName: "Sam", rating: 4 }, { id: "gldf", siteName: "GLDF" });
    expect(reply.length).toBeGreaterThan(0);
    expect(sink.rows).toEqual([expect.objectContaining({ purpose: "review_reply", outcome: "error", costUsd: null, costSource: "unknown" })]);
  });
});
