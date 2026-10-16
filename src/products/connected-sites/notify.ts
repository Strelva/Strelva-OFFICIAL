import { CONTROL_PLANE_URL } from "@/platform/infra/brand";
/**
 * Tell a business someone reached out through its connected site.
 *
 * One recipient, by the one owner-recipient rule (the business record's owner
 * contact; resolve_business_owner_recipient). Mail goes through the one email
 * path and only while client email is enabled. The inquiry is already stored
 * before this runs; a failure here never loses it.
 */
import { customerEmailPaused, emailSendingPaused } from "@/platform/infra/email/enabled";
import { inquiryRecordsEnabled } from "@/platform/infra/inquiry-records";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";
import { sendEmail } from "@/platform/infra/email/send";
import { resolveOwnerRecipient } from "@/platform/business-record/service";
import type { PaperEmail } from "@/platform/infra/email/paper";
import type { ConnectedInquiry, ResolvedConnectedSite } from "./contracts";
import { notifyDurableConnectedInquiryOwner } from "./inquiry-owner-notice";

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || CONTROL_PLANE_URL).replace(/\/+$/, "");
}

export function connectedInquiryEmail(site: Pick<ResolvedConnectedSite, "siteHost" | "workspaceId">, inquiry: Pick<ConnectedInquiry, "name" | "email" | "message">) {
  const where = site.siteHost.replace(/^www\./, "");
  const url = `${appOrigin()}/workspace?workspaceId=${encodeURIComponent(site.workspaceId)}`;
  const quote = inquiry.message ? `“${inquiry.message.slice(0, 1200)}”` : null;
  const footerNote = `Sent because ${where} is connected to Strelva.`;
  // XA · E1 presentation: who wrote, their words, where it is kept, one button.
  // The plain options stay for the text part and older mail clients.
  const paper: PaperEmail = {
    subject: `New inquiry from ${where}`,
    preheader: `${inquiry.name} reached out through ${where}.`,
    sender: where,
    senderDetail: "",
    footer: footerNote,
    blocks: [
      { kind: "label", text: [inquiry.name, inquiry.email].filter(Boolean).join(" · ") },
      ...(quote ? [{ kind: "paragraph" as const, text: quote }] : []),
      { kind: "rule" },
      { kind: "paragraph", text: `It came through the form on ${where} and is saved in Strelva. A quick reply is the best way to win the work.` },
      { kind: "actions", actions: [{ label: `Open ${inquiry.name}'s inquiry`, url, style: "primary" }], full: false },
    ],
  };
  return {
    subject: `New inquiry from ${where}`,
    options: {
      preheader: `${inquiry.name} reached out through ${where}.`,
      heading: "Someone reached out through your website",
      paragraphs: [
        `${inquiry.name} sent an inquiry through ${where}. A quick reply is the best way to win the work.`,
        ...(quote ? [quote] : []),
      ],
      rows: inquiry.email ? [{ label: "Email", value: inquiry.email }] : [],
      button: { label: "Open your workspace", url },
      footerNote,
      paper,
    },
  };
}

export async function notifyConnectedSiteInquiry({ site, inquiry }: { site: ResolvedConnectedSite; inquiry: Pick<ConnectedInquiry, "id" | "name" | "email" | "message"> }, deps: { paused?: () => boolean; customerPaused?: () => boolean; clientOverride?: typeof getClientEmailOverride; recipient?: typeof resolveOwnerRecipient; send?: typeof sendEmail } = {}): Promise<"sent" | "paused" | "no_recipient" | "no_tenant"> {
  // Durable records claim and gate their own send, including the arming switch below.
  if (inquiryRecordsEnabled()) {
    const email = connectedInquiryEmail(site, inquiry);
    return notifyDurableConnectedInquiryOwner({ rowId: inquiry.id, siteId: site.id, workspaceId: site.workspaceId, ...email });
  }
  // Connected-site rollout is silent unless explicitly armed. A per-tenant
  // override cannot bypass either global gate for this new sender.
  if (process.env.STRELVA_CONNECTED_SITE_EMAIL_ENABLED !== "1" || (deps.paused ?? emailSendingPaused)() || (deps.customerPaused ?? customerEmailPaused)()) return "paused";
  const recipient = await (deps.recipient ?? resolveOwnerRecipient)(site.workspaceId);
  if (!recipient?.email) return "no_recipient";
  // A business-only connection has no tenant email policy to authorize a send.
  if (!recipient.tenantId) return "no_tenant";
  if (await (deps.clientOverride ?? getClientEmailOverride)(recipient.tenantId) === "off") return "paused";
  const email = connectedInquiryEmail(site, inquiry);
  const sent = await (deps.send ?? sendEmail)({ audience: "client", tenantId: recipient.tenantId, to: recipient.email, subject: email.subject, options: email.options, tags: { kind: "connected-site-inquiry" }, idempotencyKey: `connected-inquiry:${inquiry.id}` });
  return sent ? "sent" : "paused";
}
