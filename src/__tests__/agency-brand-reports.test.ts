import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STRELVA_BRAND, type OwnerBrand } from "@/platform/infra/agency-brand";
import type { SendEmailInput } from "@/platform/infra/email/send";

const mock = vi.hoisted(() => ({ brand: vi.fn(), send: vi.fn(), tenants: vi.fn(), reports: vi.fn() }));
vi.mock("@/platform/agency-brand/server", () => ({ resolveTenantBrand: mock.brand }));
vi.mock("@/platform/infra/email/send", () => ({ sendEmail: mock.send }));
vi.mock("@/platform/infra/email/enabled", () => ({ emailSendingPaused: () => false }));
vi.mock("@/lib/cron-auth", () => ({ requireCronRequest: () => null }));
vi.mock("@/lib/tenants", () => ({ getAllTenants: mock.tenants }));
vi.mock("@/lib/reports", () => ({ generateAllReports: mock.reports, buildReportSubject: () => "Your weekly report", buildReportHeading: () => "Your proof this week" }));
vi.mock("@/lib/weekly-brief", () => ({ generateWeeklyBrief: async () => null, generateMonthlyRecap: async () => ({ weekStart: "2026-09-01", summary: "Your website is working.", stats: { pageViews: 47, pageViewsDelta: 1 } }) }));
vi.mock("@/lib/report-cadence", () => ({ isReportDue: async () => ({ send: true }), markReportSent: async () => null }));
vi.mock("@/lib/owner-recipient", () => ({ ownerNoticeEmail: async () => "owner@example.test" }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));
vi.mock("@/platform/infra/heartbeat", () => ({ recordHeartbeat: async () => null }));
vi.mock("@/platform/infra/monitoring", () => ({ alertOnce: async () => null }));
vi.mock("@/lib/storage/mail-log", () => ({ recordMailSend: async () => null }));
vi.mock("@/platform/catalog-reports/receipts", () => ({ recordCatalogReport: async () => null, catalogReportsMayBeOn: () => false }));
vi.mock("@/products/websites/index", () => ({ runWebsiteMonthlyReports: async () => ({ tenants: [], sent: 0, suppressed: 0, errors: [] }) }));
vi.mock("@/lib/tenant-urls", () => ({ getTenantDashboardUrl: () => "https://admin.fixture.example/dashboard/reports" }));
import { GET as weekly } from "@/app/api/cron/weekly-report/route";
import { GET as monthly } from "@/app/api/cron/monthly-report/route";

const tenant = { id: "agency-client", siteName: "The Mooney Firm", ownerEmail: "owner@example.test", active: true, resendDomain: "unverified.fixture.example" };
const agency: OwnerBrand = { agencyId: "b2640000-0000-4000-8000-000000000010", name: 'North & Web <"Owner">', logoUrl: "https://app.strelva.com/api/agency-brand/logo/fixture/digest", accentColor: "#ffff00", replyTo: "reply@north.example", credit: "runs_on_strelva" };

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
  vi.stubEnv("RESEND_API_KEY", "fictional"); vi.stubEnv("SLACK_WEBHOOK_URL", "");
  mock.tenants.mockResolvedValue([tenant]);
  mock.reports.mockResolvedValue({ reports: [{ tenant, summary: "Your website is working.", analyticsRows: [] }], skipped: [] });
  mock.send.mockResolvedValue(true);
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("agency brand in actual report cron output", () => {
  for (const [kind, route] of [["weekly", weekly], ["monthly", monthly]] as const) {
    it(`${kind} pins the business brand, Strelva sender and owner-app link in HTML/text`, async () => {
      mock.brand.mockResolvedValue(agency);
      const response = await route(new Request(`https://app.strelva.com/api/cron/${kind}-report`));
      expect(await response.json()).toMatchObject({ sent: kind === "weekly" ? [tenant.id] : 1, errors: [] });
      expect(mock.brand).toHaveBeenCalledWith(tenant.id);
      const payload = mock.send.mock.calls[0]![0] as SendEmailInput;
      expect(payload).toMatchObject({ fromName: "North & Web", replyTo: agency.replyTo, fromAddress: "report@updates.strelva.com" });
      expect(payload.html).toContain("North &amp; Web &lt;&quot;Owner&quot;&gt;");
      expect(payload.html).toContain(agency.logoUrl!); expect(payload.html).toContain("color:#000000");
      for (const artifact of [payload.html!, payload.text!]) {
        expect(artifact).toContain("Runs on Strelva.");
        expect(artifact).toContain("https://app.strelva.com/client/agency-client/dashboard/reports");
        expect(artifact).not.toContain("https://admin.fixture.example");
      }
      expect({ html: payload.html, text: payload.text }).toMatchSnapshot();
    });
    it(`${kind} retains self-serve Strelva identity and the existing report URL`, async () => {
      mock.brand.mockResolvedValue(STRELVA_BRAND);
      await route(new Request(`https://app.strelva.com/api/cron/${kind}-report`));
      const payload = mock.send.mock.calls[0]![0] as SendEmailInput;
      expect(payload.fromName).toBe(tenant.siteName); expect(payload.replyTo).toBeUndefined();
      expect(payload.html).toContain('alt="Strelva"'); expect(payload.text).not.toContain(agency.name);
      expect(payload.html).toContain("https://admin.fixture.example/dashboard/reports");
    });
  }
});
