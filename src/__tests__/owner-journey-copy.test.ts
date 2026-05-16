import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(filePath: string): string {
  return readFileSync(path.join(process.cwd(), filePath), "utf8");
}

describe("owner journey copy and links", () => {
  it("keeps the dashboard navigation in owner language with Ask AI visible", () => {
    const desktopNav = readRepoFile("src/components/dashboard/HistorySidebar.tsx");
    const mobileNav = readRepoFile("src/components/dashboard/MobileNav.tsx");

    expect(desktopNav).toContain("Today");
    expect(desktopNav).toContain("Ask AI");
    expect(desktopNav).toContain("Site");
    expect(desktopNav).toContain("Sources");
    expect(desktopNav).not.toContain('label: "Needs You"');
    expect(desktopNav).not.toContain("Approvals");
    expect(desktopNav).not.toContain("Connections");
    expect(desktopNav).not.toContain("Ownership");
    expect(desktopNav).not.toContain("Overview");

    expect(mobileNav).toContain("Today");
    expect(mobileNav).toContain("Ask AI");
    expect(mobileNav).toContain("Sources");
    expect(mobileNav).not.toContain('label: "Needs You"');
    expect(mobileNav).not.toContain("Approvals");
    expect(mobileNav).not.toContain("Connections");
    expect(mobileNav).not.toContain("Ownership");
    expect(mobileNav).not.toContain("Overview");
  });

  it("keeps the dashboard root focused on proof and next action", () => {
    const dashboardPage = readRepoFile("src/app/dashboard/page.tsx");

    expect(dashboardPage).toContain("See what is working. Change what is next.");
    expect(dashboardPage).toContain("People found you");
    expect(dashboardPage).toContain("Customer actions");
    expect(dashboardPage).toContain("Needs you");
    expect(dashboardPage).toContain("Edit site");
    expect(dashboardPage).not.toContain('redirect(withClientFallbackRoot(clientFallbackRoot, "/dashboard/chat"))');
  });

  it("keeps self-serve onboarding focused on instant setup", () => {
    const onboardPage = readRepoFile("src/app/onboard/page.tsx");
    const signUpPage = readRepoFile("src/app/sign-up/[[...sign-up]]/page.tsx");

    expect(onboardPage).toContain("/api/self-serve/tenant");
    expect(onboardPage).toContain("Tell us about the business. We prepare the site.");
    expect(onboardPage).toContain("Create starter site");
    expect(onboardPage).toContain("AI to pre-fill useful first content");
    expect(onboardPage).toContain("Update hours or booking details before publishing.");
    expect(onboardPage).not.toContain('redirect(`/access-request${suffix}`)');

    expect(signUpPage).toContain("isSelfServeSignup");
    expect(signUpPage).toContain('redirectUrl?.startsWith("/onboard")');
    expect(signUpPage).toContain("Create the account. Then we prepare the site.");
    expect(signUpPage).toContain('const title = "Dashboard signup is paused.";');
  });

  it("lands new self-serve owners on first-run quick wins", () => {
    const selfServe = readRepoFile("src/lib/self-serve.ts");
    const selfServeRoute = readRepoFile("src/app/api/self-serve/tenant/route.ts");
    const dashboardPage = readRepoFile("src/app/dashboard/page.tsx");

    expect(selfServe).toContain('getTenantDashboardUrl(tenant, "/dashboard?welcome=1")');
    expect(selfServeRoute).toContain("successUrl: result.dashboardUrl");
    expect(dashboardPage).toContain("searchValue(params.welcome) === \"1\"");
    expect(dashboardPage).toContain("Your starter site is ready. Make the first useful wins.");
    expect(dashboardPage).toContain("Update hours");
    expect(dashboardPage).toContain("Connect Google Business");
    expect(dashboardPage).toContain("Draft first blog post");
  });

  it("keeps rollback safety visible from the owner dashboard", () => {
    const dashboardPage = readRepoFile("src/app/dashboard/page.tsx");
    const safetyPanel = readRepoFile("src/components/dashboard/SiteSafetyPanel.tsx");
    const snapshotRoute = readRepoFile("src/app/api/site-snapshots/route.ts");
    const maintenance = readRepoFile("src/app/api/cron/maintenance/route.ts");

    expect(dashboardPage).toContain("getLatestSiteSnapshot(tenant)");
    expect(dashboardPage).toContain("<SiteSafetyPanel latestSnapshot={latestSnapshot} />");
    expect(safetyPanel).toContain("Revert to a last good version");
    expect(safetyPanel).toContain("Save backup");
    expect(safetyPanel).toContain("Restore latest backup");
    expect(snapshotRoute).toContain("restoreSiteSnapshot");
    expect(snapshotRoute).toContain("Saved a full-site backup");
    expect(snapshotRoute).toContain("Restored full site from");
    expect(maintenance).toContain("createDailySiteSnapshot");
    expect(maintenance).toContain("snapshotsCreated");
  });

  it("keeps retention proof and re-engagement signals wired into owner surfaces", () => {
    const packageJson = readRepoFile("package.json");
    const rootLayout = readRepoFile("src/app/layout.tsx");
    const dashboardPage = readRepoFile("src/app/dashboard/page.tsx");
    const chatPage = readRepoFile("src/app/dashboard/chat/page.tsx");
    const reportsPage = readRepoFile("src/app/dashboard/reports/page.tsx");
    const tracker = readRepoFile("src/components/dashboard/EngagementTracker.tsx");
    const retentionPanel = readRepoFile("src/components/dashboard/RetentionPanel.tsx");
    const retention = readRepoFile("src/lib/retention.ts");
    const analyticsStore = readRepoFile("src/lib/storage/analytics-store.ts");
    const trackRoute = readRepoFile("src/app/api/track/route.ts");
    const maintenance = readRepoFile("src/app/api/cron/maintenance/route.ts");

    expect(packageJson).toContain('"@vercel/analytics"');
    expect(rootLayout).toContain('import { Analytics } from "@vercel/analytics/next"');
    expect(rootLayout).toContain("<Analytics />");
    expect(dashboardPage).toContain("getOwnerRetentionSignals(tenant)");
    expect(dashboardPage).toContain('<EngagementTracker event="dashboard-open" />');
    expect(dashboardPage).toContain("<RetentionPanel signals={retentionSignals} />");
    expect(chatPage).toContain('<EngagementTracker event="ai-chat-open" />');
    expect(reportsPage).toContain('<EngagementTracker event="report-view" />');
    expect(tracker).toContain('"dashboard-open"');
    expect(tracker).toContain('"ai-chat-open"');
    expect(tracker).toContain('"report-view"');
    expect(tracker).toContain('import { track } from "@vercel/analytics"');
    expect(tracker).toContain("track(event)");
    expect(retentionPanel).toContain("AI changes this week");
    expect(retentionPanel).toContain("Traffic after AI updates");
    expect(retentionPanel).toContain("Engagement signals");
    expect(retentionPanel).not.toContain("Retention engine");
    expect(retention).toContain("queueRetentionReengagement");
    expect(retention).toContain("retention_reengagement");
    expect(retention).toContain("No AI changes in");
    expect(analyticsStore).toContain("sanityClickPath");
    expect(analyticsStore).toContain(".setIfMissing({ clicks: {}, [dailyPath]: 0, [totalPath]: 0 })");
    expect(analyticsStore).toContain(".inc({ [dailyPath]: 1, [totalPath]: 1 })");
    expect(trackRoute).toContain('"dashboard-open"');
    expect(trackRoute).toContain('"ai-chat-open"');
    expect(trackRoute).toContain('"report-view"');
    expect(trackRoute).toContain('"referral-click"');
    expect(maintenance).toContain("queueRetentionReengagement");
    expect(maintenance).toContain("reengagementQueued");
  });

  it("keeps weekly reports reachable as the proof surface", () => {
    const reportsPage = readRepoFile("src/app/dashboard/reports/page.tsx");
    const weeklyBrief = readRepoFile("src/components/dashboard/WeeklyBriefClient.tsx");

    expect(reportsPage).toContain("getWeeklyBrief(tenant)");
    expect(reportsPage).toContain("getWeeklyBriefs(tenant)");
    expect(reportsPage).toContain("<WeeklyBriefClient brief={brief} history={history} />");
    expect(reportsPage).not.toContain('redirect(withClientFallbackRoot(clientFallbackRoot, "/dashboard"))');
    expect(weeklyBrief).toContain("Your weekly report");
    expect(weeklyBrief).toContain("Your first weekly report is still warming up");
    expect(weeklyBrief).toContain("Open Today");
  });

  it("keeps the site editor focused on direct editing instead of embedded chat", () => {
    const workspace = readRepoFile("src/components/dashboard/ContentWorkspace.tsx");
    const preview = readRepoFile("src/components/dashboard/SitePreview.tsx");
    const properties = readRepoFile("src/components/dashboard/PropertiesEditor.tsx");
    const publishBar = readRepoFile("src/components/dashboard/design/PublishBar.tsx");

    expect(workspace).toContain('label: "Content"');
    expect(workspace).toContain('label: "Layout"');
    expect(workspace).toContain("Ready to publish");
    expect(workspace).toContain("markDraftReceipts");
    expect(workspace).not.toContain('label: "AI Chat"');
    expect(preview).toContain('useState<PreviewSource>("live")');
    expect(preview).toContain("Active site");
    expect(preview).toContain("Draft preview");
    expect(preview).toContain("Site editor");
    expect(preview).toContain("buildAskAIPrompt");
    expect(preview).toContain("addEditReceipts");
    expect(properties).toContain("Click text in the preview");
    expect(properties).toContain("Draft saved - preview updated");
    expect(publishBar).toContain("Publish live");
    expect(publishBar).toContain("Publish to Scaffold");
    expect(publishBar).toContain("Live site refreshed");
    expect(publishBar).toContain("Published to Scaffold - live refresh failed");
  });

  it("keeps Sources honest about setup and availability", () => {
    const sources = readRepoFile("src/components/dashboard/ConnectionsPage.tsx");
    const detail = readRepoFile("src/components/dashboard/ConnectionDetailPage.tsx");
    const badges = readRepoFile("src/components/dashboard/SourceHealthBadge.tsx");

    expect(sources).toContain("What the AI should trust");
    expect(sources).toContain("A short source map");
    expect(sources).toContain("OAuth ready");
    expect(sources).toContain("Manual Search Console setup");
    expect(sources).not.toContain("Sources the AI can actually use");
    expect(detail).toContain("not OAuth");
    expect(badges).toContain("Setup needed");
  });

  it("keeps AI result feedback actionable", () => {
    const chatPanel = readRepoFile("src/components/dashboard/ChatPanel.tsx");
    const agentResults = readRepoFile("src/lib/agent-results.ts");

    expect(chatPanel).toContain("View site");
    expect(chatPanel).toContain("Open Needs You");
    expect(agentResults).toContain("The live site has the change");
    expect(chatPanel).not.toContain("Queued for review");
  });

  it("uses tenant dashboard URLs in weekly report emails", () => {
    const weeklyReportRoute = readRepoFile("src/app/api/cron/weekly-report/route.ts");

    expect(weeklyReportRoute).toContain("getTenantDashboardUrl");
    expect(weeklyReportRoute).toContain('getTenantDashboardUrl(report.tenant, "/dashboard/reports")');
    expect(weeklyReportRoute).toContain("View your weekly report");
    expect(weeklyReportRoute).toContain("function reportToText");
    expect(weeklyReportRoute).toContain("View your weekly report:");
    expect(weeklyReportRoute).toContain("text,");
    expect(weeklyReportRoute).not.toContain("NEXT_PUBLIC_APP_URL");
  });

  it("keeps internal platform language out of owner-facing review copy", () => {
    const ownerFiles = [
      "src/components/dashboard/QueuePage.tsx",
      "src/components/dashboard/QueueCard.tsx",
      "src/components/dashboard/SuggestionCard.tsx",
      "src/app/dashboard/settings/page.tsx",
      "src/components/dashboard/OwnershipSection.tsx",
    ].map(readRepoFile).join("\n");

    expect(ownerFiles).toContain("Make live");
    expect(ownerFiles).toContain("Skip");
    expect(ownerFiles).toContain("Needs You");
    expect(ownerFiles).toContain("Nothing needs you right now");
    expect(ownerFiles).not.toMatch(/Approval queue|Queued for review|admin review|stale section/);
  });

  it("keeps the ownership center focused on client exports and handoff actions", () => {
    const ownershipPage = readRepoFile("src/components/dashboard/OwnershipSection.tsx");
    const settingsPage = readRepoFile("src/app/dashboard/settings/page.tsx");

    expect(settingsPage).toContain('{ id: "ownership", label: "Ownership" }');
    expect(settingsPage).toContain("/dashboard/settings#ownership");
    expect(ownershipPage).toContain("Your business owns");
    expect(ownershipPage).toContain("Scaffold Web manages");
    expect(ownershipPage).toContain("Export content");
    expect(ownershipPage).toContain("Export assets");
    expect(ownershipPage).toContain("DNS and domain handoff");
    expect(ownershipPage).toContain("Billing cancellation");
    expect(ownershipPage).toContain("Admin revocation");
  });
});
