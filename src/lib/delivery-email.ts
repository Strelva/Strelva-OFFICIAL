import {
  buildDeliveryStatusEmailHtml,
  buildDeliveryStatusEmailText,
} from "@/lib/access-request-delivery";
import { emailSendingPaused, operatorEmailsEnabled } from "@/lib/email-enabled";
import { renderEmailHtml, renderEmailText, type EmailOptions, type EmailRow } from "@/lib/email/layout";

function cleanSubjectText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Log a real client-comms send into the tenant's operator CRM activity timeline
 * so comms history accrues automatically ("Sent: welcome email"). Called ONLY
 * after a send actually goes out — every sender returns early (false) when
 * paused or missing an API key, so a suppressed send is never recorded as sent.
 * A no-op when no `tenantId` is passed. Fail-soft by contract: a CRM-log failure
 * must never break the send, so it swallows every error.
 */
async function logSentEmailToCrm(
  tenantId: string | undefined,
  summary: string,
): Promise<void> {
  if (!tenantId) return;
  try {
    const { addTenantActivity } = await import("@/lib/tenant-crm");
    await addTenantActivity(tenantId, { kind: "email", summary, author: "Strelva" });
  } catch (err) {
    console.error("[delivery-email] CRM comms log failed (non-fatal):", err);
  }
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
    await logSentEmailToCrm(params.tenantId, "Sent: update-live email");
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
  if (!operatorEmailsEnabled()) {
    console.warn(`${params.logPrefix ?? "[email]"} operator emails disabled (OPERATOR_EMAILS_ENABLED=false) — team lead notification skipped`);
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
  if (!operatorEmailsEnabled()) {
    console.warn(`${params.logPrefix ?? "[email]"} operator emails disabled (OPERATOR_EMAILS_ENABLED=false) — new-signup notification skipped`);
    return false;
  }
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromDomain = process.env.RESEND_DOMAIN || "updates.strelva.com";
    const opts = buildNewSignupEmailOptions(params);

    const result = await resend.emails.send({
      from: `Strelva <hello@${fromDomain}>`,
      to: resolveLeadNotifyRecipients(),
      subject: `New paying signup: ${cleanSubjectText(params.businessName)}`,
      html: renderEmailHtml(opts),
      text: renderEmailText(opts),
    });
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Resend did not return an email id.");
    }
    return true;
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
      `A subscription payment for ${business} failed. They're now past due — check the Stripe dashboard and follow up before access lapses.`,
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
  if (!operatorEmailsEnabled()) {
    console.warn(`${params.logPrefix ?? "[email]"} operator emails disabled (OPERATOR_EMAILS_ENABLED=false) — payment-failed notification skipped`);
    return false;
  }
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromDomain = process.env.RESEND_DOMAIN || "updates.strelva.com";
    const opts = buildPaymentFailedEmailOptions(params);

    const result = await resend.emails.send({
      from: `Strelva <hello@${fromDomain}>`,
      to: resolveLeadNotifyRecipients(),
      subject: `Payment failed: ${cleanSubjectText(params.businessName)}`,
      html: renderEmailHtml(opts),
      text: renderEmailText(opts),
    });
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Resend did not return an email id.");
    }
    return true;
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Payment-failed email failed:`, err);
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
  if (emailSendingPaused()) {
    console.warn(`[email] sending paused (EMAIL_SENDING_ENABLED != true) — skipped ${params.email}`);
    return false;
  }
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromDomain = process.env.RESEND_DOMAIN || "updates.strelva.com";
    const opts = buildWelcomeEmailOptions(params);

    const result = await resend.emails.send({
      from: `Strelva <hello@${fromDomain}>`,
      to: params.email,
      subject: "Welcome to Strelva",
      html: renderEmailHtml(opts),
      text: renderEmailText(opts),
    });
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Resend did not return an email id.");
    }
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
  if (emailSendingPaused()) {
    console.warn(`[email] sending paused (EMAIL_SENDING_ENABLED != true) — skipped ${params.email}`);
    return false;
  }
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromDomain = process.env.RESEND_DOMAIN || "updates.strelva.com";
    const opts = buildSiteLiveEmailOptions(params);

    const result = await resend.emails.send({
      from: `Strelva <hello@${fromDomain}>`,
      to: params.email,
      subject: `${cleanSubjectText(params.businessName)} is live`,
      html: renderEmailHtml(opts),
      text: renderEmailText(opts),
    });
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Resend did not return an email id.");
    }
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
  if (emailSendingPaused()) {
    console.warn(`[email] sending paused (EMAIL_SENDING_ENABLED != true) — skipped ${params.email}`);
    return false;
  }
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromDomain = process.env.RESEND_DOMAIN || "updates.strelva.com";
    const opts = buildReviewRequestEmailOptions(params);

    const result = await resend.emails.send({
      from: `Strelva <hello@${fromDomain}>`,
      to: params.email,
      subject: `A few reviews go a long way for ${cleanSubjectText(params.businessName)}`,
      html: renderEmailHtml(opts),
      text: renderEmailText(opts),
    });
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Resend did not return an email id.");
    }
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
    `${greeting}${author} left ${business} a new ${params.review.rating}-star review. A quick reply — especially in the first day or two — is one of the best local-SEO signals you can send, and it shows customers you're paying attention.`,
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
  if (emailSendingPaused()) {
    console.warn(`[email] sending paused (EMAIL_SENDING_ENABLED != true) — skipped ${params.email}`);
    return false;
  }
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromDomain = process.env.RESEND_DOMAIN || "updates.strelva.com";
    const opts = buildReviewNeedsReplyEmailOptions(params);

    const result = await resend.emails.send({
      from: `Strelva <hello@${fromDomain}>`,
      to: params.email,
      subject: `New ${params.review.rating}-star review for ${cleanSubjectText(params.businessName)}`,
      html: renderEmailHtml(opts),
      text: renderEmailText(opts),
    });
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Resend did not return an email id.");
    }
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
      `${greeting}our latest scan of ${business} found the site-health grade slipped from ${params.previousGrade} to ${params.currentGrade}. This usually means something changed — a slower page, a broken link, or an SEO signal that regressed.`,
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
  if (emailSendingPaused()) {
    console.warn(`[email] sending paused (EMAIL_SENDING_ENABLED != true) — skipped ${params.email}`);
    return false;
  }
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromDomain = process.env.RESEND_DOMAIN || "updates.strelva.com";
    const opts = buildHealthRegressionEmailOptions(params);

    const result = await resend.emails.send({
      from: `Strelva <hello@${fromDomain}>`,
      to: params.email,
      subject: `${cleanSubjectText(params.businessName)}'s site health dropped to ${params.currentGrade}`,
      html: renderEmailHtml(opts),
      text: renderEmailText(opts),
    });
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Resend did not return an email id.");
    }
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

/** One at-risk client line in the ops digest: business name + its top reason. */
export interface OpsDigestAtRisk {
  name: string;
  reason: string;
}

function buildOpsDigestEmailOptions(params: {
  totalLeads: number;
  unworkedLeads: number;
  atRisk: OpsDigestAtRisk[];
  recentSignups: string[];
  opsUrl: string;
}): EmailOptions {
  const plural = (n: number) => (n === 1 ? "" : "s");
  const rows: EmailRow[] = [
    { label: "Unworked leads", value: `${params.unworkedLeads} of ${params.totalLeads}` },
    { label: "At-risk clients", value: String(params.atRisk.length) },
  ];
  // One row per at-risk client (name → top reason), capped so a bad day can't
  // blow the email up.
  for (const client of params.atRisk.slice(0, 12)) {
    rows.push({ label: cleanSubjectText(client.name), value: cleanSubjectText(client.reason) });
  }
  rows.push({
    label: "New signups (7d)",
    value: params.recentSignups.length
      ? params.recentSignups.map((n) => cleanSubjectText(n)).join(", ")
      : "None",
  });
  const summary =
    `${params.unworkedLeads} unworked lead${plural(params.unworkedLeads)} of ${params.totalLeads} total · ` +
    `${params.atRisk.length} client${plural(params.atRisk.length)} at risk · ` +
    `${params.recentSignups.length} new signup${plural(params.recentSignups.length)} this week.`;
  return {
    heading: "Strelva daily ops",
    paragraphs: [summary],
    rows,
    button: { label: "Open the ops board", url: params.opsUrl },
    footerNote: "Operator notification",
  };
}

/**
 * "Strelva daily ops" — one digest a day summarizing the portfolio for the
 * operators (Noah + Jacob): unworked leads, at-risk clients (with the top
 * reason), and recent signups. OPERATOR notification: gates on
 * operatorEmailsEnabled() (ON by default), independent of the client email
 * pause. Recipients default to jacob@strelva.com via resolveLeadNotifyRecipients().
 * Fails soft: returns false on any error so a failed digest can never affect the
 * cron's 200.
 */
export async function sendOpsDigestEmail(params: {
  totalLeads: number;
  unworkedLeads: number;
  atRisk: OpsDigestAtRisk[];
  recentSignups: string[];
  opsUrl: string;
  logPrefix?: string;
}): Promise<boolean> {
  if (!operatorEmailsEnabled()) {
    console.warn(`${params.logPrefix ?? "[email]"} operator emails disabled (OPERATOR_EMAILS_ENABLED=false) — ops digest skipped`);
    return false;
  }
  if (!process.env.RESEND_API_KEY) return false;

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const fromDomain = process.env.RESEND_DOMAIN || "updates.strelva.com";
    const opts = buildOpsDigestEmailOptions(params);

    const result = await resend.emails.send({
      from: `Strelva <hello@${fromDomain}>`,
      to: resolveLeadNotifyRecipients(),
      subject: "Strelva daily ops",
      html: renderEmailHtml(opts),
      text: renderEmailText(opts),
    });
    if (result.error || !result.data?.id) {
      throw new Error(result.error?.message || "Resend did not return an email id.");
    }
    return true;
  } catch (err) {
    console.error(`${params.logPrefix || "[delivery-email]"} Ops-digest email failed:`, err);
    return false;
  }
}
