import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const reads = vi.hoisted(() => ({
  getClickCounts: vi.fn(),
  getActivity: vi.fn(),
  listDrafts: vi.fn(),
  getDailyMetrics: vi.fn(),
  getScanSummary: vi.fn(),
  getScanHistory: vi.fn(),
  listTenantDomainClaims: vi.fn(),
  serializeDomainClaim: vi.fn(),
  getLatestSnapshots: vi.fn(),
  diffSnapshots: vi.fn(),
  diagnoseVisibility: vi.fn(),
  summarizeVisibility: vi.fn(),
  getReviews: vi.fn(),
  getAdminReviewIntelligence: vi.fn(),
  getTenantCrm: vi.fn(),
  getAccountForTenant: vi.fn(),
  getSuggestions: vi.fn(),
  operatorSuggestions: vi.fn(),
  getVercelProjectStatus: vi.fn(),
  getTenantAtRisk: vi.fn(),
  getTenantLaunchReadinessResults: vi.fn(),
  resolveBillingType: vi.fn(),
  getGoal: vi.fn(),
  getReportCadence: vi.fn(),
  getReplyVoice: vi.fn(),
  getContentAutonomy: vi.fn(),
  getClientEmailOverride: vi.fn(),
  getClientLeadsForOperator: vi.fn(),
  loadOwnerInvitations: vi.fn(),
  loadDomainView: vi.fn(),
  loadBusinessEffort: vi.fn(),
}));
vi.mock("@/lib/storage", () => ({ getClickCounts: reads.getClickCounts, getActivity: reads.getActivity, listDrafts: reads.listDrafts, getDailyMetrics: reads.getDailyMetrics }));
vi.mock("@/lib/scan-store", () => ({ getScanSummary: reads.getScanSummary, getScanHistory: reads.getScanHistory }));
vi.mock("@/lib/domains", () => ({ listTenantDomainClaims: reads.listTenantDomainClaims, serializeDomainClaim: reads.serializeDomainClaim }));
vi.mock("@/lib/visibility/snapshots", () => ({ getLatestSnapshots: reads.getLatestSnapshots, diffSnapshots: reads.diffSnapshots }));
vi.mock("@/lib/visibility/diagnose", () => ({ diagnoseVisibility: reads.diagnoseVisibility, summarizeVisibility: reads.summarizeVisibility }));
vi.mock("@/lib/reviews", () => ({ getReviews: reads.getReviews }));
vi.mock("@/lib/reviews/intelligence", () => ({ getAdminReviewIntelligence: reads.getAdminReviewIntelligence }));
vi.mock("@/lib/tenant-crm", () => ({ getTenantCrm: reads.getTenantCrm }));
vi.mock("@/lib/accounts", () => ({ getAccountForTenant: reads.getAccountForTenant }));
vi.mock("@/lib/suggestions", () => ({ getSuggestions: reads.getSuggestions, operatorSuggestions: reads.operatorSuggestions }));
vi.mock("@/lib/vercel", () => ({ getVercelProjectStatus: reads.getVercelProjectStatus }));
vi.mock("@/lib/churn", () => ({ getTenantAtRisk: reads.getTenantAtRisk }));
vi.mock("@/lib/production-readiness-rules", () => ({ getTenantLaunchReadinessResults: reads.getTenantLaunchReadinessResults }));
vi.mock("@/lib/billing-type", () => ({ resolveBillingType: reads.resolveBillingType }));
vi.mock("@/lib/goals", () => ({ getGoal: reads.getGoal }));
vi.mock("@/lib/report-cadence", () => ({ getReportCadence: reads.getReportCadence }));
vi.mock("@/lib/reviews/reply-voice", () => ({ getReplyVoice: reads.getReplyVoice }));
vi.mock("@/lib/content-autonomy", () => ({ getContentAutonomy: reads.getContentAutonomy }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: reads.getClientEmailOverride }));
vi.mock("@/lib/client-leads", () => ({ getClientLeadsForOperator: reads.getClientLeadsForOperator }));
vi.mock("@/platform/owner-entry/operator-invitations", () => ({ loadOwnerInvitations: reads.loadOwnerInvitations }));
vi.mock("@/platform/operator-queue/domain-view-loader", () => ({ loadDomainView: reads.loadDomainView }));
vi.mock("@/app/admin/work/effort-data", () => ({ loadBusinessEffort: reads.loadBusinessEffort }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: async () => true }));
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: async () => undefined }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: async () => ({ id: "fixture", siteName: "Fixture business", active: true }) }));
vi.mock("@/lib/tenant-urls", () => ({ getTenantPublicUrl: () => "https://fixture.test", getTenantDashboardFallbackUrl: () => "https://app.test/workspace" }));
vi.mock("@/platform/infra/email/enabled", () => ({ emailSendingPaused: () => true }));
vi.mock("@/app/admin/clients/[id]/GoalEditor", () => ({ GoalEditor: () => null }));
vi.mock("@/app/admin/clients/[id]/TenantEditor", () => ({ TenantEditor: () => null }));
vi.mock("@/app/admin/clients/[id]/OperatorControlsPanel", () => ({ OperatorControlsPanel: () => null }));
vi.mock("@/app/admin/clients/[id]/ReleaseFlagsPanel", () => ({ ReleaseFlagsPanel: () => null }));
vi.mock("@/app/admin/clients/[id]/OwnerInvitationsPanel", () => ({ OwnerInvitationsPanel: () => null }));
vi.mock("@/app/admin/clients/[id]/SiteScan", () => ({ SiteScan: () => null }));
vi.mock("@/app/admin/clients/[id]/ReviewIntelPanel", () => ({ ReviewIntelPanel: () => null }));
vi.mock("@/app/admin/clients/[id]/DomainManager", () => ({ DomainManager: () => null }));
vi.mock("@/app/admin/clients/[id]/DomainView", () => ({ DomainView: () => null }));
vi.mock("@/app/admin/clients/[id]/VisibilityPanel", () => ({ VisibilityPanel: () => null }));
vi.mock("@/app/admin/clients/[id]/ClientCrmSections", () => ({ ClientCrmSections: () => null }));
vi.mock("@/app/admin/clients/[id]/OperatorOpportunities", () => ({ OperatorOpportunities: () => null }));
vi.mock("@/app/admin/clients/[id]/DeploymentStatus", () => ({ DeploymentStatus: () => null }));
vi.mock("@/app/admin/clients/[id]/BillingPanel", () => ({ BillingPanel: () => null }));
vi.mock("@/app/admin/clients/[id]/IntegrationsPanel", () => ({ IntegrationsPanel: () => null }));
vi.mock("@/app/admin/client-leads/ClientLeadList", () => ({ ClientLeadList: () => null }));
vi.mock("@/app/admin/work/BusinessEffort", () => ({ BusinessEffortForSite: () => null }));

import ClientDetailPage from "@/app/admin/clients/[id]/page";
import { scanEvidenceIssue } from "@/app/admin/clients/[id]/client-read-health";
import type { ScanSummary } from "@/lib/scan-store";

async function page() {
  return renderToStaticMarkup(await ClientDetailPage({ params: Promise.resolve({ id: "fixture" }) }));
}

beforeEach(() => {
  vi.resetAllMocks();
  for (const read of Object.values(reads)) read.mockResolvedValue(null);
  reads.getClickCounts.mockResolvedValue({ total: 0, thisWeek: 0 });
  for (const name of ["getActivity", "getDailyMetrics", "getScanHistory", "listTenantDomainClaims", "getLatestSnapshots", "getReviews", "getSuggestions"]) {
    reads[name as keyof typeof reads].mockResolvedValue([]);
  }
  reads.listDrafts.mockResolvedValue({});
  reads.getScanSummary.mockResolvedValue({ grade: "A", overallScore: 100, scannedAt: new Date().toISOString() });
  reads.getAdminReviewIntelligence.mockReturnValue({ needsResponse: [] });
  reads.getTenantAtRisk.mockResolvedValue({ atRisk: false, reasons: [] });
  reads.getTenantLaunchReadinessResults.mockReturnValue([]);
  reads.getVercelProjectStatus.mockResolvedValue({ ok: true, data: {} });
  reads.getClientLeadsForOperator.mockResolvedValue({ leads: [], postgres: "ok", redis: "ok" });
  reads.getReportCadence.mockResolvedValue("monthly");
  reads.getReplyVoice.mockResolvedValue({ mode: "approve" });
  reads.getContentAutonomy.mockResolvedValue("approve");
  reads.getClientEmailOverride.mockResolvedValue("inherit");
  reads.operatorSuggestions.mockReturnValue([]);
  reads.resolveBillingType.mockReturnValue("none");
  reads.loadBusinessEffort.mockResolvedValue({ state: "disabled" });
  reads.loadDomainView.mockResolvedValue({ rows: [{ domain: "fixture.test", uptime: { state: "up" } }], monitorKnown: true, monitorScannedAt: new Date().toISOString() });
});

describe("operator client page evidence", () => {
  it("keeps Healthy for successful reads with a current site scan", async () => {
    expect(await page()).toContain("Healthy. Nothing needs you.");
  });
  it("does not turn a failed review read into Healthy", async () => {
    reads.getReviews.mockRejectedValue(new Error("private database details"));
    const html = await page();
    expect(html).not.toContain("Healthy. Nothing needs you.");
    expect(html).toContain("Unavailable: Reviews");
    expect(html).not.toContain("private database details");
  });
  it("requires scan storage so the store's fail-soft default cannot mask an outage", async () => {
    reads.getScanSummary.mockImplementation(async (_id, options) => {
      if (options?.requireStore) throw new Error("unavailable");
      return null;
    });
    const html = await page();
    expect(reads.getScanSummary).toHaveBeenCalledWith("fixture", { requireStore: true });
    expect(reads.getScanHistory).toHaveBeenCalledWith("fixture", { requireStore: true });
    expect(html).toContain("Unavailable: Site scan");
    expect(html).not.toContain("Healthy. Nothing needs you.");
  });
  it("surfaces provider error results even when they do not throw", async () => {
    reads.getVercelProjectStatus.mockResolvedValue({ ok: false, error: "token details" });
    const html = await page();
    expect(html).toContain("Unavailable: Deployment status");
    expect(html).not.toContain("Healthy. Nothing needs you.");
    expect(html).not.toContain("token details");
  });
  it("treats a missing scan as unverified", async () => {
    reads.getScanSummary.mockResolvedValue(null);
    const html = await page();
    expect(html).toContain("No site scan on record");
    expect(html).not.toContain("Healthy. Nothing needs you.");
  });
  it("marks stale scan evidence without suppressing a known failing grade", async () => {
    reads.getScanSummary.mockResolvedValue({ grade: "F", overallScore: 10, scannedAt: "2020-01-01T00:00:00Z" });
    const html = await page();
    expect(html).toContain("F-grade site. Fix the issues below.");
    expect(html).toContain("Site scan is stale");
  });
  it("keeps the most urgent known action and appends all unavailable evidence", async () => {
    reads.getTenantAtRisk.mockResolvedValue({ atRisk: true, reasons: ["Subscription past due"] });
    reads.getReviews.mockRejectedValue(new Error("offline"));
    reads.getActivity.mockRejectedValue(new Error("offline"));
    const html = await page();
    expect(html).toContain("At risk: subscription past due. Reach out.");
    expect(html).toContain("Unavailable:");
    expect(html).toContain("Reviews");
    expect(html).toContain("Activity");
  });

  it.each([
    ["getClickCounts", "Booking clicks"],
    ["listDrafts", "Content drafts"],
    ["getActivity", "Activity"],
    ["getScanHistory", "Scan history"],
    ["listTenantDomainClaims", "Domain claims"],
    ["getLatestSnapshots", "Visibility"],
    ["getTenantCrm", "Notes and CRM"],
    ["getTenantAtRisk", "Subscription risk"],
    ["getDailyMetrics", "Daily metrics"],
    ["getSuggestions", "Opportunities"],
    ["getGoal", "Goal"],
    ["getAccountForTenant", "Account"],
    ["getReportCadence", "Report cadence"],
    ["getReplyVoice", "Reply voice"],
    ["getContentAutonomy", "Content controls"],
    ["getClientEmailOverride", "Email controls"],
    ["getClientLeadsForOperator", "Inquiries"],
    ["loadDomainView", "Domain health"],
  ] as const)("preserves an unavailable %s read at the actual page boundary", async (read, label) => {
    reads[read].mockRejectedValue(new Error("offline"));
    const html = await page();
    expect(html).not.toContain("Healthy. Nothing needs you.");
    expect(html).toContain("Unavailable:");
    expect(html).toContain(label);
  });

  it("preserves structured unavailable results from gated panels", async () => {
    reads.loadBusinessEffort.mockResolvedValue({ state: "unavailable" });
    reads.loadOwnerInvitations.mockResolvedValue({ kind: "unavailable" });
    const html = await page();
    expect(html).toContain("Unavailable: Human effort, Owner invitations");
    expect(html).not.toContain("Healthy. Nothing needs you.");
  });

  it("does not label unavailable launch checks as Ready", async () => {
    reads.getTenantLaunchReadinessResults.mockImplementation(() => { throw new Error("offline"); });
    const html = await page();
    expect(html).toContain("Unavailable: Launch readiness");
    expect(html).not.toContain(">Ready<");
    expect(html).not.toContain("Healthy. Nothing needs you.");
  });

  it("keeps launch steps before uncertainty and preserves their names", async () => {
    reads.getTenantLaunchReadinessResults.mockReturnValue([{ status: "fail", name: "Connect the website domain" }]);
    reads.getReviews.mockRejectedValue(new Error("offline"));
    const html = await page();
    expect(html).toContain("Before go-live: 1 step left.");
    expect(html).toContain("Connect the website domain · Unavailable: Reviews");
  });

  it("never labels a stale passing scan as Healthy", async () => {
    reads.getScanSummary.mockResolvedValue({ grade: "A", overallScore: 100, scannedAt: "2020-01-01T00:00:00Z" });
    const html = await page();
    expect(html).toContain("Site scan is stale");
    expect(html).not.toContain("Healthy. Nothing needs you.");
  });

  it("keeps missing domain-monitor evidence in the top verdict", async () => {
    reads.loadDomainView.mockResolvedValue({ rows: [], monitorKnown: false, monitorScannedAt: null });
    const html = await page();
    expect(html).toContain("No domain monitor evidence on record");
    expect(html).not.toContain("Healthy. Nothing needs you.");
  });

  it("keeps stale domain-monitor evidence in the top verdict", async () => {
    reads.loadDomainView.mockResolvedValue({ rows: [{ domain: "fixture.test", uptime: { state: "up" } }], monitorKnown: true, monitorScannedAt: "2020-01-01T00:00:00Z" });
    const html = await page();
    expect(html).toContain("Domain monitor evidence is stale or unverified");
    expect(html).not.toContain("Healthy. Nothing needs you.");
  });
  it.each([
    { postgres: "unavailable", redis: "ok" },
    { postgres: "ok", redis: "unavailable" },
    { postgres: "unconfigured", redis: "unconfigured" },
  ])("surfaces incomplete inquiry stores even when a partial result resolves: %j", async stores => {
    reads.getClientLeadsForOperator.mockResolvedValue({ leads: [], ...stores });
    const html = await page();
    expect(html).toContain("Unavailable: Inquiries");
    expect(html).not.toContain("Healthy. Nothing needs you.");
  });
  it.each([{ rows: [] }, { rows: [{ domain: "fixture.test", uptime: null }] }, { rows: [{ domain: "fixture.test", uptime: { state: "unknown" } }] }])("does not use the fleet snapshot to certify missing site domain checks: %j", async ({ rows }) => {
    reads.loadDomainView.mockResolvedValue({ rows, monitorKnown: true, monitorScannedAt: new Date().toISOString() });
    const html = await page();
    expect(html).toContain("Domain checks are unavailable for this site");
    expect(html).not.toContain("Healthy. Nothing needs you.");
  });
  it("does not label a failed current domain check as Healthy", async () => {
    reads.loadDomainView.mockResolvedValue({ rows: [{ domain: "fixture.test", uptime: { state: "down" } }], monitorKnown: true, monitorScannedAt: new Date().toISOString() });
    const html = await page();
    expect(html).toContain("A domain check needs attention");
    expect(html).not.toContain("Healthy. Nothing needs you.");
  });
});

describe("scan evidence freshness", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  const scan: ScanSummary = { grade: "A", overallScore: 100, url: "https://fixture.test", categories: [], scannedAt: "2026-10-11T10:00:00Z" };

  it("uses the existing 26-hour portfolio scan freshness allowance", () => {
    expect(scanEvidenceIssue(scan, now)).toBeNull();
    expect(scanEvidenceIssue(scan, now + 1)).toContain("stale");
  });

  it.each(["invalid date", "2026-10-13T12:00:00Z"])("requires a new scan for an unverified time: %s", (scannedAt) => {
    expect(scanEvidenceIssue({ ...scan, scannedAt }, now)).toContain("time is unverified");
  });
});
