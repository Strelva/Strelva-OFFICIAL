import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedCronRequest } from "@/__tests__/support/cron";
import { verifyApproveToken } from "@/lib/approve-link";
import { ownerNoticeUrl } from "@/lib/owner-notice-url";
import type { TenantConfig } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  workspacePorts: vi.fn(),
  workspaceUrl: vi.fn(),
  generateReports: vi.fn(),
  monthlyRecap: vi.fn(),
  weeklyBrief: vi.fn(),
  hostedReports: vi.fn(),
  tenants: vi.fn(),
  recipient: vi.fn(),
  due: vi.fn(),
  markSent: vi.fn(),
  sendEmail: vi.fn(),
  mailLog: vi.fn(),
  heartbeat: vi.fn(),
  alert: vi.fn(),
  redisGet: vi.fn(),
  redisSet: vi.fn(),
  redisDel: vi.fn(),
  connection: vi.fn(),
  synced: vi.fn(),
  addEvent: vi.fn(),
  addReview: vi.fn(),
  reviewAlert: vi.fn(),
  reply: vi.fn(),
  recentReply: vi.fn(),
  scan: vi.fn(),
  summaries: vi.fn(),
  healthEmail: vi.fn(),
}));

vi.mock("@/lib/workspace-ports", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/workspace-ports")>(),
  workspacePorts: mocks.workspacePorts,
}));
// The independently owned owner-recipient rule is unchanged by owner entry.
// Isolate that seam so the port spy below measures only the new URL lookup.
vi.mock("@/lib/owner-recipient", () => ({ ownerNoticeEmail: mocks.recipient }));
vi.mock("@/lib/reports", () => ({
  generateAllReports: mocks.generateReports,
  buildReportSubject: () => "47 people found you this week",
  buildReportHeading: () => "Here's your proof this week",
}));
vi.mock("@/lib/weekly-brief", () => ({
  generateMonthlyRecap: mocks.monthlyRecap,
  generateWeeklyBrief: mocks.weeklyBrief,
}));
vi.mock("@/products/websites/index", () => ({ runWebsiteMonthlyReports: mocks.hostedReports }));
vi.mock("@/lib/tenants", () => ({ getAllTenants: mocks.tenants }));
vi.mock("@/lib/report-cadence", () => ({ isReportDue: mocks.due, markReportSent: mocks.markSent }));
vi.mock("@/platform/infra/email/send", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/lib/storage/mail-log", () => ({ recordMailSend: mocks.mailLog }));
vi.mock("@/platform/infra/heartbeat", () => ({ recordHeartbeat: mocks.heartbeat }));
vi.mock("@/platform/infra/monitoring", () => ({ alert: mocks.alert, alertOnce: mocks.alert }));
vi.mock("@/platform/infra/redis", () => ({
  getRedis: () => ({ get: mocks.redisGet, set: mocks.redisSet, del: mocks.redisDel }),
}));
vi.mock("@/lib/connections", () => ({ getConnection: mocks.connection, updateLastSynced: mocks.synced }));
vi.mock("@/lib/google-access", () => ({
  getGoogleGrant: vi.fn(async () => ({ status: "connected" })),
  getGoogleLocation: vi.fn(async () => ({ accountId: "accounts/test-account", locationId: "test-location" })),
  getValidGoogleAccessToken: vi.fn(async () => "fake-google-token"),
  markGoogleGrantNeedsReauth: vi.fn(),
  noteGoogleReadSucceeded: vi.fn(),
}));
vi.mock("@/lib/events", () => ({ addEvent: mocks.addEvent }));
vi.mock("@/lib/reviews", () => ({ addReview: mocks.addReview }));
vi.mock("@/lib/review-alert", () => ({ maybeAlertNewReview: mocks.reviewAlert }));
vi.mock("@/lib/review-replies", () => ({ draftReviewReply: mocks.reply, storeRecentReply: mocks.recentReply }));
vi.mock("@/lib/reviews/reply-voice", () => ({
  getReplyVoice: vi.fn(async () => ({ mode: "approve" })),
  defaultReplyVoice: () => ({ mode: "approve" }),
}));
vi.mock("@/lib/scan", () => ({ scanAllTenants: mocks.scan }));
vi.mock("@/lib/scan-store", () => ({ getScanSummaries: mocks.summaries }));
vi.mock("@/lib/delivery-email", () => ({ sendHealthRegressionEmail: mocks.healthEmail }));

const tenant: TenantConfig = {
  id: "test-business", subdomain: "test-business", siteName: "The Test Firm",
  ownerName: "Test Owner", ownerEmail: "owner@example.test", active: true,
  industry: "professional", template: "wellness", createdAt: "2026-01-01T00:00:00Z",
  adminDomain: "admin.example.test", resendDomain: "updates.example.test",
};
const legacyUrl = (path: string) => `https://admin.example.test${path}`;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_OWNER_ENTRY", "0");
  vi.stubEnv("EMAIL_SENDING_ENABLED", "true");
  vi.stubEnv("RESEND_API_KEY", "fake-send-key");
  vi.stubEnv("SLACK_WEBHOOK_URL", "");
  vi.stubEnv("APPROVE_LINK_SECRET", "test-only-approval-secret");
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.workspacePorts.mockReturnValue({ businessRecord: async () => ({ ownerNoticeWorkspaceUrl: mocks.workspaceUrl }) });
  mocks.workspaceUrl.mockResolvedValue("https://app.strelva.test/workspace");
  mocks.tenants.mockResolvedValue([tenant]);
  mocks.recipient.mockResolvedValue(tenant.ownerEmail);
  mocks.generateReports.mockResolvedValue({ reports: [{
    tenant, summary: "47 people found you.\n\nYour site is steady.", analyticsRows: [],
    pageViews: { thisWeek: 47 }, bookingClicks: { thisWeek: 2 },
  }], skipped: [] });
  mocks.monthlyRecap.mockResolvedValue({
    weekStart: "2026-09-01", summary: "Your site is steady.",
    stats: { pageViews: 47, pageViewsDelta: 2 },
  });
  mocks.hostedReports.mockResolvedValue({ tenants: [], sent: 0, suppressed: 0, errors: [] });
  mocks.weeklyBrief.mockResolvedValue(undefined);
  mocks.due.mockResolvedValue({ send: true, cadence: "weekly" });
  mocks.markSent.mockResolvedValue(undefined);
  mocks.sendEmail.mockResolvedValue(true);
  mocks.mailLog.mockResolvedValue(undefined);
  mocks.heartbeat.mockResolvedValue(undefined);
  mocks.alert.mockResolvedValue(undefined);
  mocks.redisGet.mockResolvedValue(null);
  mocks.redisSet.mockResolvedValue("OK");
  mocks.redisDel.mockResolvedValue(undefined);
  mocks.connection.mockResolvedValue({ status: "connected", accessToken: "fake-yelp-token", apiKey: "test-business" });
  mocks.synced.mockResolvedValue(undefined);
  mocks.addEvent.mockResolvedValue({ id: "test-draft" });
  mocks.addReview.mockResolvedValue({ id: "test-review" });
  mocks.reviewAlert.mockResolvedValue(undefined);
  mocks.reply.mockResolvedValue("Thank you for your review.");
  mocks.recentReply.mockResolvedValue(undefined);
  mocks.scan.mockResolvedValue({ scanned: [{ tenant: tenant.id, grade: "C", score: 70 }], failed: [], deferred: 0 });
  mocks.summaries.mockResolvedValue({ [tenant.id]: { grade: "B", overallScore: 82 } });
  mocks.healthEmail.mockResolvedValue(true);
  vi.stubGlobal("fetch", vi.fn(async (url: string | URL | Request) => {
    if (String(url).startsWith("https://mybusiness.googleapis.com/")) return Response.json({ reviews: [{
      reviewId: "google-review", reviewer: { displayName: "Test Reviewer" }, starRating: "FIVE",
      comment: "Good service", createTime: "2026-09-01T00:00:00Z",
    }] });
    if (String(url).startsWith("https://api.yelp.com/")) return Response.json({ reviews: [{
      id: "yelp-review", rating: 5, text: "Good service", time_created: "2026-09-01",
      user: { name: "Test Reviewer" },
    }] });
    throw new Error(`Unexpected network request: ${String(url)}`);
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function expectNoOwnerEntryLookup() {
  expect(mocks.workspacePorts).not.toHaveBeenCalled();
  expect(mocks.workspaceUrl).not.toHaveBeenCalled();
}

for (const flag of [undefined, "0"]) {
  describe(`owner-entry crons with flag ${flag ?? "unset"}`, () => {
    beforeEach(() => vi.stubEnv("STRELVA_OWNER_ENTRY", flag));

    it("weekly-report retains the report send, response, cadence and dashboard email URLs", async () => {
      const { GET } = await import("@/app/api/cron/weekly-report/route");
      const response = await GET(authenticatedCronRequest());
      expect(await response.json()).toEqual({
        processed: 1, failed: 0, skipped: 0, sent: [tenant.id], errors: [], skippedReasons: [], total: 1,
      });
      expect(mocks.sendEmail).toHaveBeenCalledOnce();
      expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
        audience: "client", tenantId: tenant.id, to: tenant.ownerEmail, fromAddress: "report@updates.example.test",
        html: expect.stringContaining(`href="${legacyUrl("/dashboard/reports")}"`),
        text: expect.stringContaining(legacyUrl("/dashboard/reports")),
      }));
      expect(mocks.weeklyBrief).toHaveBeenCalledWith(tenant.id);
      expect(mocks.markSent).toHaveBeenCalledWith(tenant.id);
      expect(mocks.heartbeat).toHaveBeenCalledWith("weekly-report", { ok: true, processed: 1, failed: 0 });
      expectNoOwnerEntryLookup();
    });

    it("monthly-report retains recap generation, dedup and dashboard email URLs", async () => {
      const { GET } = await import("@/app/api/cron/monthly-report/route");
      const body = await (await GET(authenticatedCronRequest())).json();
      const now = new Date();
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const month = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
      expect(body).toEqual({ status: "complete", month, sent: 1, hostedSuppressed: 0, skipped: 0, errors: [] });
      expect(mocks.monthlyRecap).toHaveBeenCalledWith(tenant.id);
      expect(mocks.recipient).toHaveBeenCalledWith(tenant);
      expect(mocks.sendEmail).toHaveBeenCalledWith(expect.objectContaining({
        audience: "client", tenantId: tenant.id, to: tenant.ownerEmail, fromAddress: "report@updates.example.test",
        html: expect.stringContaining(`href="${legacyUrl("/dashboard/reports")}"`),
        text: expect.stringContaining(legacyUrl("/dashboard/reports")),
      }));
      expect(mocks.redisSet).toHaveBeenCalledWith(`reb:monthly-recap-sent:${tenant.id}:${month}`, "1", { ex: 3888000 });
      expect(mocks.heartbeat).toHaveBeenCalledWith("monthly-report", { ok: true });
      expectNoOwnerEntryLookup();
    });

    it("poll-google-reviews retains mirroring, pending reply, signed legacy approval links and cursor", async () => {
      const { GET } = await import("@/app/api/cron/poll-google-reviews/route");
      expect(await (await GET(authenticatedCronRequest())).json()).toEqual({
        newReviews: 1, processed: 1, failed: 0, details: { processed: [`${tenant.id}: 1 new`], errors: [] },
      });
      expect(mocks.addReview).toHaveBeenCalledWith(tenant.id, expect.objectContaining({ externalId: "google-review" }));
      expect(mocks.addEvent).toHaveBeenCalledWith(expect.objectContaining({
        source: "ai", status: "pending", metadata: expect.objectContaining({ kind: "review_reply_draft" }),
      }));
      expect(mocks.reviewAlert).toHaveBeenCalledOnce();
      const notice = mocks.reviewAlert.mock.calls[0]![0];
      expect(notice.reviewsUrl).toBe(legacyUrl("/dashboard/reviews"));
      for (const [link, action] of [[notice.approveUrl, "approve"], [notice.notYetUrl, "not-yet"]]) {
        const url = new URL(link);
        expect(`${url.origin}${url.pathname}`).toBe(legacyUrl("/api/approve"));
        expect(verifyApproveToken(url.searchParams.get("token")!)).toEqual({ eventId: "test-draft", tenantId: tenant.id, action });
      }
      expect(mocks.redisSet).toHaveBeenCalledWith(`google-reviews:last:${tenant.id}`, ["google-review"], { ex: 7776000 });
      expect(mocks.synced).toHaveBeenCalledWith(tenant.id, "google");
      expectNoOwnerEntryLookup();
    });

    it("poll-yelp retains mirroring, dashboard review URL, cursor and output", async () => {
      const { GET } = await import("@/app/api/cron/poll-yelp/route");
      expect(await (await GET(authenticatedCronRequest())).json()).toEqual({
        processed: 1, totalNew: 1, failed: 0, results: [{ tenant: tenant.id, newReviews: 1 }], errors: [],
      });
      expect(mocks.addReview).toHaveBeenCalledWith(tenant.id, expect.objectContaining({ externalId: "yelp-review" }));
      expect(mocks.reviewAlert).toHaveBeenCalledWith(expect.objectContaining({ reviewsUrl: legacyUrl("/dashboard/reviews") }));
      expect(mocks.redisSet).toHaveBeenCalledWith(`yelp:seenReviews:${tenant.id}`, ["yelp-review"], { ex: 2592000 });
      expect(mocks.synced).toHaveBeenCalledWith(tenant.id, "yelp");
      expectNoOwnerEntryLookup();
    });

    it("portfolio-scan retains health regression email, dedup, dashboard URL and output", async () => {
      const { GET } = await import("@/app/api/cron/portfolio-scan/route");
      expect(await (await GET(authenticatedCronRequest())).json()).toEqual({
        scanned: 1, failed: [], regressionAlerts: 1, results: [{ tenant: tenant.id, grade: "C", score: 70 }],
      });
      expect(mocks.scan).toHaveBeenCalledWith(6, { maxPerRun: 40, rotateIndex: Math.floor(Date.now() / 86400000) });
      expect(mocks.healthEmail).toHaveBeenCalledWith(expect.objectContaining({
        email: tenant.ownerEmail, previousGrade: "B", currentGrade: "C", healthUrl: legacyUrl("/dashboard/health"),
      }));
      expect(mocks.redisSet).toHaveBeenCalledWith(`reb:health-alert-sent:${tenant.id}:B>C`, "1", { nx: true, ex: 1209600 });
      expect(mocks.heartbeat).toHaveBeenCalledWith("portfolio-scan", { ok: true, processed: 1, failed: 0 });
      expectNoOwnerEntryLookup();
    });
  });
}

describe("existing report email pause behavior with owner-entry off", () => {
  it("weekly-report stops before report generation or URL lookup", async () => {
    vi.stubEnv("EMAIL_SENDING_ENABLED", "false");
    const { GET } = await import("@/app/api/cron/weekly-report/route");
    expect(await (await GET(authenticatedCronRequest())).json()).toEqual({ status: "skipped", reason: "email_sending_paused" });
    expect(mocks.generateReports).not.toHaveBeenCalled();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.markSent).not.toHaveBeenCalled();
    expectNoOwnerEntryLookup();
  });

  it("monthly-report still refreshes the recap but does not send or mark it sent", async () => {
    vi.stubEnv("EMAIL_SENDING_ENABLED", "false");
    const { GET } = await import("@/app/api/cron/monthly-report/route");
    expect(await (await GET(authenticatedCronRequest())).json()).toMatchObject({ sent: 0, skipped: 1, errors: [] });
    expect(mocks.monthlyRecap).toHaveBeenCalledWith(tenant.id);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.redisSet).not.toHaveBeenCalled();
    expectNoOwnerEntryLookup();
  });
});

describe("existing cron failure behavior with owner-entry off", () => {
  it("weekly-report does not consume cadence when transport suppresses the send", async () => {
    mocks.sendEmail.mockResolvedValue(false);
    const { GET } = await import("@/app/api/cron/weekly-report/route");
    expect(await (await GET(authenticatedCronRequest())).json()).toEqual({
      processed: 0, failed: 1, skipped: 0, sent: [],
      errors: [`${tenant.id}: send suppressed or unconfigured`], skippedReasons: [], total: 1,
    });
    expect(mocks.markSent).not.toHaveBeenCalled();
    expect(mocks.mailLog).toHaveBeenCalledWith(tenant.id, "weekly_report", {
      ok: false, error: "suppressed_or_unconfigured", to: tenant.ownerEmail,
    });
    expect(mocks.heartbeat).toHaveBeenCalledWith("weekly-report", { ok: false, processed: 0, failed: 1 });
    expectNoOwnerEntryLookup();
  });

  it("monthly-report does not consume the dedup marker when transport suppresses the send", async () => {
    mocks.sendEmail.mockResolvedValue(false);
    const { GET } = await import("@/app/api/cron/monthly-report/route");
    expect(await (await GET(authenticatedCronRequest())).json()).toMatchObject({
      sent: 0, skipped: 0, errors: [`${tenant.id}: send suppressed or unconfigured`],
    });
    expect(mocks.redisSet).not.toHaveBeenCalled();
    expect(mocks.mailLog).toHaveBeenCalledWith(tenant.id, "monthly_report", {
      ok: false, error: "suppressed_or_unconfigured", to: tenant.ownerEmail,
    });
    expect(mocks.heartbeat).toHaveBeenCalledWith("monthly-report", { ok: false });
    expectNoOwnerEntryLookup();
  });

  for (const [cron, response] of [
    ["poll-google-reviews", { newReviews: 0, processed: 0, failed: 1, details: { processed: [], errors: [`${tenant.id}: Google API error: 503 Unavailable`] } }],
    ["poll-yelp", { processed: 0, totalNew: 0, failed: 1, results: [], errors: [`${tenant.id}: Yelp API error: 503`] }],
  ] as const) {
    it(`${cron} reports a failed read without mirroring, advancing the cursor or alerting the owner`, async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("Unavailable", { status: 503 })));
      const { GET } = cron === "poll-google-reviews"
        ? await import("@/app/api/cron/poll-google-reviews/route")
        : await import("@/app/api/cron/poll-yelp/route");
      expect(await (await GET(authenticatedCronRequest())).json()).toEqual(response);
      expect(mocks.addReview).not.toHaveBeenCalled();
      expect(mocks.reviewAlert).not.toHaveBeenCalled();
      expect(mocks.redisSet).not.toHaveBeenCalled();
      expect(mocks.synced).not.toHaveBeenCalled();
      expect(mocks.heartbeat).toHaveBeenCalledWith(cron, { ok: false, processed: 0, failed: 1 });
      expectNoOwnerEntryLookup();
    });
  }

  it("portfolio-scan releases the regression marker when its email is suppressed", async () => {
    mocks.healthEmail.mockResolvedValue(false);
    const { GET } = await import("@/app/api/cron/portfolio-scan/route");
    expect(await (await GET(authenticatedCronRequest())).json()).toMatchObject({ scanned: 1, regressionAlerts: 0, failed: [] });
    expect(mocks.redisDel).toHaveBeenCalledWith(`reb:health-alert-sent:${tenant.id}:B>C`);
    expectNoOwnerEntryLookup();
  });
});

it("exercises the real owner URL resolver when its flag is enabled (spy sensitivity)", async () => {
  vi.stubEnv("STRELVA_OWNER_ENTRY", "1");
  expect(await ownerNoticeUrl(tenant, "/dashboard/reports", legacyUrl("/dashboard/reports"))).toBe("https://app.strelva.test/workspace");
  expect(mocks.workspacePorts).toHaveBeenCalledOnce();
  expect(mocks.workspaceUrl).toHaveBeenCalledWith(tenant, "/dashboard/reports", legacyUrl("/dashboard/reports"));
});
