import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const reads = vi.hoisted(() => ({ activity: vi.fn(), drafts: vi.fn(), threads: vi.fn(), brief: vi.fn(), subscription: vi.fn(), scan: vi.fn(), risk: vi.fn(), launch: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: async () => true }));
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: async () => undefined }));
vi.mock("@/lib/tenants", () => ({ getAllTenants: async () => [{ id: "fixture", siteName: "The Mooney Firm", active: true }], isActiveTenant: () => true }));
vi.mock("@/app/admin/client-businesses", () => ({ readClientBusinessCount: async () => 1 }));
vi.mock("@/app/admin/ScanAllButton", () => ({ ScanAllButton: () => null }));
vi.mock("@/lib/storage", () => ({ getActivity: reads.activity, listDrafts: reads.drafts }));
vi.mock("@/lib/threads", () => ({ listThreads: reads.threads }));
vi.mock("@/lib/weekly-brief", () => ({ getWeeklyBrief: reads.brief }));
vi.mock("@/lib/subscription", () => ({ getEffectiveSubscriptionStatus: reads.subscription }));
vi.mock("@/lib/scan-store", () => ({ getScanSummary: reads.scan }));
vi.mock("@/lib/churn", () => ({ getAtRiskTenants: reads.risk }));
vi.mock("@/lib/production-readiness-rules", () => ({ getTenantLaunchReadinessResults: reads.launch }));
vi.mock("@/lib/launch-readiness", () => ({ buildTenantLaunchReadiness: () => ({ status: "ready", score: 100 }), tenantHasOwnerMessage: () => true }));
vi.mock("@/lib/billing-type", () => ({ billingLabel: () => "Plan configured", billingMonthlyCents: () => 0, isBillingConfigured: () => true, resolveBillingType: () => "tier" }));
import Page from "@/app/admin/clients/page";
const page = async () => renderToStaticMarkup(await Page());
beforeEach(() => {
  vi.resetAllMocks();
  reads.activity.mockResolvedValue([]); reads.drafts.mockResolvedValue({}); reads.threads.mockResolvedValue([]); reads.brief.mockResolvedValue(null);
  reads.subscription.mockResolvedValue("active"); reads.risk.mockResolvedValue([]); reads.launch.mockReturnValue([]);
  reads.scan.mockResolvedValue({ grade: "A", scannedAt: new Date().toISOString() });
});
describe("portfolio evidence at the real page boundary", () => {
  it("shows Live only with complete reads and a current scan", async () => { expect(await page()).toContain(">Live</span>"); });
  it.each([
    ["activity", "Activity"], ["drafts", "Content drafts"], ["threads", "Conversations"], ["brief", "Weekly brief"],
    ["subscription", "Subscription status"], ["scan", "Site scan"], ["risk", "Subscription risk"],
  ] as const)("keeps a failed %s read visible and withholds Live", async (key, label) => {
    reads[key].mockRejectedValue(new Error("private storage details"));
    const html = await page();
    expect(html).toContain("Unavailable:"); expect(html).toContain(label); expect(html).toContain("Unverified");
    expect(html).not.toContain(">Live</span>"); expect(html).not.toContain("private storage details");
  });
  it("requires the scan store instead of its fail-soft fallback", async () => {
    await page(); expect(reads.scan).toHaveBeenCalledWith("fixture", { requireStore: true });
  });
  it("marks a retained passing grade historical and never Live", async () => {
    reads.scan.mockResolvedValue({ grade: "A", scannedAt: "2020-01-01T00:00:00Z" });
    const html = await page(); expect(html).toContain("stale"); expect(html).toContain("Historical grade"); expect(html).not.toContain(">Live</span>");
  });
  it("marks missing and invalid scan evidence unverified", async () => {
    reads.scan.mockResolvedValue(null); expect(await page()).toContain("No site scan on record");
    reads.scan.mockResolvedValue({ grade: "A", scannedAt: "invalid" }); expect(await page()).toContain("time is unverified");
  });
  it("preserves known subscription risk beside unavailable evidence", async () => {
    reads.risk.mockResolvedValue([{ tenantId: "fixture", reasons: ["Subscription past due"] }]);
    reads.activity.mockRejectedValue(new Error("offline"));
    const html = await page(); expect(html).toContain("At risk"); expect(html).toContain("Unavailable: Activity");
  });
  it("does not fabricate launch readiness when its rules fail", async () => {
    reads.launch.mockImplementation(() => { throw new Error("offline"); });
    const html = await page(); expect(html).toContain("Unavailable: Launch readiness"); expect(html).not.toContain(">Live</span>");
  });
});
