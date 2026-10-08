import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ actor: vi.fn(), read: vi.fn(), change: vi.fn(), limited: vi.fn() }));
vi.mock("@/platform/workspaces/http", async original => ({ ...(await original<typeof import("@/platform/workspaces/http")>()), workspaceHttpActor: mocks.actor }));
vi.mock("@/platform/business-record/service", () => ({ readBusinessRecord: mocks.read }));
vi.mock("@/app/workspace/business-details/record-effects", () => ({ changeRecordWithWebsiteReviews: mocks.change }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.limited }));
import { POST } from "@/app/api/workspace/business-details/record/route";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
const actor = { userId: "7f000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const command = { workspaceId: "7f000000-0000-4000-8000-000000000010", revision: 1, commandId: "7f000000-0000-4000-8000-000000000099", patch: { services: [{ op: "upsert", id: "7f000000-0000-4000-8000-000000000040", name: "Consultation", priceText: "$90" }] } };
const request = (body: unknown = command, origin = "https://app.example.test") => new Request("https://app.example.test/api/workspace/business-details/record", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks();vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");mocks.actor.mockResolvedValue(actor);mocks.read.mockResolvedValue({ access: "owner" });mocks.limited.mockResolvedValue(false); });
afterEach(() => vi.unstubAllEnvs());
describe("business details record boundary", () => {
  it("saves without Google publishing and returns each website outcome separately", async () => {
    const result = { record: { revision: 2 }, google: [], native: { ready: [], needsReview: [{ tenantId: "gldf", reason: "draft_held", reported: true }] } };
    mocks.change.mockResolvedValue(result);
    const response = await POST(request());expect(response.status).toBe(200);expect(await response.json()).toEqual({ result });
    expect(mocks.change).toHaveBeenCalledExactlyOnceWith(actor, command.workspaceId, 1, command.patch, { source: "owner", commandId: command.commandId, googleApprovalDisclosed: false });
  });
  it.each(["member", "admin", "agency"])("does not let %s write with owner provenance", async access => {
    mocks.read.mockResolvedValue({ access });expect((await POST(request())).status).toBe(403);expect(mocks.change).not.toHaveBeenCalled();
  });
  it("fails closed for flags, cross-origin, anonymous, invalid and limited requests", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");expect((await POST(request())).status).toBe(503);expect(mocks.actor).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");expect((await POST(request(command,"https://attacker.example.test"))).status).toBe(403);
    mocks.actor.mockResolvedValueOnce(null);expect((await POST(request())).status).toBe(401);
    expect((await POST(request({ ...command, source: "owner" }))).status).toBe(400);
    mocks.limited.mockResolvedValue(true);expect((await POST(request())).status).toBe(429);expect(mocks.change).not.toHaveBeenCalled();
  });
  it("returns a stale revision conflict without a success receipt", async () => {
    mocks.change.mockRejectedValue(new WorkspaceConflictError("The record changed. Reload."));const response = await POST(request());expect(response.status).toBe(409);expect(await response.json()).toEqual({ error: "The record changed. Reload." });
  });
});
