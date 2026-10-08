import type { EmailOptions, EmailRow } from "@/platform/infra/email/layout";
import { sendEmail } from "@/platform/infra/email/send";
import { cleanSubjectText } from "@/platform/infra/email/text";
import { logSentEmailToCrm } from "./crm-log";

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
