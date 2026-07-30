import { describe, it, expect, vi, beforeEach } from "vitest";
import type { CategoryResult } from "@/lib/audit/types";
import type { TenantConfig } from "@/lib/types";

// Hoisted mocks for every collaborator scan.ts wires together. Keeping the
// scan-store writers mocked lets us assert exactly what gets persisted without
// touching Redis; keeping runAudit mocked lets one tenant "fail" on demand.
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockGetAllTenants = vi.hoisted(() => vi.fn());
const mockGetTenantPublicUrl = vi.hoisted(() => vi.fn());
const mockRunAudit = vi.hoisted(() => vi.fn());
const mockSaveScanSummary = vi.hoisted(() => vi.fn());
const mockPushScanHistory = vi.hoisted(() => vi.fn());
const mockSaveScanBaseline = vi.hoisted(() => vi.fn());
const mockGetScanBaseline = vi.hoisted(() => vi.fn());
const mockGetScanHistory = vi.hoisted(() => vi.fn());
const mockGetGa4Perf = vi.hoisted(() => vi.fn());
const mockGetLeadSummary = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenants", () => ({
  getTenantConfig: mockGetTenantConfig,
  getAllTenants: mockGetAllTenants,
}));
vi.mock("@/lib/tenant-urls", () => ({
  getTenantPublicUrl: mockGetTenantPublicUrl,
}));
vi.mock("@/lib/audit/checks", () => ({
  runAudit: mockRunAudit,
}));
vi.mock("@/lib/scan-store", () => ({
  saveScanSummary: mockSaveScanSummary,
  pushScanHistory: mockPushScanHistory,
  saveScanBaseline: mockSaveScanBaseline,
  getScanBaseline: mockGetScanBaseline,
  getScanHistory: mockGetScanHistory,
}));
vi.mock("@/lib/analytics", () => ({
  getGa4Perf: mockGetGa4Perf,
}));
vi.mock("@/lib/leads", () => ({
  getLeadSummary: mockGetLeadSummary,
}));

import { scanTenant, scanAllTenants } from "@/lib/scan";

// computeOverallScore is the real (unmocked) implementation — it averages
// weighted category scores. We use a single weight-1 category so the expected
// overall score is just that category's score, keeping the assertion exact
// without re-deriving the weighting math here.
const detail: CategoryResult[] = [
  {
    name: "Basic SEO",
    slug: "seo",
    weight: 1,
    score: 82,
    checks: [],
  } as unknown as CategoryResult,
];

// A detail with a real failing check, so prioritizeIssues (real, unmocked)
// produces a non-empty verdict that scanTenant must persist.
const failingDetail: CategoryResult[] = [
  {
    name: "Basic SEO",
    slug: "seo",
    weight: 1,
    score: 40,
    checks: [
      {
        name: "Meta description",
        status: "fail",
        score: 0,
        message: "Missing meta description",
        impact: "Google writes its own, often poorly.",
        quantified: "~$120/mo in conversions (estimated)",
        priority: "high",
      },
      { name: "Title tag", status: "pass", score: 100, message: "Present" },
    ],
  } as unknown as CategoryResult,
];

function tenant(id: string, active = true): TenantConfig {
  return { id, active } as unknown as TenantConfig;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  // Default: no GA4 data yet (pre-activation) → audit stays on the generic
  // prior, so scanTenant calls runAudit with `{ traffic: undefined }`.
  mockGetGa4Perf.mockResolvedValue({ status: "unconfigured", users: 0 });
  mockGetLeadSummary.mockResolvedValue({ count: 0 });
  // No baseline yet → scanTenant seeds one from history.
  mockGetScanBaseline.mockResolvedValue(null);
  mockGetScanHistory.mockResolvedValue([]);
});

describe("scanTenant", () => {
  it("resolves the live production URL, audits it, persists a slim summary + history point, and returns full detail", async () => {
    const config = tenant("gldf");
    mockGetTenantConfig.mockResolvedValue(config);
    mockGetTenantPublicUrl.mockReturnValue("https://greatlakesdriedfruit.com");
    mockRunAudit.mockResolvedValue(detail);

    const result = await scanTenant("gldf");

    // Live production URL, not the dev/localhost host.
    expect(mockGetTenantPublicUrl).toHaveBeenCalledWith(config, "production");
    // No GA4 data → generic prior (traffic undefined).
    expect(mockRunAudit).toHaveBeenCalledWith("https://greatlakesdriedfruit.com", {
      traffic: undefined,
    });

    // overallScore is the (real) weighted average; single weight-1 cat => 82.
    expect(result.overallScore).toBe(82);
    expect(result.grade).toBe("B"); // scoreToGrade(82)

    // Persisted summary is slim: url/scannedAt/overallScore/grade/categories only.
    expect(mockSaveScanSummary).toHaveBeenCalledTimes(1);
    const [savedTenant, savedSummary] = mockSaveScanSummary.mock.calls[0]!;
    expect(savedTenant).toBe("gldf");
    expect(savedSummary).toEqual({
      url: "https://greatlakesdriedfruit.com",
      scannedAt: expect.any(String),
      overallScore: 82,
      grade: "B",
      categories: [{ name: "Basic SEO", slug: "seo", score: 82 }],
    });
    // No full per-check detail leaks into the persisted store.
    expect(savedSummary.categories[0]).not.toHaveProperty("checks");

    // History point mirrors the summary's score/grade/timestamp.
    expect(mockPushScanHistory).toHaveBeenCalledWith("gldf", {
      scannedAt: savedSummary.scannedAt,
      overallScore: 82,
      grade: "B",
    });

    // Return value = persisted summary PLUS the full category detail for the UI.
    expect(result).toEqual({ ...savedSummary, detail });
    expect(result.detail).toBe(detail);
  });

  it("persists the ranked fix-first verdict (compact) for a tenant with failing checks", async () => {
    mockGetTenantConfig.mockResolvedValue(tenant("gldf"));
    mockGetTenantPublicUrl.mockReturnValue("https://greatlakesdriedfruit.com");
    mockRunAudit.mockResolvedValue(failingDetail);

    await scanTenant("gldf");

    const [, savedSummary] = mockSaveScanSummary.mock.calls[0]!;
    expect(savedSummary.prioritizedIssues).toBeTruthy();
    expect(savedSummary.prioritizedIssues.length).toBeGreaterThan(0);
    expect(savedSummary.prioritizedIssues[0]).toMatchObject({
      message: "Missing meta description",
      category: "Basic SEO",
      priority: "high",
      quantified: "~$120/mo in conversions (estimated)",
    });
    // Compact: the heavy live-only fields never leak into the persisted verdict.
    expect(savedSummary.prioritizedIssues[0]).not.toHaveProperty("score");
    expect(savedSummary.prioritizedIssues[0]).not.toHaveProperty("status");
    expect(savedSummary.prioritizedIssues[0]).not.toHaveProperty("categorySlug");
  });

  it("omits prioritizedIssues entirely when the audit has no failing checks", async () => {
    mockGetTenantConfig.mockResolvedValue(tenant("gldf"));
    mockGetTenantPublicUrl.mockReturnValue("https://greatlakesdriedfruit.com");
    mockRunAudit.mockResolvedValue(detail); // empty checks → no issues

    await scanTenant("gldf");

    const [, savedSummary] = mockSaveScanSummary.mock.calls[0]!;
    expect(savedSummary).not.toHaveProperty("prioritizedIssues");
  });

  it("threads a paying client's real GA4 + leads traffic into the audit (B5.3)", async () => {
    mockGetTenantConfig.mockResolvedValue(tenant("gldf"));
    mockGetTenantPublicUrl.mockReturnValue("https://greatlakesdriedfruit.com");
    mockRunAudit.mockResolvedValue(detail);
    // 2000 real monthly visitors, 40 real leads → conversion 40/2000 = 0.02.
    mockGetGa4Perf.mockResolvedValue({ status: "ok", users: 2000 });
    mockGetLeadSummary.mockResolvedValue({ count: 40 });

    await scanTenant("gldf");

    expect(mockRunAudit).toHaveBeenCalledWith("https://greatlakesdriedfruit.com", {
      traffic: { monthlyVisitors: 2000, conversionRate: 0.02, orderValue: 75, source: "measured" },
    });
  });

  // The conversion rate is clamped to [0.005, 0.5]. Without the ceiling a tenant
  // whose leads momentarily exceed GA4 users (bot-inflated leads, a GA4 undercount,
  // a tiny sample) would multiply the dollar-impact into an absurd figure on their
  // dashboard. These lock the bounds so a refactor can't silently drop them.
  it("clamps the conversion rate to the 0.5 ceiling when leads exceed visitors (B5.3)", async () => {
    mockGetTenantConfig.mockResolvedValue(tenant("gldf"));
    mockGetTenantPublicUrl.mockReturnValue("https://greatlakesdriedfruit.com");
    mockRunAudit.mockResolvedValue(detail);
    // 50 leads over just 10 GA4 users → raw 5.0, must clamp to 0.5 (not 5.0).
    mockGetGa4Perf.mockResolvedValue({ status: "ok", users: 10 });
    mockGetLeadSummary.mockResolvedValue({ count: 50 });

    await scanTenant("gldf");

    expect(mockRunAudit).toHaveBeenCalledWith("https://greatlakesdriedfruit.com", {
      traffic: { monthlyVisitors: 10, conversionRate: 0.5, orderValue: 75, source: "measured" },
    });
  });

  it("clamps the conversion rate to the 0.005 floor for high-traffic, low-lead tenants (B5.3)", async () => {
    mockGetTenantConfig.mockResolvedValue(tenant("gldf"));
    mockGetTenantPublicUrl.mockReturnValue("https://greatlakesdriedfruit.com");
    mockRunAudit.mockResolvedValue(detail);
    // 1 lead over 100k users → raw 0.00001, must clamp up to the 0.005 floor.
    mockGetGa4Perf.mockResolvedValue({ status: "ok", users: 100000 });
    mockGetLeadSummary.mockResolvedValue({ count: 1 });

    await scanTenant("gldf");

    expect(mockRunAudit).toHaveBeenCalledWith("https://greatlakesdriedfruit.com", {
      traffic: { monthlyVisitors: 100000, conversionRate: 0.005, orderValue: 75, source: "measured" },
    });
  });

  it("falls back to the generic conversion prior when a tenant has real traffic but no leads (B5.3)", async () => {
    mockGetTenantConfig.mockResolvedValue(tenant("gldf"));
    mockGetTenantPublicUrl.mockReturnValue("https://greatlakesdriedfruit.com");
    mockRunAudit.mockResolvedValue(detail);
    // Real GA4 visitors but zero leads → no conversion signal → generic 0.03,
    // while monthlyVisitors stays the tenant's real number.
    mockGetGa4Perf.mockResolvedValue({ status: "ok", users: 2000 });
    mockGetLeadSummary.mockResolvedValue({ count: 0 });

    await scanTenant("gldf");

    expect(mockRunAudit).toHaveBeenCalledWith("https://greatlakesdriedfruit.com", {
      traffic: { monthlyVisitors: 2000, conversionRate: 0.03, orderValue: 75, source: "measured" },
    });
  });

  it("seeds the durable day-0 baseline once, from the earliest retained point (B5.4)", async () => {
    mockGetTenantConfig.mockResolvedValue(tenant("gldf"));
    mockGetTenantPublicUrl.mockReturnValue("https://greatlakesdriedfruit.com");
    mockRunAudit.mockResolvedValue(detail);
    mockGetScanBaseline.mockResolvedValue(null); // no anchor yet
    const earliest = { scannedAt: "2026-04-01T00:00:00.000Z", overallScore: 55, grade: "D" as const };
    mockGetScanHistory.mockResolvedValue([earliest, { scannedAt: "x", overallScore: 82, grade: "B" as const }]);

    await scanTenant("gldf");

    // Anchor seeded from the earliest point, not today's fresh scan.
    expect(mockSaveScanBaseline).toHaveBeenCalledWith("gldf", earliest);
  });

  it("does not overwrite an existing baseline anchor", async () => {
    mockGetTenantConfig.mockResolvedValue(tenant("gldf"));
    mockGetTenantPublicUrl.mockReturnValue("https://greatlakesdriedfruit.com");
    mockRunAudit.mockResolvedValue(detail);
    mockGetScanBaseline.mockResolvedValue({ scannedAt: "2026-01-01T00:00:00.000Z", overallScore: 40, grade: "F" });

    await scanTenant("gldf");

    expect(mockSaveScanBaseline).not.toHaveBeenCalled();
  });

  it("throws for an unknown tenant and never audits or persists", async () => {
    mockGetTenantConfig.mockResolvedValue(null);

    await expect(scanTenant("nope")).rejects.toThrow('No tenant "nope"');
    expect(mockRunAudit).not.toHaveBeenCalled();
    expect(mockSaveScanSummary).not.toHaveBeenCalled();
    expect(mockPushScanHistory).not.toHaveBeenCalled();
  });
});

describe("scanAllTenants", () => {
  it("scans only active tenants, isolates a per-tenant failure, and returns {scanned, failed}", async () => {
    mockGetAllTenants.mockResolvedValue([
      tenant("gldf", true),
      tenant("dormant", false), // inactive — must be skipped
      tenant("rohlax", true),
    ]);

    // getTenantConfig echoes back a config for any id (all "exist").
    mockGetTenantConfig.mockImplementation(async (id: string) => tenant(id));
    mockGetTenantPublicUrl.mockImplementation((c: TenantConfig) => `https://${c.id}.example.com`);

    // rohlax's audit blows up (e.g. dead DNS); gldf succeeds.
    mockRunAudit.mockImplementation(async (url: string) => {
      if (url.includes("rohlax")) throw new Error("dead DNS");
      return detail;
    });

    const outcome = await scanAllTenants();

    // Inactive tenant never scanned.
    const auditedUrls = mockRunAudit.mock.calls.map((c) => c[0]);
    expect(auditedUrls).toContain("https://gldf.example.com");
    expect(auditedUrls).toContain("https://rohlax.example.com");
    expect(auditedUrls).not.toContain("https://dormant.example.com");

    // The healthy tenant still landed despite the other one throwing.
    expect(outcome.scanned).toEqual([{ tenant: "gldf", grade: "B", score: 82 }]);
    expect(outcome.failed).toEqual([{ tenant: "rohlax", error: "dead DNS" }]);

    // gldf's summary was persisted; rohlax's was not.
    const persistedTenants = mockSaveScanSummary.mock.calls.map((c) => c[0]);
    expect(persistedTenants).toEqual(["gldf"]);
  });

  it("returns empty arrays when there are no active tenants", async () => {
    mockGetAllTenants.mockResolvedValue([tenant("dormant", false)]);

    const outcome = await scanAllTenants();

    expect(outcome).toEqual({ scanned: [], failed: [], deferred: 0, windowIndex: undefined, windowCount: undefined });
    expect(mockRunAudit).not.toHaveBeenCalled();
  });

  it("caps the run and rotates the covered window when a per-run window is given", async () => {
    mockGetAllTenants.mockResolvedValue([
      tenant("a", true),
      tenant("b", true),
      tenant("c", true),
      tenant("d", true),
    ]);
    mockGetTenantConfig.mockImplementation(async (id: string) => tenant(id));
    mockGetTenantPublicUrl.mockImplementation((c: TenantConfig) => `https://${c.id}.example.com`);
    mockRunAudit.mockResolvedValue(detail);

    // 4 active tenants, cap 2 → 2 windows. rotateIndex 0 = first half, 1 = second half.
    const run0 = await scanAllTenants(6, { maxPerRun: 2, rotateIndex: 0 });
    expect(run0.scanned.map((s) => s.tenant)).toEqual(["a", "b"]);
    expect(run0.deferred).toBe(2);
    expect(run0.windowCount).toBe(2);

    const run1 = await scanAllTenants(6, { maxPerRun: 2, rotateIndex: 1 });
    expect(run1.scanned.map((s) => s.tenant)).toEqual(["c", "d"]);
    expect(run1.deferred).toBe(2);

    // rotateIndex wraps modulo windowCount, so day 2 covers the first half again.
    const run2 = await scanAllTenants(6, { maxPerRun: 2, rotateIndex: 2 });
    expect(run2.scanned.map((s) => s.tenant)).toEqual(["a", "b"]);
  });
});
