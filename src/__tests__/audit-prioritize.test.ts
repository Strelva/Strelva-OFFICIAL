import { describe, it, expect } from "vitest";
import { prioritizeIssues } from "../lib/audit/prioritize";
import type { AuditResult } from "../lib/audit/types";

function audit(): AuditResult {
  return {
    url: "https://example.com",
    scannedAt: new Date().toISOString(),
    overallScore: 62,
    grade: "C",
    categories: [
      {
        name: "SEO Foundations",
        slug: "seo-foundations",
        weight: 0.3,
        score: 40,
        checks: [
          { name: "Title tag", status: "pass", score: 100, message: "Present" },
          {
            name: "Meta description",
            status: "fail",
            score: 0,
            message: "Missing meta description",
            priority: "high",
            impact: "Search engines skip your summary",
          },
          {
            name: "Headings",
            status: "warn",
            score: 60,
            message: "Only one H1",
            priority: "low",
          },
        ],
      },
      {
        name: "Trust",
        slug: "trust",
        weight: 0.2,
        score: 70,
        checks: [
          {
            name: "Reviews visible",
            status: "warn",
            score: 55,
            message: "No reviews shown on site",
            priority: "medium",
          },
        ],
      },
    ],
  };
}

describe("prioritizeIssues", () => {
  it("excludes passing checks", () => {
    const list = prioritizeIssues(audit());
    expect(list.issues.find((i) => i.check === "Title tag")).toBeUndefined();
    expect(list.total).toBe(3);
  });

  it("ranks the high-priority failing check first", () => {
    const list = prioritizeIssues(audit());
    expect(list.issues[0].check).toBe("Meta description");
    expect(list.issues[0].priority).toBe("high");
  });

  it("orders strictly by descending score", () => {
    const scores = prioritizeIssues(audit()).issues.map((i) => i.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("counts issues by priority band", () => {
    const list = prioritizeIssues(audit());
    expect(list.highCount).toBe(1);
    expect(list.mediumCount).toBe(1);
    expect(list.lowCount).toBe(1);
  });

  it("carries the impact narrative through", () => {
    const top = prioritizeIssues(audit()).issues[0];
    expect(top.impact).toContain("Search engines");
  });

  it("derives priority from status when a check omits it", () => {
    const a = audit();
    a.categories[0].checks[1].priority = undefined;
    const top = prioritizeIssues(a).issues.find((i) => i.check === "Meta description")!;
    expect(top.priority).toBe("high"); // fail -> high
  });
});
