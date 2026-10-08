import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ tenants: vi.fn(), recap: vi.fn(), send: vi.fn(), outcomes: vi.fn(), delivery: vi.fn(), html: vi.fn() }));
vi.mock("@/products/websites/index", () => ({ runWebsiteMonthlyReports: async () => ({ tenants: [], sent: 0, suppressed: 0, errors: [] }) }));
vi.mock("@/platform/infra/heartbeat", () => ({ recordHeartbeat: async () => {} }));
vi.mock("@/lib/storage/mail-log", () => ({ recordMailSend: async () => {} }));
vi.mock("@/platform/infra/monitoring", () => ({ alertOnce: async () => {} }));
vi.mock("@/lib/tenants", () => ({ getAllTenants: mocks.tenants }));
vi.mock("@/lib/weekly-brief", () => ({ generateMonthlyRecap: mocks.recap }));
vi.mock("@/lib/tenant-urls", () => ({ getTenantDashboardUrl: () => "https://fixture.example.test/dashboard/reports" }));
vi.mock("@/lib/owner-recipient", () => ({ ownerNoticeEmail: async () => "owner@example.test" }));
vi.mock("@/lib/cron-auth", () => ({ requireCronRequest: () => null }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));
vi.mock("@/platform/infra/email/send", () => ({ sendEmail: mocks.send }));
vi.mock("@/platform/infra/email/layout", () => ({ renderEmailHtml: mocks.html, renderEmailText: () => "fixture text" }));
vi.mock("@/platform/business-outcomes/reports", () => ({ readBusinessOutcomeReports: mocks.outcomes, deliverBusinessOutcomeReport: mocks.delivery }));
import { GET } from "@/app/api/cron/monthly-report/route";
const report = { workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", primaryTenantId: "a", tenantIds: ["a", "b"], line: { text: "9 inquiries. 3 bookings, 2 of them from a website inquiry.", figures: [] } };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("EMAIL_SENDING_ENABLED", "true"); vi.stubEnv("RESEND_API_KEY", "local-provider-double");
  mocks.tenants.mockResolvedValue([{ id: "a", siteName: "Fixture A", active: true }, { id: "b", siteName: "Fixture B", active: true }]);
  mocks.recap.mockResolvedValue({ weekStart: "2026-09-01", summary: "Existing monthly recap.", stats: { pageViews: 412, pageViewsDelta: 0 } });
  mocks.send.mockResolvedValue(true); mocks.outcomes.mockResolvedValue([]); mocks.html.mockReturnValue("fixture html");
  mocks.delivery.mockImplementation(async (_report, _month, send: () => Promise<{ status: string }>) => send());
});
afterEach(() => vi.unstubAllEnvs());
describe("monthly report outcome integration", () => {
  it("retains both original tenant reports with unchanged paragraphs when outcomes are off", async () => {
    const response = await GET(new Request("https://fixture.example.test/api/cron/monthly-report"));
    expect((await response.json()).sent).toBe(2); expect(mocks.delivery).not.toHaveBeenCalled();
    expect(mocks.html.mock.calls.every(call => JSON.stringify(call[0].paragraphs) === JSON.stringify(["Existing monthly recap."]))).toBe(true);
  });
  it("sends one grouped business report through the existing transport and durable receipt", async () => {
    mocks.outcomes.mockResolvedValue([report]);
    const response = await GET(new Request("https://fixture.example.test/api/cron/monthly-report"));
    expect((await response.json()).sent).toBe(1); expect(mocks.recap).toHaveBeenCalledWith("a"); expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.html).toHaveBeenCalledWith(expect.objectContaining({ paragraphs: ["Existing monthly recap.", `Across your business: ${report.line.text}`] }));
    expect(mocks.delivery).toHaveBeenCalledWith(report, expect.stringMatching(/^\d{4}-\d{2}$/), expect.any(Function));
  });
  it("does not contact the provider when the grouped report receipt refuses duplicate delivery", async () => {
    mocks.outcomes.mockResolvedValue([report]); mocks.delivery.mockResolvedValue({ status: "suppressed", reason: "already_reserved" });
    const response = await GET(new Request("https://fixture.example.test/api/cron/monthly-report"));
    expect((await response.json()).sent).toBe(0); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not resend after an accepted report loses its cache marker and grouping becomes unavailable", async () => {
    mocks.outcomes.mockResolvedValueOnce([report]);
    expect((await (await GET(new Request("https://fixture.example.test/api/cron/monthly-report"))).json()).sent).toBe(1);
    mocks.outcomes.mockResolvedValueOnce(null);
    expect((await (await GET(new Request("https://fixture.example.test/api/cron/monthly-report"))).json()).sent).toBe(0);
    expect(mocks.send).toHaveBeenCalledOnce();
  });

});
