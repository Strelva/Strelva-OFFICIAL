import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ gate: vi.fn(), alert: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
vi.mock("@/platform/infra/email/client-override", () => ({ getClientEmailOverride: mocks.gate }));
vi.mock("@/platform/infra/monitoring", () => ({ alert: mocks.alert }));
import { deliverBusinessOutcomeReport, readBusinessOutcomeReports, type BusinessOutcomeReport } from "@/platform/business-outcomes/reports";
import { WORKSPACE_SUBSCRIPTION_PLAN } from "@/platform/business-billing";
import { isPlanKey } from "@/lib/billing-plans";
const workspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const token = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const figure = (value: number | null) => ({ kind: "counted", value });
const record = { workspaceId, primaryTenantId: "a", tenantIds: ["a", "b"], outcome: {
  workspaceId, month: "2026-09", sites: 2, visits: figure(412), inquiries: figure(9),
  answered: { kind: "linked", value: 8, withinDay: 8 }, bookings: { ...figure(3), native: 1, legacy: 2 },
  bookingsFromInquiry: { kind: "linked", value: 2, joins: ["inquiry_id"] }, reviews: figure(2),
} };
const report: BusinessOutcomeReport = { workspaceId, primaryTenantId: "a", tenantIds: ["a", "b"], line: { text: "9 inquiries. 3 bookings.", figures: [] } };
beforeEach(() => {
  vi.clearAllMocks(); mocks.gate.mockResolvedValue(null);
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_BUSINESS_OUTCOME_REPORTS", "1");
  vi.stubEnv("EMAIL_SENDING_ENABLED", "true"); vi.stubEnv("CUSTOMER_EMAIL_ENABLED", "true");
});
afterEach(() => vi.unstubAllEnvs());
describe("business outcome report read", () => {
  it("is inert flags off and distinguishes unavailable grouping when armed", async () => {
    const call = vi.fn(async () => ({ data: [record], error: null }));
    vi.stubEnv("STRELVA_BUSINESS_OUTCOME_REPORTS", "0");
    expect(await readBusinessOutcomeReports(["a", "b"], "2026-09", call)).toEqual([]); expect(call).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_BUSINESS_OUTCOME_REPORTS", "1");
    expect(await readBusinessOutcomeReports(["a"], "2026-09", async () => { throw new Error("database unavailable"); })).toBeNull();
  });
  it("formats one grouped PostgreSQL line and claims linked figures only where joined", async () => {
    const call = vi.fn(async () => ({ data: [record], error: null }));
    const rows = await readBusinessOutcomeReports(["a", "b"], "2026-09", call);
    expect(rows).toHaveLength(1); expect(rows?.[0]?.tenantIds).toEqual(["a", "b"]);
    expect(rows?.[0]?.line.text).toBe("412 visits. 9 inquiries; 8 answered within a day. 3 bookings, 2 of them from a website inquiry. 2 new reviews.");
    expect(call).toHaveBeenCalledWith("list_business_outcome_reports", { p_tenant_ids: ["a", "b"], p_month: "2026-09-01" });
  });
  it("refuses malformed/cross-workspace groupings without falling back to delivery", async () => {
    expect(await readBusinessOutcomeReports(["a"], "2026-09", async () => ({ data: [{ ...record, primaryTenantId: "unrelated" }], error: null }))).toBeNull();
    expect(await readBusinessOutcomeReports(["a"], "2026-09", async () => ({ data: [{ ...record, outcome: { ...record.outcome, workspaceId: token } }], error: null }))).toBeNull();
  });
  it("defines the workspace plan without adding a sellable legacy checkout plan", () => {
    expect(WORKSPACE_SUBSCRIPTION_PLAN).toMatchObject({ key: "workspace", billingState: "subscription", monthlyCents: null, stripePriceId: null, purchasable: false });
    expect(isPlanKey(WORKSPACE_SUBSCRIPTION_PLAN.key)).toBe(false);
  });
});
describe("one outcome report per business and month", () => {
  function call() { return vi.fn(async (name: string) => ({ data: name === "reserve_business_outcome_report_delivery" ? { token } : {}, error: null as { message: string } | null })); }
  it.each(["STRELVA_BUSINESS_OUTCOME_REPORTS", "EMAIL_SENDING_ENABLED", "CUSTOMER_EMAIL_ENABLED"])("sends nothing while %s is off", async flag => {
    vi.stubEnv(flag, "0"); const write = call(); const send = vi.fn(async () => ({ status: "accepted" as const }));
    expect((await deliverBusinessOutcomeReport(report, "2026-09", send, write)).status).toBe("suppressed"); expect(write).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it("obeys every linked site override before reserving or sending", async () => {
    mocks.gate.mockImplementation(async (tenant: string) => tenant === "b" ? "off" : null);
    const write = call(); const send = vi.fn(async () => ({ status: "accepted" as const }));
    expect(await deliverBusinessOutcomeReport(report, "2026-09", send, write)).toEqual({ status: "suppressed", reason: "client_email_disabled" }); expect(write).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
  });
  it("cannot send when a receipt reservation was already taken", async () => {
    const send = vi.fn(async () => ({ status: "accepted" as const }));
    expect((await deliverBusinessOutcomeReport(report, "2026-09", send, async () => ({ data: null, error: null }))).status).toBe("suppressed"); expect(send).not.toHaveBeenCalled();
  });
  it("keeps provider acceptance final when its local receipt fails", async () => {
    const write = call(); write.mockImplementation(async name => name === "reserve_business_outcome_report_delivery" ? { data: { token }, error: null } : { data: null, error: { message: "receipt unavailable" } } as never);
    const send = vi.fn(async () => ({ status: "accepted" as const }));
    expect(await deliverBusinessOutcomeReport(report, "2026-09", send, write)).toEqual({ status: "accepted" }); expect(send).toHaveBeenCalledOnce();
    expect(write).toHaveBeenCalledWith("record_business_outcome_report_delivery", expect.objectContaining({ p_status: "accepted" }));
    expect(mocks.alert).toHaveBeenCalledWith("business_outcome_report_receipt_failed", "high", expect.objectContaining({ providerAccepted: true }));
  });
  it("records an unknown result separately from a safe suppression", async () => {
    const write = call();
    await expect(deliverBusinessOutcomeReport(report, "2026-09", async () => { throw new Error("response lost"); }, write)).rejects.toThrow("response lost");
    expect(write).toHaveBeenCalledWith("record_business_outcome_report_delivery", expect.objectContaining({ p_status: "unknown" }));
    expect(await deliverBusinessOutcomeReport(report, "2026-09", async () => ({ status: "suppressed" as const }), write)).toEqual({ status: "suppressed" });
    expect(write).toHaveBeenCalledWith("record_business_outcome_report_delivery", expect.objectContaining({ p_status: "suppressed" }));
  });
});
