import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn(), redis: vi.fn(), read: vi.fn(), get: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: mocks.db }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: mocks.redis }));
vi.mock("@/lib/client-records", () => ({ readRecord: mocks.read }));
import { calendlyConnectionSource } from "@/app/api/oauth/calendly/connection-source";
import { instagramConnectionSource } from "@/app/api/oauth/instagram/connection-source";

const workspaceId = "c1000000-0000-4000-8000-000000000001";
const stableId = "c1000000-0000-4000-8000-000000000002";
const access = { provider: "calendly", through: { kind: "platform" }, approval: "not_required" } as const;
const from = vi.fn();
beforeEach(() => {
  vi.resetAllMocks(); mocks.db.mockReturnValue({ from }); mocks.redis.mockReturnValue({ get: mocks.get });
  from.mockImplementation(table => {
    const result = table === "tenant_workspace_links" ? { data: [{ tenant_stable_id: stableId }], error: null } : { data: [{ id: "current-slug", stable_id: stableId, site_name: "Harbor Dental" }], error: null };
    return { select: vi.fn(() => ({ eq: vi.fn(async () => result), in: vi.fn(async () => result) })) };
  });
  mocks.read.mockImplementation((_store, _tenant, _provider, fallback) => fallback());
  mocks.get.mockResolvedValue({ tenantId: "current-slug", provider: "calendly", status: "connected", accessToken: "secret-canary", lastSyncedAt: "2026-10-14T00:00:00Z" });
});

describe("tenant OAuth ConnectionSources", () => {
  it("reads only currently linked stable tenants and returns no token or inferred holder", async () => {
    const rows = await calendlyConnectionSource.list({ workspaceId, access });
    expect(rows).toEqual([{ ref: `calendly:${stableId}`, provider: "calendly", workspaceId, accountLabel: "Calendly · Harbor Dental", accountHolder: { kind: "unknown" }, accessThrough: { kind: "unknown" }, state: "connected", unavailableReason: null, connectedAt: null, systemIds: [] }]);
    expect(mocks.get).toHaveBeenCalledWith("connections:current-slug:calendly");
    expect(JSON.stringify(rows)).not.toContain("secret-canary");
    expect(JSON.stringify(rows)).not.toContain("lastSyncedAt");
  });
  it.each(["error", "needs_reauth", "disconnected"])("maps stored %s honestly", async status => {
    mocks.get.mockResolvedValue({ tenantId: "current-slug", provider: "calendly", status });
    expect((await calendlyConnectionSource.list({ workspaceId, access }))[0]?.state).toBe(status === "disconnected" ? "disconnected" : "stale");
  });
  it.each(["2000-01-01T00:00:00Z", "invalid"])("marks expired or invalid expiry %s stale", async expiresAt => {
    mocks.get.mockResolvedValue({ tenantId: "current-slug", provider: "calendly", status: "connected", expiresAt });
    expect((await calendlyConnectionSource.list({ workspaceId, access }))[0]?.state).toBe("stale");
  });
  it("reads Instagram from its own provider key", async () => {
    mocks.get.mockResolvedValue({ tenantId: "current-slug", provider: "instagram", status: "connected" });
    const rows = await instagramConnectionSource.list({ workspaceId, access: { ...access, provider: "instagram" } });
    expect(rows[0]?.ref).toBe(`instagram:${stableId}`);
    expect(mocks.get).toHaveBeenCalledWith("connections:current-slug:instagram");
  });
  it("does not manufacture a row when there is no connected account", async () => {
    mocks.get.mockResolvedValue(null);
    expect(await calendlyConnectionSource.list({ workspaceId, access })).toEqual([]);
  });
  it("does not read tokens when there are no links", async () => {
    from.mockReturnValue({ select: () => ({ eq: async () => ({ data: [], error: null }) }) });
    expect(await calendlyConnectionSource.list({ workspaceId, access })).toEqual([]);
    expect(mocks.get).not.toHaveBeenCalled();
  });
  it("rejects a cross-tenant payload", async () => {
    mocks.get.mockResolvedValue({ tenantId: "foreign-tenant", provider: "calendly", status: "connected" });
    await expect(calendlyConnectionSource.list({ workspaceId, access })).rejects.toThrow("identity");
  });
  it("surfaces storage failures instead of claiming an empty source", async () => {
    mocks.redis.mockReturnValue(null);
    await expect(calendlyConnectionSource.list({ workspaceId, access })).rejects.toThrow("unavailable");
    mocks.db.mockReturnValue(null);
    await expect(calendlyConnectionSource.list({ workspaceId, access })).rejects.toThrow("unavailable");
  });
});
