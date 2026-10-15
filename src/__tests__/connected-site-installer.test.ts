import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), getSupabase: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: mocks.getSupabase }));
import { resolveConnectedSiteInstaller } from "@/products/connected-sites/installer";

const business = "bc120000-0000-4000-8000-000000000011";
const agency = "bc120000-0000-4000-8000-000000000012";
const actor = { userId: "bc120000-0000-4000-8000-000000000001", verifiedEmail: " Owner@Example.test " };

describe("connected-site installer identity", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.getSupabase.mockReturnValue({ rpc: mocks.rpc }); });

  it.each([{ kind: "business", workspaceId: business }, { kind: "agency", workspaceId: agency }])("uses SQL-verified $kind holder", async holder => {
    mocks.rpc.mockResolvedValue({ data: holder, error: null });
    await expect(resolveConnectedSiteInstaller(actor, business)).resolves.toEqual(holder);
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("read_connected_site_installer", {
      p_workspace_id: business, p_user_id: actor.userId, p_verified_email: "owner@example.test",
    });
  });

  it("preserves authority refusal from absent, ambiguous or revoked grants", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "workspace_access_denied" } });
    await expect(resolveConnectedSiteInstaller(actor, business)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it.each([null, {}, { kind: "unknown" }, { kind: "platform" }, { kind: "agency", workspaceId: "bad" }])("fails closed for malformed or inferred holder %j", async data => {
    mocks.rpc.mockResolvedValue({ data, error: null });
    await expect(resolveConnectedSiteInstaller(actor, business)).rejects.toBeInstanceOf(WorkspaceStoreError);
  });

  it("rejects a sibling business holder", async () => {
    mocks.rpc.mockResolvedValue({ data: { kind: "business", workspaceId: agency }, error: null });
    await expect(resolveConnectedSiteInstaller(actor, business)).rejects.toBeInstanceOf(WorkspaceAccessError);
  });

  it("does not expose provider or database errors", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "private database detail" } });
    await expect(resolveConnectedSiteInstaller(actor, business)).rejects.toThrow("The connected-site installer could not be confirmed.");
  });

  it("refuses absent persistence", async () => {
    mocks.getSupabase.mockReturnValue(null);
    await expect(resolveConnectedSiteInstaller(actor, business)).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("refuses malformed actor or business identifiers before the RPC", async () => {
    await expect(resolveConnectedSiteInstaller(actor, "bad")).rejects.toThrow();
    await expect(resolveConnectedSiteInstaller({ ...actor, verifiedEmail: "bad" }, business)).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
