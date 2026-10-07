import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), command: vi.fn(), read: vi.fn(), limited: vi.fn() }));
vi.mock("@/platform/workspaces/http", async original => ({ ...(await original<typeof import("@/platform/workspaces/http")>()), workspaceHttpActor: mocks.actor }));
vi.mock("@/products/google-listing/server", () => ({ commandGoogleLocationVersions: mocks.command, readGoogleLocationVersion: mocks.read }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.limited }));
import { GET, POST } from "@/app/api/workspace/publishing/google-versions/route";
import { VersionAccessError, VersionStaleError } from "@/platform/system-versions";
const actor = { userId: "5e000000-0000-4000-8000-000000000001", verifiedEmail: "operator@example.test" };
const command = { action: "prepare", workspaceId: "5e000000-0000-4000-8000-000000000010" };
const request = (origin = "https://app.example.test") => new Request("https://app.example.test/api/workspace/publishing/google-versions", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(command) });
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); mocks.actor.mockResolvedValue(actor); mocks.limited.mockResolvedValue(false); });
afterEach(() => vi.unstubAllEnvs());
describe("Google location lineage route authority", () => {
  it("uses the confirmed session actor and returns per-location outcomes", async () => {
    const result = { results: [{ status: "needs_approval", eventId: "one" }, { status: "blocked" }] };
    mocks.command.mockResolvedValue(result);
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(result);
    expect(mocks.command).toHaveBeenCalledWith(actor, command);
  });
  it("refuses release-off, cross-origin, unsigned and rate-limited writes", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0"); expect((await POST(request())).status).toBe(503);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); expect((await POST(request("https://attacker.example.test"))).status).toBe(403);
    mocks.actor.mockResolvedValueOnce(null); expect((await POST(request())).status).toBe(401);
    mocks.limited.mockResolvedValueOnce(true); expect((await POST(request())).status).toBe(429);
    expect(mocks.command).not.toHaveBeenCalled();
  });
  it("keeps denied and stale Versions distinct, and validates read identities", async () => {
    mocks.command.mockRejectedValueOnce(new VersionAccessError()); expect((await POST(request())).status).toBe(403);
    mocks.command.mockRejectedValueOnce(new VersionStaleError()); expect((await POST(request())).status).toBe(409);
    expect((await GET(new Request("https://app.example.test/api/workspace/publishing/google-versions?workspaceId=invalid&versionId=invalid"))).status).toBe(400);
    expect(mocks.read).not.toHaveBeenCalled();
  });
});
