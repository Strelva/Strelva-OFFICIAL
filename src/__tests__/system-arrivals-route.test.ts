import { beforeEach, expect, it, vi } from "vitest";
import { WorkspaceAccessError } from "@/platform/workspaces/types";
const state = vi.hoisted(() => ({ enabled: true, owner: true, systems: true, records: true, inquiries: true, links: { sites: [] as unknown[], denied: [] as unknown[] }, signedIn: true, actor: { userId: "owner", verifiedEmail: "owner@example.test" }, read: vi.fn() }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => state.enabled }));
vi.mock("@/platform/workspaces/http", async importOriginal => ({ ...await importOriginal<typeof import("@/platform/workspaces/http")>(), workspaceHttpActor: async () => state.signedIn ? state.actor : null }));
vi.mock("@/platform/owner-entry/linked-sites", () => ({ ownerEntryHomesOpen: async () => state.owner, readLinkedSites: async () => state.links }));
vi.mock("@/platform/infra/inquiry-records", () => ({ inquiryRecordsEnabled: () => state.records }));
vi.mock("@/products/inquiries", () => ({ inquiryReleaseEnabledForWorkspace: async () => state.inquiries, readSystemArrivals: state.read }));
vi.mock("@/platform/systems-release", () => ({ systemsReleasedFor: async () => state.systems }));
import { GET } from "@/app/api/workspace/system-arrivals/route";
const workspaceId = "61000000-0000-4000-8000-000000000003";
const request = () => new Request(`https://app.example.test/api/workspace/system-arrivals?workspaceId=${workspaceId}`);
beforeEach(() => { Object.assign(state, { enabled: true, owner: true, systems: true, records: true, inquiries: true, signedIn: true, links: { sites: [], denied: [] } }); state.read.mockReset().mockResolvedValue({ workspaceId, items: [] }); });
it("keeps the owner-entry and Systems gates closed without reading records", async () => {
  for (const key of ["enabled", "systems"] as const) {
    state[key] = false;
    expect((await GET(request())).status).toBe(503);
    state[key] = true;
  }
  expect(state.read).not.toHaveBeenCalled();
});
it("serves private uncached arrivals and passes inquiry release eligibility independently", async () => {
  state.records = false;
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(state.read).toHaveBeenCalledWith(state.actor, workspaceId, expect.any(Date), undefined, false);
});
it("refuses cross-business membership and malformed business ids", async () => {
  state.read.mockRejectedValue(new WorkspaceAccessError());
  expect((await GET(request())).status).toBe(403);
  expect((await GET(new Request("https://app.example.test/api/workspace/system-arrivals?workspaceId=bad"))).status).toBe(400);
});

it("keeps the eleven linked clients behind owner entry, including denied links", async () => {
  state.owner = false;
  for (const links of [{ sites: [{}], denied: [] }, { sites: [], denied: [{}] }]) {
    state.links = links;
    expect((await GET(request())).status).toBe(503);
  }
  expect(state.read).not.toHaveBeenCalled();
});
it("native-only businesses receive bookings while the legacy owner door and inquiry destination stay dark", async () => {
  state.owner = false;
  expect((await GET(request())).status).toBe(200);
  expect(state.read).toHaveBeenCalledWith(state.actor, workspaceId, expect.any(Date), undefined, false);
});
it("requires sign-in before gate and record reads", async () => {
  state.signedIn = false;
  expect((await GET(request())).status).toBe(401);
  expect(state.read).not.toHaveBeenCalled();
});
