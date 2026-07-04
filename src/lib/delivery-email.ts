import {
  buildDeliveryStatusEmailHtml,
  buildDeliveryStatusEmailText,
} from "@/lib/access-request-delivery";
import { emailSendingPaused } from "@/lib/email-enabled";
import { renderEmailHtml, renderEmailText, type EmailOptions } from "@/lib/email/layout";

function cleanSubjectText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildUpdateLiveEmailOptions(params: {
  whatChanged: string;
  siteUrl: string;
  rollingOut?: boolean;
}): EmailOptions {
  const whatChanged = cleanSubjectText(params.whatChanged);
  // When revalidation hasn't confirmed, soften the claim: don't promise it's
  // visible "right now" if the client site may not have picked it up yet.
  const heading = params.rollingOut ? "Your update is approved." : "Your update is live.";
  const lead = params.rollingOut
    ? `We just approved an update to ${whatChanged} on your site. It's rolling out now — it can take a few minutes to appear.`
    : `We just updated ${whatChanged} on your site. It's published and live for visitors right now.`;
  return {
    heading,
    paragraphs: [
      lead,
      "Want something else changed? Just reply or tell the assistant in your dashboard.",
    ],
    button: { label: "See it on your site", url: params.siteUrl },
  };
}

function buildUpdateLiveEmailHtml(params: {
  whatChanged: string;
  siteUrl: string;
  rollingOut?: boolean;
}): string {
  return renderEmailHtml(buildUpdateLiveEmailOptions(params));
}

function buildUpdateLiveEmailText(params: {
  whatChanged: string;
  siteUrl: string;
  rollingOut?: boolean;
}): string {
  return renderEmailText(buildUpdateLiveEmailOptions(params));
}

/**
 * "Your update is live" — tells the site owner, in plain English, that an
 * approved change has published. Closes the abdication loop so the owner never
 * wonders whether the change happened. Fails soft: returns false on any error
 * (missing API key, Resend failure) so it can never block a publish.
 */
export async function sendUpdateLiveEmail(params: {
  email: string;
  siteName: string;
  whatChanged: string;
  siteUrl: string;
  logPrefix?: string;
  /**
   * When true, the change is approved but its propagation to the live client
   * site has NOT been confirmed (e.g. revalidation failed). Softens the copy to
   * "approved and rolling out — it can take a few minutes to appear" so we never
   * promise a change is visible when it might not be yet.
   */
  rollingOut?: boolean;
}): Promise<boolean> {
  if (emailSendingPaused()) {
    console.warn(`[email] sending paused (EMAIL_SENDING_ENABLED != true) — skipped ${params.email}`);
    return false;
  }
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromDomain = process.env.RESEND_DOMAIN || "updates.strelva.com";
    const subjectSiteName = cleanSubjectText(params.siteName);
    const subject = params.rollingOut
      ? `Your update to ${subjectSiteName} is rolling out`
      : `Your update to ${subjectSiteName} is live`;

    const result = await resend.emails.send({
      from: `Strelva <hello@${fromDomain}>`,
      to: params.email,
      subject,
      html: buildUpdateLiveEmailHtml({
        whatChanged: params.whatChanged,
        siteUrl: params.siteUrl,
        rollingOut: params.rollingOut,
      }),
      text: buildUpdateLiveEmailText({
        whatChanged: params.whatChanged,
        siteUrl: params.siteUrl,
        rollingOut: params.rollingOut,
      }),
    });
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Resend did not return an email id.");
    }
    return true;
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Update-live email failed:`, err);
    return false;
  }
}

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
  logPrefix?: string;
}): Promise<boolean> {
  if (emailSendingPaused()) {
    console.warn(`[email] sending paused (EMAIL_SENDING_ENABLED != true) — skipped ${params.email}`);
    return false;
  }
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromDomain = process.env.RESEND_DOMAIN || "updates.strelva.com";

    const result = await resend.emails.send({
      from: `Strelva <hello@${fromDomain}>`,
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
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Resend did not return an email id.");
    }
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

/**
 * Who gets the "new lead" notification. Reads LEAD_NOTIFY_EMAILS (comma-
 * separated) and DEFAULTS to jacob@strelva.com when it's unset or empty — the
 * whole point of this path is that an unset env can never silence a lead.
 * Exported so the fallback behavior is directly testable.
 */
export function resolveLeadNotifyRecipients(): string[] {
  const parsed = (process.env.LEAD_NOTIFY_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : ["jacob@strelva.com"];
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
 * Fails soft: returns false on any error (missing API key, Resend failure) so a
 * failed notification can never fail the intake response.
 */
export async function sendNewIntakeLeadEmail(params: {
  lead: IntakeLeadFields;
  leadsUrl: string;
  logPrefix?: string;
}): Promise<boolean> {
  if (emailSendingPaused()) {
    console.warn(`${params.logPrefix ?? "[email]"} sending paused (EMAIL_SENDING_ENABLED != true) — team lead notification skipped`);
    return false;
  }
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromDomain = process.env.RESEND_DOMAIN || "updates.strelva.com";

    const result = await resend.emails.send({
      from: `Strelva <hello@${fromDomain}>`,
      to: resolveLeadNotifyRecipients(),
      subject: `New lead: ${cleanSubjectText(params.lead.businessName)}`,
      html: buildNewIntakeLeadEmailHtml({ lead: params.lead, leadsUrl: params.leadsUrl }),
      text: buildNewIntakeLeadEmailText({ lead: params.lead, leadsUrl: params.leadsUrl }),
    });
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Resend did not return an email id.");
    }
    return true;
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
  if (emailSendingPaused()) {
    console.warn(`[email] sending paused (EMAIL_SENDING_ENABLED != true) — skipped ${params.email}`);
    return false;
  }
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromDomain = process.env.RESEND_DOMAIN || "updates.strelva.com";
    const subjectBusinessName = cleanSubjectText(params.businessName);

    const result = await resend.emails.send({
      from: `Strelva <hello@${fromDomain}>`,
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
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Resend did not return an email id.");
    }
    return true;
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Delivery status email failed:`, err);
    return false;
  }
}
