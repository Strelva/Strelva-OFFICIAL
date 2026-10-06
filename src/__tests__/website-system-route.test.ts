import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; email_confirmed_at: string },
  workspaces: vi.fn(),
  detail: vi.fn(),
  limited: vi.fn(),
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: async () => deps.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/lib/rate-limit", () => ({ isRateLimitedWindowedAsync: deps.limited }));
vi.mock("@/lib/db/repositories", () => ({ isSuperAdminUser: async () => false }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: deps.workspaces }));
vi.mock("@/experience/systems/website-detail-server", () => ({ readWebsiteSystemDetail: deps.detail }));

import { GET } from "@/app/api/workspace/systems/website/route";
import { setReleaseFlagsDb } from "@/platform/release-flags/store";

const BUSINESS = "a0000000-0000-4000-8000-000000000001";
const SYSTEM = "a0000000-0000-4000-8000-000000000002";
const call = (query = `workspaceId=${BUSINESS}&systemId=${SYSTEM}`) => GET(new Request(`http://localhost:3000/api/workspace/systems/website?${query}`));

describe("GET /api/workspace/systems/website", () => {
  beforeEach(() => {
    deps.user = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.test", email_confirmed_at: "2026-10-01" };
    deps.workspaces.mockReset().mockResolvedValue([{ id: BUSINESS, kind: "customer", name: "The Mooney Firm", access: "member", role: "member" }]);
    deps.detail.mockReset().mockResolvedValue({ systemId: SYSTEM, domains: [], waiting: [], requests: [], history: [], unavailable: [] });
    deps.limited.mockReset().mockResolvedValue(false);
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1"); vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1");
    setReleaseFlagsDb({ rpc: async () => ({ data: { workspaceId: BUSINESS, flags: {}, testers: [] }, error: null }) });
  });
  afterEach(() => { vi.unstubAllEnvs(); setReleaseFlagsDb(null); });

  it("returns the lists to a member of the business", async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect((await response.json()).detail.systemId).toBe(SYSTEM);
    expect(deps.detail).toHaveBeenCalledWith(expect.objectContaining({ userId: deps.user!.id }), BUSINESS, SYSTEM);
  });
  it("refuses without a session, for another business, and for a non-customer workspace", async () => {
    deps.user = null; expect((await call()).status).toBe(401);
    deps.user = { id: "11111111-1111-4111-8111-111111111111", email: "owner@example.test", email_confirmed_at: "2026-10-01" };
    deps.workspaces.mockResolvedValueOnce([]); expect((await call()).status).toBe(403);
    deps.workspaces.mockResolvedValueOnce([{ id: BUSINESS, kind: "agency", name: "Agency" }]); expect((await call()).status).toBe(403);
    expect(deps.detail).not.toHaveBeenCalled();
  });
  it("answers 404 when the System is not a website here, 400 for bad ids, 429 when limited and 503 with Systems off", async () => {
    deps.detail.mockResolvedValueOnce(null); expect((await call()).status).toBe(404);
    expect((await call("workspaceId=nope&systemId=nope")).status).toBe(400);
    deps.limited.mockResolvedValueOnce(true); expect((await call()).status).toBe(429);
    setReleaseFlagsDb({ rpc: async () => ({ data: { workspaceId: BUSINESS, flags: { systems: { state: "off", revision: 1, changedAt: "2026-10-06T00:00:00Z" } }, testers: [] }, error: null }) });
    expect((await call()).status).toBe(503);
  });
});
