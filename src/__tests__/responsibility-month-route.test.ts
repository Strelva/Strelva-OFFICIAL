import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/operations/route";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";
const mocks = vi.hoisted(() => ({ enabled: true, actor: vi.fn(), read: vi.fn(), snapshot: vi.fn() }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => mocks.enabled }));
vi.mock("@/products/operations/server", () => ({ readResponsibilityMonthEvidence: mocks.read, snapshotResponsibilityMeter: mocks.snapshot }));
vi.mock("@/platform/workspaces/http", async original => ({ ...await original<typeof import("@/platform/workspaces/http")>(), workspaceHttpActor: mocks.actor }));
const business = "99100000-0000-4000-8000-000000000011";
const actor = { userId: "99100000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const url = `http://localhost/api/operations?view=responsibility_meter&workspaceId=${business}&month=2026-08`;
const receipt = { stage: "monthly_snapshot", availability: "partial", priced: false, stripeExportEnabled: false };
function post(body: unknown, origin = "http://localhost") {
  return new Request("http://localhost/api/operations", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.clearAllMocks(); mocks.enabled = true; mocks.actor.mockResolvedValue(actor); mocks.read.mockResolvedValue(receipt); mocks.snapshot.mockResolvedValue(receipt); });
afterEach(() => vi.unstubAllEnvs());
it("reads immutable historical evidence without invoking capture and preserves unavailable data", async () => {
  expect(await (await GET(new Request(url))).json()).toEqual(receipt);
  expect(mocks.read).toHaveBeenCalledExactlyOnceWith(actor, business, "2026-08");
  expect(mocks.snapshot).not.toHaveBeenCalled();
  mocks.read.mockResolvedValue(null);
  expect(await (await GET(new Request(url))).json()).toBeNull();
});
it("uses server actor for monthly admission and rejects browser authority", async () => {
  const body = { action: "responsibility_meter", workspaceId: business, month: "2026-08" };
  expect((await POST(post(body))).status).toBe(200);
  expect(mocks.snapshot).toHaveBeenCalledExactlyOnceWith(actor, business, "2026-08");
  mocks.snapshot.mockClear();
  expect((await POST(post({ ...body, userId: actor.userId, priced: true }))).status).toBe(400);
  expect((await POST(post(body, "https://outside.example"))).status).toBe(403);
  expect(mocks.snapshot).not.toHaveBeenCalled();
});
it("retains release, authentication, current authority and storage failures", async () => {
  mocks.enabled = false; expect((await GET(new Request(url))).status).toBe(503);
  mocks.enabled = true; mocks.actor.mockResolvedValue(null); expect((await GET(new Request(url))).status).toBe(401);
  expect(mocks.read).not.toHaveBeenCalled();
  mocks.actor.mockResolvedValue(actor); mocks.read.mockRejectedValue(new WorkspaceAccessError()); expect((await GET(new Request(url))).status).toBe(403);
  mocks.read.mockRejectedValue(new WorkspaceStoreError("Unavailable")); expect((await GET(new Request(url))).status).toBe(503);
});
