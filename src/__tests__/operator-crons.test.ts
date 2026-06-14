import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockBuildAttentionBriefing = vi.hoisted(() => vi.fn());
const mockBuildPortfolioSnapshot = vi.hoisted(() => vi.fn());
const mockSetPortfolioSummary = vi.hoisted(() => vi.fn());

vi.mock("@/lib/attention", () => ({ buildAttentionBriefing: mockBuildAttentionBriefing }));
vi.mock("@/lib/portfolio", () => ({
  buildPortfolioSnapshot: mockBuildPortfolioSnapshot,
  setPortfolioSummary: mockSetPortfolioSummary,
}));

const ORIGINAL_SLACK = process.env.SLACK_WEBHOOK_URL;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (ORIGINAL_SLACK === undefined) delete process.env.SLACK_WEBHOOK_URL;
  else process.env.SLACK_WEBHOOK_URL = ORIGINAL_SLACK;
});

describe("GET /api/cron/attention-digest", () => {
  it("posts to Slack when there are high/medium items", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/x";
    mockBuildAttentionBriefing.mockResolvedValue({
      generatedAt: "t",
      counts: { high: 1, medium: 1, low: 0 },
      items: [
        { severity: "high", kind: "launch", message: "Launch blocked — Acme" },
        { severity: "medium", kind: "ops", message: "1 failed AI write" },
      ],
    });
    const { GET } = await import("@/app/api/cron/attention-digest/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when nothing needs attention", async () => {
    process.env.SLACK_WEBHOOK_URL = "https://hooks.slack.test/x";
    mockBuildAttentionBriefing.mockResolvedValue({
      generatedAt: "t",
      counts: { high: 0, medium: 0, low: 2 },
      items: [{ severity: "low", kind: "drafts", message: "1 draft waiting" }],
    });
    const { GET } = await import("@/app/api/cron/attention-digest/route");
    await GET();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/portfolio-snapshot", () => {
  it("recomputes the snapshot and warms the cache", async () => {
    mockBuildPortfolioSnapshot.mockResolvedValue({ snapshotAt: "t", tenantCount: 3 });
    mockSetPortfolioSummary.mockResolvedValue(undefined);
    const { GET } = await import("@/app/api/cron/portfolio-snapshot/route");
    const res = await GET();
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, tenants: 3 });
    expect(mockSetPortfolioSummary).toHaveBeenCalledTimes(1);
  });

  it("returns 500 (not throw) when the snapshot build fails", async () => {
    process.env.SLACK_WEBHOOK_URL = "";
    mockBuildPortfolioSnapshot.mockRejectedValue(new Error("redis down"));
    const { GET } = await import("@/app/api/cron/portfolio-snapshot/route");
    const res = await GET();
    expect(res.status).toBe(500);
  });
});
