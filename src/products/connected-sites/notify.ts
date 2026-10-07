/**
 * Tell a business someone reached out through its connected site.
 *
 * One recipient, by the one owner-recipient rule (the business record's owner
 * contact; resolve_business_owner_recipient). Mail goes through the one email
 * path and only while client email is enabled. The inquiry is already stored
 * before this runs; a failure here never loses it.
 */
import { customerEmailEnabled, emailSendingPaused } from "@/platform/infra/email/enabled";
import { inquiryRecordsEnabled } from "@/platform/infra/inquiry-records";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";
import { sendEmail } from "@/platform/infra/email/send";
import { resolveOwnerRecipient } from "@/platform/business-record/service";
import type { ConnectedInquiry, ResolvedConnectedSite } from "./contracts";

function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://app.strelva.com").replace(/\/+$/, "");
}

export function connectedInquiryEmail(site: Pick<ResolvedConnectedSite, "siteHost" | "workspaceId">, inquiry: Pick<ConnectedInquiry, "name" | "email" | "message">) {
  const where = site.siteHost.replace(/^www\./, "");
  return {
    subject: `New inquiry from ${where}`,
    options: {
      preheader: `${inquiry.name} reached out through ${where}.`,
      heading: "Someone reached out through your website",
      paragraphs: [
        `${inquiry.name} sent an inquiry through ${where}. A quick reply is the best way to win the work.`,
        ...(inquiry.message ? [`“${inquiry.message.slice(0, 1200)}”`] : []),
      ],
      rows: inquiry.email ? [{ label: "Email", value: inquiry.email }] : [],
      button: { label: "Open your workspace", url: `${appOrigin()}/workspace?workspaceId=${encodeURIComponent(site.workspaceId)}` },
      footerNote: `Sent because ${where} is connected to your Strelva workspace.`,
    },
  };
}

export async function notifyConnectedSiteInquiry({ site, inquiry }: { site: ResolvedConnectedSite; inquiry: Pick<ConnectedInquiry, "id" | "name" | "email" | "message"> }, deps: { paused?: () => boolean; recipient?: typeof resolveOwnerRecipient; send?: typeof sendEmail } = {}): Promise<"sent" | "paused" | "no_recipient"> {
  if ((deps.paused ?? emailSendingPaused)()) return "paused";
  const recipient = await (deps.recipient ?? resolveOwnerRecipient)(site.workspaceId);
  if (!recipient?.email) return "no_recipient";
  if (inquiryRecordsEnabled() && (process.env.STRELVA_INQUIRY_OWNER_NOTICES !== "1" || !customerEmailEnabled()
    || (recipient.tenantId && await getClientEmailOverride(recipient.tenantId) === "off"))) return "paused";
  const email = connectedInquiryEmail(site, inquiry);
  const sent = await (deps.send ?? sendEmail)({ audience: "client", ...(recipient.tenantId ? { tenantId: recipient.tenantId } : {}), to: recipient.email, subject: email.subject, options: email.options, tags: { kind: "connected-site-inquiry" }, idempotencyKey: `connected-inquiry:${inquiry.id}` });
  return inquiryRecordsEnabled() && !sent ? "paused" : "sent";
}
