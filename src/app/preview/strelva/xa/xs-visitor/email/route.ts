import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { HERTEL, genericVisitorEmails, newsletterIssue, previewBooking, previewBrand } from "@/experience/workspace/preview/xs-visitor-fixture";
import { visitorBrandForMail } from "@/products/websites/client";
import { customerReminderEmail, ownerRequestReminderEmail, requestLapsedEmail, bookingWhen } from "@/platform/bookings/emails";
import { bookingUpdateVisitorMail } from "@/platform/bookings/updates";
import { renderEmailHtml, renderEmailText, type EmailOptions } from "@/platform/infra/email/layout";
import { visitorNewsletterMail } from "@/platform/infra/email/visitor-mail";
import { renderXaMailHtml, renderXaMailText, type XaMail } from "@/platform/infra/email/xa-mail";

export const dynamic = "force-dynamic";

const P = "/preview/strelva/xa/xs-visitor";
const HARBOR_MAIL = { name: "Harbor Dental", address: "1180 Elmwood Ave, Buffalo" };
const HERTEL_MAIL = { name: HERTEL.name, address: "1452 Hertel Ave, Buffalo" };

/**
 * Visitor emails, rendered by the real builders and the real renderer
 * (renderEmailHtml / renderXaMailHtml). Templates only: nothing is sent.
 * Visitor mail wears Harbor Dental's own accent (&brand=none for XA ink); the
 * owner's chase stays in XA ink because it is Strelva speaking to the owner.
 * ?kind=reminder|today|chase|lapsed|lapsed-none|confirmed|requested|held|cancelled|declined|newsletter|inquiry-reply|inquiry-offer|inquiry-follow|authored-reply|confirm-request&format=text
 */
function mail(kind: string, brand?: string): { options?: EmailOptions; xa?: XaMail } | null {
  const harbor = brand === "hertel" ? HERTEL_MAIL : HARBOR_MAIL;
  const booking = brand === "hertel" ? { ...previewBooking("confirmed"), serviceName: HERTEL.service } : previewBooking("confirmed");
  const when = bookingWhen(booking);
  switch (kind) {
    case "reminder": return { options: customerReminderEmail({ booking, kind: "reminder_24h", businessName: harbor.name, manageUrl: `${P}/manage` }).options };
    case "today": return { options: customerReminderEmail({ booking, kind: "reminder_2h", businessName: harbor.name, manageUrl: `${P}/manage` }).options };
    case "chase": return { options: ownerRequestReminderEmail({ booking: previewBooking("requested"), businessName: harbor.name, openUrl: "/preview/strelva/bookings" }).options };
    case "lapsed": return { options: requestLapsedEmail({ booking: previewBooking("declined"), businessName: harbor.name, alternatives: ["Wed, Nov 25, 8:30 AM", "Sat, Nov 28, 9:00 AM", "Mon, Nov 30, 10:30 AM"], bookAgainUrl: `${P}/offer` }).options };
    case "lapsed-none": return { options: requestLapsedEmail({ booking: previewBooking("declined"), businessName: harbor.name, alternatives: [], bookAgainUrl: null }).options };
    case "confirmed": case "requested": case "held": case "cancelled": case "declined":
      return { xa: bookingUpdateVisitorMail({ title: kind === "confirmed" ? "Booking confirmed" : kind === "requested" ? "Request received" : kind === "held" ? "Confirm your booking request" : kind === "cancelled" ? "Booking cancelled" : "Your time wasn't confirmed", state: kind, rescheduled: false, business: harbor, booking, when, agentSource: null, url: kind === "cancelled" || kind === "declined" ? null : `${P}/${kind === "held" ? "confirm" : "manage"}` }) };
    case "newsletter": return { xa: visitorNewsletterMail({ business: harbor.name, ...newsletterIssue, unsubscribeUrl: `${P}/unsubscribe` }) };
    default: { const options = genericVisitorEmails[kind]; return options ? { options } : null; }
  }
}

export async function GET(request: Request) {
  if (!strelvaUiPreviewEnabled()) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const found = mail(url.searchParams.get("kind") ?? "reminder", url.searchParams.get("brand") ?? undefined);
  if (!found) return new Response("Unknown kind", { status: 404 });
  const text = url.searchParams.get("format") === "text";
  const chosen = previewBrand(url.searchParams.get("brand") ?? undefined);
  const mailBrand = visitorBrandForMail(chosen);
  // A real logo must be https; the fictional Hertel logo is served by this preview, so it rides as a local path.
  const brand = mailBrand && chosen?.logo && !mailBrand.logoUrl ? { ...mailBrand, logoUrl: chosen.logo.url } : mailBrand;
  if (brand && url.searchParams.get("kind") !== "chase") { if (found.xa) found.xa = { ...found.xa, brand }; else if (found.options) found.options = { ...found.options, visitorBrand: brand }; }
  const raw = found.xa ? text ? renderXaMailText(found.xa) : renderXaMailHtml(found.xa) : text ? renderEmailText(found.options!) : renderEmailHtml(found.options!);
  // Mail clients that load web fonts read the Google Fonts <link> in the email.
  // This app's CSP blocks that host, so the preview adds the same face from
  // public/xa/fonts. Clients that strip web fonts (Gmail) show the system stack.
  const body = text ? raw : raw.replace("</head>", `<style>@font-face{font-family:'DM Sans';font-style:normal;font-weight:100 1000;src:url(/xa/fonts/dm-sans-latin.woff2) format('woff2')}</style></head>`);
  return new Response(body, { headers: { "Content-Type": `text/${text ? "plain" : "html"}; charset=utf-8`, "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } });
}
