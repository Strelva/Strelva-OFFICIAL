import { renderEmailHtml, renderEmailText, type EmailOptions } from "@/platform/infra/email/layout";
import { sendEmail } from "@/platform/infra/email/send";
import { cleanSubjectText } from "@/platform/infra/email/text";
import { logSentEmailToCrm } from "./crm-log";

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
    ? `We just approved an update to ${whatChanged} on your site. It's rolling out now. It can take a few minutes to appear.`
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
  /** When set, a real send is logged to this tenant's CRM comms timeline. */
  tenantId?: string;
  logPrefix?: string;
  /**
   * When true, the change is approved but its propagation to the live client
   * site has NOT been confirmed (e.g. revalidation failed). Softens the copy to
   * "approved and rolling out — it can take a few minutes to appear" so we never
   * promise a change is visible when it might not be yet.
   */
  rollingOut?: boolean;
}): Promise<boolean> {
  try {
    const subjectSiteName = cleanSubjectText(params.siteName);
    const subject = params.rollingOut
      ? `Your update to ${subjectSiteName} is rolling out`
      : `Your update to ${subjectSiteName} is live`;

    const sent = await sendEmail({
      audience: "client",
      tenantId: params.tenantId,
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
    if (!sent) return false;
    await logSentEmailToCrm(params.tenantId, "Sent: update-live email");
    return true;
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Update-live email failed:`, err);
    return false;
  }
}

function buildWelcomeEmailOptions(params: {
  businessName: string;
  ownerName?: string;
  dashboardUrl: string;
}): EmailOptions {
  const business = cleanSubjectText(params.businessName);
  const owner = params.ownerName ? cleanSubjectText(params.ownerName) : "";
  const opener = owner
    ? `Hi ${owner}, your Strelva dashboard for ${business} is ready.`
    : `Your Strelva dashboard for ${business} is ready.`;
  return {
    preheader: "Your dashboard is ready. Here's what happens next.",
    heading: "Welcome to Strelva",
    paragraphs: [
      opener,
      "From here, we manage your site for you. Tell the assistant in your dashboard what you want changed, in plain words, and we handle the update.",
      "Once a month you'll get a report showing what's working: who found you, what they clicked, and what we changed. Reply to any of our emails anytime and a real person will get back to you.",
    ],
    button: { label: "Open your dashboard", url: params.dashboardUrl },
    footerNote: `For ${business}`,
  };
}

/**
 * "Welcome to Strelva" — the first email a client gets once they have dashboard
 * access. Sets the expectation for how the service works (we manage, you ask,
 * you get a monthly report). CLIENT email: gated on emailSendingPaused() so it
 * stays silent during the test-tenant phase. Fails soft: returns false on any
 * error so it can never block granting access.
 */
export async function sendWelcomeEmail(params: {
  email: string;
  businessName: string;
  ownerName?: string;
  dashboardUrl: string;
  /** When set, a real send is logged to this tenant's CRM comms timeline. */
  tenantId?: string;
  logPrefix?: string;
}): Promise<boolean> {
  try {
    const opts = buildWelcomeEmailOptions(params);

    const sent = await sendEmail({
      audience: "client",
      tenantId: params.tenantId,
      to: params.email,
      subject: "Welcome to Strelva",
      options: opts,
    });
    if (!sent) return false;
    await logSentEmailToCrm(params.tenantId, "Sent: welcome email");
    return true;
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Welcome email failed:`, err);
    return false;
  }
}

function buildSiteLiveEmailOptions(params: {
  businessName: string;
  siteUrl: string;
  dashboardUrl: string;
}): EmailOptions {
  const business = cleanSubjectText(params.businessName);
  return {
    preheader: `${business} is live and ready for visitors.`,
    heading: "Your site is live",
    paragraphs: [
      `${business}'s new site is live and ready for visitors. Take a look, and if anything needs a tweak, just tell the assistant in your dashboard.`,
    ],
    rows: [{ label: "Your site", value: params.siteUrl }],
    button: { label: "View your site", url: params.siteUrl },
    footerNote: `For ${business}`,
    manageUrl: params.dashboardUrl,
  };
}

/**
 * "Your site is live" — tells the client their new site has gone live, with the
 * live URL and a link back to the dashboard (footer Manage link). CLIENT email:
 * gated on emailSendingPaused(). Fails soft: returns false on any error.
 */
export async function sendSiteLiveEmail(params: {
  email: string;
  businessName: string;
  siteUrl: string;
  dashboardUrl: string;
  /** When set, a real send is logged to this tenant's CRM comms timeline. */
  tenantId?: string;
  logPrefix?: string;
}): Promise<boolean> {
  try {
    const opts = buildSiteLiveEmailOptions(params);

    const sent = await sendEmail({
      audience: "client",
      tenantId: params.tenantId,
      to: params.email,
      subject: `${cleanSubjectText(params.businessName)} is live`,
      options: opts,
    });
    if (!sent) return false;
    await logSentEmailToCrm(params.tenantId, "Sent: site-live email");
    return true;
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Site-live email failed:`, err);
    return false;
  }
}

function buildHealthRegressionEmailOptions(params: {
  businessName: string;
  ownerName?: string;
  previousGrade: string;
  currentGrade: string;
  previousScore: number;
  currentScore: number;
  healthUrl: string;
}): EmailOptions {
  const business = cleanSubjectText(params.businessName);
  const greeting = params.ownerName ? `Hi ${cleanSubjectText(params.ownerName)}, ` : "";
  return {
    preheader: `${business}'s site health slipped to a ${params.currentGrade}.`,
    heading: "Your site health dropped",
    paragraphs: [
      `${greeting}our latest scan of ${business} found the site-health grade slipped from ${params.previousGrade} to ${params.currentGrade}. This usually means something changed: a slower page, a broken link, or an SEO signal that regressed.`,
      "You don't need to do anything technical. Open your dashboard to see what changed, or just tell the assistant and we'll look into it for you.",
    ],
    rows: [
      { label: "Previous", value: `${params.previousGrade} (${params.previousScore})` },
      { label: "Now", value: `${params.currentGrade} (${params.currentScore})` },
    ],
    button: { label: "See what changed", url: params.healthUrl },
    footerNote: `For ${business}`,
    manageUrl: params.healthUrl,
  };
}

/**
 * "Your site health dropped" — alerts the owner when a scheduled scan finds the
 * site-health grade regressed materially vs the last stored grade. Plain,
 * non-technical copy pointing at the dashboard. CLIENT email: gated on
 * emailSendingPaused(). Fails soft: returns false on any error so a failed alert
 * can never break the portfolio scan.
 */
export async function sendHealthRegressionEmail(params: {
  email: string;
  businessName: string;
  ownerName?: string;
  previousGrade: string;
  currentGrade: string;
  previousScore: number;
  currentScore: number;
  healthUrl: string;
  /** When set, a real send is logged to this tenant's CRM comms timeline. */
  tenantId?: string;
  logPrefix?: string;
}): Promise<boolean> {
  try {
    const opts = buildHealthRegressionEmailOptions(params);

    const sent = await sendEmail({
      audience: "client",
      tenantId: params.tenantId,
      to: params.email,
      subject: `${cleanSubjectText(params.businessName)}'s site health dropped to ${params.currentGrade}`,
      options: opts,
    });
    if (!sent) return false;
    await logSentEmailToCrm(
      params.tenantId,
      `Sent: health-drop alert (${params.previousGrade} → ${params.currentGrade})`,
    );
    return true;
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Health-regression email failed:`, err);
    return false;
  }
}
