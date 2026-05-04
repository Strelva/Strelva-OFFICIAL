import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import DashboardContentRedirect from "../app/dashboard/content/page";

describe("dashboard route redirects", () => {
  beforeEach(() => {
    redirectMock.mockReset();
  });

  it("keeps the legacy content route pointed at the site workspace", () => {
    DashboardContentRedirect();

    expect(redirectMock).toHaveBeenCalledWith("/dashboard/site");
  });

  it("sends dashboard child access denials to the no-access page", () => {
    const routeFiles = [
      "src/app/dashboard/page.tsx",
      "src/app/dashboard/chat/page.tsx",
      "src/app/dashboard/review/page.tsx",
      "src/app/dashboard/site/page.tsx",
    ];

    for (const routeFile of routeFiles) {
      const source = readFileSync(path.join(process.cwd(), routeFile), "utf8");

      expect(source, routeFile).not.toMatch(/redirect\(\s*["']\/["']\s*\)/);
      expect(source, routeFile).toContain('redirect("/no-access")');
    }
  });

  it("documents the canonical dashboard site path in the production runbook", () => {
    const runbook = readFileSync(
      path.join(process.cwd(), "docs/production-readiness.md"),
      "utf8",
    );

    expect(runbook).toContain("Verify `/dashboard/site` loads");
    expect(runbook).toContain("`/dashboard/content` redirects to `/dashboard/site`");
    expect(runbook).not.toContain("Verify `/dashboard/content` loads");
  });
});
