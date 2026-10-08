import type { EmailOptions } from "@/platform/infra/email/layout";
import { sendEmail } from "@/platform/infra/email/send";
import { cleanSubjectText } from "@/platform/infra/email/text";
import { logSentEmailToCrm } from "./crm-log";
import { resolveLeadNotifyRecipients } from "./operator-recipients";

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

function buildNewSignupEmailOptions(params: {
  businessName: string;
  plan?: string;
  ownerEmail?: string;
  mrrDollars?: number;
  tenantUrl: string;
}): EmailOptions {
  const business = cleanSubjectText(params.businessName);
  const rows = [{ label: "Client", value: business }];
  if (params.plan) rows.push({ label: "Plan", value: cleanSubjectText(params.plan) });
  if (params.ownerEmail) rows.push({ label: "Owner", value: cleanSubjectText(params.ownerEmail) });
  if (typeof params.mrrDollars === "number") {
    rows.push({
      label: "MRR",
      value: `${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(params.mrrDollars)}/mo`,
    });
  }
  return {
    heading: "New paying signup 🎉",
    paragraphs: [`${business} just started a paid subscription.`],
    rows,
    button: { label: "Open the tenant", url: params.tenantUrl },
    footerNote: "Operator notification",
  };
}

/**
 * "New paying signup 🎉" — alerts the operators (Noah + Jacob) the moment a
 * client starts a paid subscription, so a new paying customer is never a silent
 * row in Stripe. OPERATOR notification: gates on operatorEmailsEnabled() (ON by
 * default), independent of the client email pause. Recipients default to
 * jacob@strelva.com via resolveLeadNotifyRecipients(). Fails soft: returns false
 * on any error so a failed alert can never affect the billing webhook.
 */
export async function sendNewSignupEmail(params: {
  businessName: string;
  plan?: string;
  ownerEmail?: string;
  mrrDollars?: number;
  tenantUrl: string;
  logPrefix?: string;
}): Promise<boolean> {
  try {
    const opts = buildNewSignupEmailOptions(params);

    return await sendEmail({
      audience: "operator",
      to: resolveLeadNotifyRecipients(),
      subject: `New paying signup: ${cleanSubjectText(params.businessName)}`,
      options: opts,
    });
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} New-signup email failed:`, err);
    return false;
  }
}

function buildPaymentFailedEmailOptions(params: {
  businessName: string;
  ownerEmail?: string;
  tenantUrl: string;
}): EmailOptions {
  const business = cleanSubjectText(params.businessName);
  const rows = [{ label: "Client", value: business }];
  if (params.ownerEmail) rows.push({ label: "Owner", value: cleanSubjectText(params.ownerEmail) });
  return {
    heading: `Payment failed: ${business}`,
    paragraphs: [
      `A subscription payment for ${business} failed. They're now past due. Check the Stripe dashboard and follow up before access lapses.`,
    ],
    rows,
    button: { label: "Open the tenant", url: params.tenantUrl },
    footerNote: "Operator notification",
  };
}

/**
 * "Payment failed: {business}" — alerts the operators (Noah + Jacob) when a
 * client's subscription payment fails, so a lapsing paying customer is never
 * silent. OPERATOR notification: gates on operatorEmailsEnabled() (ON by
 * default), independent of the client email pause. Recipients default to
 * jacob@strelva.com via resolveLeadNotifyRecipients(). Fails soft: returns false
 * on any error so a failed alert can never affect the billing webhook.
 */
export async function sendPaymentFailedEmail(params: {
  businessName: string;
  ownerEmail?: string;
  tenantUrl: string;
  logPrefix?: string;
}): Promise<boolean> {
  try {
    const opts = buildPaymentFailedEmailOptions(params);

    return await sendEmail({
      audience: "operator",
      to: resolveLeadNotifyRecipients(),
      subject: `Payment failed: ${cleanSubjectText(params.businessName)}`,
      options: opts,
    });
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Payment-failed email failed:`, err);
    return false;
  }
}
