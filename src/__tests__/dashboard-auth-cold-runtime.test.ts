import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ allowed: true, audit: vi.fn(async () => undefined) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-client-fallback-root": "/client/customer-site" }) }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: async () => "customer-site" }));
vi.mock("@/platform/infra/auth", () => ({ hasDashboardViewAccess: async () => state.allowed }));
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeTenantOperatorRead: state.audit }));
const slot = Symbol.for("strelva.workspace-ports");
beforeEach(() => {
  vi.resetModules(); delete (globalThis as Record<symbol, unknown>)[slot];
  state.allowed = true; state.audit.mockClear();
});
afterEach(async () => { vi.resetModules(); await import("@/register-workspace-ports"); });
describe("dashboard request edge in a cold server runtime", () => {
  it("registers the actual loaders before the authorized website editor read", async () => {
    const { requireDashboardView } = await import("@/lib/dashboard-auth");
    await expect(requireDashboardView()).resolves.toEqual({ tenant: "customer-site", clientFallbackRoot: "/client/customer-site" });
    const { workspacePorts, workspacePortsRegistered } = await import("@/lib/workspace-ports");
    const { workspacePortLoaders } = await import("@/server/workspace-ports");
    expect(workspacePortsRegistered()).toBe(true); expect(workspacePorts()).toBe(workspacePortLoaders);
    expect(state.audit).toHaveBeenCalledExactlyOnceWith("customer-site");
  });
  it("still refuses an unauthorized dashboard before operator admission", async () => {
    state.allowed = false;
    const { requireDashboardView } = await import("@/lib/dashboard-auth");
    await expect(requireDashboardView()).rejects.toThrow("redirect:/client/customer-site/no-access");
    expect(state.audit).not.toHaveBeenCalled();
  });
});
