import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc: mocks.rpc }) }));

import { createAgencyWorkspace } from "@/platform/workspaces/repository";
import { WorkspaceStoreError } from "@/platform/workspaces/types";

const actor = { userId: "5a000000-0000-4000-8000-000000000001", verifiedEmail: "Owner@Northside.example" };
const row = { id: "5a000000-0000-4000-8000-000000000010", kind: "agency", name: "Northside", created_by: actor.userId };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "workspace");
  mocks.rpc.mockResolvedValue({ data: [row], error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("agency signup Systems enrollment", () => {
  it.each(["workspace", "1"])("enrolls atomically when the global release is %s", async (mode) => {
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", mode);
    expect(await createAgencyWorkspace(actor, " Northside ")).toMatchObject({ id: row.id, kind: "agency", role: "owner", access: "member" });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("create_agency_workspace", {
      p_user_id: actor.userId, p_verified_email: "owner@northside.example", p_name: "Northside", p_systems_enabled: true,
    });
  });

  it.each([undefined, "0", "on", "true", "WORKSPACE"])("fails closed for global Systems value %s", async (mode) => {
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", mode);
    await createAgencyWorkspace(actor, "Northside");
    expect(mocks.rpc).toHaveBeenCalledWith("create_agency_workspace", expect.objectContaining({ p_systems_enabled: false }));
  });

  it("does not enroll while the workspace release is off", async () => {
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    await createAgencyWorkspace(actor, "Northside");
    expect(mocks.rpc).toHaveBeenCalledWith("create_agency_workspace", expect.objectContaining({ p_systems_enabled: false }));
  });

  it("takes enrollment only from server configuration", async () => {
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "0");
    const clientSetting = { ...actor, p_systems_enabled: true, systems: true };
    await createAgencyWorkspace(clientSetting, "Northside");
    expect(mocks.rpc).toHaveBeenCalledWith("create_agency_workspace", expect.objectContaining({ p_systems_enabled: false }));
  });

  it("fails the signup if atomic enrollment or its migration is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "release history unavailable" } });
    await expect(createAgencyWorkspace(actor, "Northside")).rejects.toBeInstanceOf(WorkspaceStoreError);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("refuses a missing creation result", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    await expect(createAgencyWorkspace(actor, "Northside")).rejects.toBeInstanceOf(WorkspaceStoreError);
  });
});
