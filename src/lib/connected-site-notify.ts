/**
 * Tell a business someone reached out through its connected site.
 *
 * One recipient, by the one owner-recipient rule (the business record's owner
 * contact; resolve_business_owner_recipient). Mail goes through the one email
 * path and only while client email is enabled. The inquiry is already stored
 * before this runs; a failure here never loses it.
 */
import { emailSendingPaused } from "@/lib/email-enabled";
import { sendEmail } from "@/lib/email/send";
import { resolveOwnerRecipient } from "@/platform/business-record/service";
import type { ConnectedInquiry, ResolvedConnectedSite } from "@/products/connected-sites/contracts";

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
  const email = connectedInquiryEmail(site, inquiry);
  await (deps.send ?? sendEmail)({ audience: "client", to: recipient.email, subject: email.subject, options: email.options, tags: { kind: "connected-site-inquiry" }, idempotencyKey: `connected-inquiry:${inquiry.id}` });
  return "sent";
}
