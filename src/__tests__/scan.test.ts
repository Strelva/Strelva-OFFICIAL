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

function tenant(id: string, active = true): TenantConfig {
  return { id, active } as unknown as TenantConfig;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
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
    expect(mockRunAudit).toHaveBeenCalledWith("https://greatlakesdriedfruit.com");

    // overallScore is the (real) weighted average; single weight-1 cat => 82.
    expect(result.overallScore).toBe(82);
    expect(result.grade).toBe("B"); // scoreToGrade(82)

    // Persisted summary is slim: url/scannedAt/overallScore/grade/categories only.
    expect(mockSaveScanSummary).toHaveBeenCalledTimes(1);
    const [savedTenant, savedSummary] = mockSaveScanSummary.mock.calls[0];
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
