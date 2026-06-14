import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAllTenants = vi.hoisted(() => vi.fn());
const mockGetActivity = vi.hoisted(() => vi.fn());
const mockListDrafts = vi.hoisted(() => vi.fn());
const mockListThreads = vi.hoisted(() => vi.fn());
const mockGetWeeklyBrief = vi.hoisted(() => vi.fn());
const mockGetEffectiveSubscriptionStatus = vi.hoisted(() => vi.fn());
const mockGetTenantLaunchReadinessResults = vi.hoisted(() => vi.fn());
const mockBuildTenantLaunchReadiness = vi.hoisted(() => vi.fn());
const mockGetTenantDeliveryModel = vi.hoisted(() => vi.fn());
const mockBuildOpsReport = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenants", () => ({
  getAllTenants: mockGetAllTenants,
  isActiveTenant: (t: { active: boolean }) => t.active,
}));
vi.mock("@/lib/storage", () => ({ getActivity: mockGetActivity, listDrafts: mockListDrafts }));
vi.mock("@/lib/threads", () => ({ listThreads: mockListThreads }));
vi.mock("@/lib/weekly-brief", () => ({ getWeeklyBrief: mockGetWeeklyBrief }));
vi.mock("@/lib/subscription", () => ({ getEffectiveSubscriptionStatus: mockGetEffectiveSubscriptionStatus }));
vi.mock("@/lib/production-readiness-rules", () => ({ getTenantLaunchReadinessResults: mockGetTenantLaunchReadinessResults }));
vi.mock("@/lib/launch-readiness", () => ({
  buildTenantLaunchReadiness: mockBuildTenantLaunchReadiness,
  tenantHasOwnerMessage: () => false,
}));
vi.mock("@/lib/custom-repos", () => ({ getTenantDeliveryModel: mockGetTenantDeliveryModel }));
vi.mock("@/lib/ops", () => ({ buildOpsReport: mockBuildOpsReport }));

import { buildPortfolioSnapshot } from "@/lib/portfolio";
import { SCAFFOLD_PLAN_MONTHLY_PRICE_DOLLARS } from "@/lib/pricing";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetActivity.mockResolvedValue([]);
  mockListDrafts.mockResolvedValue({});
  mockListThreads.mockResolvedValue([]);
  mockGetWeeklyBrief.mockResolvedValue(null);
  mockGetTenantLaunchReadinessResults.mockReturnValue([]);
  mockGetTenantDeliveryModel.mockReturnValue("custom_repo");
  mockBuildOpsReport.mockResolvedValue({ timestamp: "t", activeTenants: 0, metrics: {}, revalidationFailures: [] });
});

describe("buildPortfolioSnapshot", () => {
  it("aggregates launch status, MRR, and drafts across active tenants", async () => {
    mockGetAllTenants.mockResolvedValue([
      { id: "ready", siteName: "Ready", ownerName: "A", active: true, subscriptionStatus: "active" },
      { id: "blocked", siteName: "Blocked", ownerName: "B", active: true, subscriptionStatus: "none" },
      { id: "archived", siteName: "Old", ownerName: "C", active: false, subscriptionStatus: "none" },
    ]);
    mockGetEffectiveSubscriptionStatus.mockResolvedValue("active");
    mockListDrafts.mockImplementation((id: string) =>
      Promise.resolve(id === "blocked" ? { hero: true, services: true } : {})
    );
    mockBuildTenantLaunchReadiness.mockImplementation((input: { tenant: { id: string } }) => ({
      status: input.tenant.id === "blocked" ? "blocked" : "ready",
      score: input.tenant.id === "blocked" ? 40 : 100,
      completed: 8,
      total: 8,
      items: [],
    }));

    const snap = await buildPortfolioSnapshot();

    expect(snap.tenantCount).toBe(2); // archived excluded
    expect(snap.archivedTenantCount).toBe(1);
    expect(snap.launchReadyCount).toBe(1);
    expect(snap.launchBlockedCount).toBe(1);
    expect(snap.totalDrafts).toBe(2);
    // One tenant has subscriptionStatus "active" → MRR = 1 × plan price.
    expect(snap.mrr).toBe(SCAFFOLD_PLAN_MONTHLY_PRICE_DOLLARS);
    expect(snap.tenants.map((t) => t.id).sort()).toEqual(["blocked", "ready"]);
    expect(snap.ops.activeTenants).toBe(0);
  });

  it("handles an empty portfolio", async () => {
    mockGetAllTenants.mockResolvedValue([]);
    const snap = await buildPortfolioSnapshot();
    expect(snap.tenantCount).toBe(0);
    expect(snap.mrr).toBe(0);
    expect(snap.tenants).toEqual([]);
  });
});
