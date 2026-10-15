import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const workspaceId = "61000000-0000-4000-8000-000000000003";
const userId = "61000000-0000-4000-8000-000000000001";
const state = vi.hoisted(() => ({
  user: null as { id: string; email: string; email_confirmed_at: string | null } | null,
  systems: true, receipt: true, role: "owner", error: false, configured: true, arrivals: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: async () => state.user }));
vi.mock("@/platform/systems-release", () => ({ systemsReleasedFor: async () => state.systems }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: async () => false }));
vi.mock("@/platform/workspaces/http", async importOriginal => ({ ...await importOriginal<typeof import("@/platform/workspaces/http")>(), workspaceHttpActor: async () => state.user && ({ userId: state.user.id, verifiedEmail: state.user.email }) }));
vi.mock("@/platform/infra/inquiry-records", () => ({ inquiryRecordsEnabled: () => true }));
vi.mock("@/products/inquiries", () => ({ inquiryReleaseEnabledForWorkspace: async () => true, readSystemArrivals: state.arrivals }));
import { ownerEntryHomesOpen } from "@/platform/owner-entry/linked-sites";
import { GET } from "@/app/api/workspace/system-arrivals/route";
import { setReleaseFlagsDb } from "@/platform/release-flags/store";

const legacyOff = { operator: async () => false, flag: async () => false };
beforeEach(() => {
  vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
  vi.stubEnv("STRELVA_OWNER_ENTRY", "0");
  state.arrivals.mockReset().mockResolvedValue({ workspaceId, items: [] });
  Object.assign(state, { user: { id: userId, email: "owner@example.test", email_confirmed_at: "2026-10-14" }, systems: true, receipt: true, role: "owner", error: false, configured: true });
  state.rpc.mockReset().mockImplementation(async () => ({ data: state.configured ? state.receipt && state.role === "owner" : null, error: state.error ? { message: "unavailable" } : null }));
  setReleaseFlagsDb({ rpc: state.rpc });
});
afterEach(() => { setReleaseFlagsDb(null); vi.unstubAllEnvs(); });

describe("new direct-owner places while retained tenant owner entry is dark", () => {
  it("opens the current verified owner's new business using its atomic signup receipt", async () => {
    expect(await ownerEntryHomesOpen(workspaceId, userId, legacyOff)).toBe(true);
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("read_direct_owner_places_eligibility", { p_workspace_id: workspaceId, p_user_id: userId, p_verified_email: "owner@example.test" });
  });

  it("still opens after this new direct business receives a hosted tenant", async () => {
    // Eligibility uses creation origin rather than the later website link.
    expect(await ownerEntryHomesOpen(workspaceId, userId, legacyOff)).toBe(true);
    expect(state.rpc).toHaveBeenCalledExactlyOnceWith("read_direct_owner_places_eligibility", expect.any(Object));
  });

  it("serves inquiry activity when the same direct owner's inquiry destination opens", async () => {
    const response = await GET(new Request(`https://app.example.test/api/workspace/system-arrivals?workspaceId=${workspaceId}`));
    expect(response.status).toBe(200);
    expect(state.arrivals).toHaveBeenCalledWith({ userId, verifiedEmail: "owner@example.test" }, workspaceId, expect.any(Date), undefined, true);
  });

  it("keeps a converted tenant or older creation with no enrollment receipt closed", async () => {
    state.receipt = false;
    expect(await ownerEntryHomesOpen(workspaceId, userId, legacyOff)).toBe(false);
  });

  it.each(["admin", "member", ""])("does not give %s membership an owner bypass", async (role) => {
    state.role = role;
    expect(await ownerEntryHomesOpen(workspaceId, userId, legacyOff)).toBe(false);
  });

  it("requires the current verified session to match the requested owner", async () => {
    state.user!.email_confirmed_at = null;
    expect(await ownerEntryHomesOpen(workspaceId, userId, legacyOff)).toBe(false);
    state.user!.email_confirmed_at = "2026-10-14";
    expect(await ownerEntryHomesOpen(workspaceId, "61000000-0000-4000-8000-000000000009", legacyOff)).toBe(false);
    state.user = null;
    expect(await ownerEntryHomesOpen(workspaceId, userId, legacyOff)).toBe(false);
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("keeps workspace and Systems kill switches and unreadable storage closed", async () => {
    state.systems = false;
    expect(await ownerEntryHomesOpen(workspaceId, userId, legacyOff)).toBe(false);
    state.systems = true;
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0");
    expect(await ownerEntryHomesOpen(workspaceId, userId, legacyOff)).toBe(false);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    state.error = true;
    expect(await ownerEntryHomesOpen(workspaceId, userId, legacyOff)).toBe(false);
    state.error = false; state.configured = false;
    expect(await ownerEntryHomesOpen(workspaceId, userId, legacyOff)).toBe(false);
  });
});
