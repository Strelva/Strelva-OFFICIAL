import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { workspaceReturnTarget } from "@/lib/workspace-location";
import { systemOriginId } from "@/platform/systems/invariants";
import {
  DASHBOARD_DISPOSITIONS,
  SETTINGS_ANCHORS,
  effectiveDisposition,
  pagesBlockingOwnerEntry,
  routeForDashboardPath,
} from "@/platform/owner-entry/dispositions";
import { decideOwnerEntry, entryDestination, routeDashboardRequest, type OwnerEntryDecision } from "@/platform/owner-entry/decision";
import { ownerEntryPossible, tenantSignInNext } from "@/platform/owner-entry/env";
import type { OwnerEntryResolution } from "@/platform/release-flags/store";

const WS = "7f000000-0000-4000-8000-000000000010";
const STABLE = "7f000000-0000-4000-8000-0000000000b2";
const ON = { STRELVA_WORKSPACE_RELEASE: "1", STRELVA_OWNER_ENTRY: "workspace" };

function pageRoutes(): string[] {
  const root = join(process.cwd(), "src/app/dashboard");
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name === "page.tsx") {
        const rel = relative(root, dir).split(sep).join("/");
        found.push(rel ? `/${rel}` : "/");
      }
    }
  };
  walk(root);
  return found.sort();
}

const resolution = (patch: Partial<OwnerEntryResolution> = {}): OwnerEntryResolution => ({
  workspaceId: WS, tenantStableId: STABLE, ownerEntry: "on", role: "owner", tester: false, operator: false, ...patch,
});

describe("dashboard disposition map", () => {
  it("has an entry for every /dashboard page file, and nothing else", () => {
    const mapped = DASHBOARD_DISPOSITIONS.map((entry) => entry.route).sort();
    expect(mapped).toEqual(pageRoutes());
    expect(mapped).toHaveLength(25);
  });

  it("gives every page a target that survives sign-in", () => {
    const context = { workspaceId: WS, tenantStableId: STABLE, search: new URLSearchParams() };
    for (const entry of DASHBOARD_DISPOSITIONS) {
      const target = entry.target(context);
      expect(workspaceReturnTarget(target), entry.route).toBe(target);
      expect(entry.target({ ...context, tenantStableId: null }), entry.route).toMatch(/^\/workspace/);
    }
    for (const [anchor, target] of Object.entries(SETTINGS_ANCHORS)) {
      expect(workspaceReturnTarget(target(context)), anchor).toBe(target(context));
    }
  });

  it("maps the settings anchors the old links use", () => {
    expect(Object.keys(SETTINGS_ANCHORS)).toEqual(expect.arrayContaining(["ownership", "domains", "plan", "account"]));
  });

  it("explains every page that stays or is frozen", () => {
    for (const entry of DASHBOARD_DISPOSITIONS) {
      if (entry.state === "stay" || entry.state === "frozen") expect(entry.note, entry.route).toBeTruthy();
      if (entry.state === "retire") expect(DASHBOARD_DISPOSITIONS.some((other) => other.route === entry.retiresTo), entry.route).toBe(true);
    }
  });

  it("follows the systems catalog: store and members are frozen, schedule and roster belong to Bookings", () => {
    const state = (route: string) => DASHBOARD_DISPOSITIONS.find((entry) => entry.route === route)!;
    expect(state("/store").state).toBe("frozen");
    expect(state("/members").state).toBe("frozen");
    expect(state("/schedule").home).toMatch(/Bookings/);
    expect(state("/roster").home).toMatch(/Bookings/);
  });

  it("lands the website pages on the tenant's website System, each on its own tab", () => {
    const system = systemOriginId(WS, { kind: "tenant", ref: STABLE });
    const target = (route: string, path = `/dashboard${route}`, search = "") => DASHBOARD_DISPOSITIONS.find((entry) => entry.route === route)!
      .target({ workspaceId: WS, tenantStableId: STABLE, search: new URLSearchParams(search), path });
    expect(target("/site")).toBe(`/workspace/site?workspaceId=${WS}&system=${system}`);
    expect(target("/assets")).toBe(`/workspace/site?workspaceId=${WS}&system=${system}&tab=photos`);
    expect(target("/brand-kit")).toBe(`/workspace/site?workspaceId=${WS}&system=${system}&tab=look`);
    expect(target("/collections")).toBe(`/workspace/site?workspaceId=${WS}&system=${system}&tab=collections`);
    expect(target("/history", "/dashboard/history", "request=evt_42")).toBe(`/workspace/site?workspaceId=${WS}&system=${system}&tab=history&request=evt_42`);
    expect(target("/history", "/dashboard/history", "request=<script>")).toBe(`/workspace/site?workspaceId=${WS}&system=${system}&tab=history`);
    expect(target("/integrations")).toBe(`/workspace/site?workspaceId=${WS}&system=${system}&tab=connections`);
    expect(target("/google")).toBe(`/workspace/site?workspaceId=${WS}&system=${system}&tab=google`);
    expect(target("/sources/[id]", "/dashboard/sources/google-business")).toBe(`/workspace/site?workspaceId=${WS}&system=${system}&tab=source&source=google-business`);
    expect(target("/sources/[id]", "/dashboard/sources/%E0%A4%A")).toBe(`/workspace/site?workspaceId=${WS}&system=${system}&tab=connections`);
    expect(target("/chat")).toBe(`/workspace?view=ask&workspaceId=${WS}`);
    for (const route of ["/site", "/assets", "/history", "/sources/[id]"]) {
      expect(DASHBOARD_DISPOSITIONS.find((entry) => entry.route === route)!.target({ workspaceId: WS, tenantStableId: null, search: new URLSearchParams() }), route).toBe(`/workspace?workspaceId=${WS}`);
    }
  });

  it("matches concrete paths to routes and retire pages to their target's state", () => {
    expect(routeForDashboardPath("/dashboard")).toBe("/");
    expect(routeForDashboardPath("/dashboard/")).toBe("/");
    expect(routeForDashboardPath("/dashboard/reports")).toBe("/reports");
    expect(routeForDashboardPath("/dashboard/sources/google")).toBe("/sources/[id]");
    expect(routeForDashboardPath("/dashboard/nope/deeper")).toBe("/[...notFound]");
    expect(effectiveDisposition("/content").route).toBe("/site");
    expect(effectiveDisposition("/health").route).toBe("/analytics");
    expect(effectiveDisposition("/ownership").route).toBe("/settings");
  });

  it("blocks owner entry on while any used page still stays, and ignores frozen and unused pages", () => {
    const blocking = pagesBlockingOwnerEntry(new Set(["always"])).map((entry) => entry.route);
    expect(blocking).toContain("/");
    expect(blocking).not.toContain("/store");
    expect(blocking).not.toContain("/schedule");
    expect(pagesBlockingOwnerEntry(new Set(["always", "wellness"])).map((entry) => entry.route)).toContain("/schedule");
    expect(pagesBlockingOwnerEntry(new Set(["store"])).map((entry) => entry.route)).toEqual([]);
  });
});

describe("owner entry decision: linked × flag × membership", () => {
  it("stays on /dashboard while the env makes owner entry impossible", () => {
    expect(ownerEntryPossible({})).toBe(false);
    expect(ownerEntryPossible({ STRELVA_OWNER_ENTRY: "1" })).toBe(false);
    expect(decideOwnerEntry({ environment: { STRELVA_WORKSPACE_RELEASE: "1", STRELVA_OWNER_ENTRY: "0" }, resolution: resolution() })).toEqual({ kind: "dashboard", reason: "env_off" });
  });

  const cases: Array<[string, Partial<OwnerEntryResolution> | null, Record<string, string>, OwnerEntryDecision["kind"], string?]> = [
    ["linked, on, owner", {}, ON, "workspace"],
    ["linked, on, member", { role: "member" }, ON, "workspace"],
    ["unlinked", { workspaceId: null, tenantStableId: null }, ON, "dashboard", "unlinked"],
    ["linked, row unset under workspace env", { ownerEntry: null }, ON, "dashboard", "entry_off"],
    ["linked, row unset under env 1", { ownerEntry: null }, { STRELVA_WORKSPACE_RELEASE: "1", STRELVA_OWNER_ENTRY: "1" }, "workspace"],
    ["linked, row off under env 1", { ownerEntry: "off" }, { STRELVA_WORKSPACE_RELEASE: "1", STRELVA_OWNER_ENTRY: "1" }, "dashboard", "entry_off"],
    ["linked, operators, client", { ownerEntry: "operators" }, ON, "dashboard", "entry_off"],
    ["linked, operators, operator member", { ownerEntry: "operators", operator: true, role: "admin" }, ON, "workspace"],
    ["linked, operators, tester member", { ownerEntry: "operators", tester: true, role: "member" }, ON, "workspace"],
    ["linked, on, no membership", { role: null }, ON, "dashboard", "no_membership"],
    ["linked, operators, operator without membership", { ownerEntry: "operators", operator: true, role: null }, ON, "dashboard", "no_membership"],
    ["read failed", null, ON, "dashboard", "unavailable"],
  ];
  for (const [name, patch, environment, kind, reason] of cases) {
    it(name, () => {
      const decision = decideOwnerEntry({ environment, resolution: patch === null ? null : resolution(patch) });
      expect(decision.kind).toBe(kind);
      if (reason) expect(decision).toEqual({ kind: "dashboard", reason });
    });
  }
});

describe("routing a /dashboard request", () => {
  const moved: OwnerEntryDecision = { kind: "workspace", workspaceId: WS, tenantStableId: STABLE, operator: false, tester: false };

  it("renders as today for anyone not moved", () => {
    expect(routeDashboardRequest({ decision: { kind: "dashboard", reason: "entry_off" }, pathWithSearch: "/dashboard/nope" })).toEqual({ kind: "render" });
  });

  it("redirects a ready page to its workspace home", () => {
    expect(routeDashboardRequest({ decision: moved, pathWithSearch: "/dashboard/unknown/page" })).toEqual({ kind: "redirect", location: `/workspace?workspaceId=${WS}`, route: "/[...notFound]" });
  });

  it("moves the website pages only where Systems are on for the workspace", () => {
    const system = systemOriginId(WS, { kind: "tenant", ref: STABLE });
    const on = (flag: string) => flag === "systems";
    expect(routeDashboardRequest({ decision: moved, pathWithSearch: "/dashboard/site", flagOn: on })).toEqual({ kind: "redirect", location: `/workspace/site?workspaceId=${WS}&system=${system}`, route: "/site" });
    expect(routeDashboardRequest({ decision: moved, pathWithSearch: "/dashboard/content", flagOn: on })).toMatchObject({ kind: "redirect", route: "/content", location: `/workspace/site?workspaceId=${WS}&system=${system}` });
    expect(routeDashboardRequest({ decision: moved, pathWithSearch: "/dashboard/sources/google", flagOn: on })).toMatchObject({ kind: "redirect", location: `/workspace/site?workspaceId=${WS}&system=${system}&tab=source&source=google` });
    expect(routeDashboardRequest({ decision: moved, pathWithSearch: "/dashboard/sources", flagOn: on })).toMatchObject({ kind: "redirect", location: `/workspace/site?workspaceId=${WS}&system=${system}&tab=connections` });
    for (const path of ["/dashboard/site", "/dashboard/assets", "/dashboard/history", "/dashboard/integrations", "/dashboard/google"]) {
      expect(routeDashboardRequest({ decision: moved, pathWithSearch: path, flagOn: () => false }).kind, path).toBe("render-with-back");
    }
  });

  it("moves /dashboard/chat only while Ask Strelva is released", () => {
    expect(routeDashboardRequest({ decision: moved, pathWithSearch: "/dashboard/chat", askReleased: true })).toEqual({ kind: "redirect", location: `/workspace?view=ask&workspaceId=${WS}`, route: "/chat" });
    expect(routeDashboardRequest({ decision: moved, pathWithSearch: "/dashboard/chat", askReleased: false }).kind).toBe("render-with-back");
  });

  it("renders a page that stays, with a way back to the workspace", () => {
    for (const path of ["/dashboard", "/dashboard/review", "/dashboard/site", "/dashboard/content"]) {
      const routing = routeDashboardRequest({ decision: moved, pathWithSearch: path });
      expect(routing.kind, path).toBe("render-with-back");
      if (routing.kind === "render-with-back") expect(routing.homeHref).toBe(`/workspace?workspaceId=${WS}`);
    }
  });

  it("renders frozen pages with the way back", () => {
    expect(routeDashboardRequest({ decision: moved, pathWithSearch: "/dashboard/store" })).toMatchObject({ kind: "render-with-back", state: "frozen" });
    expect(routeDashboardRequest({ decision: moved, pathWithSearch: "/dashboard/members" })).toMatchObject({ kind: "render-with-back", state: "frozen" });
  });

  it("lets an operator, and only an operator, keep the old page with ?legacy=1", () => {
    expect(routeDashboardRequest({ decision: { ...moved, operator: true }, pathWithSearch: "/dashboard/unknown?legacy=1" }).kind).toBe("render-with-back");
    expect(routeDashboardRequest({ decision: moved, pathWithSearch: "/dashboard/unknown?legacy=1" }).kind).toBe("redirect");
  });

  it("sends sign-in to the workspace only for a moved member", () => {
    expect(entryDestination(moved, "/client/gldf/dashboard")).toBe(`/workspace?workspaceId=${WS}`);
    expect(entryDestination({ kind: "dashboard", reason: "no_membership" }, "/client/gldf/dashboard")).toBe("/client/gldf/dashboard");
  });
});

describe("the trusted dashboard path header", () => {
  it("is the same name in the proxy and the dashboard", async () => {
    const [{ DASHBOARD_PATH_HEADER: proxyName }, { DASHBOARD_PATH_HEADER: serverName }] = await Promise.all([import("@/proxy"), import("@/platform/owner-entry/server")]);
    expect(serverName).toBe(proxyName);
  });
});

describe("sign-in and sign-up next on a client admin host", () => {
  it("keeps /dashboard while owner entry is impossible", () => {
    expect(tenantSignInNext("", {})).toBe("/dashboard");
    expect(tenantSignInNext("/client/rohlax", { STRELVA_WORKSPACE_RELEASE: "1" })).toBe("/client/rohlax/dashboard");
  });
  it("goes through the entry route once it is possible", () => {
    expect(tenantSignInNext("", ON)).toBe("/auth/entry");
    expect(tenantSignInNext("/client/rohlax", ON)).toBe("/client/rohlax/auth/entry");
    expect(tenantSignInNext("/not-a-root", ON)).toBe("/auth/entry");
  });
});
