import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), records: vi.fn(), homes: vi.fn(), release: vi.fn(), actor: vi.fn(), read: vi.fn() }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: mocks.workspace }));
vi.mock("@/platform/infra/inquiry-records", () => ({ inquiryRecordsEnabled: mocks.records }));
vi.mock("@/platform/owner-entry/linked-sites", () => ({ ownerEntryHomesOpen: mocks.homes }));
vi.mock("@/products/inquiries", () => ({ inquiryReleaseEnabledForWorkspace: mocks.release, readInquirySystemDetails: mocks.read }));
vi.mock("@/platform/workspaces/http", () => ({ workspaceHttpActor: mocks.actor, workspaceJson: (value: unknown, status = 200) => Response.json(value, { status }), workspaceHttpFailure: () => Response.json({ error: "unavailable" }, { status: 403 }) }));
import { GET } from "@/app/api/workspace/inquiries/system/route";
const workspace = "d7100000-0000-4000-8000-000000000002";
const actor = { userId: "owner", verifiedEmail: "owner@example.test" };
const read = () => GET(new Request(`https://app.example/api/workspace/inquiries/system?workspaceId=${workspace}`));
beforeEach(() => { vi.clearAllMocks(); mocks.workspace.mockReturnValue(true); mocks.records.mockReturnValue(true); mocks.homes.mockResolvedValue(true); mocks.release.mockResolvedValue(true); mocks.actor.mockResolvedValue(actor); mocks.read.mockResolvedValue([]); });
describe("inquiry System read boundary", () => {
  it.each(["workspace", "records", "release", "homes"] as const)("%s off never reads a form", async gate => {
    mocks[gate].mockResolvedValue(false); if (gate === "workspace" || gate === "records") mocks[gate].mockReturnValue(false);
    expect((await read()).status).toBe(503); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("requires authentication and the exact per-workspace release", async () => {
    mocks.actor.mockResolvedValue(null); expect((await read()).status).toBe(401); expect(mocks.read).not.toHaveBeenCalled();
    mocks.actor.mockResolvedValue(actor); expect((await read()).status).toBe(200);
    expect(mocks.release).toHaveBeenCalledWith(workspace, { userId: actor.userId, operator: false, tester: false });
    expect(mocks.read).toHaveBeenCalledWith(actor, workspace);
  });
});
