import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ session: vi.fn(), release: vi.fn(), preview: vi.fn(), read: vi.fn(), create: vi.fn(), edit: vi.fn(), experiment: vi.fn(), admin: vi.fn() }));
vi.mock("@/lib/db/server-client", () => ({ getSessionUser: mocks.session }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.release }));
vi.mock("@/lib/auth", () => ({ isSuperAdmin: mocks.admin }));
vi.mock("@/products/tracker/server", () => ({ previewTracker: mocks.preview, readSavedTracker: mocks.read, saveNewTracker: mocks.create, editSavedTracker: mocks.edit, recordTrackerExperiment: mocks.experiment }));
import { GET, POST } from "@/app/api/tracker/route";
const body = { action: "preview", workspaceId: "workspace", input: {} };
const post = (data = body, origin = "http://localhost") => new Request("http://localhost/api/tracker", { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(data) });
describe("tracker route authority", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.release.mockReturnValue(true); mocks.session.mockResolvedValue({ id: "owner", email: "Owner@example.com", email_confirmed_at: "2026-09-11" }); });
  it("keeps release-gated work unavailable", async () => {
    mocks.release.mockReturnValue(false);
    expect((await GET(new Request("http://localhost/api/tracker"))).status).toBe(503);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("requires verified identity", async () => {
    mocks.session.mockResolvedValue({ id: "owner", email: "owner@example.com" });
    expect((await POST(post())).status).toBe(401);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("rejects cross-origin mutation", async () => {
    expect((await POST(post(body, "https://other.example"))).status).toBe(403);
    expect(mocks.preview).not.toHaveBeenCalled();
  });
  it("derives the actor from the session", async () => {
    mocks.preview.mockResolvedValue({ validation: { canCreate: true } });
    expect((await POST(post())).status).toBe(200);
    expect(mocks.preview).toHaveBeenCalledWith({ userId: "owner", verifiedEmail: "owner@example.com" }, "workspace", {});
  });
  it("keeps internal experiment recording restricted", async () => {
    mocks.admin.mockResolvedValue(false);
    const response = await POST(new Request("http://localhost/api/tracker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "experiment", workId: "work", input: {} }) }));
    expect(response.status).toBe(403);
    expect(mocks.experiment).not.toHaveBeenCalled();
  });
  it("passes the displayed tracker revision through to the experiment authority", async () => {
    mocks.admin.mockResolvedValue(true);
    mocks.experiment.mockResolvedValue({ experimentWorkId: "experiment" });
    const input = { expectedRevision: 4, hypothesis: "Compare review time" };
    const response = await POST(new Request("http://localhost/api/tracker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "experiment", workId: "work", input }) }));
    expect(response.status).toBe(200);
    expect(mocks.experiment).toHaveBeenCalledWith({ userId: "owner", verifiedEmail: "owner@example.com" }, "work", input);
  });
  it("bounds request bodies even without a content length", async () => {
    const response = await POST(new Request("http://localhost/api/tracker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: "x".repeat(2 * 1024 * 1024) }) }));
    expect(response.status).toBe(413);
  });
});
