import { createHash } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SendEmailInput } from "@/platform/infra/email/send";
import { renderEmailHtml, renderEmailText } from "@/platform/infra/email/layout";
import * as delivery from "@/lib/delivery-email";

const mocks = vi.hoisted(() => {
  // The layout reads this at module initialization. Keep the output fixture
  // independent of the machine's branding configuration.
  const originalLogoUrl = process.env.EMAIL_LOGO_URL;
  process.env.EMAIL_LOGO_URL = "https://strelva.com/brand/logo-full-light.png";
  return { sendEmail: vi.fn(), addTenantActivity: vi.fn(), originalLogoUrl };
});
vi.mock("@/platform/infra/email/send", () => ({ sendEmail: mocks.sendEmail }));
vi.mock("@/platform/infra/tenant-crm", () => ({ addTenantActivity: mocks.addTenantActivity }));

const owner = {
  email: "owner@example.com",
  businessName: "Example & Co\r\nBusiness",
  ownerName: "Dana <Owner>",
  tenantId: "example-tenant",
};
const dashboardUrl = "https://example.com/dashboard?tab=overview&from=email";
const siteUrl = "https://example.com/";
const review = { author: "A <Visitor>\r\nName", rating: 4, text: "Helpful & quick.\nThank you!" };
const reviewNotice = { ...owner, review, reviewsUrl: "https://example.com/reviews" };
const booking = {
  to: "customer@example.com", clientName: "A <Customer>", serviceName: "Consultation & advice",
  date: "2026-10-12", time: "09:00", businessName: owner.businessName, tenantId: owner.tenantId,
};
const intake: delivery.IntakeLeadFields = {
  businessName: owner.businessName, description: "A new <site> & booking flow", location: "Buffalo, NY",
  email: "prospect@example.com", phone: "555-0100", currentWebsite: siteUrl, plan: "managed",
  planLabel: "Managed site", referredBy: "Example Agency",
};

// These snapshots were recorded against the unsplit f3097dd6 implementation.
// They pin the full shared-sender input, rendered HTML/text bytes (SHA-256),
// and CRM effects without ever calling an email provider.
const examples = [
  { name: "update live", audience: "client", logsCrm: true, send: () => delivery.sendUpdateLiveEmail({ ...owner, siteName: owner.businessName, whatChanged: "hours & contact\r\ninformation", siteUrl }) },
  { name: "update rolling out", audience: "client", logsCrm: true, send: () => delivery.sendUpdateLiveEmail({ ...owner, siteName: owner.businessName, whatChanged: "hours", siteUrl, rollingOut: true }) },
  { name: "customer booking", audience: "customer", logsCrm: true, send: () => delivery.sendBookingConfirmation(booking) },
  { name: "customer booking without names", audience: "customer", logsCrm: true, send: () => delivery.sendBookingConfirmation({ ...booking, businessName: "", clientName: "" }) },
  { name: "payment past due", audience: "client", logsCrm: true, send: () => delivery.sendPaymentPastDueEmail({ ...owner, dashboardUrl }) },
  { name: "lead owner notice", audience: "client", logsCrm: true, send: () => delivery.sendNewLeadEmail({ ...owner, siteName: owner.businessName, lead: { name: "A <Lead>", email: "lead@example.com", message: "Please call & discuss\nmy site" }, dashboardUrl }) },
  { name: "lead minimal notice", audience: "client", logsCrm: true, send: () => delivery.sendNewLeadEmail({ ...owner, siteName: owner.businessName, lead: { name: "A Lead" }, dashboardUrl }) },
  { name: "booking owner notice", audience: "client", logsCrm: true, send: () => delivery.sendNewBookingOwnerEmail({ ...owner, siteName: owner.businessName, booking: { customerName: booking.clientName, customerEmail: booking.to, serviceName: booking.serviceName, when: "Monday at 9 AM" }, dashboardUrl }) },
  { name: "booking owner notice without email", audience: "client", logsCrm: true, send: () => delivery.sendNewBookingOwnerEmail({ ...owner, siteName: owner.businessName, booking: { customerName: booking.clientName, serviceName: booking.serviceName, when: "Monday at 9 AM" }, dashboardUrl }) },
  { name: "intake operator notice", audience: "operator", logsCrm: false, send: () => delivery.sendNewIntakeLeadEmail({ lead: intake, leadsUrl: dashboardUrl }) },
  { name: "intake minimal notice", audience: "operator", logsCrm: false, send: () => delivery.sendNewIntakeLeadEmail({ lead: { businessName: owner.businessName, email: intake.email, planLabel: intake.planLabel }, leadsUrl: dashboardUrl }) },
  { name: "paying signup", audience: "operator", logsCrm: false, send: () => delivery.sendNewSignupEmail({ businessName: owner.businessName, plan: "Managed", ownerEmail: owner.email, mrrDollars: 199.49, tenantUrl: dashboardUrl }) },
  { name: "paying signup minimal", audience: "operator", logsCrm: false, send: () => delivery.sendNewSignupEmail({ businessName: owner.businessName, tenantUrl: dashboardUrl }) },
  { name: "payment failed", audience: "operator", logsCrm: false, send: () => delivery.sendPaymentFailedEmail({ businessName: owner.businessName, ownerEmail: owner.email, tenantUrl: dashboardUrl }) },
  { name: "payment failed minimal", audience: "operator", logsCrm: false, send: () => delivery.sendPaymentFailedEmail({ businessName: owner.businessName, tenantUrl: dashboardUrl }) },
  { name: "welcome", audience: "client", logsCrm: true, send: () => delivery.sendWelcomeEmail({ ...owner, dashboardUrl }) },
  { name: "welcome without tenant or owner name", audience: "client", logsCrm: false, send: () => delivery.sendWelcomeEmail({ ...owner, tenantId: undefined, ownerName: undefined, dashboardUrl }) },
  { name: "site live", audience: "client", logsCrm: true, send: () => delivery.sendSiteLiveEmail({ ...owner, siteUrl, dashboardUrl }) },
  { name: "review request", audience: "client", logsCrm: true, send: () => delivery.sendReviewRequestEmail({ ...owner, reviewUrl: "https://example.com/review" }) },
  { name: "review request without owner name", audience: "client", logsCrm: true, send: () => delivery.sendReviewRequestEmail({ ...owner, ownerName: undefined, reviewUrl: "https://example.com/review" }) },
  { name: "review without draft", audience: "client", logsCrm: true, send: () => delivery.sendReviewNeedsReplyEmail(reviewNotice) },
  { name: "review approval URLs without draft", audience: "client", logsCrm: true, send: () => delivery.sendReviewNeedsReplyEmail({ ...reviewNotice, approveUrl: "https://example.com/approve", notYetUrl: "https://example.com/not-yet" }) },
  { name: "review draft without approval", audience: "client", logsCrm: true, send: () => delivery.sendReviewNeedsReplyEmail({ ...reviewNotice, draftedReply: "Thank you <Visitor> & come again!" }) },
  { name: "review draft with approval", audience: "client", logsCrm: true, send: () => delivery.sendReviewNeedsReplyEmail({ ...reviewNotice, draftedReply: "Thank you <Visitor> & come again!", approveUrl: "https://example.com/approve?token=fixture&action=approve" }) },
  { name: "review draft with both decisions", audience: "client", logsCrm: true, send: () => delivery.sendReviewNeedsReplyEmail({ ...reviewNotice, draftedReply: "Thank you <Visitor> & come again!", approveUrl: "https://example.com/approve?token=fixture&action=approve", notYetUrl: "https://example.com/approve?token=fixture&action=not-yet" }) },
  { name: "review without owner or text and clamped stars", audience: "client", logsCrm: true, send: () => delivery.sendReviewNeedsReplyEmail({ ...reviewNotice, ownerName: undefined, review: { author: review.author, rating: 6 } }) },
  { name: "health regression", audience: "client", logsCrm: true, send: () => delivery.sendHealthRegressionEmail({ ...owner, previousGrade: "A", currentGrade: "C", previousScore: 95, currentScore: 70, healthUrl: dashboardUrl }) },
  { name: "health regression without owner name", audience: "client", logsCrm: true, send: () => delivery.sendHealthRegressionEmail({ ...owner, ownerName: undefined, previousGrade: "A", currentGrade: "C", previousScore: 95, currentScore: 70, healthUrl: dashboardUrl }) },
  { name: "prospect delivery status", audience: "prospect", logsCrm: false, send: () => delivery.sendDeliveryStatusEmail({ businessName: intake.businessName, email: intake.email, statusUrl: "https://example.com/status?token=fixture" }) },
  { name: "ops digest re-export", audience: "operator", logsCrm: false, send: () => delivery.sendOpsDigestEmail({ totalLeads: 5, unworkedLeads: 2, atRisk: [{ name: owner.businessName, reason: "Payment failed" }], recentSignups: ["A & B"], opsUrl: dashboardUrl }) },
];

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("LEAD_NOTIFY_EMAILS", " first@example.com, , second@example.com ");
  mocks.sendEmail.mockResolvedValue(true);
  mocks.addTenantActivity.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(() => {
  if (mocks.originalLogoUrl === undefined) delete process.env.EMAIL_LOGO_URL;
  else process.env.EMAIL_LOGO_URL = mocks.originalLogoUrl;
});

describe("delivery email compatibility and output parity", () => {
  it("keeps every public function export", () => {
    expect(Object.keys(delivery).sort()).toEqual([
      "resolveLeadNotifyRecipients", "sendBookingConfirmation", "sendDeliveryStatusEmail",
      "sendHealthRegressionEmail", "sendNewBookingOwnerEmail", "sendNewIntakeLeadEmail",
      "sendNewLeadEmail", "sendNewSignupEmail", "sendOpsDigestEmail", "sendPaymentFailedEmail",
      "sendPaymentPastDueEmail", "sendReviewNeedsReplyEmail", "sendReviewRequestEmail",
      "sendSiteLiveEmail", "sendUpdateLiveEmail", "sendWelcomeEmail",
    ]);
  });

  describe.each(examples)("$name", ({ audience, logsCrm, send }) => {
    it("preserves sender input, rendered bytes and successful CRM effects", async () => {
      expect(await send()).toBe(true);
      expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
      const input = mocks.sendEmail.mock.calls[0]![0] as SendEmailInput;
      expect(input.audience).toBe(audience);
      const { html, text, ...envelopeAndOptions } = input;
      expect({
        input: envelopeAndOptions,
        renderedHtmlSha256: sha256(html ?? renderEmailHtml(input.options!)),
        renderedTextSha256: sha256(text ?? renderEmailText(input.options!)),
        // Raw-markup senders do not have options; retain their readable text.
        ...(text === undefined ? {} : { text }),
        crm: mocks.addTenantActivity.mock.calls,
      }).toMatchSnapshot();
      expect(mocks.addTenantActivity).toHaveBeenCalledTimes(logsCrm ? 1 : 0);
    });

    it("never records a suppressed send as sent", async () => {
      mocks.sendEmail.mockResolvedValue(false);
      expect(await send()).toBe(false);
      expect(mocks.addTenantActivity).not.toHaveBeenCalled();
    });

    it("fails soft on a shared-sender error without recording a send", async () => {
      mocks.sendEmail.mockRejectedValue(new Error("provider unavailable"));
      expect(await send()).toBe(false);
      expect(mocks.addTenantActivity).not.toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledTimes(1);
    });

    if (logsCrm) {
      it("keeps an accepted send successful when lazy CRM logging fails", async () => {
        mocks.addTenantActivity.mockRejectedValue(new Error("CRM unavailable"));
        expect(await send()).toBe(true);
        expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
        expect(mocks.addTenantActivity).toHaveBeenCalledTimes(1);
        expect(console.error).toHaveBeenCalledWith("[delivery-email] CRM comms log failed (non-fatal):", expect.any(Error));
      });
    }
  });

  it.each([undefined, "", " , , "])("keeps the operator fallback when recipients are %s", (value) => {
    vi.stubEnv("LEAD_NOTIFY_EMAILS", value);
    expect(delivery.resolveLeadNotifyRecipients()).toEqual(["jacob@strelva.com"]);
  });

  it("keeps recipient order, trimming and duplicate policy", () => {
    vi.stubEnv("LEAD_NOTIFY_EMAILS", " first@example.com, , second@example.com,first@example.com ");
    expect(delivery.resolveLeadNotifyRecipients()).toEqual(["first@example.com", "second@example.com", "first@example.com"]);
  });
});
