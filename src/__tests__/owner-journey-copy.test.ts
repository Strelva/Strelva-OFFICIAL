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

    expect(desktopNav).toContain("What's working");
    expect(desktopNav).toContain("Ask AI");
    expect(desktopNav).toContain("Needs approval");
    expect(desktopNav).toContain("My site");
    expect(desktopNav).toContain("Connected accounts");

    expect(mobileNav).toContain("Ask AI");
    expect(mobileNav).toContain("Working");
    expect(mobileNav).toContain("Approve");
  });

  it("keeps the first-run dashboard focused on value and next action", () => {
    const weeklyBrief = readRepoFile("src/components/dashboard/WeeklyBriefClient.tsx");

    expect(weeklyBrief).toContain("Your site is ready to manage");
    expect(weeklyBrief).toContain("See what&apos;s working");
    expect(weeklyBrief).toContain("Tell AI what to change");
    expect(weeklyBrief).toContain("Ask AI for a small change");
    expect(weeklyBrief).toContain("View your live site");
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
    ].map(readRepoFile).join("\n");

    expect(ownerFiles).toContain("Make live");
    expect(ownerFiles).toContain("Skip");
    expect(ownerFiles).not.toMatch(/Approval queue|Queued for review|admin review|stale section/);
  });
});
