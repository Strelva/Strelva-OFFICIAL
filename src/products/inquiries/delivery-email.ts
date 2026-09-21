/**
 * Internal email transport for inquiry delivery.
 *
 * Provider calls stay behind the shared email boundary. The transport reports
 * provider acceptance separately from delivery verification and never retries
 * an accepted message by itself.
 */

import { getEmailReadback, sendEmailWithReceipt } from "@/lib/email/send";

import type { InquiryOutboundTransport } from "./delivery-types";

/** Real email transport. In tests it is blocked unless explicitly overridden. */
export function createEmailInquiryTransport(options: { allowExternalSends?: boolean } = {}): InquiryOutboundTransport {
  return {
    async send(message) {
      if (process.env.NODE_ENV === "test" && options.allowExternalSends !== true) {
        return { status: "rejected", reason: "external_sends_disabled_in_test", retryable: false };
      }
      try {
        const sent = await sendEmailWithReceipt({
          audience: message.audience,
          tenantId: message.audience === "client" ? message.tenantId : undefined,
          to: message.to,
          ...(message.replyTo ? { replyTo: message.replyTo } : {}),
          subject: message.subject,
          options: message.options,
          ...(message.tags ? { tags: message.tags } : {}),
          idempotencyKey: message.idempotencyKey,
        });
        if (sent.status === "accepted") {
          return {
            status: "accepted" as const,
            providerMessageId: sent.providerMessageId,
            acceptedAt: sent.acceptedAt,
          };
        }
        return {
          status: "rejected" as const,
          reason: sent.reason,
          retryable: true,
          outcome: "suppressed" as const,
        };
      } catch (error) {
        return { status: "unknown" as const, reason: error instanceof Error ? error.message.slice(0, 240) : "email_provider_unknown" };
      }
    },
    async verify(message, acceptance) {
      const apiKey = process.env.RESEND_API_KEY;
      const providerMessageId = acceptance.providerMessageId;
      if (!apiKey || !providerMessageId) {
        return { status: "unavailable", reason: "email_provider_readback_unavailable" };
      }
      try {
        const result = await getEmailReadback(providerMessageId);
        if (result.status === "unavailable") return result;
        if (result.providerMessageId !== providerMessageId) {
          return { status: "unavailable", reason: "email_provider_readback_mismatch" };
        }
        if (!result.to.some((recipient) => recipient.trim().toLowerCase() === message.to.trim().toLowerCase())) {
          return { status: "unavailable", reason: "email_provider_recipient_mismatch" };
        }
        if (result.subject !== message.subject) {
          return { status: "unavailable", reason: "email_provider_subject_mismatch" };
        }
        const evidence = [`Resend reported email ${providerMessageId} as ${result.lastEvent}.`];
        if (result.lastEvent === "delivered" || result.lastEvent === "opened" || result.lastEvent === "clicked") {
          return { status: "verified", evidence };
        }
        if (result.lastEvent === "bounced") {
          return { status: "bounced", reason: "Resend reported a permanent bounce.", evidence };
        }
        if (result.lastEvent === "delivery_delayed") {
          return { status: "deferred", reason: "Resend reported delayed delivery.", retryable: false, evidence };
        }
        if (result.lastEvent === "failed" || result.lastEvent === "canceled" || result.lastEvent === "complained") {
          return { status: "failed", reason: `Resend reported ${result.lastEvent}.`, retryable: false, evidence };
        }
        return { status: "unverified", reason: `Resend reported ${result.lastEvent}; final delivery is not verified.`, retryable: false };
      } catch (error) {
        return { status: "unavailable", reason: error instanceof Error ? error.message.slice(0, 240) : "email_provider_readback_unavailable" };
      }
    },
  };
}
