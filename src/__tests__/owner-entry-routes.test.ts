import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ownerEntryForTenant = vi.hoisted(() => vi.fn());
vi.mock("@/platform/owner-entry/server", () => ({ ownerEntryForTenant, DASHBOARD_PATH_HEADER: "x-strelva-dashboard-path" }));
vi.mock("@/products/websites/document-store", () => ({ getPublishedSiteDocument: vi.fn() }));

const readTenantWorkspaceLink = vi.hoisted(() => vi.fn());
const setWorkspaceReleaseFlag = vi.hoisted(() => vi.fn());
const setWorkspaceReleaseTester = vi.hoisted(() => vi.fn());
vi.mock("@/platform/business-record/service", () => ({ readTenantWorkspaceLink }));
vi.mock("@/platform/release-flags/store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/platform/release-flags/store")>()),
  setWorkspaceReleaseFlag,
  setWorkspaceReleaseTester,
}));

import proxy, { DASHBOARD_PATH_HEADER, adminRootTargetPath, dashboardPathHeaderValue } from "@/proxy";
import { GET as entry } from "@/app/auth/entry/route";
import { workspaceReturnTarget } from "@/lib/workspace-location";
import { applyTenantReleaseCommand, dashboardUsesForTenant } from "@/platform/owner-entry/operator";
import { ReleaseFlagValidationError } from "@/platform/release-flags/store";

const WS = "7f000000-0000-4000-8000-000000000010";
const SYSTEM = "7f000000-0000-4000-8000-0000000000aa";

beforeEach(() => {
  ownerEntryForTenant.mockReset();
  readTenantWorkspaceLink.mockReset();
  setWorkspaceReleaseFlag.mockReset();
  setWorkspaceReleaseTester.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("workspaceReturnTarget keeps System links", () => {
  it("accepts view=system with a System id", () => {
    const target = `/workspace?view=system&system=${SYSTEM}&workspaceId=${WS}`;
    expect(workspaceReturnTarget(target)).toBe(target);
  });
  it("refuses a System link without a valid id, or a system id on another view", () => {
    expect(workspaceReturnTarget(`/workspace?view=system&workspaceId=${WS}`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace?view=system&system=not-a-uuid&workspaceId=${WS}`)).toBeNull();
    expect(workspaceReturnTarget(`/workspace?view=settings&system=${SYSTEM}`)).toBeNull();
  });
});

describe("proxy: trusted dashboard path and admin root", () => {
  it("only marks /dashboard paths", () => {
    expect(dashboardPathHeaderValue("/dashboard", "")).toBe("/dashboard");
    expect(dashboardPathHeaderValue("/dashboard/reports", "?view=monthly")).toBe("/dashboard/reports?view=monthly");
    expect(dashboardPathHeaderValue("/dashboardx", "")).toBeNull();
    expect(dashboardPathHeaderValue("/workspace", "")).toBeNull();
  });

  it("sends the admin root to the entry route only when owner entry is possible", () => {
    expect(adminRootTargetPath({})).toBe("/dashboard");
    expect(adminRootTargetPath({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_OWNER_ENTRY: "0" })).toBe("/dashboard");
    expect(adminRootTargetPath({ STRELVA_WORKSPACE_RELEASE: "1", STRELVA_OWNER_ENTRY: "workspace" })).toBe("/auth/entry");
  });

  it("sets the path for /client/<tenant>/dashboard and replaces a smuggled copy", async () => {
    vi.stubEnv("SCAFFOLD_DEV_UNGATED_ACCESS", "1");
    const response = await proxy(new NextRequest("https://app.strelva.com/client/gldf/dashboard/reports?view=monthly", {
      headers: { host: "app.strelva.com", [DASHBOARD_PATH_HEADER]: "/dashboard/unknown" },
    }));
    expect(response.headers.get(`x-middleware-request-${DASHBOARD_PATH_HEADER}`)).toBe("/dashboard/reports?view=monthly");
  });

  it("strips a smuggled path on a non-dashboard path", async () => {
    vi.stubEnv("SCAFFOLD_DEV_UNGATED_ACCESS", "1");
    const response = await proxy(new NextRequest("https://app.strelva.com/client/gldf/sign-in", {
      headers: { host: "app.strelva.com", [DASHBOARD_PATH_HEADER]: "/dashboard/unknown" },
    }));
    expect(response.headers.get(`x-middleware-request-${DASHBOARD_PATH_HEADER}`)).toBeNull();
  });

  it("redirects an admin subdomain root to /dashboard today and to the entry route with owner entry possible", async () => {
    const request = () => new NextRequest("https://admin.gldf.strelva.com/", { headers: { host: "admin.gldf.strelva.com" } });
    expect(new URL((await proxy(request())).headers.get("location")!).pathname).toBe("/dashboard");
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    vi.stubEnv("STRELVA_OWNER_ENTRY", "workspace");
    expect(new URL((await proxy(request())).headers.get("location")!).pathname).toBe("/auth/entry");
  });
});

describe("/auth/entry", () => {
  const request = (headers: Record<string, string>) => new NextRequest("https://app.strelva.com/auth/entry", { headers });

  it("lands a moved member in the workspace with a 307", async () => {
    ownerEntryForTenant.mockResolvedValue({ kind: "workspace", workspaceId: WS, tenantStableId: null, operator: false, tester: false });
    const response = await entry(request({ "x-tenant": "gldf", "x-client-fallback-root": "/client/gldf" }));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`https://app.strelva.com/workspace?workspaceId=${WS}`);
    expect(ownerEntryForTenant).toHaveBeenCalledWith("gldf");
  });

  it("falls back to the tenant's /dashboard for anyone else", async () => {
    for (const reason of ["env_off", "unlinked", "entry_off", "no_membership", "unavailable"]) {
      ownerEntryForTenant.mockResolvedValue({ kind: "dashboard", reason });
      const response = await entry(request({ "x-tenant": "rohlax", "x-client-fallback-root": "/client/rohlax" }));
      expect(response.status, reason).toBe(307);
      expect(response.headers.get("location"), reason).toBe("https://app.strelva.com/client/rohlax/dashboard");
    }
  });

  it("sends a signed-out person to the tenant's sign-in", async () => {
    ownerEntryForTenant.mockResolvedValue({ kind: "dashboard", reason: "signed_out" });
    const response = await entry(request({ "x-tenant": "gldf" }));
    expect(response.headers.get("location")).toBe("https://app.strelva.com/sign-in");
  });

  it("never takes the tenant from anywhere but the proxy header", async () => {
    const response = await entry(new NextRequest("https://app.strelva.com/auth/entry?tenant=gldf"));
    expect(response.headers.get("location")).toBe("https://app.strelva.com/account");
    expect(ownerEntryForTenant).not.toHaveBeenCalled();
  });
});

describe("operator commands", () => {
  const plain = { tenantConfig: { template: "professional" as const, features: [] }, connections: [], hasCommerce: false };

  it("refuses an unconverted client", async () => {
    readTenantWorkspaceLink.mockResolvedValue({ tenantId: "gldf", link: null });
    await expect(applyTenantReleaseCommand("op@example.test", "gldf", plain, { kind: "flag", flag: "systems", state: "operators", reason: "try", expectedRevision: 0 }))
      .rejects.toBeInstanceOf(ReleaseFlagValidationError);
    expect(setWorkspaceReleaseFlag).not.toHaveBeenCalled();
  });

  it("needs Jacob's yes for on and records it in the reason", async () => {
    readTenantWorkspaceLink.mockResolvedValue({ tenantId: "gldf", link: { workspaceId: WS } });
    await expect(applyTenantReleaseCommand("op@example.test", "gldf", plain, { kind: "flag", flag: "systems", state: "on", reason: "ready", expectedRevision: 0 }))
      .rejects.toThrow(/Jacob's yes/);
    await applyTenantReleaseCommand("op@example.test", "gldf", plain, { kind: "flag", flag: "systems", state: "on", reason: "ready", expectedRevision: 0, jacobApproved: true });
    expect(setWorkspaceReleaseFlag).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: WS, flag: "systems", state: "on", reason: "Jacob's yes: ready" }));
  });

  it("refuses owner entry on while a page the client uses hasn't moved, but allows operators", async () => {
    readTenantWorkspaceLink.mockResolvedValue({ tenantId: "gldf", link: { workspaceId: WS } });
    await expect(applyTenantReleaseCommand("op@example.test", "gldf", plain, { kind: "flag", flag: "owner_entry", state: "on", reason: "go", expectedRevision: 0, jacobApproved: true }))
      .rejects.toThrow(/\/dashboard\/site/);
    await applyTenantReleaseCommand("op@example.test", "gldf", plain, { kind: "flag", flag: "owner_entry", state: "operators", reason: "walk pages", expectedRevision: 0 });
    expect(setWorkspaceReleaseFlag).toHaveBeenCalledTimes(1);
    expect(setWorkspaceReleaseFlag).toHaveBeenCalledWith(expect.objectContaining({ state: "operators", reason: "walk pages" }));
  });

  it("counts store and wellness pages only for the clients that have them", () => {
    expect([...dashboardUsesForTenant({ ...plain, hasCommerce: true })]).toContain("store");
    expect([...dashboardUsesForTenant(plain)]).not.toContain("store");
    expect([...dashboardUsesForTenant({ ...plain, tenantConfig: { template: "wellness", features: ["schedule", "members", "roster"] } })]).toContain("wellness");
  });
});
