import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Page from "@/app/workspace/provider-change/page";
const mocks = vi.hoisted(() => ({ list: vi.fn(), actor: vi.fn(), rpc: vi.fn() }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: mocks.list }));
vi.mock("@/platform/connect", () => ({ moneyRpc: mocks.rpc }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: mocks.actor }));
const id = "d2940000-0000-4000-8000-000000000010";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("STRELVA_PROVIDER_CHANGE", "1"); mocks.actor.mockResolvedValue({ userId: "owner", verifiedEmail: "owner@example.test" }); mocks.rpc.mockResolvedValue([{ id: "request", business_workspace_id: id, status: "awaiting_policy", respond_by: null }]); });
afterEach(() => vi.unstubAllEnvs());
describe("provider change owner presentation", () => {
  it.each([ ["customer", "member", "owner", true], ["customer", "member", "admin", false], ["customer", "delegated_read", "owner", false], ["customer", "provider_seat", "owner", false], ["agency", "member", "owner", false] ])("kind %s access %s role %s offers recovery %s", async (kind, access, role, allowed) => {
    mocks.list.mockResolvedValue([{ id, kind, access, role }]);
    const html = renderToStaticMarkup(await Page({ searchParams: Promise.resolve({ workspaceId: id }) }));
    expect(html.includes("Cancel provider change")).toBe(allowed);
  });
});
