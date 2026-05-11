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

    expect(desktopNav).toContain("Ask AI");
    expect(desktopNav).toContain("Approvals");
    expect(desktopNav).toContain("Site");
    expect(desktopNav).toContain("Connections");
    expect(desktopNav).toContain("Ownership");
    expect(desktopNav).not.toContain("Overview");

    expect(mobileNav).toContain("Ask AI");
    expect(mobileNav).toContain("Approvals");
    expect(mobileNav).toContain("Connections");
    expect(mobileNav).toContain("Ownership");
    expect(mobileNav).not.toContain("Overview");
  });

  it("keeps the first-run dashboard focused on AI action", () => {
    const dashboardPage = readRepoFile("src/app/dashboard/page.tsx");
    const chatPanel = readRepoFile("src/components/dashboard/ChatPanel.tsx");
    const promptBox = readRepoFile("src/components/ui/ai-prompt-box.tsx");

    expect(dashboardPage).toContain('withClientFallbackRoot(clientFallbackRoot, "/dashboard/chat")');
    expect(chatPanel).toContain("What's working?");
    expect(chatPanel).toContain("Suggest an update");
    expect(chatPanel).toContain("Show recent changes");
    expect(chatPanel).toContain("Check site health");
    expect(promptBox).toContain("More ways to ask");
  });

  it("keeps AI result feedback actionable", () => {
    const chatPanel = readRepoFile("src/components/dashboard/ChatPanel.tsx");

    expect(chatPanel).toContain("View site");
    expect(chatPanel).toContain("Open needs approval");
    expect(chatPanel).toContain("The live site has the change");
    expect(chatPanel).not.toContain("Queued for review");
  });

  it("uses tenant dashboard URLs in weekly report emails", () => {
    const weeklyReportRoute = readRepoFile("src/app/api/cron/weekly-report/route.ts");

    expect(weeklyReportRoute).toContain("getTenantDashboardUrl");
    expect(weeklyReportRoute).toContain('getTenantDashboardUrl(report.tenant, "/dashboard")');
    expect(weeklyReportRoute).not.toContain("NEXT_PUBLIC_APP_URL");
  });

  it("keeps internal platform language out of owner-facing review copy", () => {
    const ownerFiles = [
      "src/components/dashboard/QueuePage.tsx",
      "src/components/dashboard/QueueCard.tsx",
      "src/components/dashboard/SuggestionCard.tsx",
      "src/app/dashboard/settings/page.tsx",
      "src/app/dashboard/ownership/page.tsx",
    ].map(readRepoFile).join("\n");

    expect(ownerFiles).toContain("Make live");
    expect(ownerFiles).toContain("Skip");
    expect(ownerFiles).not.toMatch(/Approval queue|Queued for review|admin review|stale section/);
  });

  it("keeps the ownership center focused on client exports and handoff actions", () => {
    const ownershipPage = readRepoFile("src/app/dashboard/ownership/page.tsx");

    expect(ownershipPage).toContain("Your business owns");
    expect(ownershipPage).toContain("Scaffold Web manages");
    expect(ownershipPage).toContain("Export content");
    expect(ownershipPage).toContain("Export assets");
    expect(ownershipPage).toContain("DNS and domain handoff");
    expect(ownershipPage).toContain("Billing cancellation");
    expect(ownershipPage).toContain("Admin revocation");
  });
});
