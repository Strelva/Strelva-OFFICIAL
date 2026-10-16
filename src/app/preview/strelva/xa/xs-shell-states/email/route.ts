import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { renderPaperEmailHtml } from "@/platform/infra/email/paper";
import { exportReadyPaperEmail, ownerInvitationPaperEmail, teamInvitationPaperEmail } from "@/platform/infra/email/paper-templates";

export const dynamic = "force-dynamic";

const LINK = "/preview/strelva/xa/xs-shell-states/account";

/** Templates only, rendered with fictional data. Nothing here is sent. ?template=team|owner|export */
const TEMPLATES = {
  team: () => teamInvitationPaperEmail({ workspace: "Harbor Dental", inviter: "Dr. Amy Lin", recipient: "frontdesk@harbordental.com", owner: false, accept: { label: "Accept the invitation", url: LINK } }),
  owner: () => ownerInvitationPaperEmail({ sender: "North Studio", senderDetail: "Runs on Strelva · to amy@harbordental.com · 10:03 AM", business: "Harbor Dental",
    greeting: "Hi Dr. Lin. Maya Okafor at North Studio set up harbordental.com, Bookings and your Google listing in Strelva. Everything runs as it did yesterday.",
    systems: [{ label: "harbordental.com", value: "Live", tone: "live" }, { label: "Bookings", value: "Live", tone: "live" }, { label: "Google listing", value: "Live", tone: "live" }, { label: "New patient form", value: "Draft, waits for you", tone: "need" }],
    accept: { label: "Accept and open Harbor Dental", url: LINK }, expires: "Oct 23", invitedBy: "Maya Okafor at North Studio" }),
  export: () => exportReadyPaperEmail({ sender: "Strelva", senderDetail: "to amy@harbordental.com · 4:22 PM", business: "Harbor Dental", filename: "harbor-dental-2026-10-16.zip", fileDetail: "18 MB · website, bookings, inquiries and the business record",
    included: "Website pages and images · 1,204 bookings · 318 inquiries and replies · the business record (hours, 1180 Elmwood Ave, insurance). The manifest lists every category.",
    omitted: "Card details, which the payment provider holds · other people’s sign-in data", download: { label: "Download the export", url: LINK },
    linkNote: "The link works for 7 days and only for amy@harbordental.com.", requestedBy: "Dr. Amy Lin asked for this on Oct 16." }),
} as const;

export async function GET(request: Request) {
  if (!strelvaUiPreviewEnabled()) return new Response("Not found", { status: 404 });
  const name = new URL(request.url).searchParams.get("template") as keyof typeof TEMPLATES | null;
  const email = (TEMPLATES[name ?? "team"] ?? TEMPLATES.team)();
  // The app's CSP keeps web fonts to 'self', so this preview can't load the DM Sans link the email carries.
  // Say so on the page instead of passing the fallback stack off as DM Sans.
  const note = `<p style="margin:0;padding:8px 16px;font:13px/18px -apple-system,'Segoe UI',Arial,sans-serif;color:#6b6f68;background:#efeee9;">Preview shows the fallback type (Helvetica, Segoe UI or Arial). Mail apps that load web fonts show DM Sans; Gmail shows this fallback too.</p>`;
  const html = renderPaperEmailHtml(email).replace(/(<body[^>]*>)/, `$1${note}`);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex", "Cache-Control": "no-store" } });
}
