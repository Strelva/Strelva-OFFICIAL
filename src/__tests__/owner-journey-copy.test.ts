import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function readRepoFile(filePath: string): string {
  return readFileSync(path.join(process.cwd(), filePath), "utf8");
}

describe("owner journey copy and links", () => {
  it("keeps the dashboard navigation in owner language with Ask Strelva visible", () => {
    // Nav labels live in the conditional surface resolver now (not inline in the
    // sidebar). The pillars are owner-language; old-IA labels are gone. Phase-1 IA:
    // Today · Ask Strelva · Website · Google Business · Analytics · Reviews (+ Settings gear).
    const surfaces = readRepoFile("src/lib/dashboard-surfaces.ts");

    expect(surfaces).toContain('label: "Today"');
    expect(surfaces).toContain('label: "Ask Strelva"');
    expect(surfaces).toContain('label: "Website"');
    expect(surfaces).toContain('label: "Google Business"');
    expect(surfaces).toContain('label: "Analytics"');
    expect(surfaces).toContain('label: "Reviews"');

    // Old IA names should not resurface as top-level nav labels. ("Site" is now a
    // legitimate sub-tab label inside Website via getWebsiteSections, so it's not
    // guarded here — the top-level pillar is "Website", asserted above.)
    expect(surfaces).not.toContain('label: "Sources"');
    expect(surfaces).not.toContain('label: "Ask AI"');
    expect(surfaces).not.toContain('label: "Dashboard"');
    expect(surfaces).not.toContain('label: "Reports"');
    expect(surfaces).not.toContain('label: "Health"');
    expect(surfaces).not.toContain('label: "Leads"');
    // "Store" is a legitimate Website sub-tab label (getWebsiteSections), just not
    // a top-level pillar — so it isn't guarded here.
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

  it("retires the self-serve onboarding flow in favor of done-for-you builds", () => {
    const onboardPage = readRepoFile("src/app/onboard/page.tsx");
    const signUpPage = readRepoFile("src/app/sign-up/[[...sign-up]]/page.tsx");

    // /onboard now redirects to the build-request intake (query forwarded).
    expect(onboardPage).toContain('redirect(query ? `/access-request?${query}` : "/access-request")');
    expect(onboardPage).not.toContain("/api/self-serve/tenant");
    expect(onboardPage).not.toContain("Create starter site");

    // The sign-up page no longer carries the dead self-serve signup branch.
    expect(signUpPage).not.toContain("isSelfServeSignup");
    expect(signUpPage).not.toContain('redirectUrl?.startsWith("/onboard")');
    expect(signUpPage).toContain('const title = "Dashboard access is invite-only.";');
    expect(signUpPage).toContain("Request your build");
  });

  it("lands welcomed owners on first-run quick wins", () => {
    const dashboardPage = readRepoFile("src/app/dashboard/page.tsx");

    expect(dashboardPage).toContain("searchValue(params.welcome) === \"1\"");
    expect(dashboardPage).toContain("Your starter site is ready. Make the first useful wins.");
    expect(dashboardPage).toContain("Update hours");
    expect(dashboardPage).toContain("Connect Google Business");
    expect(dashboardPage).toContain("Draft first blog post");
  });

  it("keeps rollback safety reachable under the Website History tab", () => {
    // Safety net + recent changes moved off the dashboard into Website > History
    // (site-management tools, not at-a-glance metrics).
    const historyPage = readRepoFile("src/app/dashboard/history/page.tsx");
    const safetyPanel = readRepoFile("src/components/dashboard/SiteSafetyPanel.tsx");
    const snapshotRoute = readRepoFile("src/app/api/site-snapshots/route.ts");
    const maintenance = readRepoFile("src/app/api/cron/maintenance/route.ts");

    expect(historyPage).toContain("getLatestSiteSnapshot(tenant)");
    expect(historyPage).toContain("<SiteSafetyPanel latestSnapshot={latestSnapshot} />");
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
    // Report view moved onto the merged Analytics surface.
    const analyticsPage = readRepoFile("src/app/dashboard/analytics/page.tsx");
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
    expect(analyticsPage).toContain('<EngagementTracker event="report-view" />');
    expect(tracker).toContain('"dashboard-open"');
    expect(tracker).toContain('"ai-chat-open"');
    expect(tracker).toContain('"report-view"');
    expect(tracker).toContain('import { track } from "@vercel/analytics"');
    expect(tracker).toContain("track(event)");
    expect(retentionPanel).toContain("Updates this week");
    expect(retentionPanel).toContain("Traffic after updates");
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
    // Reports folded into the merged Analytics surface; /dashboard/reports aliases to it.
    const analyticsPage = readRepoFile("src/app/dashboard/analytics/page.tsx");
    const weeklyBrief = readRepoFile("src/components/dashboard/WeeklyBriefClient.tsx");

    expect(analyticsPage).toContain("getWeeklyBrief(tenant)");
    expect(analyticsPage).toContain("getWeeklyBriefs(tenant)");
    expect(analyticsPage).toMatch(/<WeeklyBriefClient\b[\s\S]*brief=\{brief\}[\s\S]*history=\{history\}/);
    expect(analyticsPage).not.toContain('redirect(withClientFallbackRoot(clientFallbackRoot, "/dashboard"))');
    // Verdict-first: lead with a plain-English verdict + the 30-day trend.
    expect(weeklyBrief).toContain("buildVerdict");
    expect(weeklyBrief).toContain("Last 30 days");
    expect(weeklyBrief).toContain("Your first weekly report is still warming up");
    expect(weeklyBrief).toContain("Open dashboard");
  });

  it("keeps the site editor focused on direct editing instead of embedded chat", () => {
    const workspace = readRepoFile("src/components/dashboard/ContentWorkspace.tsx");
    const preview = readRepoFile("src/components/dashboard/SitePreview.tsx");
    const properties = readRepoFile("src/components/dashboard/PropertiesEditor.tsx");
    const publishBar = readRepoFile("src/components/dashboard/design/PublishBar.tsx");

    expect(workspace).toContain('label: "Edit"');
    expect(workspace).toContain('label: "Ask Strelva"');
    expect(workspace).toContain("PropertiesEditor");
    expect(workspace).toContain("hasDrafts={hasAnyDraft}");
    expect(workspace).toContain("markDraftReceipts");
    expect(workspace).not.toContain('label: "AI Chat"');
    expect(preview).toContain('useState<PreviewSource>("editable")');
    expect(preview).toContain("Active site");
    expect(preview).toContain("Draft preview");
    expect(preview).toContain("Editable preview");
    expect(preview).toContain("buildAskAIPrompt");
    expect(preview).toContain("addEditReceipts");
    expect(properties).toContain("in the preview");
    expect(properties).toContain("Draft saved - preview updated");
    expect(publishBar).toContain("Publish live");
    expect(publishBar).toContain("Publish to Strelva");
    expect(publishBar).toContain("Live site refreshed");
    expect(publishBar).toContain("Published to Strelva - live refresh failed");
  });

  it("keeps Integrations honest about setup and availability", () => {
    const sources = readRepoFile("src/components/dashboard/ConnectionsPage.tsx");
    const detail = readRepoFile("src/components/dashboard/ConnectionDetailPage.tsx");
    const badges = readRepoFile("src/components/dashboard/SourceHealthBadge.tsx");

    expect(sources).toContain("Connect your accounts");
    expect(sources).toContain("expands what we can see and update");
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
    // Migrated onto the shared email design system: content, not inline markup.
    expect(weeklyReportRoute).toContain('heading: "Your weekly report"');
    expect(weeklyReportRoute).toContain("See your full report");
    expect(weeklyReportRoute).toContain("function reportToText");
    expect(weeklyReportRoute).toContain("renderEmailText");
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

    // Ownership is intentionally dropped from the settings nav (kept as a
    // component for later) — extensive and not needed in the day-to-day surface.
    expect(settingsPage).not.toContain('{ id: "ownership", label: "Ownership" }');
    expect(ownershipPage).toContain("Your business owns");
    expect(ownershipPage).toContain("Strelva manages");
    expect(ownershipPage).toContain("Export content");
    expect(ownershipPage).toContain("Export assets");
    expect(ownershipPage).toContain("DNS and domain handoff");
    expect(ownershipPage).toContain("Billing cancellation");
    expect(ownershipPage).toContain("Admin revocation");
  });
});
