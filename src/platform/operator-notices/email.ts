import { renderEmailHtml, renderEmailText, type EmailOptions } from "@/platform/infra/email/layout";
import { sendEmail } from "@/platform/infra/email/send";
import { cleanSubjectText } from "@/platform/infra/email/text";
import { resolveLeadNotifyRecipients } from "@/platform/operator-notices/recipients";
import type { IntakeLeadFields } from "@/platform/infra/email/notice-contracts";

function buildIntakeLeadRows(lead: IntakeLeadFields): Array<[string, string]> {
  return [
    ["Business", lead.businessName],
    ["Email", lead.email],
    ["Phone", lead.phone || "—"],
    ["Location", lead.location || "—"],
    ["Current site", lead.currentWebsite || "—"],
    ["Wants", lead.planLabel],
    ["Referred by", lead.referredBy || "Direct"],
    ["What they want", lead.description || "—"],
  ];
}

function buildNewIntakeLeadEmailOptions(params: {
  lead: IntakeLeadFields;
  leadsUrl: string;
}): EmailOptions {
  return {
    heading: `New lead: ${cleanSubjectText(params.lead.businessName)}`,
    paragraphs: ["A new lead just came in through the Strelva site."],
    rows: buildIntakeLeadRows(params.lead).map(([label, value]) => ({
      label,
      value: cleanSubjectText(value),
    })),
    button: { label: "Open the leads board", url: params.leadsUrl },
    footerNote: "Operator notification",
  };
}

function buildNewIntakeLeadEmailHtml(params: {
  lead: IntakeLeadFields;
  leadsUrl: string;
}): string {
  return renderEmailHtml(buildNewIntakeLeadEmailOptions(params));
}

function buildNewIntakeLeadEmailText(params: {
  lead: IntakeLeadFields;
  leadsUrl: string;
}): string {
  return renderEmailText(buildNewIntakeLeadEmailOptions(params));
}

/**
 * "New lead: {businessName}" — notifies the team the moment a genuinely-new
 * marketing lead lands, carrying every intake field plus a link to the admin
 * leads board. Slack-independent by design: this is the notification path that
 * must work with no env configured (recipients default to jacob@strelva.com).
 * This is an OPERATOR notification, so it gates on operatorEmailsEnabled() (ON
 * by default) — NOT the client `emailSendingPaused()` switch — and keeps firing
 * to the team while customer email stays paused. Fails soft: returns false on
 * any error (missing API key, Resend failure) so a failed notification can
 * never fail the intake response.
 */
export async function sendNewIntakeLeadEmail(params: {
  lead: IntakeLeadFields;
  leadsUrl: string;
  logPrefix?: string;
}): Promise<boolean> {
  try {
    return await sendEmail({
      audience: "operator",
      to: resolveLeadNotifyRecipients(),
      subject: `New lead: ${cleanSubjectText(params.lead.businessName)}`,
      html: buildNewIntakeLeadEmailHtml({ lead: params.lead, leadsUrl: params.leadsUrl }),
      text: buildNewIntakeLeadEmailText({ lead: params.lead, leadsUrl: params.leadsUrl }),
    });
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} New-intake-lead email failed:`, err);
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
