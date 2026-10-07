import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), native: vi.fn(), rpc: vi.fn(), gate: vi.fn() }));
vi.mock("@/products/websites/document-store", () => ({ websiteDocumentStore: { managePublishedTenant: mocks.native } }));
vi.mock("@/platform/infra/email/send", () => ({ sendEmailWithReceipt: mocks.send }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: mocks.gate }));
vi.mock("@/platform/infra/monitoring", () => ({ alert: vi.fn() }));
import { sendWebsiteMonthlyReport, type WebsiteMonthlyReport } from "@/products/websites/site-report";
const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const token = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const actor = { userId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", verifiedEmail: "owner@example.test" };
const report: WebsiteMonthlyReport = {
  workId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", workspaceId, tenantId: "a", siteName: "Harbor fixture", month: "2026-09", generatedAt: "2026-10-01T00:00:00Z",
  inquiries: { status: "available", count: 9, limitedToRecentRecords: true },
  bookings: { status: "available", scheduledInPeriod: 3, providerAccepted: 3, providerVerified: 3 },
  visibility: { status: "unavailable", note: "Not measured." }, readiness: { status: "unavailable", passedChecks: null, totalChecks: null }, changes: [],
  businessOutcome: { workspaceId, primaryTenantId: "a", tenantIds: ["a", "b"], line: { text: "9 inquiries. 3 bookings, 2 of them from a website inquiry.", figures: [{ label: "bookings from a website inquiry", value: 2, kind: "linked" }] } },
};
beforeEach(() => {
  vi.resetAllMocks(); mocks.native.mockResolvedValue(undefined); mocks.gate.mockResolvedValue(null);
  mocks.send.mockResolvedValue({ status: "accepted", providerMessageId: "provider-fixture", acceptedAt: "2026-10-01T00:00:00Z" });
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "reserve_business_outcome_report_delivery" ? { token } : name === "list_business_outcome_reports" ? [{ workspaceId, primaryTenantId: "a", tenantIds: ["a", "b"], outcome: {workspaceId,month: "2026-09",sites: 2,visits: {kind:"counted",value:null},inquiries:{kind:"counted",value:9},answered:{kind:"linked",value:null,withinDay:null},bookings:{kind:"counted",value:3,native:1,legacy:2},bookingsFromInquiry:{kind:"linked",value:2,joins:["inquiry_id"]},reviews:{kind:"counted",value:null}} }] : {}, error: null }));
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_BUSINESS_OUTCOME_REPORTS", "1");
  vi.stubEnv("EMAIL_SENDING_ENABLED", "true"); vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());
describe("native outcome report transport", () => {
  it("carries one business line and explicit linked labels through the existing owner transport", async () => {
    expect((await sendWebsiteMonthlyReport(report, actor.verifiedEmail, actor)).status).toBe("accepted");
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: actor.verifiedEmail, tenantId: "a", options: expect.objectContaining({ paragraphs: expect.arrayContaining([expect.stringContaining("Across your business: 9 inquiries.")]), rows: expect.arrayContaining([{ label: "Business bookings from a website inquiry (linked)", value: "2" }]) }) }));
    expect(mocks.rpc).toHaveBeenCalledWith("record_business_outcome_report_delivery", expect.objectContaining({ p_workspace_id: workspaceId, p_status: "accepted" }));
  });
  it("checks native ownership before reserving any report delivery", async () => {
    mocks.native.mockRejectedValue(new Error("native ownership revoked"));
    await expect(sendWebsiteMonthlyReport(report, actor.verifiedEmail, actor)).rejects.toThrow("native ownership revoked");
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("refuses the second report for the same month before provider contact", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect((await sendWebsiteMonthlyReport(report, actor.verifiedEmail, actor)).status).toBe("suppressed"); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not resend after an accepted report loses its cache marker and grouping becomes unavailable", async () => {
    expect((await sendWebsiteMonthlyReport(report, actor.verifiedEmail, actor)).status).toBe("accepted");
    mocks.rpc.mockResolvedValue({data:null,error:{message:"grouping storage unavailable"}});
    expect(await sendWebsiteMonthlyReport({...report,businessOutcome:undefined}, actor.verifiedEmail, actor)).toEqual({status:"suppressed",reason:"business_outcome_grouping_unavailable"});
    expect(mocks.send).toHaveBeenCalledOnce();
  });

});
