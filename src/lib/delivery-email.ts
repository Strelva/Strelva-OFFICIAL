import {
  buildDeliveryStatusEmailHtml,
  buildDeliveryStatusEmailText,
} from "@/lib/access-request-delivery";

function cleanSubjectText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function buildUpdateLiveEmailHtml(params: {
  whatChanged: string;
  siteUrl: string;
  rollingOut?: boolean;
}): string {
  const whatChanged = escapeHtml(cleanSubjectText(params.whatChanged));
  const siteUrl = escapeHtml(params.siteUrl);
  // When revalidation hasn't confirmed, soften the claim: don't promise it's
  // visible "right now" if the client site may not have picked it up yet.
  const headline = params.rollingOut ? "Your update is approved." : "Your update is live.";
  const lead = params.rollingOut
    ? `We just approved an update to <strong>${whatChanged}</strong> on your site. It's rolling out now — it can take a few minutes to appear.`
    : `We just updated <strong>${whatChanged}</strong> on your site. It's published and live for visitors right now.`;
  return `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #151515;">
      <p style="font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: #5b6f68; margin: 0 0 18px;">Strelva</p>
      <h1 style="font-size: 28px; line-height: 1.15; margin: 0 0 18px;">${headline}</h1>
      <p style="font-size: 16px; line-height: 1.65; color: #444; margin: 0 0 24px;">
        ${lead}
      </p>
      <a href="${siteUrl}" style="display: inline-block; border-radius: 999px; background: #111; color: #fff; padding: 13px 20px; text-decoration: none; font-weight: 600; font-size: 15px;">
        See it on your site
      </a>
      <p style="font-size: 14px; line-height: 1.6; color: #666; margin: 24px 0 0;">
        Want something else changed? Just reply or tell the assistant in your dashboard.
      </p>
    </div>
  `;
}

function buildUpdateLiveEmailText(params: {
  whatChanged: string;
  siteUrl: string;
  rollingOut?: boolean;
}): string {
  const whatChanged = cleanSubjectText(params.whatChanged);
  const headline = params.rollingOut ? "Your update is approved." : "Your update is live.";
  const lead = params.rollingOut
    ? `We just approved an update to ${whatChanged} on your site. It's rolling out now — it can take a few minutes to appear.`
    : `We just updated ${whatChanged} on your site. It's published and live for visitors right now.`;
  return [
    headline,
    "",
    lead,
    "",
    `See it on your site: ${params.siteUrl}`,
    "",
    "Want something else changed? Just reply or tell the assistant in your dashboard.",
  ].join("\n");
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

function buildNewLeadEmailHtml(params: {
  name: string;
  email?: string;
  message?: string;
  dashboardUrl: string;
}): string {
  const name = escapeHtml(cleanSubjectText(params.name));
  const email = params.email ? escapeHtml(cleanSubjectText(params.email)) : "";
  const message = params.message ? escapeHtml(cleanSubjectText(params.message)) : "";
  const dashboardUrl = escapeHtml(params.dashboardUrl);
  const contactLine = email
    ? `<p style="font-size: 16px; line-height: 1.65; color: #444; margin: 0 0 8px;"><strong>${name}</strong> &lt;${email}&gt;</p>`
    : `<p style="font-size: 16px; line-height: 1.65; color: #444; margin: 0 0 8px;"><strong>${name}</strong></p>`;
  const messageBlock = message
    ? `<p style="font-size: 16px; line-height: 1.65; color: #444; margin: 0 0 24px; padding: 14px 16px; background: #f5f4f2; border-radius: 8px;">${message}</p>`
    : "";
  return `
    <div style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #151515;">
      <p style="font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: #5b6f68; margin: 0 0 18px;">Strelva</p>
      <h1 style="font-size: 28px; line-height: 1.15; margin: 0 0 18px;">Someone reached out through your website.</h1>
      ${contactLine}
      ${messageBlock}
      <a href="${dashboardUrl}" style="display: inline-block; border-radius: 999px; background: #111; color: #fff; padding: 13px 20px; text-decoration: none; font-weight: 600; font-size: 15px;">
        See it in your dashboard
      </a>
    </div>
  `;
}

function buildNewLeadEmailText(params: {
  name: string;
  email?: string;
  message?: string;
  dashboardUrl: string;
}): string {
  const name = cleanSubjectText(params.name);
  const email = params.email ? cleanSubjectText(params.email) : "";
  const message = params.message ? cleanSubjectText(params.message) : "";
  return [
    "Someone reached out through your website.",
    "",
    email ? `${name} <${email}>` : name,
    ...(message ? ["", message] : []),
    "",
    `See it in your dashboard: ${params.dashboardUrl}`,
  ].join("\n");
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

export async function sendDeliveryStatusEmail(params: {
  businessName: string;
  email: string;
  statusUrl: string;
  logPrefix?: string;
}): Promise<boolean> {
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
