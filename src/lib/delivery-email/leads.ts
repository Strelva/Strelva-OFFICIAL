import { buildDeliveryStatusEmailHtml, buildDeliveryStatusEmailText } from "@/lib/access-request-delivery";
import { renderEmailHtml, renderEmailText, type EmailOptions } from "@/platform/infra/email/layout";
import { sendEmail } from "@/platform/infra/email/send";
import { cleanSubjectText } from "@/platform/infra/email/text";
import { logSentEmailToCrm } from "@/platform/infra/email/sent-activity";

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
