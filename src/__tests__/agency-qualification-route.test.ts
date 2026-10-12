import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ release: vi.fn(), actor: vi.fn(), admin: vi.fn(), read: vi.fn(), desk: vi.fn(), submit: vi.fn(), decide: vi.fn() }));
vi.mock("@/platform/agency-signup-release", () => ({ agencySignupReleaseEnabled: mocks.release }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: mocks.admin }));
vi.mock("@/platform/workspaces/http", async importOriginal => ({ ...await importOriginal<typeof import("@/platform/workspaces/http")>(), workspaceHttpActor: mocks.actor }));
vi.mock("@/experience/workspace/agency/qualification-server", () => ({ readQualification: mocks.read, readQualificationDesk: mocks.desk, submitQualification: mocks.submit, decideQualification: mocks.decide }));
import { WorkspaceAccessError } from "@/platform/workspaces/types";
import { GET, POST } from "@/app/api/agency-qualification/route";
const actor = { userId: "11111111-1111-4111-8111-111111111111", verifiedEmail: "operator@example.test" };
function request(body: object, origin = "https://app.example.test") {
  return new Request("https://app.example.test/api/agency-qualification", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.resetAllMocks(); mocks.release.mockReturnValue(true); mocks.actor.mockResolvedValue(actor); mocks.admin.mockResolvedValue(false); });
it("keeps the release gate and identity ahead of every read/write", async () => {
  mocks.release.mockReturnValue(false);
  expect((await GET(new Request("https://app.example.test/api/agency-qualification?desk=1"))).status).toBe(503);
  expect((await POST(request({ action: "submit" }))).status).toBe(503);
  expect(mocks.actor).not.toHaveBeenCalled();
  mocks.release.mockReturnValue(true); mocks.actor.mockResolvedValue(null);
  expect((await POST(request({ action: "submit" }))).status).toBe(401);
  expect(mocks.submit).not.toHaveBeenCalled();
});
it("rejects cross-origin submissions before reading identity or touching storage", async () => {
  expect((await POST(request({ action: "submit" }, "https://other.example.test"))).status).toBe(403);
  expect(mocks.actor).not.toHaveBeenCalled();
  expect(mocks.submit).not.toHaveBeenCalled();
});
it("keeps operator desk and decisions out of ordinary agency accounts", async () => {
  expect((await GET(new Request("https://app.example.test/api/agency-qualification?desk=1"))).status).toBe(403);
  expect((await POST(request({ action: "decide" }))).status).toBe(403);
  expect(mocks.desk).not.toHaveBeenCalled(); expect(mocks.decide).not.toHaveBeenCalled();
});
it("passes recorded session identity to the qualification decision", async () => {
  mocks.admin.mockResolvedValue(true); mocks.desk.mockResolvedValue([]);
  const body = { action: "decide", submissionId: "22222222-2222-4222-8222-222222222222", decision: "verified", reason: "Evidence checked and verified" };
  expect((await POST(request(body))).status).toBe(200);
  expect(mocks.decide).toHaveBeenCalledWith(actor.verifiedEmail, body);
});
it("maps unavailable decision reads into an unconfirmed outcome instead of success", async () => {
  mocks.admin.mockResolvedValue(true); mocks.desk.mockRejectedValue(new Error("unavailable"));
  const response = await POST(request({ action: "decide" }));
  expect(response.status).toBe(503);
  expect((await response.json()).error).toContain("could not be confirmed");
});

it("keeps an accepted decision read-back refusal ambiguous instead of reporting an atomic 403", async () => {
  mocks.admin.mockResolvedValue(true); mocks.desk.mockRejectedValue(new WorkspaceAccessError());
  const response = await POST(request({ action: "decide" }));
  expect(response.status).toBe(503);
  expect((await response.json()).code).toBe("qualification_readback_unavailable");
});
