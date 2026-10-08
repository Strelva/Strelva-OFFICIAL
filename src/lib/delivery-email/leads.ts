import { buildDeliveryStatusEmailHtml, buildDeliveryStatusEmailText } from "@/lib/access-request-delivery";
import { renderEmailHtml, renderEmailText, type EmailOptions } from "@/platform/infra/email/layout";
import { sendEmail } from "@/platform/infra/email/send";
import { cleanSubjectText } from "@/platform/infra/email/text";
import { logSentEmailToCrm } from "./crm-log";
import { resolveLeadNotifyRecipients } from "./operator-recipients";

function buildNewLeadEmailOptions(params: {
  name: string;
  email?: string;
  message?: string;
  dashboardUrl: string;
}): EmailOptions {
  const rows = [{ label: "Name", value: cleanSubjectText(params.name) }];
  if (params.email) rows.push({ label: "Email", value: cleanSubjectText(params.email) });
  if (params.message) rows.push({ label: "Message", value: cleanSubjectText(params.message) });
  return {
    heading: "Someone reached out",
    rows,
    button: { label: "See it in your dashboard", url: params.dashboardUrl },
  };
}

function buildNewLeadEmailHtml(params: {
  name: string;
  email?: string;
  message?: string;
  dashboardUrl: string;
}): string {
  return renderEmailHtml(buildNewLeadEmailOptions(params));
}

function buildNewLeadEmailText(params: {
  name: string;
  email?: string;
  message?: string;
  dashboardUrl: string;
}): string {
  return renderEmailText(buildNewLeadEmailOptions(params));
}

/**
 * "Someone reached out through your website" — tells the owner a customer
 * submitted the site's contact/booking form the moment it lands, so they don't
 * have to open the dashboard to find out. Fails soft: returns false on any error
 * (missing API key, Resend failure) so it can never block lead capture.
 */
export async function sendNewLeadEmail(params: {
  email: string;
  siteName: string;
  lead: { name: string; email?: string; message?: string };
  dashboardUrl: string;
  /** The tenant the lead belongs to. Lets the per-client email override arm
   * this notice and logs a real send to the tenant's CRM timeline. */
  tenantId?: string;
  logPrefix?: string;
}): Promise<boolean> {
  try {
    const sent = await sendEmail({
      audience: "client",
      tenantId: params.tenantId,
      to: params.email,
      subject: "Someone reached out through your website",
      html: buildNewLeadEmailHtml({
        name: params.lead.name,
        email: params.lead.email,
        message: params.lead.message,
        dashboardUrl: params.dashboardUrl,
      }),
      text: buildNewLeadEmailText({
        name: params.lead.name,
        email: params.lead.email,
        message: params.lead.message,
        dashboardUrl: params.dashboardUrl,
      }),
    });
    if (!sent) return false;
    await logSentEmailToCrm(params.tenantId, "Sent: new-lead email");
    return true;
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} New-lead email failed:`, err);
    return false;
  }
}

/**
 * Every field that comes in on the /access-request intake form. Carried whole
 * into the team-notification email so nobody has to open a screen to triage.
 */
export interface IntakeLeadFields {
  businessName: string;
  description?: string | null;
  location?: string | null;
  email: string;
  phone?: string | null;
  currentWebsite?: string | null;
  plan?: string | null;
  planLabel: string;
  referredBy?: string | null;
}

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

export async function sendDeliveryStatusEmail(params: {
  businessName: string;
  email: string;
  statusUrl: string;
  logPrefix?: string;
}): Promise<boolean> {
  try {
    const subjectBusinessName = cleanSubjectText(params.businessName);

    return await sendEmail({
      // A build-request confirmation goes to a PROSPECT (no tenant yet), same
      // class as the audit-report scorecard — not the client lifecycle audience.
      // Under "client" it was suppressed by the (default-off) client kill-switch
      // while prospect mail flows, so prospects never got their confirmation.
      audience: "prospect",
      to: params.email,
      subject: `We received ${subjectBusinessName}'s site request`,
      html: buildDeliveryStatusEmailHtml({
        businessName: params.businessName,
        statusUrl: params.statusUrl,
      }),
      text: buildDeliveryStatusEmailText({
        businessName: params.businessName,
        statusUrl: params.statusUrl,
      }),
    });
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Delivery status email failed:`, err);
    return false;
  }
}
