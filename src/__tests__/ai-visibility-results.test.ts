import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiVisibilityResult } from "@/lib/ai-visibility/score";

const redis = vi.hoisted(() => ({
  set: vi.fn(),
  get: vi.fn(),
  incr: vi.fn(),
  expire: vi.fn(),
}));
const getRedis = vi.hoisted(() => vi.fn((): typeof redis | null => redis));

vi.mock("@/lib/redis", () => ({ getRedis }));

import {
  getAiVisibilityResult,
  recordAiVisibilityResultView,
  saveAiVisibilityResult,
} from "@/lib/ai-visibility/results";

const result: AiVisibilityResult = {
  business: "Acme Plumbing",
  url: "https://acme.example",
  score: 42,
  grade: "F",
  verdict: "Acme Plumbing has weak AI readiness.",
  signals: [],
  citation: { probed: false, mentioned: false, recommended: false, note: "Not probed." },
  topFix: "Add LocalBusiness structured data.",
};

beforeEach(() => {
  vi.clearAllMocks();
  getRedis.mockReturnValue(redis);
  redis.set.mockResolvedValue("OK");
  redis.get.mockResolvedValue(null);
  redis.incr.mockResolvedValue(1);
  redis.expire.mockResolvedValue(1);
});

describe("AI Visibility result persistence", () => {
  it("stores a bounded public scorecard with acquisition context", async () => {
    const stored = await saveAiVisibilityResult(
      result,
      { category: "plumber", location: "Buffalo, NY" },
      "campaign-that-is-way-longer-than-needed".repeat(5),
    );

    expect(stored?.id).toMatch(/^scan_[a-z0-9]+$/i);
    expect(stored?.source?.length).toBeLessThanOrEqual(120);
    expect(redis.set).toHaveBeenCalledWith(
      `reb:ai-visibility-result:${stored?.id}`,
      stored,
      { ex: 180 * 24 * 60 * 60 },
    );
  });

  it("does not invent durability when Redis is unavailable", async () => {
    getRedis.mockReturnValue(null);
    await expect(saveAiVisibilityResult(result, {})).resolves.toBeNull();
  });

  it("rejects malformed public ids before reading Redis", async () => {
    await expect(getAiVisibilityResult("../../tenant-secret")).resolves.toBeNull();
    expect(redis.get).not.toHaveBeenCalled();
  });

  it("counts views without extending an existing retention window", async () => {
    await recordAiVisibilityResultView("scan_abc123");
    expect(redis.incr).toHaveBeenCalledWith("reb:ai-visibility-views:scan_abc123");
    expect(redis.expire).toHaveBeenCalledWith(
      "reb:ai-visibility-views:scan_abc123",
      180 * 24 * 60 * 60,
      "NX",
    );
  });
});
