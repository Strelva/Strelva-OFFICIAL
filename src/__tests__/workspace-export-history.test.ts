import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readOwnerExportHistory } from "@/platform/workspace-exports/owner-access";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), db: vi.fn(), rpc: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: mocks.db }));
vi.mock("@/platform/workspaces/http", async original => ({ ...await original<typeof import("@/platform/workspaces/http")>(), workspaceHttpActor: mocks.actor }));
const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.test" };
const workspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const row = { buildId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", workspaceId, status: "ready", createdAt: "2026-10-12T12:00:00Z", expiresAt: "2026-10-19T12:00:00Z" };
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_EXPORT_SCHEMA_3", "1");
  mocks.actor.mockResolvedValue(actor); mocks.db.mockReturnValue({ rpc: mocks.rpc }); mocks.rpc.mockResolvedValue({ data: [row], error: null });
});
afterEach(() => vi.unstubAllEnvs());

describe("owner export history", () => {
  it("passes current actor and workspace authority and exposes only safe history metadata", async () => {
    mocks.rpc.mockResolvedValue({ data: [{ ...row, downloadTokenHash: "secret", deliverTo: "private@example.test", failure: "internal", manifest: {} }], error: null });
    expect(await readOwnerExportHistory(actor, workspaceId)).toEqual([row]);
    expect(mocks.rpc).toHaveBeenCalledWith("list_workspace_export_owner_builds", { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
  });
  it("fails closed for revoked authority, storage failure, invalid rows and cross-workspace results", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "workspace_export_denied" } });
    await expect(readOwnerExportHistory(actor, workspaceId)).rejects.toMatchObject({ code: "denied" });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "private storage failure" } });
    await expect(readOwnerExportHistory(actor, workspaceId)).rejects.toMatchObject({ code: "unavailable" });
    for (const data of [null, [{ ...row, workspaceId: actor.userId }], [{ ...row, expiresAt: null }], [{ ...row, status: "unknown" }]]) {
      mocks.rpc.mockResolvedValueOnce({ data, error: null });
      await expect(readOwnerExportHistory(actor, workspaceId)).rejects.toMatchObject({ code: "unavailable" });
    }
  });
  it("returns an empty authorized history without inventing an export", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await readOwnerExportHistory(actor, workspaceId)).toEqual([]);
  });
});

describe("history HTTP boundary", () => {
  const request = () => new Request(`https://strelva.test/api/workspace-export/v3/history?workspaceId=${workspaceId}`);
  it("returns workspace-scoped metadata with private no-store headers", async () => {
    const route = await import("@/app/api/workspace-export/v3/history/route");
    const response = await route.GET(request());
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ exports: [row] });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });
  it("keeps release gates and confirmed sign-in ahead of storage", async () => {
    const route = await import("@/app/api/workspace-export/v3/history/route");
    vi.stubEnv("STRELVA_EXPORT_SCHEMA_3", "0"); expect((await route.GET(request())).status).toBe(503);
    expect(mocks.actor).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_EXPORT_SCHEMA_3", "1"); vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "0"); expect((await route.GET(request())).status).toBe(503);
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); mocks.actor.mockResolvedValue(null); expect((await route.GET(request())).status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("distinguishes denial from unreadable history, with no private error details", async () => {
    const route = await import("@/app/api/workspace-export/v3/history/route");
    expect((await route.GET(new Request("https://strelva.test/api/workspace-export/v3/history?workspaceId=bad"))).status).toBe(404);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "workspace_export_denied" } }); expect((await route.GET(request())).status).toBe(403);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "private database failure" } });
    const response = await route.GET(request()); expect(response.status).toBe(503); expect(await response.text()).not.toContain("private database failure");
  });
});
