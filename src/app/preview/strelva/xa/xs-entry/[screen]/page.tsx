import { readFile } from "node:fs/promises";
import path from "node:path";
import { notFound } from "next/navigation";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import { WorkspaceSignIn } from "@/experience/workspace/WorkspaceSignIn";
import { AccountNoBusiness, AccountPicker, NoAccessView } from "@/experience/entry/AccountEntry";
import { CheckNotFound } from "@/experience/entry/CheckNotFound";
import { AccessRequestPage } from "@/components/marketing/AccessRequestPage";
import { PossibilityTryErrorClient } from "./TryErrorClient";
import { PossibilityTry, PossibilityTryLoading, type PossibilityTryState } from "@/experience/systems/PossibilityTry";
import { WebsiteAuditPage } from "@/products/website-audit";
import { claimEmailOptions } from "@/products/agency-clients/server";
import { renderEmailHtml } from "@/platform/infra/email/layout";
import { composeAskPageSet } from "@/products/websites/index";
import { XS_AGENCY, XS_BUSINESS, XS_BUSINESSES, XS_IDENTITY_UNAVAILABLE, XS_NORTH_STUDIO, XS_OWNER, XS_REPORT_ID, XS_SCAN_ID, xsAi, xsAudit } from "@/experience/workspace/preview/XsEntryFixtures";

export const dynamic = "force-dynamic";
export const metadata = { title: "Strelva · XA entry preview", robots: { index: false, follow: false } };

/**
 * XA entry lane: getting back in, the free check and the claim email, with
 * fictional fixtures. /preview/strelva/xa/xs-entry/<screen>?state=…&mode=dark
 * Forms here never call Auth, never save and never send.
 */
export default async function XsEntryPreview({ params, searchParams }: { params: Promise<{ screen: string }>; searchParams: Promise<{ state?: string; mode?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { screen } = await params;
  const { state = "ready", mode: rawMode } = await searchParams;
  const mode = rawMode === "dark" ? "dark" as const : undefined;

  switch (screen) {
    case "sign-in": {
      if (state === "invite") return <WorkspaceSignIn mode={mode} emailReady codeReady brand={XS_NORTH_STUDIO} businessName={XS_BUSINESS.name} title={`Sign in to manage ${XS_BUSINESS.name}.`} description="Use the address your invitation went to." prefillEmail={XS_OWNER.email} next="/account" resume={`your invitation to ${XS_BUSINESS.name}`} />;
      if (state === "admin-host") return <WorkspaceSignIn mode={mode} emailReady codeReady brand={XS_IDENTITY_UNAVAILABLE} businessName={XS_BUSINESS.name} host="admin.harbordental.com" title={`Manage ${XS_BUSINESS.name}.`} description={`For the people ${XS_BUSINESS.name} added.`} next="/client/harbor-dental/dashboard" />;
      if (state === "code") return <WorkspaceSignIn mode={mode} emailReady codeReady initialStatus="sent" prefillEmail={XS_OWNER.email} next="/workspace" />;
      if (state === "link") return <WorkspaceSignIn mode={mode} emailReady codeReady={false} initialStatus="sent" prefillEmail={XS_OWNER.email} next="/workspace" resume="what you were opening" />;
      if (state === "failed") return <WorkspaceSignIn mode={mode} emailReady codeReady failed next="/workspace?save=scan_preview" resume="your saved check" />;
      if (state === "email-off") return <WorkspaceSignIn mode={mode} emailReady={false} next="/workspace" />;
      return <WorkspaceSignIn mode={mode} emailReady codeReady next="/workspace" resume={state === "resume" ? "your saved check" : undefined} />;
    }
    case "account":
      if (state === "empty") return <AccountNoBusiness mode={mode} />;
      return <AccountPicker mode={mode} businesses={XS_BUSINESSES} email={XS_OWNER.email} />;
    case "no-access":
      if (state === "agency") return <NoAccessView mode={mode} businessName={XS_BUSINESS.name} brand={XS_NORTH_STUDIO} />;
      if (state === "unknown") return <NoAccessView mode={mode} brand={XS_IDENTITY_UNAVAILABLE} />;
      return <NoAccessView mode={mode} businessName={XS_BUSINESS.name} />;
    case "audit":
    case "embed": {
      const embed = screen === "embed" ? "embed" as const : "page" as const;
      const agency = state.startsWith("agency") || embed === "embed" ? XS_AGENCY : undefined;
      const done = ["done", "agency-done", "partial", "website-failed", "saved"].includes(state) || (embed === "embed" && state === "done");
      const key = `${screen}:${state}:${rawMode}`;
      if (state === "scanning") return <WebsiteAuditPage key={key} mode={mode} frame={embed} agency={agency} initialUrl="harbordental.com" initialBusiness="Harbor Dental" initialState="scanning" />;
      if (state === "error") return <WebsiteAuditPage key={key} mode={mode} frame={embed} agency={agency} initialUrl="harbordental.com" initialBusiness="Harbor Dental" initialError="Part of this saved check has expired or is unavailable. Run another check, or open your saved copy in your workspace." />;
      if (state === "attribution-error") return <WebsiteAuditPage key={key} mode={mode} frame={embed} agency={XS_AGENCY} attributionError="This agency check is temporarily unavailable." />;
      if (!done) return <WebsiteAuditPage key={key} mode={mode} frame={embed} agency={agency} initialCity="Buffalo, NY" />;
      return <WebsiteAuditPage key={key} mode={mode} frame={embed} agency={agency} workspaceEnabled={!agency}
        saved={state === "saved"}
        initialResult={state === "website-failed" ? undefined : xsAudit(agency)} initialReportId={state === "website-failed" ? undefined : XS_REPORT_ID}
        initialAiResult={state === "partial" ? undefined : xsAi(agency)} initialScanId={state === "partial" ? undefined : XS_SCAN_ID} />;
    }
    case "check-not-found":
      return <CheckNotFound mode={mode} />;
    case "access-request":
      if (state === "carried") return <AccessRequestPage mode={mode} carried={{ businessName: XS_BUSINESS.name, currentWebsite: XS_BUSINESS.site, scan: XS_SCAN_ID }} />;
      if (state === "closed") return <AccessRequestPage mode={mode} businessOpen={false} agencyOpen={false} carried={{ businessName: XS_BUSINESS.name, currentWebsite: XS_BUSINESS.site, scan: XS_SCAN_ID }} />;
      return <AccessRequestPage mode={mode} />;
    case "try":
      if (state === "loading") return <PossibilityTryLoading mode={mode} />;
      if (state === "error") return <PossibilityTryErrorClient mode={mode} />;
      return <PossibilityTry mode={mode} state={tryState(state)} />;
    case "email-code": {
      const template = await readFile(path.join(process.cwd(), "supabase/templates/magic-link.html"), "utf8");
      const html = template.replaceAll("{{ .Token }}", "482913").replaceAll("{{ .ConfirmationURL }}", "#preview-link");
      return <EmailFrame subject="Your Strelva sign-in code" from="Strelva <no-reply@updates.strelva.com>" to={XS_OWNER.email} html={html} mode={mode} />;
    }
    case "email-claim": {
      const options = claimEmailOptions({ workspaceName: XS_BUSINESS.name }, "https://app.strelva.com/workspace/claim/preview", "North Studio");
      return <EmailFrame subject={`Claim ${XS_BUSINESS.name} on Strelva`} from="North Studio · Strelva <hello@updates.strelva.com>" to={XS_OWNER.email} html={renderEmailHtml({ ...options, paper: { ...options.paper, brand: XS_NORTH_STUDIO } })} mode={mode} />;
    }
    default:
      notFound();
  }
}

function tryState(state: string): PossibilityTryState {
  if (state === "expired") return { kind: "expired" };
  if (state === "changed") return { kind: "changed", from: { proposer: "Maya Okafor", agencyName: "North Studio", replyTo: XS_NORTH_STUDIO.replyTo } };
  const base = { businessName: XS_BUSINESS.name, proposingActor: { kind: "person" as const, displayName: "Maya Okafor" }, agencyBrand: XS_NORTH_STUDIO };
  if (state === "form") return { kind: "ready", view: { ...base, title: "A shorter new-patient form", intent: "Four questions instead of eleven, with insurance asked after the visit is booked.", changes: ["The new-patient form on harbordental.com"], introduces: [], takesSubmissions: true } };
  if (state === "follow-up") return { kind: "ready", view: { ...base, title: "A next-day follow-up for unanswered inquiries", intent: "One friendly note the day after an inquiry goes unanswered.", changes: ["Inquiries from the contact form"], introduces: [], takesSubmissions: false,
    inquiryFollowUp: { afterMinutes: 1440, maxAttempts: 1, messageTemplate: "Hi {{name}},\n\nThanks for reaching out to Harbor Dental. Would you like us to hold a time for you this week?\n\nHarbor Dental\n1180 Elmwood Ave, Buffalo", checks: [{ label: "Waits a full day", status: "passed", detail: "The fictional inquiry waited 24 hours before the follow-up." }, { label: "Skips answered inquiries", status: "passed", detail: "An inquiry Dr. Lin had answered got nothing." }], outboundMessages: ["Hi Jordan,\n\nThanks for reaching out to Harbor Dental. Would you like us to hold a time for you this week?\n\nHarbor Dental\n1180 Elmwood Ave, Buffalo"] } } };
  if (state === "unknown") return { kind: "ready", view: { title: "Saturday hours on the site", intent: "Show Saturday 9 to 1 on every page.", changes: ["The hours on harbordental.com"], introduces: [], takesSubmissions: false } };
  const document = composeAskPageSet(XS_BUSINESS.name, { kind: "website-pages", pages: [
    { path: "/", title: "Gentle family dentistry on Elmwood.", description: "Cleanings, checkups and same-week emergency visits for kids and adults.", paragraphs: ["Harbor Dental has cared for Buffalo families at 1180 Elmwood Ave since 2009.", "New patients can book a first visit online. Choose Book a visit to see open times."] },
    { path: "/book", title: "Book a visit", description: "Pick a time that works", paragraphs: ["Choose a cleaning, a checkup or an emergency visit. This is a test copy; no time is held."] },
  ] }).document;
  return { kind: "ready", view: { ...base, title: "Online booking for new patients", intent: "A Book a visit page beside the contact form, so new patients can pick a time themselves.", changes: ["harbordental.com with a Book a visit page", "Inquiries from the booking form"], introduces: ["Bookings"], takesSubmissions: true, websiteDocument: document } };
}

/**
 * Email review frame. The preview loads DM Sans so review matches intent;
 * real inboxes that block web fonts fall back to the system sans in the
 * template's stack (an accepted email exception). No slab behind the email:
 * it sits on the page as an inbox would show it.
 */
function EmailFrame({ subject, from, to, html, mode }: { subject: string; from: string; to: string; html: string; mode?: "light" | "dark" }) {
  const reviewed = html.replace("</head>", '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap"></head>');
  return <div data-workspace-mode={mode} style={{ display: "contents" }}>
    <div data-workspace-theme="linen" style={{ minHeight: "100dvh", background: "var(--st-canvas)", color: "var(--st-text)", fontFamily: "var(--font-workspace), sans-serif", padding: "32px 16px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
        <div><p style={{ margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: -0.4 }}>{subject}</p><p style={{ margin: "6px 0 0", fontSize: 14, color: "var(--st-text-2)" }}>{from} · to {to}</p><p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--st-text-3)" }}>Template preview. Client email stays off during the rollout; nothing is sent from here.</p></div>
        <iframe title={subject} srcDoc={reviewed} style={{ width: "100%", height: 640, border: "1px solid var(--st-line)", borderRadius: 12, background: "#f4f4f1" }} />
      </div>
    </div>
  </div>;
}
