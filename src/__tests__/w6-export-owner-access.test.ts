import { beforeEach, describe, expect, it, vi } from "vitest";
import { readOwnerExportBody, readOwnerExportStatus } from "@/platform/workspace-exports/owner-access";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), status: vi.fn(), body: vi.fn() }));
vi.mock("@/platform/workspaces/http", async original => ({ ...await original<typeof import("@/platform/workspaces/http")>(), workspaceHttpActor: mocks.actor }));
const actor = { userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", verifiedEmail: "owner@example.test" };
const buildId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_EXPORT_SCHEMA_3", "1"); mocks.actor.mockResolvedValue(actor); });

describe("owner download without email", () => {
  it("reads every part under current owner authority", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { body: '{"a":', partCount: 2 }, error: null }).mockResolvedValueOnce({ data: { body: '1}', partCount: 2 }, error: null });
    expect(await readOwnerExportBody(actor, buildId, rpc)).toBe('{"a":1}');
    expect(rpc.mock.calls.map(call => call[1].p_part)).toEqual([0, 1]);
    expect(rpc).toHaveBeenCalledWith("read_workspace_export_owner_part", expect.objectContaining({ p_user_id: actor.userId, p_verified_email: actor.verifiedEmail }));
  });
  it("fails closed after a revoked second part or malformed status", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { body: "partial", partCount: 2 }, error: null }).mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    await expect(readOwnerExportBody(actor, buildId, rpc)).rejects.toThrow("unavailable to this owner");
    await expect(readOwnerExportStatus(actor, buildId, vi.fn().mockResolvedValue({ data: { status: "unexpected" }, error: null }))).rejects.toThrow();
  });
  it("projects ready and stalled status without private failure details", async () => {
    expect(await readOwnerExportStatus(actor, buildId, vi.fn().mockResolvedValue({ data: { status: "stalled", failure: "private", manifest: {} }, error: null }))).toEqual({ status: "stalled" });
  });
});

describe("owner export HTTP gates", () => {
  it("keeps both new read routes unavailable while the flag is off", async () => {
    vi.stubEnv("STRELVA_EXPORT_SCHEMA_3", "0");
    const status = await import("@/app/api/workspace-export/v3/status/route");
    const download = await import("@/app/api/workspace-export/v3/owner-download/route");
    expect((await status.GET(new Request(`https://strelva.test/api/workspace-export/v3/status?build=${buildId}`))).status).toBe(503);
    expect((await download.GET(new Request(`https://strelva.test/api/workspace-export/v3/owner-download?build=${buildId}`))).status).toBe(503);
    expect(mocks.actor).not.toHaveBeenCalled();
  });
  it("denies unconfirmed sessions before reading an archive", async () => {
    mocks.actor.mockResolvedValue(null);
    const status = await import("@/app/api/workspace-export/v3/status/route");
    const download = await import("@/app/api/workspace-export/v3/owner-download/route");
    expect((await status.GET(new Request(`https://strelva.test/api/workspace-export/v3/status?build=${buildId}`))).status).toBe(401);
    expect((await download.GET(new Request(`https://strelva.test/api/workspace-export/v3/owner-download?build=${buildId}`))).status).toBe(401);
  });
});
