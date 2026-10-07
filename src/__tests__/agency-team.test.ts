import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { agencyTeamFixture, TEAM_AGENCY, TEAM_CLIENT, TEAM_OWNER, TEAM_STAFF } from "@/experience/workspace/preview/agency-team-fixture";

const deps = vi.hoisted(() => ({
  user: { id: "f1000000-0000-4000-8000-000000000001", email: "Owner@Agency.example.test", email_confirmed_at: "2026-10-07" } as null | { id: string; email: string; email_confirmed_at: string },
  rpc: vi.fn(), invite: vi.fn(), revoke: vi.fn(), released: vi.fn(), limited: vi.fn(), enabled: true,
}));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: deps.rpc }) }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: async () => deps.user }));
vi.mock("@/platform/workspaces/invitations", () => ({ createWorkspaceInvitation: deps.invite, revokeWorkspaceInvitation: deps.revoke }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => deps.enabled }));
vi.mock("@/platform/systems-release", () => ({ systemsReleaseMayBeOn: () => deps.enabled, systemsReleasedFor: deps.released }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: deps.limited }));
import { GET, POST } from "@/app/api/workspace/agency-team/route";
import { readAgencyTeam } from "@/experience/workspace/agency-team-server";
const ORIGIN = "http://localhost:3000";
const get = () => GET(new Request(`${ORIGIN}/api/workspace/agency-team?workspaceId=${TEAM_AGENCY}`));
const assign = { action: "assign", workspaceId: TEAM_AGENCY, userIds: [TEAM_STAFF], clientIds: [TEAM_CLIENT], active: true };
const send = (body: unknown = assign, headers: Record<string, string> = {}) => POST(new Request(`${ORIGIN}/api/workspace/agency-team`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));

beforeEach(() => {
  deps.user = { id: TEAM_OWNER, email: "Owner@Agency.example.test", email_confirmed_at: "2026-10-07" };
  deps.enabled = true; deps.released.mockReset().mockResolvedValue(true); deps.limited.mockReset().mockResolvedValue(false);
  deps.rpc.mockReset().mockImplementation(async (name) => ({ data: name === "read_agency_team" ? agencyTeamFixture()
    : name === "bulk_set_agency_client_staff" ? { results: [{ agencyWorkspaceId: TEAM_AGENCY, customerWorkspaceId: TEAM_CLIENT, userId: TEAM_STAFF, active: true, changed: true }] } : { ok: true }, error: null }));
  deps.invite.mockReset().mockResolvedValue({ token: "a".repeat(43), invitation: {} }); deps.revoke.mockReset().mockResolvedValue("revoked");
});

describe("agency Team route and RPC boundary", () => {
  it("reads with trusted actor and private cache headers", async () => {
    const response = await get();
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(deps.rpc).toHaveBeenCalledWith("read_agency_team", { p_user_id: TEAM_OWNER, p_verified_email: "owner@agency.example.test", p_agency_workspace_id: TEAM_AGENCY });
  });
  it("uses one atomic bulk RPC rather than writing staff rows", async () => {
    expect((await send()).status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledTimes(1);
    expect(deps.rpc).toHaveBeenCalledWith("bulk_set_agency_client_staff", { p_user_id: TEAM_OWNER, p_verified_email: "owner@agency.example.test", p_agency_workspace_id: TEAM_AGENCY, p_staff_user_ids: [TEAM_STAFF], p_workspace_ids: [TEAM_CLIENT], p_active: true });
  });
  it("maps member assignment and other-agency reads to 403 without SQL details", async () => {
    deps.rpc.mockResolvedValue({ data: null, error: { message: "agency_client_staff_access_denied" } });
    expect((await send()).status).toBe(403);
    deps.rpc.mockResolvedValue({ data: null, error: { message: "agency_team_access_denied" } });
    const response = await get(); expect(response.status).toBe(403); expect(await response.text()).not.toContain("agency_team_access_denied");
  });
  it("protects owners and maps vanished seats to conflicts", async () => {
    for (const message of ["agency_team_member_protected", "provider_seat_required"]) {
      deps.rpc.mockResolvedValueOnce({ data: null, error: { message } });
      expect((await send()).status).toBe(409);
    }
  });
  it("sets agency role or removes membership through the controlled function", async () => {
    await send({ action: "set_role", workspaceId: TEAM_AGENCY, userId: TEAM_STAFF, role: "admin" });
    expect(deps.rpc).toHaveBeenLastCalledWith("manage_agency_team_member", expect.objectContaining({ p_staff_user_id: TEAM_STAFF, p_role: "admin" }));
    await send({ action: "remove", workspaceId: TEAM_AGENCY, userId: TEAM_STAFF });
    expect(deps.rpc).toHaveBeenLastCalledWith("manage_agency_team_member", expect.objectContaining({ p_role: null }));
  });
  it("uses existing invitations and refuses owner elevation or nonmanager invitations", async () => {
    const body = { action: "invite", workspaceId: TEAM_AGENCY, recipientEmail: "Sam@Example.test", role: "member" };
    expect((await send(body)).status).toBe(200);
    expect(deps.invite).toHaveBeenCalledWith({ userId: TEAM_OWNER, verifiedEmail: "owner@agency.example.test" }, { workspaceId: TEAM_AGENCY, recipientEmail: "sam@example.test", role: "member" });
    expect((await send({ ...body, role: "owner" })).status).toBe(400);
    deps.rpc.mockResolvedValue({ data: { ...agencyTeamFixture(), canManage: false }, error: null });
    expect((await send(body)).status).toBe(403); expect(deps.invite).toHaveBeenCalledTimes(1);
  });
  it("refuses invitation IDs outside this agency", async () => {
    expect((await send({ action: "revoke_invitation", workspaceId: TEAM_AGENCY, invitationId: TEAM_CLIENT })).status).toBe(403);
    expect(deps.revoke).not.toHaveBeenCalled();
  });
  it("rechecks workspace flags for reads and writes", async () => {
    deps.released.mockResolvedValue(false);
    expect((await get()).status).toBe(503); expect((await send()).status).toBe(503); expect(deps.rpc).not.toHaveBeenCalled();
    deps.enabled = false; expect((await get()).status).toBe(503);
  });
  it("refuses signed-out, cross-origin, wrong content, rate-limited and untrusted fields", async () => {
    expect((await send(assign, { origin: "https://evil.test" })).status).toBe(403);
    expect((await send(assign, { "content-type": "text/plain" })).status).toBe(415);
    expect((await send({ ...assign, actorId: TEAM_STAFF })).status).toBe(400);
    expect((await send({ ...assign, userIds: [] })).status).toBe(400);
    deps.limited.mockResolvedValue(true); expect((await send()).status).toBe(429);
    deps.user = null; expect((await get()).status).toBe(401); expect((await send()).status).toBe(401);
    expect(deps.rpc).not.toHaveBeenCalled();
  });
  it("fails closed on malformed or another actor/agency responses and storage failures", async () => {
    const actor = { userId: TEAM_OWNER, verifiedEmail: "owner@agency.example.test" };
    for (const data of [{}, { ...agencyTeamFixture(), agencyWorkspaceId: TEAM_CLIENT }, { ...agencyTeamFixture(), actorUserId: TEAM_STAFF }]) {
      deps.rpc.mockResolvedValueOnce({ data, error: null });
      await expect(readAgencyTeam(actor, TEAM_AGENCY)).rejects.toBeInstanceOf(WorkspaceStoreError);
    }
    deps.rpc.mockResolvedValueOnce({ data: null, error: { message: "agency_team_access_denied" } });
    await expect(readAgencyTeam(actor, TEAM_AGENCY)).rejects.toBeInstanceOf(WorkspaceAccessError);
    deps.rpc.mockResolvedValue({ data: null, error: { message: "private database detail" } });
    const response = await send(); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private database detail");
  });
  it("does not confirm empty, duplicate or foreign assignment receipts", async () => {
    const row = { agencyWorkspaceId: TEAM_AGENCY, customerWorkspaceId: TEAM_CLIENT, userId: TEAM_STAFF, active: true, changed: true };
    for (const data of [null, { results: [] }, { results: [row, row] }, { results: [{ ...row, userId: TEAM_OWNER }] }]) {
      deps.rpc.mockResolvedValueOnce({ data, error: null });
      expect((await send()).status).toBe(503);
    }
  });
});
