import { getSubscribers, getContent } from "./storage";
import { EMAIL_DOMAIN } from "./brand";
import { sanitizeEmailSubjectText } from "./invite-email";
import { sanitizeEmailHtml, htmlToPlainText } from "./email-html";
import { emailSendingPaused } from "./email-enabled";

export interface SendNewsletterInput {
  subject: string;
  body: string;
  previewText?: string;
  /**
   * Stable prefix for Resend idempotency keys (e.g. the approval event id). When
   * set, each batch is sent with `Idempotency-Key: {prefix}:{batchOffset}` so a
   * retry after a mid-send failure does NOT re-deliver batches Resend already
   * accepted. Omit for a truly one-off send.
   */
  idempotencyKeyPrefix?: string;
}

export interface SendNewsletterResult {
  success: boolean;
  subscriberCount: number;
  devMode?: boolean;
  reason?: "no_subscribers" | "paused" | "send_failed";
}

/**
 * Send a newsletter to a tenant's active subscribers. Extracted so both the
 * manual send route (POST /api/newsletter/send) and the approve-the-draft path
 * (event-actions) share one implementation — sanitize once, batch via Resend,
 * unsubscribe header on every email. Caller is responsible for auth + rate limit
 * + subscription gating; this is the delivery primitive.
 */
export async function sendNewsletter(
  tenant: string,
  { subject, body, previewText, idempotencyKeyPrefix }: SendNewsletterInput,
): Promise<SendNewsletterResult> {
  const subscribers = await getSubscribers(tenant);
  const activeSubscribers = subscribers.filter((s) => s.status === "active");
  if (activeSubscribers.length === 0) {
    return { success: false, subscriberCount: 0, reason: "no_subscribers" };
  }

  const settings = await getContent("settings", tenant);
  const fromName = sanitizeEmailSubjectText(settings.siteName || "Newsletter");
  const safeHtml = sanitizeEmailHtml(body);
  const safeText = htmlToPlainText(body);
  const safeSubject = sanitizeEmailSubjectText(subject);

  if (emailSendingPaused()) {
    console.warn("[newsletter] sending paused (EMAIL_SENDING_ENABLED != true) — not sent");
    return { success: false, subscriberCount: 0, reason: "paused" };
  }

  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const emailDomain = process.env.RESEND_DOMAIN || EMAIL_DOMAIN;
    const emails = activeSubscribers.map((s) => s.email);

    const batchSize = 100;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const payload = batch.map((to) => ({
        from: `${fromName} <newsletter@${emailDomain}>`,
        to,
        subject: safeSubject,
        html: safeHtml,
        text: safeText,
        headers: {
          "List-Unsubscribe": `<mailto:unsubscribe@${emailDomain}?subject=unsubscribe%20${encodeURIComponent(
            tenant,
          )}%20${encodeURIComponent(to)}>`,
          ...(previewText ? { "X-Preview-Text": previewText } : {}),
        },
      }));
      // The Resend SDK returns API failures in `error` (it does NOT throw) — an
      // unchecked call would report the newsletter "sent" when zero mails went
      // out, and event-actions would resolve the approval. Check it. The
      // idempotency key makes a retry after a mid-send failure skip batches
      // Resend already accepted instead of double-delivering.
      let result;
      try {
        result = await resend.batch.send(
          payload,
          idempotencyKeyPrefix ? { idempotencyKey: `${idempotencyKeyPrefix}:${i}` } : undefined,
        );
      } catch (err) {
        console.error(`[newsletter] batch send threw for ${tenant} (offset ${i}):`, err);
        return { success: false, subscriberCount: 0, reason: "send_failed" };
      }
      if (result.error) {
        console.error(`[newsletter] batch send failed for ${tenant} (offset ${i}):`, result.error);
        return { success: false, subscriberCount: 0, reason: "send_failed" };
      }
    }
    return { success: true, subscriberCount: activeSubscribers.length };
  }

  // Dev mode — no RESEND_API_KEY configured.
  console.log("=== NEWSLETTER (dev mode — no RESEND_API_KEY) ===");
  console.log(`From: ${fromName} | Subject: ${subject} | To: ${activeSubscribers.length} subscribers`);
  return { success: true, subscriberCount: activeSubscribers.length, devMode: true };
}
