import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), enabled: vi.fn(), change: vi.fn(), limited: vi.fn() }));
vi.mock("@/platform/workspaces/http", async original => ({ ...(await original<typeof import("@/platform/workspaces/http")>()), workspaceHttpActor: mocks.actor }));
vi.mock("@/products/publishing/server", () => ({ publishingEnabledForWorkspace: mocks.enabled, changeRecordWithGoogle: mocks.change }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.limited }));
import { POST } from "@/app/api/workspace/publishing/record/route";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const actor = { userId: "7f000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const command = { workspaceId: "7f000000-0000-4000-8000-000000000010", revision: 1, commandId: "7f000000-0000-4000-8000-000000000099",
  patch: { facts: { hours: { value: { timezone: "America/New_York", weekly: [{ day: 1, opens: "09:00", closes: "17:00" }], overrides: [{ date: "2026-11-27", closed: true }] } } } }, googleApprovalDisclosed: true };
const request = (body: unknown = command, origin = "https://app.example.test") => new Request("https://app.example.test/api/workspace/publishing/record", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); mocks.actor.mockResolvedValue(actor); mocks.enabled.mockResolvedValue(true); mocks.limited.mockResolvedValue(false); });
afterEach(() => vi.unstubAllEnvs());
describe("publishing record save boundary", () => {
  it("returns record success and each separate Google result using the session owner", async () => {
    const result = { record: { revision: 2 }, google: [{ locationId: "one", status: "posted" }, { locationId: "two", status: "failed", reason: "Google access pending" }] };
    mocks.change.mockResolvedValue(result);
    const response = await POST(request()); expect(response.status).toBe(200); expect(await response.json()).toEqual({ result });
    expect(mocks.change).toHaveBeenCalledWith(actor, command.workspaceId, 1, command.patch, { source: "owner", commandId: command.commandId, googleApprovalDisclosed: true });
  });
  it("flags off, cross-origin, no session and per-business off never reach the record writer", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0"); expect((await POST(request())).status).toBe(503); expect(mocks.actor).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); expect((await POST(request(command, "https://attacker.example.test"))).status).toBe(403);
    mocks.actor.mockResolvedValueOnce(null); expect((await POST(request())).status).toBe(401);
    mocks.enabled.mockResolvedValue(false); expect((await POST(request())).status).toBe(503); expect(mocks.change).not.toHaveBeenCalled();
  });
  it("rejects malformed dates, arbitrary actors, stale revisions and unauthorized writers", async () => {
    expect((await POST(request({ ...command, actorId: actor.userId }))).status).toBe(400);
    expect((await POST(request({ ...command, patch: { facts: { hours: { value: { timezone: "America/New_York", weekly: [], overrides: [{ date: "2026-02-30", closed: true }] } } } } }))).status).toBe(400);
    expect(mocks.change).not.toHaveBeenCalled();
    mocks.change.mockRejectedValue(new WorkspaceAccessError()); expect((await POST(request())).status).toBe(403);
    mocks.limited.mockResolvedValue(true); expect((await POST(request())).status).toBe(429);
  });
});
