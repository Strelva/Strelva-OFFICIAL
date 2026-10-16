import Link from "next/link";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { CONFIRM_STATES, MANAGE_STATES, OFFER_STATES } from "@/experience/workspace/preview/xs-visitor-fixture";

export const dynamic = "force-dynamic";
export const metadata = { title: "Visitor screens", robots: { index: false, follow: false } };

const P = "/preview/strelva/xa/xs-visitor";
const GROUPS: { title: string; links: [string, string][] }[] = [
  { title: "The business's website", links: [["Home, native renderer", `${P}/site`], ["About, native renderer", `${P}/site?page=/about`], ["Links", `${P}/links`], ["Links, nothing set", `${P}/links?state=empty`], ["Blog", `${P}/blog`], ["Blog, no posts", `${P}/blog?state=empty`], ["Blog post", `${P}/post`], ["Page not found", `${P}/site-missing`], ["Error", `${P}/site-error`]] },
  { title: "Business page (/biz)", links: [["Ready", `${P}/biz`], ["With assistant access", `${P}/biz?state=assistants`], ["Loading", `${P}/biz?state=loading`], ["Nothing confirmed", `${P}/biz?state=empty`], ["Error", `${P}/biz?state=error`], ["Unavailable", `${P}/biz?state=permission`], ["Dark", `${P}/biz?mode=dark`], ["Page not found", `${P}/biz-missing`]] },
  { title: "Your booking (/b)", links: MANAGE_STATES.map(state => [state, `${P}/manage?state=${state}`]) },
  { title: "Confirm a request (/booking-confirm)", links: CONFIRM_STATES.map(state => [state, `${P}/confirm?state=${state}`]) },
  { title: "Offer from an inquiry (/book-inquiry)", links: OFFER_STATES.map(state => [state, `${P}/offer?state=${state}`]) },
  { title: "Inquiry handoff (/inquiry-booking)", links: ["choose", "held", "requested", "confirmed", "rate", "expired-link", "error"].map(state => [state, `${P}/handoff?state=${state}`]) },
  { title: "Loading", links: [["Booking pages", `${P}/loading`]] },
  { title: "Emails", links: ["reminder", "today", "chase", "lapsed", "lapsed-none", "confirmed", "requested", "held", "cancelled", "offer-dates", "newsletter", "inquiry-reply", "inquiry-offer", "inquiry-follow", "authored-reply", "confirm-request"].map(kind => [kind, `${P}/email?kind=${kind}`]) },
  { title: "Unsubscribe", links: ["ask", "done", "bad", "rate", "failed"].map(state => [state, `${P}/unsubscribe?state=${state}`]) },
];

/** Index of the xs-visitor previews. Preview harness only. */
export default function Page() {
  if (!strelvaUiPreviewEnabled()) notFound();
  return <main style={{ maxWidth: 880, margin: "0 auto", padding: "48px 24px", fontFamily: "var(--font-workspace), 'DM Sans', sans-serif" }}>
    <h1 style={{ fontSize: 28, fontWeight: 600, margin: 0 }}>What visitors see</h1>
    {GROUPS.map(group => <section key={group.title} style={{ marginTop: 32 }}>
      <h2 style={{ fontSize: 13, fontWeight: 500, color: "#6b6f68", margin: "0 0 8px" }}>{group.title}</h2>
      <p style={{ margin: 0, lineHeight: "28px" }}>{group.links.map(([label, href], index) => <span key={href}>{index ? " · " : ""}<Link href={href}>{label}</Link></span>)}</p>
    </section>)}
  </main>;
}
