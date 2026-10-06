import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; email_confirmed_at: string },
  workspaces: vi.fn(),
  work: vi.fn(),
  exit: vi.fn(),
  makeReal: vi.fn(),
  limited: vi.fn(),
  throughNeedsYou: vi.fn(),
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: async () => deps.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimitedWindowedAsync: deps.limited }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: deps.workspaces, listWork: deps.work }));
vi.mock("@/platform/workspace-exit", () => ({ readWorkspaceExit: deps.exit }));
vi.mock("@/products/managed-presence/server", () => ({ listManagedPresenceWork: async () => ({ managedWork: [{ id: "mooney-firm", domain: "www.attymooney.com" }] }) }));
vi.mock("@/experience/systems/server", () => ({ makeRealForWorkspace: deps.makeReal }));
vi.mock("@/platform/needs-you/systems-sources", () => ({ makeRealThroughNeedsYou: deps.throughNeedsYou }));

import { POST } from "@/app/api/workspace/systems/make-real/route";
import { setReleaseFlagsDb } from "@/platform/release-flags/store";

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
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1");
    vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    setReleaseFlagsDb({ rpc: async () => ({ data: { workspaceId: BUSINESS, flags: {}, testers: [] }, error: null }) });
  });

  afterEach(() => { vi.unstubAllEnvs(); setReleaseFlagsDb(null); });

  it("answers 503 for a business an operator set off, and runs where its workspace row is on under env workspace", async () => {
    setReleaseFlagsDb({ rpc: async () => ({ data: { workspaceId: BUSINESS, flags: { systems: { state: "off", revision: 1, changedAt: "2026-10-06T00:00:00Z" } }, testers: [] }, error: null }) });
    expect((await call()).status).toBe(503);
    expect(deps.makeReal).not.toHaveBeenCalled();
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "workspace");
    setReleaseFlagsDb({ rpc: async () => ({ data: { workspaceId: BUSINESS, flags: { systems: { state: "on", revision: 1, changedAt: "2026-10-06T00:00:00Z" } }, testers: [] }, error: null }) });
    expect((await call()).status).toBe(200);
  });

  it("answers 503 and reads nothing while STRELVA_SYSTEMS_RELEASE is off", async () => {
    for (const value of [undefined, "", "0", "true"]) {
      vi.stubEnv("STRELVA_SYSTEMS_RELEASE", value);
      const response = await call();
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Make real is not enabled. Nothing changed." });
    }
    expect(deps.workspaces).not.toHaveBeenCalled();
    expect(deps.limited).not.toHaveBeenCalled();
    expect(deps.makeReal).not.toHaveBeenCalled();
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

  describe("with Needs you on: the tap is the owner's one approval for the plan", () => {
    beforeEach(() => {
      vi.stubEnv("STRELVA_NEEDS_YOU_RELEASE", "1");
      deps.throughNeedsYou.mockReset().mockResolvedValue({ status: "done", result: RESULT, reason: null });
    });

    it("decides the plan's Needs you item and returns Make real's result", async () => {
      const response = await call();
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ result: RESULT, decision: "done" });
      expect(deps.throughNeedsYou).toHaveBeenCalledWith({ userId: deps.user!.id, verifiedEmail: "sheri@example.test" }, BUSINESS, "website-rebuild:w", expect.anything());
      // One write path: the route never runs Make real beside Needs you.
      expect(deps.makeReal).not.toHaveBeenCalled();
    });

    it("says so when nothing waits on a decision, or it changed, or the actor may not decide", async () => {
      deps.throughNeedsYou.mockResolvedValue(null);
      expect((await call()).status).toBe(404);
      deps.throughNeedsYou.mockResolvedValue({ status: "changed", result: null, reason: null });
      expect((await call()).status).toBe(409);
      deps.throughNeedsYou.mockResolvedValue({ status: "forbidden", result: null, reason: null });
      expect((await call()).status).toBe(403);
    });

    it("a failed start says nothing changed", async () => {
      deps.throughNeedsYou.mockResolvedValue({ status: "failed", result: null, reason: "make_real_refused: live changed" });
      const response = await call();
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({ error: "Make real could not start. Nothing changed. Strelva is on it." });
    });

    it("still refuses a non-owner before reaching Needs you", async () => {
      deps.workspaces.mockResolvedValue([{ id: BUSINESS, kind: "customer", name: "The Mooney Firm", access: "member", role: "admin" }]);
      expect((await call()).status).toBe(403);
      expect(deps.throughNeedsYou).not.toHaveBeenCalled();
    });
  });
});
