import { createHash } from "node:crypto";

import type { EmailOptions } from "@/lib/email/layout";
import { cleanSubjectText } from "@/lib/email/text";
import type { ReceiptActor } from "@/products/inquiries/contracts";

import type {
  InquiryDeliveryAction,
  InquiryDeliveryMessage,
  InquiryDeliverySubmission,
  InquiryRoute,
} from "./delivery-types";

export function validEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

/** A deterministic receiving address that contains no customer data. */
export function getInquiryReplyTrackingAddress(inquiry: InquiryDeliverySubmission): string | null {
  const domain = process.env.INQUIRY_REPLY_TO_DOMAIN?.trim().toLowerCase();
  if (!domain || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(domain)) return null;
  const digest = createHash("sha256").update(`${inquiry.tenantId}:${inquiry.id}`).digest("hex").slice(0, 20);
  return `inquiry+${digest}@${domain}`;
}

export function isInquiryReplyTrackingAddress(value: string): boolean {
  const domain = process.env.INQUIRY_REPLY_TO_DOMAIN?.trim().toLowerCase();
  return Boolean(
    domain &&
    value.trim().toLowerCase().match(new RegExp(`^inquiry\\+[a-f0-9]{20}@${domain.replaceAll(".", "\\.")}$`)),
  );
}

function providerTags(inquiry: InquiryDeliverySubmission, action: InquiryDeliveryAction): Record<string, string> {
  return {
    strelva_tenant_id: inquiry.tenantId.slice(0, 256),
    strelva_inquiry_id: inquiry.id.slice(0, 256),
    strelva_action: action,
    ...(inquiry.capabilityId ? { strelva_capability_id: inquiry.capabilityId.slice(0, 256) } : {}),
    ...(Number.isSafeInteger(inquiry.capabilityVersion) ? { strelva_capability_version: String(inquiry.capabilityVersion) } : {}),
  };
}

export function inquiryBusinessName(inquiry: InquiryDeliverySubmission, tenantName?: string): string {
  return cleanSubjectText(inquiry.businessName || tenantName || "your business").slice(0, 160) || "your business";
}

export function deliveryActionLabel(action: InquiryDeliveryAction): string {
  if (action === "schedule_follow_up") return "follow-up";
  if (action === "owner_notification") return "owner notification";
  return "reply";
}

export function actorForAction(action: InquiryDeliveryAction): ReceiptActor {
  return { kind: "strelva", id: `inquiry-delivery:${action}`, label: "Strelva" };
}

/** Render one provider-bound customer or owner message from trusted inquiry data. */
export function createInquiryDeliveryMessage(
  inquiry: InquiryDeliverySubmission,
  route: InquiryRoute,
  action: InquiryDeliveryAction,
): InquiryDeliveryMessage | null {
  const recipient = action === "owner_notification" ? validEmail(route.ownerEmail) : validEmail(route.customerEmail);
  if (!recipient) return null;

  const name = cleanSubjectText(inquiry.name).slice(0, 160) || "there";
  const business = inquiryBusinessName(inquiry, route.businessName);
  const message = typeof inquiry.message === "string" ? cleanSubjectText(inquiry.message).slice(0, 2000) : "";
  const source = typeof inquiry.source === "string" ? cleanSubjectText(inquiry.source).slice(0, 80) : "";
  const isOwner = action === "owner_notification";
  if (isOwner) {
    const options: EmailOptions = {
      preheader: `New inquiry from ${name}`,
      heading: `New inquiry from ${name}`,
      paragraphs: [`A new inquiry reached ${business}.`],
      rows: [
        { label: "Name", value: name },
        { label: "Email", value: validEmail(inquiry.email) || "Not provided" },
        ...(source ? [{ label: "Source", value: source }] : []),
        ...(message ? [{ label: "Message", value: message }] : []),
      ],
      footerNote: "Operator-configured inquiry notification · sent by Strelva",
    };
    return {
      tenantId: inquiry.tenantId,
      inquiryId: inquiry.id,
      action,
      capabilityId: inquiry.capabilityId,
      capabilityVersion: inquiry.capabilityVersion,
      audience: "client",
      to: recipient,
      subject: `New inquiry from ${name}`,
      options,
      tags: providerTags(inquiry, action),
      idempotencyKey: `inquiry:${inquiry.id}:${action}`,
    };
  }

  const isFollowUp = action === "schedule_follow_up";
  const followUpTemplate = isFollowUp && inquiry.followUpMessageTemplate
    ? cleanSubjectText(inquiry.followUpMessageTemplate).replaceAll("{name}", name).slice(0, 2000)
    : "";
  const options: EmailOptions = {
    preheader: isFollowUp ? `Following up with ${business}` : `We received your message for ${business}`,
    heading: isFollowUp ? "Checking in" : "We received your message",
    paragraphs: isFollowUp
      ? [
          followUpTemplate || `Hi ${name}, we are checking in about your message to ${business}. If you still need help, reply to this email and we will take it from there.`,
          "This is an automatic follow-up sent by Strelva for the business named above.",
        ]
      : [
          `Hi ${name}, ${business} received your message. Someone will review it and follow up as soon as they can.`,
          "This is an automatic confirmation sent by Strelva for the business named above.",
        ],
    ...(message && !isFollowUp ? { rows: [{ label: "Your message", value: message }] } : {}),
    footerNote: `Automatic ${isFollowUp ? "follow-up" : "reply"} · sent by Strelva for ${business}`,
  };
  const trackingReplyTo = getInquiryReplyTrackingAddress(inquiry);
  const fallbackReplyTo = validEmail(route.customerReplyTo);
  return {
    tenantId: inquiry.tenantId,
    inquiryId: inquiry.id,
    action,
    capabilityId: inquiry.capabilityId,
    capabilityVersion: inquiry.capabilityVersion,
    audience: "customer",
    to: recipient,
    ...(trackingReplyTo || fallbackReplyTo ? { replyTo: trackingReplyTo || fallbackReplyTo! } : {}),
    subject: isFollowUp ? `Following up on your message to ${business}` : `We received your message for ${business}`,
    options,
    tags: providerTags(inquiry, action),
    idempotencyKey: `inquiry:${inquiry.id}:${action}`,
  };
}
