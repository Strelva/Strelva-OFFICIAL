import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; email_confirmed_at: string }, limited: vi.fn(),
  read: vi.fn(), detect: vi.fn(), check: vi.fn(), connect: vi.fn(),
}));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: async () => deps.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: deps.limited }));
vi.mock("@/products/connected-sites/server", async importOriginal => ({
  ...(await importOriginal<typeof import("@/products/connected-sites/server")>()),
  readAgencyClientSites: deps.read, detectClientSites: deps.detect, checkClientSites: deps.check, connectClientSite: deps.connect,
}));

import { GET, POST } from "@/app/api/workspace/agency-client-sites/route";

const AGENCY = "7f000000-0000-4000-8000-000000000001";
const id = (n: number) => `7f000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORIGIN = "http://localhost:3000";
const post = (body: unknown) => POST(new Request(`${ORIGIN}/api/workspace/agency-client-sites`, { method: "POST", headers: { origin: ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) }));
const get = (query = "") => GET(new Request(`${ORIGIN}/api/workspace/agency-client-sites?agencyWorkspaceId=${AGENCY}${query}`));
const on = () => { vi.stubEnv("STRELVA_WORKSPACE_RELEASE", "1"); vi.stubEnv("STRELVA_CONNECTED_SITES_RELEASE", "1"); vi.stubEnv("STRELVA_KEEP_YOUR_SITE_RELEASE", "workspace"); };

beforeEach(() => {
  deps.user = { id: id(2), email: "Staff@Example.test", email_confirmed_at: "2026-10-01" };
  deps.limited.mockReset().mockResolvedValue(false);
  deps.read.mockReset().mockResolvedValue({ clients: [], nextCursor: null });
  deps.detect.mockReset().mockResolvedValue([]);
  deps.check.mockReset().mockResolvedValue([]);
  deps.connect.mockReset().mockResolvedValue({ site: {}, stepsText: "steps" });
});
afterEach(() => vi.unstubAllEnvs());

describe("/api/workspace/agency-client-sites", () => {
  it("does not exist while the flag is off, and reads nothing", async () => {
    expect((await get()).status).toBe(404);
    expect((await post({ action: "detect", agencyWorkspaceId: AGENCY, workspaceIds: [id(3)] })).status).toBe(404);
    expect(deps.read).not.toHaveBeenCalled();
    expect(deps.detect).not.toHaveBeenCalled();
  });
  it("reads a page with its cursor for the signed-in person", async () => {
    on();
    const response = await get(`&afterName=Client%2001&afterId=${id(3)}`);
    expect(response.status).toBe(200);
    expect(deps.read).toHaveBeenCalledWith({ userId: id(2), verifiedEmail: "staff@example.test" }, AGENCY, { name: "Client 01", id: id(3) });
  });
  it("needs a confirmed session", async () => {
    on();
    deps.user = null;
    expect((await get()).status).toBe(401);
    expect((await post({ action: "check", agencyWorkspaceId: AGENCY, workspaceIds: [id(3)] })).status).toBe(401);
  });
  it("refuses more than 25 clients, none, unknown keys and unknown actions", async () => {
    on();
    expect((await post({ action: "detect", agencyWorkspaceId: AGENCY, workspaceIds: Array.from({ length: 26 }, (_, index) => id(index + 10)) })).status).toBe(400);
    expect((await post({ action: "check", agencyWorkspaceId: AGENCY, workspaceIds: [] })).status).toBe(400);
    expect((await post({ action: "detect", agencyWorkspaceId: AGENCY, workspaceIds: [id(3)], extra: 1 })).status).toBe(400);
    expect((await post({ action: "email", agencyWorkspaceId: AGENCY, workspaceIds: [id(3)] })).status).toBe(400);
    expect(deps.detect).not.toHaveBeenCalled();
  });
  it("runs each action for the person", async () => {
    on();
    expect((await post({ action: "detect", agencyWorkspaceId: AGENCY, workspaceIds: [id(3)] })).status).toBe(200);
    expect(deps.detect).toHaveBeenCalledWith({ userId: id(2), verifiedEmail: "staff@example.test" }, AGENCY, [id(3)]);
    expect((await post({ action: "check", agencyWorkspaceId: AGENCY, workspaceIds: [id(3)] })).status).toBe(200);
    const connected = await post({ action: "connect", agencyWorkspaceId: AGENCY, workspaceId: id(3) });
    expect(connected.status).toBe(201);
    expect(await connected.json()).toMatchObject({ stepsText: "steps" });
  });
  it("rate limits detection and checks", async () => {
    on();
    deps.limited.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect((await post({ action: "detect", agencyWorkspaceId: AGENCY, workspaceIds: [id(3)] })).status).toBe(429);
    expect(deps.limited).toHaveBeenLastCalledWith(`agency-client-sites:detect:${id(2)}`, 4, 600_000);
    deps.limited.mockReset().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect((await post({ action: "check", agencyWorkspaceId: AGENCY, workspaceIds: [id(3)] })).status).toBe(429);
    expect(deps.limited).toHaveBeenLastCalledWith(`agency-client-sites:check:${id(2)}`, 6, 600_000);
    expect(deps.detect).not.toHaveBeenCalled();
  });
});
