import type { EmailOptions } from "@/platform/infra/email/layout";
import { sendEmail } from "@/platform/infra/email/send";
import { cleanSubjectText } from "@/platform/infra/email/text";
import { logSentEmailToCrm } from "@/platform/infra/email/sent-activity";

function buildPaymentPastDueOptions(params: {
  businessName: string;
  dashboardUrl: string;
}): EmailOptions {
  const business = cleanSubjectText(params.businessName);
  return {
    preheader: `We couldn't process your payment for ${business}.`,
    heading: "Your payment didn't go through",
    paragraphs: [
      `We tried to charge your card for ${business} and it didn't go through. Your site is still live for now, but if the payment isn't updated in the next few days your dashboard access will pause.`,
      "Updating your card takes a minute. Open your dashboard and click Manage billing.",
    ],
    button: { label: "Update your card", url: params.dashboardUrl },
    footerNote: `For ${business}`,
  };
}

/**
 * Client dunning — tells the site OWNER their subscription payment failed and how to fix it.
 * Complements the in-app past-due banner (which already links to the Stripe portal). Client
 * email (behind the `emailSendingPaused()` gate), fail-soft: returns false on pause / missing
 * key / Resend error so it can never affect the billing webhook's response.
 */
export async function sendPaymentPastDueEmail(params: {
  email: string;
  businessName: string;
  dashboardUrl: string;
  /** When set, a real send is logged to this tenant's CRM comms timeline. */
  tenantId?: string;
  logPrefix?: string;
}): Promise<boolean> {
  try {
    const opts = buildPaymentPastDueOptions(params);

    const sent = await sendEmail({
      audience: "client",
      tenantId: params.tenantId,
      to: params.email,
      subject: `Action needed: your payment for ${cleanSubjectText(params.businessName)} didn't go through`,
      options: opts,
    });
    if (!sent) return false;
    await logSentEmailToCrm(params.tenantId, "Sent: payment-past-due email");
    return true;
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Payment-past-due email failed:`, err);
    return false;
  }
}
