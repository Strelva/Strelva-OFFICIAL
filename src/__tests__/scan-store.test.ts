import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetRedis = vi.hoisted(() => vi.fn());
vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));

import {
  saveScanSummary,
  getScanSummary,
  getScanSummaries,
  pushScanHistory,
  getScanHistory,
  type ScanSummary,
} from "@/lib/scan-store";

const summary: ScanSummary = {
  url: "https://greatlakesdriedfruit.com",
  scannedAt: "2026-06-16T00:00:00.000Z",
  overallScore: 61,
  grade: "D",
  categories: [{ name: "Basic SEO", slug: "seo", score: 82 }],
};

beforeEach(() => vi.clearAllMocks());

describe("scan-store summary", () => {
  it("saveScanSummary writes under reb:scan:{tenant} with a TTL", async () => {
    const set = vi.fn().mockResolvedValue("OK");
    mockGetRedis.mockReturnValue({ set });
    await saveScanSummary("gldf", summary);
    expect(set).toHaveBeenCalledWith(
      "reb:scan:gldf",
      summary,
      expect.objectContaining({ ex: expect.any(Number) })
    );
  });

  it("getScanSummary returns the stored summary", async () => {
    mockGetRedis.mockReturnValue({ get: vi.fn().mockResolvedValue(summary) });
    expect(await getScanSummary("gldf")).toEqual(summary);
  });

  it("getScanSummary returns null when missing", async () => {
    mockGetRedis.mockReturnValue({ get: vi.fn().mockResolvedValue(null) });
    expect(await getScanSummary("nope")).toBeNull();
  });

  it("is null-safe when Redis is unconfigured", async () => {
    mockGetRedis.mockReturnValue(null);
    expect(await getScanSummary("x")).toBeNull();
    await expect(saveScanSummary("x", summary)).resolves.toBeUndefined();
  });
});

describe("scan-store summaries (MGET)", () => {
  it("reads many summaries in one MGET, keyed by tenant", async () => {
    const mget = vi.fn().mockResolvedValue([summary, null]);
    mockGetRedis.mockReturnValue({ mget });
    const res = await getScanSummaries(["gldf", "rohlax"]);
    expect(mget).toHaveBeenCalledWith("reb:scan:gldf", "reb:scan:rohlax");
    expect(res).toEqual({ gldf: summary, rohlax: null });
  });

  it("returns {} for empty input without touching Redis", async () => {
    const mget = vi.fn();
    mockGetRedis.mockReturnValue({ mget });
    expect(await getScanSummaries([])).toEqual({});
    expect(mget).not.toHaveBeenCalled();
  });
});

describe("scan-store history", () => {
  it("pushScanHistory pipelines lpush + ltrim + expire in one exec", async () => {
    const lpush = vi.fn();
    const ltrim = vi.fn();
    const expire = vi.fn();
    const exec = vi.fn().mockResolvedValue([]);
    const pipeline = vi.fn(() => ({ lpush, ltrim, expire, exec }));
    mockGetRedis.mockReturnValue({ pipeline });

    await pushScanHistory("gldf", { scannedAt: "t", overallScore: 61, grade: "D" });

    expect(pipeline).toHaveBeenCalledTimes(1);
    expect(ltrim).toHaveBeenCalledWith("reb:scan:hist:gldf", 0, 11);
    expect(expire).toHaveBeenCalled();
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it("getScanHistory returns oldest-to-newest (reversed from newest-first lrange)", async () => {
    const newestFirst = [
      { scannedAt: "3", overallScore: 70, grade: "C" },
      { scannedAt: "2", overallScore: 61, grade: "D" },
      { scannedAt: "1", overallScore: 50, grade: "F" },
    ];
    const lrange = vi.fn().mockResolvedValue(newestFirst.map((p) => JSON.stringify(p)));
    mockGetRedis.mockReturnValue({ lrange });
    const res = await getScanHistory("gldf");
    expect(res.map((p) => p.scannedAt)).toEqual(["1", "2", "3"]);
  });

  it("getScanHistory tolerates already-parsed objects from the client", async () => {
    const lrange = vi.fn().mockResolvedValue([{ scannedAt: "1", overallScore: 50, grade: "F" }]);
    mockGetRedis.mockReturnValue({ lrange });
    expect(await getScanHistory("gldf")).toHaveLength(1);
  });

  it("getScanHistory is null-safe", async () => {
    mockGetRedis.mockReturnValue(null);
    expect(await getScanHistory("x")).toEqual([]);
  });
});
