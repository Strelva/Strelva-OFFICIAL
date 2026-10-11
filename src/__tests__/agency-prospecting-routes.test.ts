import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { AiVisibilityResult } from "@/products/ai-visibility/contracts";
import type { AgencyAttribution } from "@/platform/infra/agency-attribution";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), score: vi.fn(), saveResult: vi.fn(), getResult: vi.fn(), saveLead: vi.fn(), getLeadToken: vi.fn(),
  rate: vi.fn(), redisGet: vi.fn(), audit: vi.fn(), saveReport: vi.fn(), email: vi.fn(), slack: vi.fn(), session: vi.fn(),
}));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/products/ai-visibility/server", async importOriginal => ({
  ...await importOriginal<object>(), scoreAiVisibility: mocks.score, saveAiVisibilityResult: mocks.saveResult, getAiVisibilityResult: mocks.getResult,
}));
vi.mock("@/lib/access-request-delivery", () => ({ createDeliveryStatusToken: () => "token", getExistingLeadToken: mocks.getLeadToken, saveDeliveryLead: mocks.saveLead }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.rate, rateLimitKey: () => "test-ip" }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => ({ get: mocks.redisGet, set: vi.fn() }) }));
vi.mock("@/lib/audit/checks", () => ({ runAudit: mocks.audit }));
vi.mock("@/lib/audit-report-store", () => ({ saveAuditReport: mocks.saveReport }));
vi.mock("@/lib/audit-report-email", () => ({ sendAuditReportEmail: mocks.email }));
vi.mock("@/lib/slack", () => ({ sendSlackNotification: mocks.slack }));

import { POST as check } from "@/app/api/ai-visibility/route";
import { POST as monitor } from "@/app/api/ai-visibility/[id]/monitor/route";
import { POST as lead } from "@/app/api/audit/lead/route";
import { POST as scan } from "@/app/api/audit/scan/route";
import { POST as exportAudit } from "@/app/api/audit/report/route";
import { GET as prospects } from "@/app/api/workspace/prospects/route";

const agency: AgencyAttribution = { workspaceId: "b2770000-0000-4000-8000-000000000010", slug: "northside", name: "Northside Web", contactUrl: "https://north.example/contact", brand: { logoUrl: null, accentColor: "#447a4f" } };
const result: AiVisibilityResult = { business: "Acme", url: "https://acme.example", score: 40, grade: "F", verdict: "Needs work", signals: [], topFix: "Ask Strelva to add schema.", citation: { probed: false, mentioned: false, recommended: false, note: "Not probed" } };
const categories = [{ name: "SEO", slug: "seo", score: 40, weight: 1, checks: [{ name: "Schema", status: "fail", score: 0, message: "Missing schema", details: "Ask Strelva to add it.", impact: "Optional: ask Strelva to review.", priority: "high" }] }];
const request = (path: string, body: unknown) => new NextRequest(`https://app.strelva.com${path}`, { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" } });

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("STRELVA_AGENCY_PROSPECTING_RELEASE", "1");
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "agency_prospecting_profile" ? [{ workspace_id: agency.workspaceId, slug: agency.slug, name: agency.name, contact_url: agency.contactUrl, contact_email: "north@agency.test" }] : name === "resolve_owner_brand" ? { agencyId: agency.workspaceId, name: agency.name, brand: null, emailAllowed: true, replyTo: "north@agency.test" } : null, error: null }));
  mocks.score.mockResolvedValue(result); mocks.saveResult.mockImplementation(async (value: AiVisibilityResult) => ({ id: "scan_abc123", result: value, input: {} }));
  mocks.getResult.mockResolvedValue({ id: "scan_abc123", result: { ...result, agency }, input: {} });
  mocks.rate.mockResolvedValue(false); mocks.redisGet.mockResolvedValue(null); mocks.audit.mockResolvedValue(categories);
  mocks.saveReport.mockResolvedValue("a".repeat(32)); mocks.email.mockResolvedValue(false); mocks.getLeadToken.mockResolvedValue(null); mocks.saveLead.mockResolvedValue(true);
  mocks.session.mockResolvedValue({ id: "actor", email: "north@agency.test", email_confirmed_at: "2026-10-07" });
});
afterEach(() => vi.unstubAllEnvs());

describe("agency public check attribution", () => {
  it("resolves query slug, admits quota before scoring, pins attribution and neutralizes fixes", async () => {
    const response = await check(request("/api/ai-visibility?agency=northside", { business: "Acme", agency: "southside" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ agency, topFix: "Ask your web provider to add schema.", shareUrl: "https://app.strelva.com/ai-visibility/scan_abc123" });
    expect(mocks.rpc.mock.calls[0]).toEqual(["agency_prospecting_profile", { p_slug: "northside" }]);
    expect(mocks.rpc.mock.calls[2]?.[0]).toBe("agency_prospect_admit");
    expect((mocks.rpc.mock.invocationCallOrder[2] ?? Infinity)).toBeLessThan(mocks.score.mock.invocationCallOrder[0] ?? -Infinity);
    expect(mocks.saveResult.mock.calls[0]?.[0]?.agency?.workspaceId).toBe(agency.workspaceId);
  });
  it("keeps flag-off public behavior and copy unchanged", async () => {
    vi.stubEnv("STRELVA_AGENCY_PROSPECTING_RELEASE", "0");
    const response = await check(request("/api/ai-visibility?agency=northside", { business: "Acme" }));
    expect(await response.json()).toMatchObject({ topFix: "Ask Strelva to add schema." });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not use an agency without explicit attribution", async () => {
    const response = await check(request("/api/ai-visibility", { business: "Acme" }));
    expect(await response.json()).not.toHaveProperty("agency");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it.each(["../northside", ["northside"]])("rejects malformed attribution %s", async agency => {
    expect((await check(request("/api/ai-visibility", { business: "Acme", agency }))).status).toBe(400);
    expect(mocks.score).not.toHaveBeenCalled();
  });
  it("rejects a missing/disabled profile without scoring or default routing", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect((await check(request("/api/ai-visibility?agency=unknown", { business: "Acme" }))).status).toBe(404);
    expect(mocks.score).not.toHaveBeenCalled();
  });
  it("surfaces durable quota failure before expensive work", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "agency_prospect_admit" ? { data: null, error: { message: "agency_prospect_quota" } } : { data: [{ workspace_id: agency.workspaceId, slug: agency.slug, name: agency.name, contact_url: agency.contactUrl }], error: null });
    expect((await check(request("/api/ai-visibility", { business: "Acme", agency: "northside" }))).status).toBe(429);
    expect(mocks.score).not.toHaveBeenCalled();
  });
});

describe("agency lead routing", () => {
  it("monitor uses the stored agency despite forged query/body and existing Strelva lead", async () => {
    mocks.getLeadToken.mockResolvedValue("existing-strelva");
    const response = await monitor(request("/api/ai-visibility/scan_abc123/monitor?agency=southside", { email: "OWNER@ACME.EXAMPLE", agency: "southside" }), { params: Promise.resolve({ id: "scan_abc123" }) });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("agency_prospect_capture", expect.objectContaining({ p_workspace_id: agency.workspaceId, p_source: "monitor", p_email: "owner@acme.example", p_result_id: "scan_abc123" }));
    expect(mocks.getLeadToken).not.toHaveBeenCalled(); expect(mocks.saveLead).not.toHaveBeenCalled();
  });
  it("never falls back to delivery leads when agency capture fails or flag is disabled", async () => {
    vi.stubEnv("STRELVA_AGENCY_PROSPECTING_RELEASE", "0");
    const response = await monitor(request("/api/ai-visibility/scan_abc123/monitor", { email: "owner@acme.example" }), { params: Promise.resolve({ id: "scan_abc123" }) });
    expect(response.status).toBe(503); expect(mocks.saveLead).not.toHaveBeenCalled();
  });
  it("monitor returns quota errors and does not claim success", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "agency_prospect_quota" } });
    const response = await monitor(request("/api/ai-visibility/scan_abc123/monitor", { email: "owner@acme.example" }), { params: Promise.resolve({ id: "scan_abc123" }) });
    expect(response.status).toBe(429); expect(mocks.saveLead).not.toHaveBeenCalled();
  });
  it("audit persists agency leads, retains a neutral report, and emails with agency reply routing", async () => {
    const response = await lead(request("/api/audit/lead", { name: "Jacob", email: "jacob@fixture.test", url: "fixture.example", agency: "northside" }));
    expect(response.status).toBe(200); expect(mocks.slack).not.toHaveBeenCalled();
    expect(mocks.saveReport.mock.calls[0]?.[0]).toMatchObject({ agency, categories: [{ checks: [{ details: "Ask your web provider to add it.", impact: "Optional: ask your web provider to review." }] }] });
    expect(mocks.rpc).toHaveBeenCalledWith("agency_prospect_capture", expect.objectContaining({ p_workspace_id: agency.workspaceId, p_source: "audit" }));
    expect(mocks.email).toHaveBeenCalledWith(expect.objectContaining({ replyTo: "north@agency.test", reportUrl: `https://app.strelva.com/audit/report/${"a".repeat(32)}`, result: expect.objectContaining({ agency: expect.objectContaining(agency) }) }));
  });
  it("does not email or notify Strelva when prospect persistence fails", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "agency_prospect_capture" ? { data: null, error: { message: "database unavailable" } } : { data: [{ workspace_id: agency.workspaceId, slug: agency.slug, name: agency.name, contact_url: agency.contactUrl }], error: null });
    expect((await lead(request("/api/audit/lead", { name: "Jacob", email: "jacob@fixture.test", url: "fixture.example", agency: "northside" }))).status).toBe(503);
    expect(mocks.email).not.toHaveBeenCalled(); expect(mocks.slack).not.toHaveBeenCalled();
  });
  it("returns the retained report when agency reply routing becomes unavailable after capture", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "agency_prospecting_profile" && mocks.rpc.mock.calls.filter(([call]) => call === name).length > 1) return { data: null, error: { message: "Sender lookup unavailable" } };
      return { data: name === "agency_prospecting_profile" ? [{ workspace_id: agency.workspaceId, slug: agency.slug, name: agency.name, contact_url: agency.contactUrl, contact_email: "north@agency.test" }] : null, error: null };
    });
    const response = await lead(request("/api/audit/lead", { name: "Jacob", email: "jacob@fixture.test", url: "fixture.example", agency: "northside" }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reportId: "a".repeat(32), emailed: false });
    expect(mocks.email).not.toHaveBeenCalled(); expect(mocks.slack).not.toHaveBeenCalled();
  });
  it("unattributed audit still uses the existing Strelva notification/report path", async () => {
    const response = await lead(request("/api/audit/lead", { name: "Jacob", email: "jacob@fixture.test", url: "fixture.example" }));
    expect(response.status).toBe(200); expect(mocks.slack).toHaveBeenCalledOnce(); expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.email.mock.calls[0]?.[0]?.reportUrl).toMatch(/^https:\/\/strelva.com\/audit\/report\//);
    expect(mocks.saveReport.mock.calls[0]?.[0].categories[0].checks[0].details).toBe("Ask Strelva to add it.");
  });
});

describe("audit cache and exports", () => {
  it("attributes a cached scan without contaminating the shared unbranded cache", async () => {
    const raw = { url: "https://fixture.example/", scannedAt: "2026-10-07T12:00:00Z", overallScore: 40, grade: "F", categories };
    mocks.redisGet.mockResolvedValue(raw);
    const response = await scan(request("/api/audit/scan", { url: "fixture.example", agency: "northside" }));
    expect(response.status).toBe(200); expect(mocks.audit).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ agency, categories: [{ checks: [{ details: "Ask your web provider to add it." }] }] });
    expect(raw.categories[0]?.checks[0]?.details).toBe("Ask Strelva to add it.");
  });
  it("ignores caller-forged branding on the pure export route", async () => {
    const response = await exportAudit(request("/api/audit/report", { url: "https://fixture.example", scannedAt: "2026-10-07", overallScore: 40, grade: "F", categories, agency }));
    expect(await response.text()).toContain("Prepared by Strelva."); expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("agency member read boundary", () => {
  it("requires a verified session before reading", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await prospects(new Request(`https://app.strelva.com/api/workspace/prospects?workspace=${agency.workspaceId}`))).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("passes only the server-verified actor and workspace to the membership-checked RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    const response = await prospects(new Request(`https://app.strelva.com/api/workspace/prospects?workspace=${agency.workspaceId}&userId=forged`));
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("agency_prospect_list", { p_workspace_id: agency.workspaceId, p_user_id: "actor", p_email: "north@agency.test" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("returns 403 for another agency without exposing rows", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "agency_prospect_access" } });
    expect((await prospects(new Request(`https://app.strelva.com/api/workspace/prospects?workspace=${agency.workspaceId}`))).status).toBe(403);
  });
});
