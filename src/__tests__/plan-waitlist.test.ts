import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ actor: vi.fn(), list: vi.fn(), redis: vi.fn(), checkout: vi.fn(), limited: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: mocks.redis }));
vi.mock("@/platform/workspaces", () => ({ listWorkspaces: mocks.list }));
vi.mock("@/platform/workspace-release", () => ({ workspaceReleaseEnabled: () => true }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedWindowedAsync: mocks.limited }));
vi.mock("@/platform/business-billing/workspace-checkout", () => ({ selfServeBillingConfig: mocks.checkout }));
vi.mock("@/platform/workspaces/http", async () => ({ ...(await vi.importActual<typeof import("@/platform/workspaces/http")>("@/platform/workspaces/http")), workspaceHttpActor: mocks.actor }));

import { joinPlanWaitlist, leavePlanWaitlist, readPlanWaitlist, waitsForPlans } from "@/platform/business-billing/plan-waitlist";
import { POST } from "@/app/api/workspace/plan-waitlist/route";

const WS = "a0000000-0000-4000-8000-000000000001";
function memoryStore() {
  const values = new Map<string, unknown>(); const index = new Map<string, number>();
  return {
    values, index,
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => { values.set(key, value); }),
    del: vi.fn(async (key: string) => { values.delete(key); }),
    zadd: vi.fn(async (key: string, item: { score: number; member: string }) => { index.set(item.member, item.score); }),
    zrem: vi.fn(async (_key: string, member: string) => { index.delete(member); }),
  };
}
const post = (body: unknown, origin = "http://localhost") => new Request("http://localhost/api/workspace/plan-waitlist", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks(); vi.unstubAllEnvs();
  mocks.checkout.mockReturnValue({ enabled: false }); mocks.limited.mockResolvedValue(false);
  mocks.actor.mockResolvedValue({ userId: "owner", verifiedEmail: "amy@harbordental.com" });
  mocks.list.mockResolvedValue([{ id: WS, kind: "customer", access: "member", role: "owner", name: "Harbor Dental" }]);
});

describe("who waits for plans", () => {
  const budget = { capCents: null, subscribed: false };
  it("is a business with no plan and nothing included, while plans are closed and the cap is enforced", () => {
    const env = { STRELVA_BUSINESS_AI_BUDGET: "1", STRELVA_FREE_MONTHLY_AI_CAP_USD: "0" };
    expect(waitsForPlans(budget, env)).toBe(true);
    expect(waitsForPlans({ ...budget, subscribed: true }, env)).toBe(false);
    expect(waitsForPlans(budget, { ...env, STRELVA_FREE_MONTHLY_AI_CAP_USD: "5" })).toBe(false);
    expect(waitsForPlans(budget, { ...env, STRELVA_BUSINESS_AI_BUDGET: "0" })).toBe(false);
    expect(waitsForPlans(null, env)).toBe(false);
    mocks.checkout.mockReturnValue({ enabled: true });
    expect(waitsForPlans(budget, env)).toBe(false);
  });
});

describe("the plan waitlist store", () => {
  it("joins once by business, keeps the first join day, and leaves cleanly", async () => {
    const store = memoryStore();
    const first = await joinPlanWaitlist({ workspaceId: WS, businessName: "Harbor Dental", email: "amy@harbordental.com" }, new Date("2026-10-16T12:00:00Z"), store as never);
    expect(first?.repeat).toBe(false);
    const again = await joinPlanWaitlist({ workspaceId: WS, businessName: "Harbor Dental", email: "amy@harbordental.com" }, new Date("2026-10-17T12:00:00Z"), store as never);
    expect(again?.repeat).toBe(true); expect(again?.entry.joinedAt).toBe("2026-10-16T12:00:00.000Z");
    expect(store.zadd).toHaveBeenCalledOnce();
    expect((await readPlanWaitlist(WS, store as never))?.email).toBe("amy@harbordental.com");
    expect(await leavePlanWaitlist(WS, store as never)).toBe(true);
    expect(await readPlanWaitlist(WS, store as never)).toBeNull(); expect(store.index.size).toBe(0);
  });
  it("says so when storage is missing instead of pretending", async () => {
    expect(await joinPlanWaitlist({ workspaceId: WS, businessName: null, email: "a@b.co" }, new Date(), null)).toBeNull();
    expect(await leavePlanWaitlist(WS, null)).toBe(false);
    expect(await readPlanWaitlist(WS, null)).toBeNull();
  });
});

describe("POST /api/workspace/plan-waitlist", () => {
  it("saves the owner's confirmed email for this business and sends nothing to them", async () => {
    const store = memoryStore(); mocks.redis.mockReturnValue(store);
    const fetchSpy = vi.fn(); vi.stubGlobal("fetch", fetchSpy);
    const response = await POST(post({ workspaceId: WS, action: "join" }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ joined: true, email: "amy@harbordental.com" });
    expect(JSON.parse(String(store.values.get(`waitlist:plans:${WS}`)))).toMatchObject({ businessName: "Harbor Dental", email: "amy@harbordental.com" });
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("takes the business off the list", async () => {
    const store = memoryStore(); mocks.redis.mockReturnValue(store);
    await POST(post({ workspaceId: WS, action: "join" }));
    const response = await POST(post({ workspaceId: WS, action: "leave" }));
    expect(await response.json()).toEqual({ joined: false }); expect(store.values.size).toBe(0);
  });
  it("refuses a signed-out person, a member, an agency, another origin and a body it can't read", async () => {
    mocks.redis.mockReturnValue(memoryStore());
    mocks.actor.mockResolvedValueOnce(null);
    expect((await POST(post({ workspaceId: WS, action: "join" }))).status).toBe(401);
    mocks.list.mockResolvedValueOnce([{ id: WS, kind: "customer", access: "member", role: "member", name: "Harbor Dental" }]);
    expect((await POST(post({ workspaceId: WS, action: "join" }))).status).toBe(403);
    mocks.list.mockResolvedValueOnce([{ id: WS, kind: "agency", access: "member", role: "owner", name: "North Studio" }]);
    expect((await POST(post({ workspaceId: WS, action: "join" }))).status).toBe(403);
    expect((await POST(post({ workspaceId: WS, action: "join" }, "https://elsewhere.example"))).status).toBe(403);
    expect((await POST(post({ workspaceId: "not-a-uuid", action: "join" }))).status).toBe(400);
  });
  it("answers honestly when plans are open or the list can't be reached", async () => {
    mocks.redis.mockReturnValue(null);
    const missing = await POST(post({ workspaceId: WS, action: "join" }));
    expect(missing.status).toBe(503); expect((await missing.json()).error).toContain("Nothing changed");
    mocks.checkout.mockReturnValue({ enabled: true });
    expect((await POST(post({ workspaceId: WS, action: "join" }))).status).toBe(409);
  });
});
