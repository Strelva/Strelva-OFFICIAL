import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
const mocks = vi.hoisted(() => ({ session: vi.fn(), release: vi.fn(), systemsMay: vi.fn(), systemsFor: vi.fn(), needs: vi.fn(), read: vi.fn() }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/platform/systems-release", () => ({ systemsReleaseMayBeOn: mocks.systemsMay, systemsReleasedFor: mocks.systemsFor }));
vi.mock("@/platform/needs-you/release", () => ({ needsYouReleaseEnabled: mocks.needs }));
vi.mock("@/experience/workspace/agency-client-home-server", () => ({ readAgencyClientHome: mocks.read }));
import { GET } from "@/app/api/workspace/agency-client-home/route";
const workspaceId = "b9200000-0000-4000-8000-000000000001";
const user = { id: "b9200000-0000-4000-8000-000000000002", email: "STAFF@example.test", email_confirmed_at: "2026-10-10" };
const projection = { workspaceId, decisions: [{ id: user.id }], changes: [], deliveries: [], deliveryChecks: [] };
const req = (id = workspaceId) => new Request(`https://example.test/api/workspace/agency-client-home?workspaceId=${id}`);
beforeEach(() => { vi.clearAllMocks(); mocks.release.mockReturnValue(true); mocks.systemsMay.mockReturnValue(true); mocks.systemsFor.mockResolvedValue(true); mocks.needs.mockReturnValue(true); mocks.session.mockResolvedValue(user); mocks.read.mockResolvedValue(projection); });
describe("agency client Home HTTP boundary", () => {
  it("reads under the verified session with private caching", async () => {
    const result = await GET(req()); expect(result.status).toBe(200); expect(result.headers.get("cache-control")).toBe("private, no-store");
    expect(await result.json()).toEqual(projection); expect(mocks.read).toHaveBeenCalledWith({ userId: user.id, verifiedEmail: "staff@example.test" }, workspaceId);
  });
  it.each(["workspace", "systems", "cohort"])("respects the %s release boundary before projecting rows", async gate => {
    if (gate === "workspace") mocks.release.mockReturnValue(false); else if (gate === "systems") mocks.systemsMay.mockReturnValue(false); else mocks.systemsFor.mockResolvedValue(false);
    expect((await GET(req())).status).toBe(503); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("holds decisions while Needs you is off", async () => { mocks.needs.mockReturnValue(false); expect(await (await GET(req())).json()).toEqual({ ...projection, decisions: [] }); });
  it("refuses anonymous, unconfirmed, malformed and revoked access", async () => {
    mocks.session.mockResolvedValue(null); expect((await GET(req())).status).toBe(401);
    mocks.session.mockResolvedValue({ ...user, email_confirmed_at: null }); expect((await GET(req())).status).toBe(401);
    mocks.session.mockResolvedValue(user); expect((await GET(req("invalid"))).status).toBe(400);
    mocks.read.mockRejectedValue(new WorkspaceAccessError()); expect((await GET(req())).status).toBe(403);
  });
  it("does not turn a failed source into a confirmed empty Home", async () => { mocks.read.mockRejectedValue(new Error("offline")); expect((await GET(req())).status).toBe(503); });
});
