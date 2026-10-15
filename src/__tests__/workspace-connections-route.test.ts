import { beforeEach, expect, it, vi } from "vitest";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), list: vi.fn(), enabled: vi.fn() }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.enabled }));
vi.mock("@/platform/connections/server", () => ({ listWorkspaceConnections: mocks.list }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.actor }));
import { GET } from "@/app/api/workspace/connections/route";
const workspaceId = "a1000000-0000-4000-8000-000000000001";
const request = () => new Request(`https://app.example.test/api/workspace/connections?workspaceId=${workspaceId}`);
beforeEach(() => { vi.resetAllMocks(); mocks.enabled.mockReturnValue(true); mocks.actor.mockResolvedValue({ id: "a1000000-0000-4000-8000-000000000004", email: "owner@example.test", email_confirmed_at: "2026-10-14" }); mocks.list.mockResolvedValue({ connections: [], sourceErrors: ["calendly"] }); });
it("retains the release gate without reading Auth or sources", async () => {
  mocks.enabled.mockReturnValue(false); expect((await GET(request())).status).toBe(503); expect(mocks.actor).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled();
});
it("requires a confirmed session and workspace UUID", async () => {
  mocks.actor.mockResolvedValueOnce(null); expect((await GET(request())).status).toBe(401);
  expect((await GET(new Request("https://app.example.test/api/workspace/connections?workspaceId=bad"))).status).toBe(400);
  expect(mocks.list).not.toHaveBeenCalled();
});
it("returns scoped rows and per-source errors with private no-store caching", async () => {
  const response = await GET(request()); expect(response.status).toBe(200); expect(await response.json()).toEqual({ connections: [], sourceErrors: ["calendly"] }); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.list).toHaveBeenCalledWith({ userId: "a1000000-0000-4000-8000-000000000004", verifiedEmail: "owner@example.test" }, workspaceId);
});
it("denies outsiders and does not expose server failures", async () => {
  mocks.list.mockRejectedValueOnce(new WorkspaceAccessError()); expect((await GET(request())).status).toBe(403);
  mocks.list.mockRejectedValueOnce(Error("private provider details")); const response = await GET(request()); expect(response.status).toBe(503); expect(JSON.stringify(await response.json())).not.toContain("private provider");
});
