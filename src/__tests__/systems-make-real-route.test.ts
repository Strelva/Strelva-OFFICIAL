import { beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; email_confirmed_at: string },
  workspaces: vi.fn(),
  work: vi.fn(),
  exit: vi.fn(),
  makeReal: vi.fn(),
  limited: vi.fn(),
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: async () => deps.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimitedWindowedAsync: deps.limited }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: deps.workspaces, listWork: deps.work }));
vi.mock("@/platform/workspace-exit", () => ({ readWorkspaceExit: deps.exit }));
vi.mock("@/products/managed-presence/server", () => ({ listManagedPresenceWork: async () => ({ managedWork: [{ id: "mooney-firm", domain: "www.attymooney.com" }] }) }));
vi.mock("@/experience/systems/server", () => ({ makeRealForWorkspace: deps.makeReal }));

import { POST } from "@/app/api/workspace/systems/make-real/route";

const BUSINESS = "a0000000-0000-4000-8000-000000000001";
const ORIGIN = "http://localhost:3000";
const call = (body: unknown = { workspaceId: BUSINESS, possibilityId: "website-rebuild:w" }, headers: Record<string, string> = {}) =>
  POST(new Request(`${ORIGIN}/api/workspace/systems/make-real`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json", ...headers }, body: JSON.stringify(body) }));

const RESULT = { isolated: true, status: "in_progress", headline: "In progress: 2 of 5 steps.", done: [], waiting: [], unknown: [], notStarted: [], liveUnchanged: true, notConnected: [] };

describe("POST /api/workspace/systems/make-real", () => {
  beforeEach(() => {
    deps.user = { id: "11111111-1111-4111-8111-111111111111", email: "Sheri@Example.test", email_confirmed_at: "2026-10-01" };
    deps.workspaces.mockReset().mockResolvedValue([{ id: BUSINESS, kind: "customer", name: "The Mooney Firm", access: "member", role: "owner" }]);
    deps.work.mockReset().mockResolvedValue([]);
    deps.exit.mockReset().mockResolvedValue({ state: null });
    deps.makeReal.mockReset().mockResolvedValue(RESULT);
    deps.limited.mockReset().mockResolvedValue(false);
  });

  it("runs the isolated sandbox for an owner and returns its partial state", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: RESULT });
    expect(deps.makeReal).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS, actor: { userId: deps.user!.id, verifiedEmail: "sheri@example.test" }, siteDomains: new Map([["mooney-firm", "www.attymooney.com"]]) }),
      "website-rebuild:w", { canActivate: true },
    );
  });

  it("gives a member, an admin and a delegated reader a permission state and never runs Make real", async () => {
    for (const access of [{ access: "member", role: "member" }, { access: "member", role: "admin" }, { access: "delegated_read" }]) {
      deps.workspaces.mockResolvedValue([{ id: BUSINESS, kind: "customer", name: "The Mooney Firm", ...access }]);
      const response = await call();
      expect(response.status).toBe(403);
      if (access.access === "member") expect(await response.json()).toEqual({ error: "Only an owner of this business can make a possibility real.", permission: "not_owner" });
    }
    expect(deps.makeReal).not.toHaveBeenCalled();
  });

  it("hides a business the actor cannot see, and refuses personal and agency workspaces", async () => {
    deps.workspaces.mockResolvedValue([{ id: BUSINESS, kind: "agency", name: "Agency", access: "member", role: "owner" }]);
    expect((await call()).status).toBe(403);
    deps.workspaces.mockResolvedValue([]);
    expect((await call()).status).toBe(403);
    expect(deps.makeReal).not.toHaveBeenCalled();
  });

  it("requires a confirmed session and a same-origin JSON request", async () => {
    deps.user = null;
    expect((await call()).status).toBe(401);
    deps.user = { id: "11111111-1111-4111-8111-111111111111", email: "sheri@example.test", email_confirmed_at: "2026-10-01" };
    expect((await call(undefined, { origin: "https://evil.example" })).status).toBe(403);
    expect((await call({ workspaceId: "not-a-uuid", possibilityId: "x" })).status).toBe(400);
    expect(deps.makeReal).not.toHaveBeenCalled();
  });

  it("fails closed when the business has stopped or its stop state cannot be read", async () => {
    deps.exit.mockResolvedValue({ state: { status: "completed" } });
    expect((await call()).status).toBe(409);
    deps.exit.mockRejectedValue(new Error("down"));
    expect((await call()).status).toBe(409);
    expect(deps.makeReal).not.toHaveBeenCalled();
  });

  it("says a possibility the business does not have is unavailable", async () => {
    deps.makeReal.mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("rate limits", async () => {
    deps.limited.mockResolvedValue(true);
    expect((await call()).status).toBe(429);
  });
});
