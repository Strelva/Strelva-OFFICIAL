import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPossibility } from "@/platform/possibilities";

const deps = vi.hoisted(() => ({
  user: null as null | { id: string; email: string; email_confirmed_at: string },
  workspaces: vi.fn(),
  get: vi.fn(),
  current: vi.fn(),
  systemsOn: vi.fn(async () => true),
}));

vi.mock("@/lib/db/server-client", () => ({ getSessionUser: async () => deps.user }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/systems-release", () => ({ systemsReleaseEnabledForWorkspace: deps.systemsOn }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: deps.workspaces }));
vi.mock("@/platform/possibilities/supabase-repository", () => ({
  isStoredPossibilityId: (id: string) => /^[0-9a-f-]{36}$/.test(id),
  createSupabasePossibilityRepository: () => ({ get: deps.get }),
}));
vi.mock("@/platform/make-real/supabase-content", () => ({ createSupabaseRevisionContent: () => ({}) }));
vi.mock("@/platform/systems/supabase-store", () => ({ createSupabaseSystemStore: () => ({}) }));
vi.mock("@/platform/make-real/systems-adapter", () => ({ createSystemStoreLiveSystems: () => ({ current: deps.current }) }));

import { GET } from "@/app/api/workspace/systems/possibilities/route";

const BIZ = "e1000000-0000-4000-8000-000000000001";
const SITE = "e1000000-0000-4000-8000-0000000000e1";
const REV = "e1000000-0000-4000-8000-0000000000f1";
const P = createPossibility({
  title: "Consult booking", intent: "Add consult booking.",
  changes: [{ baseline: { businessId: BIZ, systemId: SITE, revisionId: REV, number: 1 }, candidate: { summary: "the site with booking", content: { pages: 4 } } }],
  checks: [{ id: "site-serves", description: "The site serves." }],
}, { id: "e1000000-0000-4000-8000-0000000000a1", businessId: BIZ, actorId: "x", at: "2026-10-06T12:00:00.000Z" });

const get = (q: string) => GET(new Request(`http://localhost:3000/api/workspace/systems/possibilities?${q}`));

describe("GET /api/workspace/systems/possibilities", () => {
  beforeEach(() => {
    deps.user = { id: "e1000000-0000-4000-8000-0000000000b1", email: "member@mooney.test", email_confirmed_at: "2026-10-01" };
    deps.workspaces.mockReset().mockResolvedValue([{ id: BIZ, kind: "customer", name: "The Mooney Firm", access: "member", role: "member" }]);
    deps.get.mockReset().mockResolvedValue(P);
    deps.current.mockReset().mockResolvedValue({ revisionId: REV, number: 1, content: { pages: 3 } });
    deps.systemsOn.mockReset().mockResolvedValue(true);
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("lets a member read one stored possibility and its compare against live", async () => {
    const response = await get(`workspaceId=${BIZ}&possibilityId=${P.id}`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.possibility).toMatchObject({ id: P.id, title: "Consult booking", status: "exploring", changes: [{ systemId: SITE, summary: "the site with booking" }], staleReason: null });
    expect(body.compare.changes[0]).toMatchObject({ systemId: SITE, stale: false, differences: [{ path: "pages", current: 3, candidate: 4 }] });
  });

  it("claims no difference when the live side cannot be read", async () => {
    deps.current.mockRejectedValue(new Error("down"));
    expect((await (await get(`workspaceId=${BIZ}&possibilityId=${P.id}`)).json()).compare).toBeNull();
  });

  it("refuses other businesses, bad ids, missing possibilities and an off release", async () => {
    expect((await get(`workspaceId=e1000000-0000-4000-8000-000000000099&possibilityId=${P.id}`)).status).toBe(403);
    expect((await get(`workspaceId=${BIZ}&possibilityId=website-rebuild:w1`)).status).toBe(400);
    deps.get.mockResolvedValue(null);
    expect((await get(`workspaceId=${BIZ}&possibilityId=${P.id}`)).status).toBe(404);
    deps.systemsOn.mockResolvedValue(false);
    expect((await get(`workspaceId=${BIZ}&possibilityId=${P.id}`)).status).toBe(503);
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "0");
    expect((await get(`workspaceId=${BIZ}&possibilityId=${P.id}`)).status).toBe(503);
    deps.user = null;
    vi.stubEnv("STRELVA_SYSTEMS_RELEASE", "1");
    expect((await get(`workspaceId=${BIZ}&possibilityId=${P.id}`)).status).toBe(401);
  });
});
