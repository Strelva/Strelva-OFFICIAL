import {
  buildDeliveryStatusEmailHtml,
  buildDeliveryStatusEmailText,
} from "@/lib/access-request-delivery";
import { renderEmailHtml, renderEmailText, type EmailOptions, type EmailRow } from "@/platform/infra/email/layout";
import { sendEmail } from "@/platform/infra/email/send";
import { cleanSubjectText } from "@/platform/infra/email/text";
import { logSentEmailToCrm } from "@/platform/infra/email/sent-activity";
import { workspacePorts } from "./workspace-ports";
import type { BookingConfirmationInput, BookingOwnerNoticeInput, NewIntakeLeadInput, NewSignupInput, PaymentFailedInput } from "@/platform/infra/email/notice-contracts";

/** Legacy synchronous API for the platform-owned operator recipient rule. */
export function resolveLeadNotifyRecipients(): string[] {
  return workspacePorts().operatorNoticeRecipients().resolveLeadNotifyRecipients();
}
export type { IntakeLeadFields } from "@/platform/infra/email/notice-contracts";


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

function buildReviewRequestEmailOptions(params: {
  businessName: string;
  reviewUrl: string;
  ownerName?: string;
}): EmailOptions {
  const business = cleanSubjectText(params.businessName);
  const owner = params.ownerName ? cleanSubjectText(params.ownerName) : "";
  const opener = owner
    ? `Hi ${owner}, reviews are one of the strongest signals for ${business} in local search.`
    : `Reviews are one of the strongest signals for ${business} in local search.`;
  return {
    preheader: "Your review link, ready to share with a few happy customers.",
    heading: "A few reviews go a long way",
    paragraphs: [
      opener,
      "Here's your review link. Send it to a few recent customers, or add it to your receipts and follow-up messages. A handful this month makes a real difference.",
    ],
    button: { label: "Open your review link", url: params.reviewUrl },
    footerNote: `For ${business}`,
  };
}

/**
 * "A few reviews go a long way" — a gentle, occasional nudge giving the owner
 * their review link to forward to happy customers. Deliberately short. CLIENT
 * email: gated on emailSendingPaused(). Fails soft: returns false on any error.
 */
export async function sendReviewRequestEmail(params: {
  email: string;
  businessName: string;
  reviewUrl: string;
  ownerName?: string;
  /** When set, a real send is logged to this tenant's CRM comms timeline. */
  tenantId?: string;
  logPrefix?: string;
}): Promise<boolean> {
  try {
    const opts = buildReviewRequestEmailOptions(params);

    const sent = await sendEmail({
      audience: "client",
      tenantId: params.tenantId,
      to: params.email,
      subject: `A few reviews go a long way for ${cleanSubjectText(params.businessName)}`,
      options: opts,
    });
    if (!sent) return false;
    await logSentEmailToCrm(params.tenantId, "Sent: review-request email");
    return true;
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Review-request email failed:`, err);
    return false;
  }
}

function buildReviewNeedsReplyEmailOptions(params: {
  businessName: string;
  ownerName?: string;
  review: { author: string; rating: number; text?: string };
  reviewsUrl: string;
  draftedReply?: string;
  approveUrl?: string;
  notYetUrl?: string;
}): EmailOptions {
  const business = cleanSubjectText(params.businessName);
  const author = cleanSubjectText(params.review.author);
  const stars = "★".repeat(Math.max(0, Math.min(5, params.review.rating)));
  const greeting = params.ownerName ? `Hi ${cleanSubjectText(params.ownerName)}, ` : "";
  const paragraphs = [
    `${greeting}${author} left ${business} a new ${params.review.rating}-star review. A quick reply (especially in the first day or two) is one of the best local-SEO signals you can send, and it shows customers you're paying attention.`,
  ];
  const rows: EmailRow[] = [
    { label: "From", value: author },
    { label: "Rating", value: `${stars} (${params.review.rating}/5)` },
  ];
  if (params.review.text) rows.push({ label: "Review", value: cleanSubjectText(params.review.text) });

  // When a filter-safe reply has been drafted, show it and let the owner post it
  // in one click. The Approve button resolves the pending reply-draft event via
  // the governed approval path — no auto-publish, the owner is the approver.
  if (params.draftedReply) {
    paragraphs.push("We drafted a reply you can post as-is, or tweak in your dashboard:");
    rows.push({ label: "Suggested reply", value: cleanSubjectText(params.draftedReply) });
  }

  const opts: EmailOptions = {
    preheader: `${author} left ${business} a ${params.review.rating}-star review.`,
    heading: "A new review needs your reply",
    paragraphs,
    rows,
    footerNote: `For ${business}`,
    manageUrl: params.reviewsUrl,
  };

  if (params.approveUrl && params.draftedReply) {
    opts.button = { label: "Approve & post this reply", url: params.approveUrl };
    if (params.notYetUrl) opts.secondaryButton = { label: "Not yet", url: params.notYetUrl };
  } else {
    opts.button = { label: "Reply in your dashboard", url: params.reviewsUrl };
  }
  return opts;
}

/**
 * "A new review needs your reply" — tells the owner the moment a genuinely-new
 * review lands, with the review, an optional AI-drafted reply, and (when a draft
 * exists) one-click Approve / Not-yet links that resolve the pending reply-draft
 * through the governed approval path. CLIENT email: gated on emailSendingPaused()
 * so it stays silent during the test-tenant phase. Fails soft: returns false on
 * any error so a failed alert can never break the review poll.
 */
export async function sendReviewNeedsReplyEmail(params: {
  email: string;
  businessName: string;
  ownerName?: string;
  review: { author: string; rating: number; text?: string };
  reviewsUrl: string;
  draftedReply?: string;
  approveUrl?: string;
  notYetUrl?: string;
  /** When set, a real send is logged to this tenant's CRM comms timeline. */
  tenantId?: string;
  logPrefix?: string;
}): Promise<boolean> {
  try {
    const opts = buildReviewNeedsReplyEmailOptions(params);

    const sent = await sendEmail({
      audience: "client",
      tenantId: params.tenantId,
      to: params.email,
      subject: `New ${params.review.rating}-star review for ${cleanSubjectText(params.businessName)}`,
      options: opts,
    });
    if (!sent) return false;
    await logSentEmailToCrm(
      params.tenantId,
      `Sent: review-reply alert (${params.review.rating}-star from ${cleanSubjectText(params.review.author)})`,
    );
    return true;
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Review-needs-reply email failed:`, err);
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

export { sendOpsDigestEmail, type OpsDigestAtRisk } from "@/lib/ops-digest-email";

/** Legacy API; the owning platform module keeps the complete send behavior. */
export async function sendBookingConfirmation(params: BookingConfirmationInput): Promise<boolean> {
  try {
    return await (await workspacePorts().bookingEmails()).sendBookingConfirmation(params);
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Booking confirmation failed:`, err);
    return false;
  }
}

/** Legacy API; the owning platform module keeps the complete send behavior. */
export async function sendNewBookingOwnerEmail(params: BookingOwnerNoticeInput): Promise<boolean> {
  try {
    return await (await workspacePorts().bookingEmails()).sendNewBookingOwnerEmail(params);
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} New-booking email failed:`, err);
    return false;
  }
}

/** Legacy API; the owning platform module keeps the complete send behavior. */
export async function sendNewIntakeLeadEmail(params: NewIntakeLeadInput): Promise<boolean> {
  try {
    return await (await workspacePorts().operatorNotices()).sendNewIntakeLeadEmail(params);
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} New-intake-lead email failed:`, err);
    return false;
  }
}

/** Legacy API; the owning platform module keeps the complete send behavior. */
export async function sendNewSignupEmail(params: NewSignupInput): Promise<boolean> {
  try {
    return await (await workspacePorts().operatorNotices()).sendNewSignupEmail(params);
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} New-signup email failed:`, err);
    return false;
  }
}

/** Legacy API; the owning platform module keeps the complete send behavior. */
export async function sendPaymentFailedEmail(params: PaymentFailedInput): Promise<boolean> {
  try {
    return await (await workspacePorts().operatorNotices()).sendPaymentFailedEmail(params);
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Payment-failed email failed:`, err);
    return false;
  }
}
