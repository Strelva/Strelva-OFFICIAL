import { beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceAccessError } from "@/platform/workspaces/types";

const state = vi.hoisted(() => ({ release: true, actor: null as null | { userId: string; verifiedEmail: string }, read: vi.fn(), render: vi.fn(), archive: vi.fn() }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => state.release }));
vi.mock("@/lib/db/server-client", () => ({ getSessionUser: () => state.actor ? { id: state.actor.userId, email: state.actor.verifiedEmail, email_confirmed_at: "2026-09-20" } : null }));
vi.mock("@/products/websites/server", () => ({ readWebsite: state.read, renderWebsiteCandidate: state.render, exportWebsiteCandidate: state.archive, WebsiteCandidateMismatchError: class extends Error {} }));
import { GET as preview } from "@/app/api/websites/[workId]/preview/route";
import { GET as download } from "@/app/api/websites/[workId]/export/route";
const workId = "12345678-1234-4234-8234-123456789abc";
const context = { params: Promise.resolve({ workId }) };
const request = () => new Request(`https://strelva.test/api/websites/${workId}/preview?revision=1&contentHash=${"a".repeat(64)}`);
beforeEach(() => {
  state.release = true; state.actor = { userId: "owner", verifiedEmail: "owner@example.test" };
  state.read.mockReset().mockResolvedValue({ workId });
  state.render.mockReset().mockReturnValue("<!doctype html><h1>Private business</h1>");
  state.archive.mockReset().mockReturnValue(new Uint8Array([1, 2, 3]));
});
describe("private website artifact HTTP boundary", () => {
  it("requires a verified identity and current release before reading", async () => {
    state.actor = null;
    expect((await preview(request(), context)).status).toBe(401);
    state.release = false;
    expect((await download(request(), context)).status).toBe(503);
    expect(state.read).not.toHaveBeenCalled();
  });
  it("denies an unrelated account before rendering or exporting", async () => {
    state.read.mockRejectedValue(new WorkspaceAccessError());
    expect((await preview(request(), context)).status).toBe(403);
    expect((await download(request(), context)).status).toBe(403);
    expect(state.render).not.toHaveBeenCalled(); expect(state.archive).not.toHaveBeenCalled();
  });
  it("serves noncacheable sandboxed HTML and binds the selected candidate", async () => {
    const response = await preview(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-security-policy")).toContain("form-action 'none'");
    expect(response.headers.get("content-security-policy")).toContain("sandbox");
    expect(state.render).toHaveBeenCalledWith({ workId }, { revision: 1, contentHash: "a".repeat(64), page: undefined });
    expect(await response.text()).toContain("Private business");
  });
  it("downloads the project as an attachment without executing a provider write", async () => {
    const response = await download(request(), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/x-tar");
    expect(response.headers.get("content-disposition")).toContain(`website-${workId}-r1.tar`);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(state.render).not.toHaveBeenCalled();
  });
});
