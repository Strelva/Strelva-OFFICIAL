import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { XsLeadsPreview, type XsScreen } from "@/experience/workspace/preview/XsLeadsPreview";
import { renderPaperEmailBody, type PaperEmail } from "@/platform/infra/email/paper";
import { newInquiryEmail } from "@/platform/infra/email/paper-templates";
import { connectedInquiryEmail } from "@/products/connected-sites/server";
import { websiteReportPaper } from "@/products/websites/server";
import type { WebsiteMonthlyReport } from "@/products/websites/client";
import { XA_SYSTEM_HREFS } from "@/experience/workspace/preview/xa-day";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · XA leads, reviews, recaps, results", robots: { index: false, follow: false } };

const XS_SCREENS: readonly XsScreen[] = ["leads", "reviews", "recaps", "results", "prospects", "business-picker", "business"];
const EMAILS = ["email-inquiry", "email-connected", "email-report"] as const;
type EmailScreen = (typeof EMAILS)[number];

/** Fictional email content (Harbor Dental, North Studio). Rendered here only; nothing is sent. */
function email(screen: EmailScreen, state: string): PaperEmail {
  if (screen === "email-inquiry") return newInquiryEmail({ sender: "North Studio for Harbor Dental", senderDetail: "Runs on Strelva · to dr.lin@harbordental.com · 9:14 AM", person: "Priya Shah", source: "via harbordental.com · New patient",
    inquiry: "Do you take Delta Dental PPO? My daughter needs a cleaning before school starts back.",
    recordedOutcome: "Strelva answered Priya from your business record: yes to Delta Dental PPO, with the booking link. Saved her in your Inbox.",
    policyNote: "Insurance questions are set to answer from your business record.", open: { label: "Open Priya in Strelva", url: "/preview/strelva/xa/xs-leads/business" } });
  if (screen === "email-connected") return connectedInquiryEmail({ siteHost: "www.harbordental.com", workspaceId: "5e000000-0000-4000-8000-0000000000d1" },
    { name: "Priya Shah", email: state === "no-email" ? null : "priya.shah@example.com", message: state === "no-message" ? null : "Do you take Delta Dental PPO? My daughter needs a cleaning before school starts back." }).options.paper;
  const unavailable = state === "unavailable";
  const report: WebsiteMonthlyReport = { workId: "w", workspaceId: "5e000000-0000-4000-8000-0000000000d1", tenantId: "harbor", siteName: "Harbor Dental", month: "2026-09", generatedAt: "2026-10-01T07:00:00Z",
    inquiries: unavailable ? { status: "unavailable", count: null, limitedToRecentRecords: true } : { status: "available", count: 38, limitedToRecentRecords: true },
    bookings: unavailable ? { status: "unavailable", scheduledInPeriod: null, providerAccepted: null, providerVerified: null } : { status: "available", scheduledInPeriod: 61, providerAccepted: 58, providerVerified: 55 },
    visibility: { status: "available", checkedAt: "2026-09-25T12:00:00Z", mentioned: true, recommended: false, note: "Saved measurement" },
    readiness: unavailable ? { status: "unavailable", passedChecks: null, totalChecks: null } : { status: "available", checkedAt: "2026-09-25T12:00:00Z", passedChecks: 14, totalChecks: 15 },
    // Summaries are what websiteChangeSummary reads from the documents; the draft-only save is left out of the email.
    changes: [{ revision: 3, contentHash: "a", createdAt: "2026-09-10T12:00:00Z", createdBy: "strelva", published: true, summary: "changed the map on the Contact page" }, { revision: 4, contentHash: "b", createdAt: "2026-09-12T12:00:00Z", createdBy: "maya", published: true, summary: "changed the booking button and the hours on the home page" }, { revision: 5, contentHash: "c", createdAt: "2026-09-20T12:00:00Z", createdBy: "maya", published: false, summary: null }] };
  return websiteReportPaper(report, "/preview/strelva/xa/xs-leads/results", { actors: { maya: "Maya at North Studio" }, systemUrl: XA_SYSTEM_HREFS.website });
}

/** Every xs-leads screen with fixtures. ?state=…&mode=dark (&range= for results, &period=&recap= for recaps, &open=1 opens the picked item on a phone, &prospect= picks a check result). */
export default async function XsLeadsPreviewPage({ params, searchParams }: { params: Promise<{ screen: string }>; searchParams: Promise<{ state?: string; mode?: string; range?: string; period?: string; recap?: string; open?: string; prospect?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { screen } = await params;
  const { state = "ready", mode, range, period, recap, open, prospect } = await searchParams;
  const emailScreen = EMAILS.find(item => item === screen);
  if (emailScreen) {
    const paper = email(emailScreen, state);
    return <main style={{ minHeight: "100dvh", background: "#ecebe6", padding: "24px 0", fontFamily: "var(--font-workspace), system-ui, sans-serif" }}>
      <p style={{ margin: "0 auto 12px", maxWidth: 560, padding: "0 16px", color: "#6b6f68", fontSize: 13 }}>Fictional email, rendered from the real template. Nothing is sent: client emails stay off during the rollout.</p>
      <div style={{ margin: "0 auto", maxWidth: 560, borderRadius: 16, overflow: "hidden" }} dangerouslySetInnerHTML={{ __html: renderPaperEmailBody(paper) }} />
    </main>;
  }
  const picked = XS_SCREENS.find(item => item === screen);
  if (!picked) notFound();
  return <XsLeadsPreview key={`${picked}:${state}:${mode}:${range}:${period}:${recap}:${open}`} screen={picked as XsScreen} state={state} mode={mode === "dark" ? "dark" : "light"} range={range} period={period} recap={recap} open={open === "1"} prospect={prospect} />;
}
