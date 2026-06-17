import { beforeEach, describe, expect, it, vi } from "vitest";

const mockIsSuperAdmin = vi.hoisted(() => vi.fn());
const mockGetPortfolioSummary = vi.hoisted(() => vi.fn());
const mockBuildPortfolioSnapshot = vi.hoisted(() => vi.fn());
const mockSetPortfolioSummary = vi.hoisted(() => vi.fn());
const mockBuildOpsReport = vi.hoisted(() => vi.fn());
const mockGetAuditLog = vi.hoisted(() => vi.fn());
const mockGetAllAuditEvents = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth", () => ({ isSuperAdmin: mockIsSuperAdmin }));
vi.mock("@/lib/portfolio", () => ({
  getPortfolioSummary: mockGetPortfolioSummary,
  buildPortfolioSnapshot: mockBuildPortfolioSnapshot,
  setPortfolioSummary: mockSetPortfolioSummary,
}));
vi.mock("@/lib/ops", () => ({ buildOpsReport: mockBuildOpsReport }));
vi.mock("@/lib/storage", () => ({
  getAuditLog: mockGetAuditLog,
  getAllAuditEvents: mockGetAllAuditEvents,
}));

const SNAPSHOT = { snapshotAt: "2026-06-14T00:00:00Z", tenantCount: 3, mrr: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSuperAdmin.mockResolvedValue(true);
  mockGetPortfolioSummary.mockResolvedValue(SNAPSHOT);
  mockBuildPortfolioSnapshot.mockResolvedValue(SNAPSHOT);
  mockSetPortfolioSummary.mockResolvedValue(undefined);
  mockBuildOpsReport.mockResolvedValue({ timestamp: "t", activeTenants: 3, metrics: {}, revalidationFailures: [] });
  mockGetAuditLog.mockResolvedValue([{ id: "a1", action: "tenant.update" }]);
  mockGetAllAuditEvents.mockResolvedValue([{ id: "a2", action: "paylink.create" }]);
});

describe("GET /api/admin/portfolio", () => {
  it("403s a non-super-admin", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const { GET } = await import("@/app/api/admin/portfolio/route");
    expect((await GET()).status).toBe(403);
  });

  it("returns the cached snapshot without recomputing", async () => {
    const { GET } = await import("@/app/api/admin/portfolio/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ...SNAPSHOT, cached: true });
    expect(mockBuildPortfolioSnapshot).not.toHaveBeenCalled();
  });

  it("recomputes and repopulates on cache miss", async () => {
    mockGetPortfolioSummary.mockResolvedValue(null);
    const { GET } = await import("@/app/api/admin/portfolio/route");
    const body = await (await GET()).json();
    expect(body.cached).toBe(false);
    expect(mockBuildPortfolioSnapshot).toHaveBeenCalledTimes(1);
    expect(mockSetPortfolioSummary).toHaveBeenCalledTimes(1);
  });
});

describe("GET /api/admin/ops", () => {
  it("403s a non-super-admin", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const { GET } = await import("@/app/api/admin/ops/route");
    expect((await GET()).status).toBe(403);
  });

  it("returns the ops report", async () => {
    const { GET } = await import("@/app/api/admin/ops/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).activeTenants).toBe(3);
  });
});

describe("GET /api/admin/audit", () => {
  function req(query = "") {
    return new Request(`http://localhost/api/admin/audit${query}`);
  }

  it("403s a non-super-admin", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const { GET } = await import("@/app/api/admin/audit/route");
    expect((await GET(req())).status).toBe(403);
  });

  it("returns the portfolio-wide feed by default", async () => {
    const { GET } = await import("@/app/api/admin/audit/route");
    const body = await (await GET(req())).json();
    expect(mockGetAllAuditEvents).toHaveBeenCalled();
    expect(body.count).toBe(1);
  });

  it("scopes to a tenant when ?tenant= is passed", async () => {
    const { GET } = await import("@/app/api/admin/audit/route");
    await GET(req("?tenant=acme"));
    expect(mockGetAuditLog).toHaveBeenCalledWith("acme", expect.any(Number));
    expect(mockGetAllAuditEvents).not.toHaveBeenCalled();
  });
});
