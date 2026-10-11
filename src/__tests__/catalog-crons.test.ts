import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  tenants: vi.fn(), reports: vi.fn(), recap: vi.fn(), brief: vi.fn(), hosted: vi.fn(), owner: vi.fn(),
  send: vi.fn(), receipt: vi.fn(), heartbeat: vi.fn(), due: vi.fn(), mark: vi.fn(),
  search: vi.fn(), searchStatus: vi.fn(), connection: vi.fn(), released: vi.fn(),
  saveSearch: vi.fn(), suggestions: vi.fn(), redisGet: vi.fn(), redisSet: vi.fn(),
}));
vi.mock("@/lib/tenants", () => ({ getAllTenants: deps.tenants }));
vi.mock("@/lib/reports", () => ({ generateAllReports: deps.reports, buildReportSubject: () => "Your report", buildReportHeading: () => "Your report" }));
vi.mock("@/lib/weekly-brief", () => ({ generateWeeklyBrief: deps.brief, generateMonthlyRecap: deps.recap }));
vi.mock("@/products/websites/index", () => ({ runWebsiteMonthlyReports: deps.hosted }));
vi.mock("@/lib/owner-recipient", () => ({ ownerNoticeEmail: deps.owner }));
vi.mock("@/platform/infra/email/send", () => ({ sendEmail: deps.send }));
vi.mock("@/lib/storage/mail-log", () => ({ recordMailSend: async () => {} }));
vi.mock("@/platform/infra/monitoring", () => ({ alertOnce: async () => {} }));
vi.mock("@/platform/infra/heartbeat", () => ({ recordHeartbeat: deps.heartbeat }));
vi.mock("@/lib/report-cadence", () => ({ isReportDue: deps.due, markReportSent: deps.mark }));
vi.mock("@/lib/tenant-urls", () => ({ getTenantDashboardUrl: () => "https://local.example/dashboard/reports" }));
vi.mock("@/lib/invite-email", () => ({ sanitizeEmailSubjectText: (text: string) => text }));
vi.mock("@/lib/cron-auth", () => ({ requireCronRequest: (request: Request) => request.headers.get("authorization") === "Bearer local-test" ? null : new Response("Unauthorized", { status: 401 }) }));
vi.mock("@/platform/catalog-reports/receipts", async original => ({ ...await original<Record<string, unknown>>(), recordCatalogReport: deps.receipt }));
vi.mock("@/platform/catalog-reports/search-connection", () => ({ recordSearchConnection: deps.connection }));
vi.mock("@/platform/release-flags/store", () => ({ tenantReleaseFlagEnabled: deps.released }));
vi.mock("@/lib/search-console", () => ({ fetchSearchData: deps.search, fetchSearchDataWithStatus: deps.searchStatus }));
vi.mock("@/lib/storage", () => ({ setSearchData: deps.saveSearch }));
vi.mock("@/lib/suggestions", () => ({ generateSuggestionsForTenant: deps.suggestions }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => ({ get: deps.redisGet, set: deps.redisSet }) }));

import { GET as weekly } from "@/app/api/cron/weekly-report/route";
import { GET as monthly } from "@/app/api/cron/monthly-report/route";
import { GET as search } from "@/app/api/cron/search-console/route";

const tenant = { id: "gldf", siteName: "Local Store", active: true, siteUrl: "https://store.example.test", ownerEmail: "legacy@example.test" };
const report = { tenant, ownerRecipient: "resolved@example.test", summary: "Local report.", analyticsRows: [], pageViews: { thisWeek: 12 }, bookingClicks: { thisWeek: 2 } };
const searchData = { queries: [{ query: "local", clicks: 1, impressions: 20, position: 1 }], totalClicks: 1, totalImpressions: 20, fetchedAt: "2026-10-07T10:00:00Z" };
const request = () => new Request("http://localhost/api/cron/catalog", { headers: { authorization: "Bearer local-test" } });
beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_CATALOG_REPORTS_RELEASE", "0");
  vi.stubEnv("EMAIL_SENDING_ENABLED", "true"); vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", "local-test-sink"); vi.stubEnv("SLACK_WEBHOOK_URL", "");
  deps.tenants.mockResolvedValue([tenant]); deps.reports.mockResolvedValue({ reports: [report], skipped: [] });
  deps.hosted.mockResolvedValue({ tenants: [], sent: 0, suppressed: 0, errors: [] });
  deps.owner.mockResolvedValue("resolved@example.test"); deps.send.mockResolvedValue(true); deps.receipt.mockResolvedValue(true);
  deps.due.mockResolvedValue({ send: true, cadence: "monthly" });
  deps.recap.mockResolvedValue({ weekStart: "2026-09-01", summary: "Local recap.", stats: { pageViews: 12, pageViewsDelta: 1 } });
  deps.search.mockResolvedValue(searchData); deps.searchStatus.mockResolvedValue({ status: "available", data: searchData });
  deps.released.mockResolvedValue(true); deps.connection.mockResolvedValue(undefined); deps.redisGet.mockResolvedValue(null);
  deps.redisSet.mockResolvedValue("OK"); deps.heartbeat.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe("catalog cron compatibility and failure paths", () => {
  it.each([weekly, monthly, search])("rejects unauthenticated cron requests before reads or sends", async route => {
    expect((await route(new Request("http://localhost/api/cron/catalog"))).status).toBe(401);
    expect(deps.tenants).not.toHaveBeenCalled(); expect(deps.reports).not.toHaveBeenCalled(); expect(deps.send).not.toHaveBeenCalled();
  });
  it("keeps the paused weekly flags-off response byte-identical with no new tenant reads", async () => {
    vi.stubEnv("EMAIL_SENDING_ENABLED", "false");
    expect(await (await weekly(request())).text()).toBe('{"status":"skipped","reason":"email_sending_paused"}');
    expect(deps.tenants).not.toHaveBeenCalled(); expect(deps.receipt).not.toHaveBeenCalled(); expect(deps.send).not.toHaveBeenCalled();
  });
  it("adds suppression receipts to the same paused response when catalog reporting is on", async () => {
    vi.stubEnv("EMAIL_SENDING_ENABLED", "false"); vi.stubEnv("STRELVA_CATALOG_REPORTS_RELEASE", "1");
    expect(await (await weekly(request())).text()).toBe('{"status":"skipped","reason":"email_sending_paused"}');
    expect(deps.receipt).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "gldf", status: "suppressed", reason: "email_paused" }));
    expect(deps.send).not.toHaveBeenCalled();
  });
  it.each([weekly, monthly])("retains report bytes, owner resolution and one send with receipt storage unavailable", async route => {
    const off = await (await route(request())).text();
    vi.stubEnv("STRELVA_CATALOG_REPORTS_RELEASE", "1"); deps.receipt.mockResolvedValue(false);
    const on = await (await route(request())).text();
    expect(on).toBe(off); expect(deps.send).toHaveBeenCalledTimes(2);
    expect(deps.send.mock.calls.every(([input]) => input.to === "resolved@example.test")).toBe(true);
    expect(deps.receipt).toHaveBeenLastCalledWith(expect.objectContaining({ status: "accepted", recipient: "resolved@example.test" }));
  });
  it.each([weekly, monthly])("preserves failed/suppressed mail outcomes without consuming sent markers", async route => {
    deps.send.mockRejectedValueOnce(new Error("local provider failure"));
    await route(request()); expect(deps.receipt).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed" }));
    expect(deps.mark).not.toHaveBeenCalled(); expect(deps.redisSet).not.toHaveBeenCalled();
    deps.send.mockResolvedValue(false); await route(request());
    expect(deps.receipt).toHaveBeenLastCalledWith(expect.objectContaining({ status: "suppressed" }));
    expect(deps.mark).not.toHaveBeenCalled(); expect(deps.redisSet).not.toHaveBeenCalled();
  });
  it("keeps the flags-off Search Console read and response unchanged without release lookups", async () => {
    expect(await (await search(request())).text()).toBe('{"processed":1,"failed":0,"results":[{"tenant":"gldf","clicks":1,"queries":1}],"errors":[]}');
    expect(deps.search).toHaveBeenCalledWith(tenant.siteUrl); expect(deps.searchStatus).not.toHaveBeenCalled();
    expect(deps.released).not.toHaveBeenCalled(); expect(deps.connection).not.toHaveBeenCalled();
    expect(deps.saveSearch).toHaveBeenCalledWith("gldf", searchData);
  });
  it("records unreachable Search Console separately and completes even if evidence storage fails", async () => {
    vi.stubEnv("STRELVA_CATALOG_REPORTS_RELEASE", "1");
    deps.searchStatus.mockResolvedValue({ status: "unreachable", data: { ...searchData, queries: [], totalClicks: 0, totalImpressions: 0 } });
    deps.connection.mockRejectedValue(new Error("local evidence storage failed"));
    expect((await (await search(request())).json()).failed).toBe(0);
    expect(deps.connection).toHaveBeenCalledWith("gldf", "unreachable", null);
    expect(deps.search).not.toHaveBeenCalled(); expect(deps.suggestions).not.toHaveBeenCalled();
    expect(deps.heartbeat).toHaveBeenCalledWith("search-console", expect.objectContaining({ ok: true, processed: 1 }));
  });
  it("uses the original Search Console reader for row-off businesses", async () => {
    vi.stubEnv("STRELVA_CATALOG_REPORTS_RELEASE", "1"); deps.released.mockResolvedValue(false);
    await search(request()); expect(deps.search).toHaveBeenCalledOnce();
    expect(deps.searchStatus).not.toHaveBeenCalled(); expect(deps.connection).not.toHaveBeenCalled();
  });
});
