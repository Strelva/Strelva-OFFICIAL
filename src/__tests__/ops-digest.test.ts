import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { authenticatedCronRequest } from "@/__tests__/support/cron";

// Two layers:
//  1. sendOpsDigestEmail composes the right RECIPIENTS (operator notify list,
//     defaulting to jacob@strelva.com) and CONTENT (through the shared design
//     system), gated on the operator switch — NOT the client email pause.
//  2. The ops-digest cron composes the portfolio numbers and hands them to the
//     sender.

const DESIGN_SYSTEM_MARKER = 'alt="Strelva"';

const sendMock = vi.hoisted(() =>
  vi.fn((_payload: { from: string; to: string | string[]; subject: string; html: string; text: string }) =>
    Promise.resolve({ data: { id: "m_1" }, error: null, headers: null }),
  ),
);
const mockGetDeliveryLeads = vi.hoisted(() => vi.fn());
const mockGetAtRiskTenants = vi.hoisted(() => vi.fn());
const mockGetAllTenants = vi.hoisted(() => vi.fn());
const mockSendOpsDigestEmail = vi.hoisted(() => vi.fn());
const mockRecordHeartbeat = vi.hoisted(() => vi.fn());

describe("sendOpsDigestEmail — recipients + content", () => {
  beforeEach(() => {
    vi.resetModules();
    sendMock.mockClear();
    vi.doMock("resend", () => ({ Resend: class { emails = { send: sendMock }; } }));
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_DOMAIN = "updates.strelva.com";
    delete process.env.LEAD_NOTIFY_EMAILS;
    delete process.env.OPERATOR_EMAILS_ENABLED;
    // Client email stays PAUSED to prove the operator digest ignores it.
    delete process.env.EMAIL_SENDING_ENABLED;
  });

  afterEach(() => {
    vi.doUnmock("resend");
  });

  it("sends to the operator notify list (default jacob@strelva.com) even while client email is paused", async () => {
    const { sendOpsDigestEmail } = await import("@/lib/delivery-email");
    const ok = await sendOpsDigestEmail({
      totalLeads: 5,
      unworkedLeads: 2,
      atRisk: [
        { name: "Rohlax Wellness", reason: "Subscription past due" },
        { name: "GLDF", reason: "No AI use in 7 days" },
      ],
      recentSignups: ["Acme HVAC"],
      opsUrl: "https://admin.strelva.com/",
    });

    expect(ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toEqual(["jacob@strelva.com"]);
    expect(call.subject).toBe("Strelva daily ops");
    expect(call.html).toContain(DESIGN_SYSTEM_MARKER);
    expect(call.html).toContain("Strelva daily ops");
    expect(call.html).toContain("2 unworked leads of 5 total");
    expect(call.html).toContain("Rohlax Wellness");
    expect(call.html).toContain("Subscription past due");
    expect(call.html).toContain("Acme HVAC");
    expect(call.html).toContain("Operator notification");
  });

  it("honors an explicit LEAD_NOTIFY_EMAILS recipient list", async () => {
    process.env.LEAD_NOTIFY_EMAILS = "noah@strelva.com, jacob@strelva.com";
    const { sendOpsDigestEmail } = await import("@/lib/delivery-email");
    await sendOpsDigestEmail({
      totalLeads: 0,
      unworkedLeads: 0,
      atRisk: [],
      recentSignups: [],
      opsUrl: "https://admin.strelva.com/",
    });
    expect(sendMock.mock.calls[0][0].to).toEqual(["noah@strelva.com", "jacob@strelva.com"]);
  });

  it("is silenced by the operator kill-switch", async () => {
    process.env.OPERATOR_EMAILS_ENABLED = "false";
    const { sendOpsDigestEmail } = await import("@/lib/delivery-email");
    const ok = await sendOpsDigestEmail({
      totalLeads: 1,
      unworkedLeads: 1,
      atRisk: [],
      recentSignups: [],
      opsUrl: "https://admin.strelva.com/",
    });
    expect(ok).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/cron/ops-digest — composition", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/access-request-delivery", () => ({ getDeliveryLeads: mockGetDeliveryLeads }));
    vi.doMock("@/lib/churn", () => ({ getAtRiskTenants: mockGetAtRiskTenants }));
    vi.doMock("@/lib/tenants", () => ({ getAllTenants: mockGetAllTenants }));
    vi.doMock("@/lib/delivery-email", () => ({ sendOpsDigestEmail: mockSendOpsDigestEmail }));
    vi.doMock("@/lib/heartbeat", () => ({ recordHeartbeat: mockRecordHeartbeat }));
    mockSendOpsDigestEmail.mockResolvedValue(true);
    mockRecordHeartbeat.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.doUnmock("@/lib/access-request-delivery");
    vi.doUnmock("@/lib/churn");
    vi.doUnmock("@/lib/tenants");
    vi.doUnmock("@/lib/delivery-email");
    vi.doUnmock("@/lib/heartbeat");
  });

  it("counts unworked leads, names at-risk clients, and lists recent signups", async () => {
    const now = Date.now();
    mockGetDeliveryLeads.mockResolvedValue([
      { deliveryStatus: "received" },
      { deliveryStatus: "received" },
      { deliveryStatus: "launched" },
    ]);
    mockGetAllTenants.mockResolvedValue([
      { id: "gldf", siteName: "GLDF", subscriptionStartedAt: new Date(now - 2 * 86400000).toISOString() },
      { id: "rohlax", siteName: "Rohlax Wellness" },
      { id: "old", siteName: "Old Co", subscriptionStartedAt: new Date(now - 40 * 86400000).toISOString() },
    ]);
    mockGetAtRiskTenants.mockResolvedValue([
      { tenantId: "rohlax", reasons: ["Subscription past due", "No AI use in 7 days"] },
      { tenantId: "ghost", reasons: [] },
    ]);

    const { GET } = await import("@/app/api/cron/ops-digest/route");
    const res = await GET(authenticatedCronRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, totalLeads: 3, unworkedLeads: 2, atRisk: 2, recentSignups: 1, sent: true });

    expect(mockSendOpsDigestEmail).toHaveBeenCalledTimes(1);
    const arg = mockSendOpsDigestEmail.mock.calls[0][0];
    expect(arg.totalLeads).toBe(3);
    expect(arg.unworkedLeads).toBe(2);
    expect(arg.atRisk).toEqual([
      { name: "Rohlax Wellness", reason: "Subscription past due" },
      { name: "ghost", reason: "At risk" }, // unknown tenant id falls back to id + generic reason
    ]);
    expect(arg.recentSignups).toEqual(["GLDF"]);
  });

  it("returns 500 (not throw) when a data source fails hard", async () => {
    // getDeliveryLeads/getAtRiskTenants/getAllTenants each have their own catch,
    // but a throwing sender still resolves via its own fail-soft; force a hard
    // failure by making recordHeartbeat AND send both fine but leads reject
    // unguarded is not possible — instead make sendOpsDigestEmail throw.
    mockGetDeliveryLeads.mockResolvedValue([]);
    mockGetAllTenants.mockResolvedValue([]);
    mockGetAtRiskTenants.mockResolvedValue([]);
    mockSendOpsDigestEmail.mockRejectedValue(new Error("boom"));

    const { GET } = await import("@/app/api/cron/ops-digest/route");
    const res = await GET(authenticatedCronRequest());
    expect(res.status).toBe(500);
  });
});
