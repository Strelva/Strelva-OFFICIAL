import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setReleaseFlagsDb } from "@/platform/release-flags/store";
import { connectedSitesReleasedFor } from "@/products/connected-sites/server";

const { isSuperAdminUser } = vi.hoisted(() => ({ isSuperAdminUser: vi.fn() }));
vi.mock("@/platform/infra/db/repositories", () => ({ isSuperAdminUser }));

const workspaceId = "77000000-0000-4000-8000-000000000002";
const actor = { userId: "77000000-0000-4000-8000-000000000001" };

function flags(connected: "operators" | "off" = "operators", testers: string[] = []) {
  const rpc = vi.fn(async () => ({ data: {
    workspaceId,
    flags: {
      connected_sites: { state: connected, revision: 1, changedAt: "2026-10-07T00:00:00Z" },
      systems: { state: "operators", revision: 1, changedAt: "2026-10-07T00:00:00Z" },
    },
    testers,
  }, error: null }));
  setReleaseFlagsDb({ rpc });
  return rpc;
}

beforeEach(() => {
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "workspace");
  vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "workspace");
  isSuperAdminUser.mockReset().mockResolvedValue(false);
});
afterEach(() => {
  setReleaseFlagsDb(null);
  vi.unstubAllEnvs();
});

describe("connected-site per-business release viewer", () => {
  it("opens operator-only connected sites and Systems for a real operator", async () => {
    flags();
    isSuperAdminUser.mockResolvedValue(true);
    expect(await connectedSitesReleasedFor(actor, workspaceId)).toBe(true);
    expect(isSuperAdminUser).toHaveBeenCalledWith(actor.userId);
  });

  it("keeps an ordinary member out of operator-only rows", async () => {
    flags();
    expect(await connectedSitesReleasedFor(actor, workspaceId)).toBe(false);
  });

  it("opens both rows for the business's named tester", async () => {
    flags("operators", [actor.userId]);
    expect(await connectedSitesReleasedFor(actor, workspaceId)).toBe(true);
  });

  it("never widens an explicit off row, even for an operator", async () => {
    flags("off");
    isSuperAdminUser.mockResolvedValue(true);
    expect(await connectedSitesReleasedFor(actor, workspaceId)).toBe(false);
  });

  it("fails closed when operator authority cannot be read", async () => {
    flags();
    isSuperAdminUser.mockRejectedValue(new Error("Authority unavailable"));
    expect(await connectedSitesReleasedFor(actor, workspaceId)).toBe(false);
  });

  it("reads neither authority nor flag storage with the release off", async () => {
    const rpc = flags();
    vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "0");
    expect(await connectedSitesReleasedFor(actor, workspaceId)).toBe(false);
    expect(isSuperAdminUser).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
