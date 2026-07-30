import { createHash } from "node:crypto";
import { getSubscribers, getContent } from "./storage";
import { EMAIL_DOMAIN } from "./brand";
import { sanitizeEmailSubjectText } from "./invite-email";
import { sanitizeEmailHtml, htmlToPlainText } from "./email-html";
import { emailSendingPaused } from "./email-enabled";
import { getTenantConfig } from "./tenants";

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

  // Audience gate: check BEFORE touching Resend so that "paused" is surfaced
  // consistently — sendEmail() enforces it internally, but we check here to
  // keep the early-return reason code explicit.
  if (emailSendingPaused()) {
    console.warn("[newsletter] sending paused (EMAIL_SENDING_ENABLED != true) — not sent");
    return { success: false, subscriberCount: 0, reason: "paused" };
  }

  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Resolve per-tenant sending domain (matches the weekly-report pattern).
    // getTenantConfig is cache-backed so this is a cheap read.
    const tenantConfig = await getTenantConfig(tenant).catch(() => undefined);
    const emailDomain =
      tenantConfig?.resendDomain || process.env.RESEND_DOMAIN || EMAIL_DOMAIN;

    // Reply-To: route subscriber replies to the real human inbox, not the
    // send-only newsletter@ address. sendEmail() applies this same default for
    // transactional mail; we mirror it here for the batch path.
    const replyTo =
      process.env.REPLY_TO_EMAIL || "hello@strelva.com";

    const emails = activeSubscribers.map((s) => s.email);

    const batchSize = 100;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const payload = batch.map((to) => ({
        from: `${fromName} <newsletter@${emailDomain}>`,
        replyTo,
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
      // Resend already accepted instead of double-delivering. Key by the batch's
      // CONTENT (a hash of its sorted recipients), NOT the slice offset — a
      // membership change between attempts shifts offsets, and an offset key with
      // a different payload is REJECTED by Resend, wedging the send for 24h.
      const batchKey = idempotencyKeyPrefix
        ? `${idempotencyKeyPrefix}:${createHash("sha256").update([...batch].sort().join(",")).digest("hex").slice(0, 32)}`
        : undefined;
      let result;
      try {
        result = await resend.batch.send(
          payload,
          batchKey ? { idempotencyKey: batchKey } : undefined,
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
