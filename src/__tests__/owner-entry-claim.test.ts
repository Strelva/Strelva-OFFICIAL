import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), resolve: vi.fn(), claim: vi.fn() }));
vi.mock("react", () => ({ cache: (fn: unknown) => fn }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/release-flags/store", () => ({ resolveTenantOwnerEntry: mocks.resolve, workspaceReleaseFlagEnabled: vi.fn() }));
vi.mock("@/platform/workspaces/business-ownership", () => ({ claimPendingBusinessOwner: mocks.claim }));
import { ownerEntryForTenant } from "@/platform/owner-entry/server";

const WS = "7f000000-0000-4000-8000-000000000010";
const user = { id: "7f000000-0000-4000-8000-000000000002", email: "owner@example.test", email_confirmed_at: "2026-10-07T00:00:00Z" };
const resolution = { workspaceId: WS, tenantStableId: null, ownerEntry: "on", role: null, operator: false, tester: false };
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_OWNER_ENTRY", "1");
  vi.stubEnv("STRELVA_OWNER_INVITATION_CLAIM", "1");
  mocks.session.mockResolvedValue(user);
  mocks.claim.mockResolvedValue(WS);
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("verified owner invitation claim on tenant entry", () => {
  it.each([null, "member", "admin"])("claims a pending invitation for an existing %s role", async role => {
    mocks.resolve.mockResolvedValueOnce({ ...resolution, role }).mockResolvedValueOnce({ ...resolution, role: "owner" });
    expect(await ownerEntryForTenant("fictional")).toMatchObject({ kind: "workspace", workspaceId: WS });
    expect(mocks.claim).toHaveBeenCalledWith({ userId: user.id, verifiedEmail: user.email }, "fictional");
    expect(mocks.resolve).toHaveBeenCalledTimes(2);
  });
  it("keeps ordinary membership when no invitation is pending", async () => {
    mocks.resolve.mockResolvedValue({ ...resolution, role: "member" });
    mocks.claim.mockResolvedValue(null);
    expect(await ownerEntryForTenant("fictional")).toMatchObject({ kind: "workspace" });
    expect(mocks.resolve).toHaveBeenCalledOnce();
  });
  it.each(["STRELVA_OWNER_ENTRY", "STRELVA_OWNER_INVITATION_CLAIM"])("%s off never claims", async flag => {
    vi.stubEnv(flag, "0");
    mocks.resolve.mockResolvedValue({ ...resolution, role: "member" });
    await ownerEntryForTenant("fictional");
    expect(mocks.claim).not.toHaveBeenCalled();
    if (flag === "STRELVA_OWNER_ENTRY") expect(mocks.session).not.toHaveBeenCalled();
  });
  it.each([{ ...resolution, role: "owner" }, { ...resolution, ownerEntry: "off" }, { ...resolution, workspaceId: null }])("never claims outside eligible entry", async entry => {
    mocks.resolve.mockResolvedValue(entry);
    await ownerEntryForTenant("fictional");
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("never claims for an unverified identity", async () => {
    mocks.session.mockResolvedValue({ ...user, email_confirmed_at: null });
    expect(await ownerEntryForTenant("fictional")).toEqual({ kind: "dashboard", reason: "signed_out" });
    expect(mocks.resolve).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("claim storage failure keeps the legacy surface", async () => {
    mocks.resolve.mockResolvedValue({ ...resolution, role: "admin" });
    mocks.claim.mockRejectedValue(new Error("local storage down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await ownerEntryForTenant("fictional")).toEqual({ kind: "dashboard", reason: "unavailable" });
  });
});
