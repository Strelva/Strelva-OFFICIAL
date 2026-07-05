import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The portfolio-scan cron must alert the owner when a fresh scan's grade dropped
// a full letter vs the LAST STORED grade — once per transition, gated by the
// client pause, and never for a first scan / same-or-better grade.

const mockScanAllTenants = vi.hoisted(() => vi.fn());
const mockGetAllTenants = vi.hoisted(() => vi.fn());
const mockGetScanSummaries = vi.hoisted(() => vi.fn());
const mockSend = vi.hoisted(() => vi.fn());
const mockRecordHeartbeat = vi.hoisted(() => vi.fn());
const mockRedisSet = vi.hoisted(() => vi.fn());
const mockRedisDel = vi.hoisted(() => vi.fn());
const mockGetRedis = vi.hoisted(() => vi.fn());

vi.mock("@/lib/scan", () => ({ scanAllTenants: mockScanAllTenants }));
vi.mock("@/lib/tenants", () => ({ getAllTenants: mockGetAllTenants }));
vi.mock("@/lib/scan-store", () => ({ getScanSummaries: mockGetScanSummaries }));
vi.mock("@/lib/delivery-email", () => ({ sendHealthRegressionEmail: mockSend }));
vi.mock("@/lib/heartbeat", () => ({ recordHeartbeat: mockRecordHeartbeat }));
vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));
vi.mock("@/lib/tenant-urls", () => ({
  getTenantDashboardUrl: (t: { id: string }, path: string) => `https://admin.${t.id}.strelva.com${path}`,
}));

function tenant(over: Record<string, unknown> = {}) {
  return { id: "gldf", siteName: "GLDF", active: true, ownerEmail: "owner@gldf.com", ...over };
}
function prior(grade: string, score = 82) {
  return { url: "https://gldf.com", scannedAt: "x", overallScore: score, grade, categories: [] };
}

async function run() {
  const { GET } = await import("@/app/api/cron/portfolio-scan/route");
  return (await GET()).json();
}

describe("GET /api/cron/portfolio-scan — health regression alert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedis.mockReturnValue({ set: mockRedisSet, del: mockRedisDel });
    mockRedisSet.mockResolvedValue("OK");
    mockRedisDel.mockResolvedValue(undefined);
    mockSend.mockResolvedValue(true);
    mockRecordHeartbeat.mockResolvedValue(undefined);
    mockGetAllTenants.mockResolvedValue([tenant()]);
  });
  afterEach(() => vi.resetModules());

  it("alerts once when the grade drops a full letter (B → C)", async () => {
    mockGetScanSummaries.mockResolvedValue({ gldf: prior("B", 82) });
    mockScanAllTenants.mockResolvedValue({ scanned: [{ tenant: "gldf", grade: "C", score: 71 }], failed: [], deferred: 0 });
    const body = await run();
    expect(body).toMatchObject({ regressionAlerts: 1 });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@gldf.com",
        previousGrade: "B",
        currentGrade: "C",
        healthUrl: "https://admin.gldf.strelva.com/dashboard/health",
      }),
    );
    expect(mockRedisSet).toHaveBeenCalledWith(
      "reb:health-alert-sent:gldf:B>C",
      "1",
      expect.objectContaining({ nx: true }),
    );
  });

  it("does not alert when the grade improved (B → A)", async () => {
    mockGetScanSummaries.mockResolvedValue({ gldf: prior("B") });
    mockScanAllTenants.mockResolvedValue({ scanned: [{ tenant: "gldf", grade: "A", score: 95 }], failed: [], deferred: 0 });
    const body = await run();
    expect(body).toMatchObject({ regressionAlerts: 0 });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("does not alert on the first scan (no stored baseline)", async () => {
    mockGetScanSummaries.mockResolvedValue({ gldf: null });
    mockScanAllTenants.mockResolvedValue({ scanned: [{ tenant: "gldf", grade: "F", score: 40 }], failed: [], deferred: 0 });
    const body = await run();
    expect(body).toMatchObject({ regressionAlerts: 0 });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("dedupes: a claimed transition marker (NX miss) skips the send", async () => {
    mockRedisSet.mockResolvedValue(null);
    mockGetScanSummaries.mockResolvedValue({ gldf: prior("B") });
    mockScanAllTenants.mockResolvedValue({ scanned: [{ tenant: "gldf", grade: "C", score: 71 }], failed: [], deferred: 0 });
    const body = await run();
    expect(body).toMatchObject({ regressionAlerts: 0 });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("respects the client pause: rolls the marker back when the send is suppressed", async () => {
    mockSend.mockResolvedValue(false);
    mockGetScanSummaries.mockResolvedValue({ gldf: prior("B") });
    mockScanAllTenants.mockResolvedValue({ scanned: [{ tenant: "gldf", grade: "C", score: 71 }], failed: [], deferred: 0 });
    const body = await run();
    expect(body).toMatchObject({ regressionAlerts: 0 });
    expect(mockRedisDel).toHaveBeenCalledWith("reb:health-alert-sent:gldf:B>C");
  });
});
