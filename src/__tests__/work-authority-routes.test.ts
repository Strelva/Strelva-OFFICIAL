import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const boundary = vi.hoisted(() => ({ user: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/db/server-client", () => ({ getSessionUser: boundary.user }));
vi.mock("@/lib/db/client", () => ({ getSupabase: () => ({ rpc: boundary.rpc }) }));
import { POST as participationPost, GET as participationGet } from "@/app/api/work-participation/route";
import { POST as contextPost } from "@/app/api/work-context/route";
const userId = "11111111-1111-4111-8111-111111111111";
const workId = "22222222-2222-4222-8222-222222222222";
function post(body: unknown, origin = "https://app.strelva.com") {
  return new Request("https://app.strelva.com/api/work-participation", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  boundary.user.mockResolvedValue({ id: userId, email: "owner@example.com", email_confirmed_at: "2026-09-12T12:00:00Z" });
});
afterEach(() => vi.unstubAllEnvs());
describe("work authority API", () => {
  it("fails closed for signed-out, cross-origin and release-disabled requests", async () => {
    const input = { workId, command: { kind: "revoke", expectedRevision: 0, grantId: "grant" } };
    boundary.user.mockResolvedValue(null);
    expect((await participationPost(post(input))).status).toBe(401);
    expect((await contextPost(post(input, "https://foreign.example"))).status).toBe(403);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    expect((await participationGet(new Request(`https://app.strelva.com/api/work-participation?workId=${workId}`))).status).toBe(503);
    expect(boundary.rpc).not.toHaveBeenCalled();
  });
  it("persists a scoped grant and presents the current account's review authority", async () => {
    let payload: unknown = null;
    boundary.rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "read_work_auxiliary") return { data: { work: { id: workId, workspaceId: "workspace", title: "Procedure", revision: "0", payload: { text: "Original" } }, role: "owner", payload }, error: null };
      if (name === "commit_work_auxiliary") { payload = args.p_payload; return { data: null, error: null }; }
      throw new Error("Unexpected database operation");
    });
    const response = await participationPost(post({ workId, command: { kind: "grant", expectedRevision: 0, participantEmail: "editor@example.com", participantKind: "person", scope: ["read", "propose"], purpose: "Check the procedure", expiresAt: new Date(Date.now() + 86400000).toISOString(), budgetMinor: 0, currency: "USD" } }));
    expect(response.status).toBe(200);
    const reopened = await participationGet(new Request(`https://app.strelva.com/api/work-participation?workId=${workId}`));
    expect(await reopened.json()).toMatchObject({ revision: 1, canManage: true, currentActorEmail: "owner@example.com", grants: [{ participantEmail: "editor@example.com", scope: ["read", "propose"] }] });
  });
  it("does not expose a work payload when a grant permits proposing only", async () => {
    boundary.user.mockResolvedValue({ id: userId, email: "guest@example.com", email_confirmed_at: "2026-09-12T12:00:00Z" });
    boundary.rpc.mockResolvedValue({ data: { role: null, work: { id: workId, workspaceId: "workspace", title: "Private", revision: "0", payload: { confidential: "not exposed" } }, payload: { version: 1, revision: 1, grants: [{ id: "grant", participantEmail: "guest@example.com", participantKind: "person", scope: ["propose"], purpose: "Propose hours", expiresAt: new Date(Date.now() + 86400000).toISOString(), budgetMinor: 0, currency: "USD", sponsorId: "owner", createdAt: "2026-09-12T12:00:00Z", status: "active" }], contributions: [], history: [] } }, error: null });
    const response = await participationGet(new Request(`https://app.strelva.com/api/work-participation?workId=${workId}&view=target`));
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("not exposed");
  });
});
