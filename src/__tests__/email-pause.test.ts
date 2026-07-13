import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Assert the global email kill-switch: when EMAIL_SENDING_ENABLED is not
// "true", no outbound email is sent. The prod default (unset) is paused.

const sendMock = vi.fn(
  (_payload: {
    from: string;
    to: string | string[];
    subject: string;
    html: string;
    text: string;
  }) => Promise.resolve({ data: { id: "m_1" }, error: null }),
);
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));

describe("email kill-switch (EMAIL_SENDING_ENABLED)", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    sendMock.mockClear();
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_DOMAIN = "updates.strelva.com";
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("reports paused when the flag is not exactly 'true'", async () => {
    const { emailSendingEnabled, emailSendingPaused } = await import("@/lib/email-enabled");
    for (const v of [undefined, "", "false", "1", "yes", "TRUE"]) {
      if (v === undefined) delete process.env.EMAIL_SENDING_ENABLED;
      else process.env.EMAIL_SENDING_ENABLED = v;
      expect(emailSendingEnabled()).toBe(false);
      expect(emailSendingPaused()).toBe(true);
    }
    process.env.EMAIL_SENDING_ENABLED = "true";
    expect(emailSendingEnabled()).toBe(true);
    expect(emailSendingPaused()).toBe(false);
  });

  it("does NOT call Resend when paused", async () => {
    delete process.env.EMAIL_SENDING_ENABLED; // paused
    const { sendUpdateLiveEmail } = await import("@/lib/delivery-email");
    const ok = await sendUpdateLiveEmail({
      email: "chelsea@example.com",
      siteName: "Rohlax Wellness",
      whatChanged: "hours",
      siteUrl: "https://rohlax.example.com",
    });
    expect(ok).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("DOES call Resend when explicitly enabled", async () => {
    process.env.EMAIL_SENDING_ENABLED = "true";
    const { sendUpdateLiveEmail } = await import("@/lib/delivery-email");
    const ok = await sendUpdateLiveEmail({
      email: "chelsea@example.com",
      siteName: "Rohlax Wellness",
      whatChanged: "hours",
      siteUrl: "https://rohlax.example.com",
    });
    expect(ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});

// The whole point of the operator switch: Noah + Jacob keep getting notified
// even while CLIENT email is paused. Operator emails default ON and are only
// silenced by an explicit OPERATOR_EMAILS_ENABLED="false".
describe("operator email switch (OPERATOR_EMAILS_ENABLED)", () => {
  const original = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    sendMock.mockClear();
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_DOMAIN = "updates.strelva.com";
    delete process.env.LEAD_NOTIFY_EMAILS; // default recipient = jacob@strelva.com
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("operatorEmailsEnabled defaults TRUE and only OPERATOR_EMAILS_ENABLED='false' disables it", async () => {
    const { operatorEmailsEnabled, operatorEmailsPaused } = await import("@/lib/email-enabled");
    for (const v of [undefined, "", "true", "TRUE", "1", "no"]) {
      if (v === undefined) delete process.env.OPERATOR_EMAILS_ENABLED;
      else process.env.OPERATOR_EMAILS_ENABLED = v;
      expect(operatorEmailsEnabled()).toBe(true);
      expect(operatorEmailsPaused()).toBe(false);
    }
    process.env.OPERATOR_EMAILS_ENABLED = "false";
    expect(operatorEmailsEnabled()).toBe(false);
    expect(operatorEmailsPaused()).toBe(true);
  });

  it("sendNewIntakeLeadEmail SENDS while CLIENT email is paused (operator switch is independent)", async () => {
    process.env.EMAIL_SENDING_ENABLED = "false"; // client email paused
    delete process.env.OPERATOR_EMAILS_ENABLED; // operator default ON
    const { sendNewIntakeLeadEmail } = await import("@/lib/delivery-email");
    const ok = await sendNewIntakeLeadEmail({
      lead: {
        businessName: "Demo Studio",
        email: "owner@example.com",
        planLabel: "Monthly plan",
      },
      leadsUrl: "https://strelva.com/admin/leads",
    });
    expect(ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].to).toEqual(["jacob@strelva.com"]);
  });

  it("sendNewIntakeLeadEmail is silenced ONLY by OPERATOR_EMAILS_ENABLED=false", async () => {
    process.env.EMAIL_SENDING_ENABLED = "true"; // client email on
    process.env.OPERATOR_EMAILS_ENABLED = "false"; // operator kill switch
    const { sendNewIntakeLeadEmail } = await import("@/lib/delivery-email");
    const ok = await sendNewIntakeLeadEmail({
      lead: { businessName: "Demo Studio", email: "owner@example.com", planLabel: "Monthly plan" },
      leadsUrl: "https://strelva.com/admin/leads",
    });
    expect(ok).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sendNewSignupEmail sends to the notify list with signup content", async () => {
    process.env.EMAIL_SENDING_ENABLED = "false"; // paused clients, operators still notified
    process.env.LEAD_NOTIFY_EMAILS = "noah@strelva.com, jacob@strelva.com";
    const { sendNewSignupEmail } = await import("@/lib/delivery-email");
    const ok = await sendNewSignupEmail({
      businessName: "Rohlax Wellness",
      plan: "Growth",
      ownerEmail: "chelsea@example.com",
      mrrDollars: 199,
      tenantUrl: "https://strelva.com/admin/tenants/rohlax",
    });
    expect(ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toEqual(["noah@strelva.com", "jacob@strelva.com"]);
    expect(call.subject).toBe("New paying signup: Rohlax Wellness");
    for (const value of ["New paying signup", "Rohlax Wellness", "Growth", "chelsea@example.com", "$199/mo", "Operator notification", "https://strelva.com/admin/tenants/rohlax"]) {
      expect(call.html).toContain(value);
    }
  });

  it("sendPaymentFailedEmail sends to the notify list with failure content", async () => {
    process.env.EMAIL_SENDING_ENABLED = "false";
    delete process.env.LEAD_NOTIFY_EMAILS;
    const { sendPaymentFailedEmail } = await import("@/lib/delivery-email");
    const ok = await sendPaymentFailedEmail({
      businessName: "Rohlax Wellness",
      ownerEmail: "chelsea@example.com",
      tenantUrl: "https://strelva.com/admin/tenants/rohlax",
    });
    expect(ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    const call = sendMock.mock.calls[0][0];
    expect(call.to).toEqual(["jacob@strelva.com"]);
    expect(call.subject).toBe("Payment failed: Rohlax Wellness");
    for (const value of ["Payment failed: Rohlax Wellness", "chelsea@example.com", "Operator notification", "https://strelva.com/admin/tenants/rohlax"]) {
      expect(call.html).toContain(value);
    }
  });
});

// The prospect audit-report email warms the sending domain: it flows while
// CLIENT lifecycle email is paused, on its OWN switch, and is silenced only by
// an explicit PROSPECT_EMAILS_ENABLED="false".
describe("prospect email switch (PROSPECT_EMAILS_ENABLED)", () => {
  const original = { ...process.env };

  const auditResult = {
    url: "https://acme.example.com",
    scannedAt: "2026-07-13T00:00:00.000Z",
    overallScore: 72,
    grade: "B" as const,
    categories: [
      {
        name: "SEO Foundations",
        slug: "seo-foundations",
        weight: 20,
        score: 55,
        checks: [
          { name: "Title tag", status: "fail" as const, score: 30, message: "Missing title", impact: "Search engines can't tell what this page is about.", priority: "high" as const },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.resetModules();
    sendMock.mockClear();
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_DOMAIN = "updates.strelva.com";
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("prospectEmailsEnabled defaults TRUE and only PROSPECT_EMAILS_ENABLED='false' disables it", async () => {
    const { prospectEmailsEnabled, prospectEmailsPaused } = await import("@/lib/email-enabled");
    for (const v of [undefined, "", "true", "TRUE", "1", "no"]) {
      if (v === undefined) delete process.env.PROSPECT_EMAILS_ENABLED;
      else process.env.PROSPECT_EMAILS_ENABLED = v;
      expect(prospectEmailsEnabled()).toBe(true);
      expect(prospectEmailsPaused()).toBe(false);
    }
    process.env.PROSPECT_EMAILS_ENABLED = "false";
    expect(prospectEmailsEnabled()).toBe(false);
    expect(prospectEmailsPaused()).toBe(true);
  });

  it("sendAuditReportEmail SENDS while CLIENT email is paused (prospect switch is independent)", async () => {
    process.env.EMAIL_SENDING_ENABLED = "false"; // client lifecycle paused
    delete process.env.PROSPECT_EMAILS_ENABLED; // prospect default ON
    const { sendAuditReportEmail } = await import("@/lib/audit-report-email");
    const ok = await sendAuditReportEmail({
      lead: { name: "Dana Lee", email: "dana@acme.example.com", url: auditResult.url },
      result: auditResult,
      reportUrl: "https://strelva.com/audit/report/tok_123",
    });
    expect(ok).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][0].to).toBe("dana@acme.example.com");
  });

  it("sendAuditReportEmail is silenced ONLY by PROSPECT_EMAILS_ENABLED=false", async () => {
    process.env.EMAIL_SENDING_ENABLED = "true"; // client email on — must not matter
    process.env.PROSPECT_EMAILS_ENABLED = "false"; // prospect kill switch
    const { sendAuditReportEmail } = await import("@/lib/audit-report-email");
    const ok = await sendAuditReportEmail({
      lead: { name: "Dana Lee", email: "dana@acme.example.com", url: auditResult.url },
      result: auditResult,
      reportUrl: "https://strelva.com/audit/report/tok_123",
    });
    expect(ok).toBe(false);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
