import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const mocks = vi.hoisted(() => ({ user: vi.fn(), release: vi.fn(), enabled: vi.fn(), history: vi.fn() }));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: mocks.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/products/documents/server", () => ({ documentHistoryEnabled: mocks.enabled, readWorkspaceDocumentHistory: mocks.history }));
import { GET } from "@/app/api/documents/history/route";

const workId = "33333333-3333-4333-8333-333333333333";
const user = { id: "owner", email: "Owner@example.com", email_confirmed_at: "2026-10-06" };
const request = (cursor = "") => new Request(`https://app.strelva.com/api/documents/history?workId=${workId}${cursor}`);
beforeEach(() => { vi.resetAllMocks(); mocks.release.mockReturnValue(true); mocks.enabled.mockReturnValue(true); mocks.user.mockResolvedValue(user); });

describe("document history read boundary", () => {
  it.each(["workspace", "history"])("does no private work with %s release off", async flag => {
    (flag === "workspace" ? mocks.release : mocks.enabled).mockReturnValue(false);
    expect((await GET(request())).status).toBe(503);
    expect(mocks.user).not.toHaveBeenCalled(); expect(mocks.history).not.toHaveBeenCalled();
  });
  it.each([null, { id: "owner", email: user.email }])("requires verified sign-in", async actor => {
    mocks.user.mockResolvedValue(actor);
    expect((await GET(request())).status).toBe(401); expect(mocks.history).not.toHaveBeenCalled();
  });
  it.each(["0", "-1", "1.5", "2147483648", "bad", ""])("rejects invalid cursor %s", async cursor => {
    expect((await GET(request(`&beforeRevision=${cursor}`))).status).toBe(400); expect(mocks.history).not.toHaveBeenCalled();
  });
  it("passes only normalized actor identity and a bounded cursor, with private cache headers", async () => {
    const page = { workId, workspaceId: "workspace", receipts: [], nextBeforeRevision: null };
    mocks.history.mockResolvedValue(page);
    const response = await GET(request("&beforeRevision=981"));
    expect(response.status).toBe(200); expect(await response.json()).toEqual(page);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.history).toHaveBeenCalledWith({ userId: "owner", verifiedEmail: "owner@example.com" }, workId, 981);
  });
  it("denies foreign documents without exposing database details", async () => {
    mocks.history.mockRejectedValue(new WorkspaceAccessError("other business"));
    const response = await GET(request());
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: "This document is unavailable to your account." });
  });
  it("offers retry when persistence fails", async () => {
    mocks.history.mockRejectedValue(new Error("database details"));
    const response = await GET(request());
    expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "Document history is unavailable. Try again." });
  });
});
