import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceRecaps } from "@/experience/recaps/WorkspaceRecaps";
import { PREVIEW_OWNER_REPORTS } from "@/experience/care-reports/preview-fixture";

const WS = "5e000000-0000-4000-8000-0000000000b0";
const state = { kind: "ready", sites: [] } as const;
const render = (careReports?: Parameters<typeof WorkspaceRecaps>[0]["careReports"]) =>
  renderToStaticMarkup(createElement(WorkspaceRecaps, { workspaceId: WS, state, period: "all", careReports }));

describe("Recaps: reports from your agency", () => {
  it("is unchanged when Care plan reports is off", () => {
    const html = render();
    expect(html).not.toContain("Reports from your agency");
    expect(html).not.toContain("care-reports");
    expect(html).toContain("No site is connected to this business yet.");
    expect(render(undefined)).toBe(html);
  });

  it("lists what the agency shared, newest first, with an open link", () => {
    const html = render({ kind: "ready", items: PREVIEW_OWNER_REPORTS });
    for (const text of ["Reports from your agency", "September 2026 report", "From North Studio · Release 2 · shared Oct 2", "August 2026 report"]) expect(html, text).toContain(text);
    expect(html).toContain(`/workspace/care-reports/${PREVIEW_OWNER_REPORTS[0]!.reportId}?workspaceId=${WS}`);
    expect(html.indexOf("Reports from your agency")).toBeLessThan(html.indexOf("Recap period"));
  });

  it("says so when nothing is shared yet and when it can't load", () => {
    expect(render({ kind: "ready", items: [] })).toContain("No reports from your agency yet.");
    expect(render({ kind: "unavailable" })).toContain("Agency reports couldn&#x27;t load. Reload to try again.");
  });
});
