import { createHash } from "node:crypto";
import { getSubscribers, getContent } from "./storage";
import { sanitizeEmailSubjectText } from "./invite-email";
import { sanitizeEmailHtml, htmlToPlainText } from "./email-html";
import { CLIENT_MAIL_DOMAIN, sendBatchWithReceipt } from "@/platform/infra/email/send";
import { buildUnsubscribeUrl } from "./newsletter-unsubscribe";

export interface SendNewsletterInput {
  subject: string;
  body: string;
  previewText?: string;
  /**
   * Stable prefix for provider idempotency keys (e.g. the approval event id).
   * Each batch is keyed by `{prefix}:{hash of its sorted recipients}`, so a
   * retry after a partial send never re-delivers a batch the provider already
   * accepted. Omit for a truly one-off send.
   */
  idempotencyKeyPrefix?: string;
}

export interface SendNewsletterResult {
  success: boolean;
  /** Recipients the provider accepted. Accepted, not delivered. */
  subscriberCount: number;
  devMode?: boolean;
  reason?: "no_subscribers" | "paused" | "send_failed";
  /** Receipt detail (publishing spec, section 3 item 12). */
  receipt?: {
    activeSubscribers: number;
    accepted: number;
    suppressed: number;
    acceptedBatches: number;
    failedBatches: number;
    failedRecipients: number;
    from: string;
  };
}

const BATCH_SIZE = 100;

function controlOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://app.strelva.com").replace(/\/+$/, "");
}

/**
 * Send a newsletter to a tenant's active subscribers. Shared by the manual
 * send route (POST /api/newsletter/send) and the approve-the-draft path
 * (event-actions). Caller is responsible for auth, rate limit and approval.
 *
 * Goes through the one email path (email/send.ts, audience `customer`) from
 * mail.strelva.com: never a per-client domain, never the root domain. Every
 * message carries RFC 8058 one-click unsubscribe headers. Only `active`
 * subscribers are addressed. A batch that fails does not stop the others; a
 * retry with the same prefix re-sends only what wasn't accepted.
 */
export async function sendNewsletter(
  tenant: string,
  { subject, body, previewText, idempotencyKeyPrefix }: SendNewsletterInput,
): Promise<SendNewsletterResult> {
  const subscribers = await getSubscribers(tenant);
  const active = subscribers.filter((s) => s.status === "active");
  if (active.length === 0) {
    return { success: false, subscriberCount: 0, reason: "no_subscribers" };
  }

  const settings = await getContent("settings", tenant);
  const fromName = sanitizeEmailSubjectText(settings.siteName || "Newsletter");
  const fromAddress = `newsletter@${CLIENT_MAIL_DOMAIN}`;
  const safeHtml = sanitizeEmailHtml(body);
  const safeText = htmlToPlainText(body);
  const safeSubject = sanitizeEmailSubjectText(subject);
  const origin = controlOrigin();

  if (!process.env.RESEND_API_KEY) {
    // Dev mode: nothing is sent and nothing is claimed as sent to a person.
    console.log(`[newsletter] dev mode (no RESEND_API_KEY): ${active.length} subscribers, from ${fromAddress}`);
    return { success: true, subscriberCount: active.length, devMode: true };
  }

  let accepted = 0;
  let acceptedBatches = 0;
  let failedBatches = 0;
  let failedRecipients = 0;
  let suppressed = 0;
  for (let i = 0; i < active.length; i += BATCH_SIZE) {
    const batch = active.slice(i, i + BATCH_SIZE);
    const recipients = batch.map((s) => s.email);
    // Key by the batch's content, not its offset: a membership change between
    // attempts shifts offsets, and a reused key with a different payload is
    // rejected by the provider.
    const idempotencyKey = idempotencyKeyPrefix
      ? `${idempotencyKeyPrefix}:${createHash("sha256").update([...recipients].sort().join(",")).digest("hex").slice(0, 32)}`
      : undefined;
    try {
      const result = await sendBatchWithReceipt({
        audience: "customer",
        tenantId: tenant,
        fromName,
        fromAddress,
        idempotencyKey,
        messages: batch.map((subscriber) => {
          const unsubscribe = buildUnsubscribeUrl(origin, { tenantId: tenant, email: subscriber.email });
          return {
            to: subscriber.email,
            subject: safeSubject,
            html: safeHtml,
            text: `${safeText}\n\nUnsubscribe: ${unsubscribe}`,
            headers: {
              "List-Unsubscribe": `<${unsubscribe}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              ...(previewText ? { "X-Preview-Text": previewText } : {}),
            },
          };
        }),
      });
      if (result.status === "suppressed") {
        // The audience gate is off: nothing in this send can go out.
        suppressed = active.length;
        console.warn(`[newsletter] customer email is off — ${tenant} newsletter not sent`);
        return {
          success: false, subscriberCount: 0, reason: "paused",
          receipt: { activeSubscribers: active.length, accepted: 0, suppressed, acceptedBatches: 0, failedBatches: 0, failedRecipients: 0, from: fromAddress },
        };
      }
      accepted += result.count;
      acceptedBatches += 1;
    } catch (error) {
      failedBatches += 1;
      failedRecipients += batch.length;
      console.error(`[newsletter] batch failed for ${tenant} (offset ${i}): ${error instanceof Error ? error.message : "error"}`);
    }
  }

  const receipt = { activeSubscribers: active.length, accepted, suppressed, acceptedBatches, failedBatches, failedRecipients, from: fromAddress };
  if (failedBatches > 0) return { success: false, subscriberCount: accepted, reason: "send_failed", receipt };
  return { success: true, subscriberCount: accepted, receipt };
}
