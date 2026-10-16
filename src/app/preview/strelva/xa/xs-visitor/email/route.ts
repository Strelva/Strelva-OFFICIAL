import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { genericVisitorEmails, newsletterIssue, previewBooking } from "@/experience/workspace/preview/xs-visitor-fixture";
import { customerReminderEmail, ownerRequestReminderEmail, requestLapsedEmail, bookingWhen } from "@/platform/bookings/emails";
import { bookingUpdateVisitorMail } from "@/platform/bookings/updates";
import { renderEmailHtml, renderEmailText, type EmailOptions } from "@/platform/infra/email/layout";
import { offeredDatesMail, visitorNewsletterMail } from "@/platform/infra/email/visitor-mail";
import { renderXaMailHtml, renderXaMailText, type XaMail } from "@/platform/infra/email/xa-mail";

export const dynamic = "force-dynamic";

const P = "/preview/strelva/xa/xs-visitor";
const harbor = { name: "Harbor Dental", address: "1180 Elmwood Ave, Buffalo" };

/**
 * Visitor emails, rendered by the real builders and the real renderer
 * (renderEmailHtml / renderXaMailHtml). Templates only: nothing is sent.
 * ?kind=reminder|today|chase|lapsed|lapsed-none|confirmed|requested|held|cancelled|declined|offer-dates|newsletter|inquiry-reply|inquiry-offer|inquiry-follow|authored-reply|confirm-request&format=text
 */
function mail(kind: string): { options?: EmailOptions; xa?: XaMail } | null {
  const booking = previewBooking("confirmed");
  const when = bookingWhen(booking);
  switch (kind) {
    case "reminder": return { options: customerReminderEmail({ booking, kind: "reminder_24h", businessName: harbor.name, manageUrl: `${P}/manage` }).options };
    case "today": return { options: customerReminderEmail({ booking, kind: "reminder_2h", businessName: harbor.name, manageUrl: `${P}/manage` }).options };
    case "chase": return { options: ownerRequestReminderEmail({ booking: previewBooking("requested"), businessName: harbor.name, openUrl: "/preview/strelva/bookings" }).options };
    case "lapsed": return { options: requestLapsedEmail({ booking: previewBooking("declined"), businessName: harbor.name, alternatives: ["Wed, Nov 25, 8:30 AM", "Sat, Nov 28, 9:00 AM", "Mon, Nov 30, 10:30 AM"], bookAgainUrl: `${P}/offer` }).options };
    case "lapsed-none": return { options: requestLapsedEmail({ booking: previewBooking("declined"), businessName: harbor.name, alternatives: [], bookAgainUrl: null }).options };
    case "confirmed": case "requested": case "held": case "cancelled": case "declined":
      return { xa: bookingUpdateVisitorMail({ title: kind === "confirmed" ? "Booking confirmed" : kind === "requested" ? "Request received" : kind === "held" ? "Confirm your booking request" : kind === "cancelled" ? "Booking cancelled" : "Your time wasn't confirmed", state: kind, rescheduled: false, business: harbor, booking, when, agentSource: null, url: kind === "cancelled" || kind === "declined" ? null : `${P}/${kind === "held" ? "confirm" : "manage"}` }) };
    case "offer-dates": return { xa: offeredDatesMail({ business: harbor.name, person: "Dr. Lin", greeting: "Hi Jordan, thanks for writing. These times are open for a new-patient exam.", dates: ["Wed, Nov 25 · 8:30 AM", "Sat, Nov 28 · 9:00 AM", "Mon, Nov 30 · 10:30 AM"].map(label => ({ label, reviewUrl: `${P}/offer` })), expires: "Sunday, Nov 22" }) };
    case "newsletter": return { xa: visitorNewsletterMail({ business: harbor.name, ...newsletterIssue, unsubscribeUrl: `${P}/unsubscribe` }) };
    default: { const options = genericVisitorEmails[kind]; return options ? { options } : null; }
  }
}

export async function GET(request: Request) {
  if (!strelvaUiPreviewEnabled()) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const found = mail(url.searchParams.get("kind") ?? "reminder");
  if (!found) return new Response("Unknown kind", { status: 404 });
  const text = url.searchParams.get("format") === "text";
  const body = found.xa ? text ? renderXaMailText(found.xa) : renderXaMailHtml(found.xa) : text ? renderEmailText(found.options!) : renderEmailHtml(found.options!);
  return new Response(body, { headers: { "Content-Type": `text/${text ? "plain" : "html"}; charset=utf-8`, "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } });
}
