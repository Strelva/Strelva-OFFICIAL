import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn(), from: vi.fn(), user: vi.fn(), scope: vi.fn(), rpc: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: mocks.db }));
vi.mock("@/platform/system-versions/supabase-store", () => ({ readVersionActor: mocks.scope }));
import { captureActionActor, personActor } from "@/platform/presentation/actor-server";

const actor = { userId: "83000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const workspaceId = "83000000-0000-4000-8000-000000000002";
function query(data: unknown, error: unknown = null) {
  const value = { data, error };
  const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(async () => value), then: (resolve: (value: unknown) => unknown) => Promise.resolve(value).then(resolve) };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain);
  return chain;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.scope.mockResolvedValue({ userId: actor.userId, memberships: [{ businessId: workspaceId, role: "owner", via: "membership" }] });
  mocks.db.mockReturnValue({ from: mocks.from, rpc: mocks.rpc, auth: { admin: { getUserById: mocks.user } } });
});
describe("recording the actor at the action", () => {
  it("resolves the stored principal's name, never its UUID or email", async () => {
    mocks.user.mockResolvedValue({ data: { user: { id: actor.userId, user_metadata: { full_name: "Sheri" } } }, error: null });
    expect(await personActor(actor.userId)).toEqual({ kind: "person", displayName: "Sheri" });
    expect(mocks.user).toHaveBeenCalledWith(actor.userId);
    mocks.user.mockResolvedValue({ data: { user: { id: actor.userId, email: actor.verifiedEmail, user_metadata: {} } }, error: null });
    expect(await personActor(actor.userId)).toBeNull();
  });
  it("captures the actual staffed agency through checked RPCs and retains its action-time name", async () => {
    mocks.scope.mockResolvedValue({ userId: actor.userId, memberships: [
      { businessId: workspaceId, role: "admin", via: "provider_seat" },
      { businessId: "north-studio", role: "member", via: "membership" },
    ] });
    mocks.from.mockReturnValueOnce(query({ kind: "agency" })).mockReturnValueOnce(query({ name: "North Studio", agency_brand: null }));
    mocks.rpc.mockResolvedValue({ data: [{ customerWorkspaceId: workspaceId, staff: [{ userId: actor.userId }] }], error: null });
    const snapshot = await captureActionActor(actor, workspaceId);
    expect(snapshot).toEqual({ kind: "agency", displayName: "North Studio" });
    expect(mocks.rpc).toHaveBeenCalledWith("read_agency_provider_seats", {
      p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_agency_workspace_id: "north-studio",
    });
    expect(mocks.from).not.toHaveBeenCalledWith("agency_client_staff");
    expect(mocks.user).not.toHaveBeenCalled();
    mocks.from.mockReturnValue(query({ name: "Another agency" }));
    expect(snapshot).toEqual({ kind: "agency", displayName: "North Studio" });
  });
  it("keeps a direct business member a person rather than guessing their agency", async () => {
    mocks.from.mockReturnValue(query({ kind: "customer" }));
    mocks.user.mockResolvedValue({ data: { user: { id: actor.userId, user_metadata: { name: "Sheri" } } }, error: null });
    expect(await captureActionActor(actor, workspaceId)).toEqual({ kind: "person", displayName: "Sheri" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("keeps multiple staffed agencies and unavailable identities unknown", async () => {
    mocks.scope.mockResolvedValue({ userId: actor.userId, memberships: [
      { businessId: workspaceId, role: "admin", via: "provider_seat" },
      ...["north", "south"].map(businessId => ({ businessId, role: "member", via: "membership" })),
    ] });
    mocks.from.mockReturnValue(query({ kind: "agency" }));
    mocks.rpc.mockResolvedValue({ data: [{ customerWorkspaceId: workspaceId, staff: [{ userId: actor.userId }] }], error: null });
    expect(await captureActionActor(actor, workspaceId)).toBeNull();
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect(await captureActionActor(actor, workspaceId)).toBeNull();
    mocks.scope.mockRejectedValue(new Error("unavailable"));
    expect(await captureActionActor(actor, workspaceId)).toBeNull();
    mocks.db.mockReturnValue(null);
    expect(await captureActionActor(actor, workspaceId)).toBeNull();
    expect(await personActor(actor.userId)).toBeNull();
  });
});
