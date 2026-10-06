import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { WeeklyBrief } from "@/lib/types";
import { workspaceReturnTarget } from "@/lib/workspace-location";
import { setReleaseFlagsDb } from "@/platform/release-flags/store";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { readWorkspaceRecaps, recapView, type RecapDependencies } from "@/products/recaps/server";
import { WorkspaceRecaps, recapTitle } from "@/experience/recaps/WorkspaceRecaps";
import { DASHBOARD_DISPOSITIONS } from "@/platform/owner-entry/dispositions";
import { routeDashboardRequest } from "@/platform/owner-entry/decision";

const WS = "7f000000-0000-4000-8000-000000000010";
const ACTOR = { userId: "7f000000-0000-4000-8000-000000000002", verifiedEmail: "Owner@Example.test" };

const brief = (patch: Partial<WeeklyBrief>): WeeklyBrief => ({
  id: "b1", tenantId: "lakeshore", period: "week", weekStart: "2026-09-21", weekEnd: "2026-09-27",
  summary: "A steady week.", stats: { pageViews: 412, bookingClicks: 9, reviewsReceived: 1, contentUpdates: 2, pageViewsDelta: 12, bookingClicksDelta: 0, phoneClicks: 3 },
  highlights: ["Fixed a broken image on the store page"], nextAction: { title: "Add fall hours", description: "Customers asked twice." },
  topServices: [], topSearchQueries: [], staleSections: [], createdAt: "2026-09-28T14:00:00Z", ...patch,
});

function links(rows: unknown, error: { message: string } | null = null) {
  const rpc = vi.fn(async () => ({ data: rows, error }));
  setReleaseFlagsDb({ rpc });
  return rpc;
}

const deps = (patch: Partial<RecapDependencies> = {}): RecapDependencies => ({
  weekly: async () => [brief({ id: "w2", weekStart: "2026-09-28", weekEnd: "2026-10-04" }), brief({ id: "w1" })],
  monthly: async () => [brief({ id: "m9", period: "month", weekStart: "2026-09-01", weekEnd: "2026-09-30" })],
  siteName: async () => "Lakeshore Dried Goods",
  ...patch,
});

afterEach(() => setReleaseFlagsDb(null));

describe("reading recaps through the business link", () => {
  it("reads every linked site's recaps, newest first, as the signed-in member", async () => {
    const rpc = links([{ tenantId: "lakeshore", tenantStableId: "7f000000-0000-4000-8000-0000000000b2", linkedAt: "2026-10-01T00:00:00Z" }]);
    const sites = await readWorkspaceRecaps(ACTOR, WS, deps());
    expect(rpc).toHaveBeenCalledWith("read_workspace_tenant_links", { p_workspace_id: WS, p_user_id: ACTOR.userId, p_verified_email: "owner@example.test" });
    expect(sites).toHaveLength(1);
    expect(sites[0]!.siteName).toBe("Lakeshore Dried Goods");
    expect(sites[0]!.recaps.map((recap) => recap.id)).toEqual(["w2", "m9", "w1"]);
  });

  it("refuses anyone who isn't a member of the business", async () => {
    links(null, { message: "workspace_access_denied" });
    await expect(readWorkspaceRecaps(ACTOR, WS, deps())).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("marks a site unavailable instead of empty when its recap store fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    links([{ tenantId: "lakeshore", tenantStableId: "7f000000-0000-4000-8000-0000000000b2", linkedAt: "2026-10-01T00:00:00Z" }]);
    const sites = await readWorkspaceRecaps(ACTOR, WS, deps({ weekly: async () => { throw new Error("redis down"); } }));
    expect(sites[0]).toMatchObject({ unavailable: true, recaps: [] });
    error.mockRestore();
  });

  it("counts calls with bookings and keeps the next step", () => {
    expect(recapView(brief({}))).toMatchObject({ visits: 412, visitsDelta: 12, customerActions: 12, nextAction: { title: "Add fall hours" } });
    expect(recapTitle(recapView(brief({ period: "month", weekStart: "2026-09-01" })))).toBe("September 2026");
    expect(recapTitle(recapView(brief({})))).toBe("Week of Sep 21, 2026");
  });
});

describe("the recaps page", () => {
  const sites = [{ tenantId: "lakeshore", siteName: "Lakeshore Dried Goods", unavailable: false, recaps: [recapView(brief({ id: "w2" })), recapView(brief({ id: "m9", period: "month", weekStart: "2026-09-01" }))] }];
  const render = (props: Parameters<typeof WorkspaceRecaps>[0]) => renderToStaticMarkup(createElement(WorkspaceRecaps, props));

  it("shows recaps with a way back home and a period filter", () => {
    const html = render({ workspaceId: WS, period: "all", state: { kind: "ready", sites } });
    expect(html).toContain(`href="/workspace?workspaceId=${WS}"`);
    expect(html).toContain("Week of Sep 21, 2026");
    expect(html).toContain("September 2026");
    expect(html).toContain("Fixed a broken image on the store page");
    expect(html).toContain('aria-current="page"');
  });

  it("filters to monthly", () => {
    const html = render({ workspaceId: WS, period: "month", state: { kind: "ready", sites } });
    expect(html).toContain("September 2026");
    expect(html).not.toContain("Week of Sep 21");
  });

  it("has empty, unavailable, permission and error states", () => {
    expect(render({ workspaceId: WS, period: "all", state: { kind: "ready", sites: [] } })).toContain("No site is connected");
    expect(render({ workspaceId: WS, period: "all", state: { kind: "ready", sites: [{ ...sites[0]!, recaps: [] }] } })).toContain("No recaps for Lakeshore Dried Goods yet");
    expect(render({ workspaceId: WS, period: "all", state: { kind: "ready", sites: [{ ...sites[0]!, recaps: [], unavailable: true }] } })).toContain("couldn&#x27;t be read right now");
    expect(render({ workspaceId: WS, period: "all", state: { kind: "permission" } })).toContain("belong to another business");
    expect(render({ workspaceId: WS, period: "all", state: { kind: "error" } })).toContain("Recaps couldn&#x27;t load");
  });
});

describe("/dashboard/reports moves to the recaps page", () => {
  const moved = { kind: "workspace" as const, workspaceId: WS, tenantStableId: null, operator: false, tester: false };

  it("is ready and keeps the old weekly/monthly meaning", () => {
    expect(DASHBOARD_DISPOSITIONS.find((entry) => entry.route === "/reports")!.state).toBe("ready");
    expect(routeDashboardRequest({ decision: moved, pathWithSearch: "/dashboard/reports" })).toEqual({ kind: "redirect", location: `/workspace/recaps?workspaceId=${WS}`, route: "/reports" });
    expect(routeDashboardRequest({ decision: moved, pathWithSearch: "/dashboard/reports?view=monthly" })).toMatchObject({ location: `/workspace/recaps?workspaceId=${WS}&period=month` });
  });

  it("survives sign-in, and rejects anything else on that path", () => {
    expect(workspaceReturnTarget(`/workspace/recaps?workspaceId=${WS}&period=week`)).toBe(`/workspace/recaps?workspaceId=${WS}&period=week`);
    expect(workspaceReturnTarget(`/workspace/recaps?workspaceId=nope`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/recaps?workspaceId=${WS}&period=year`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace/recaps?workspaceId=${WS}&next=//evil.example`)).toBeNull();
  });
});
