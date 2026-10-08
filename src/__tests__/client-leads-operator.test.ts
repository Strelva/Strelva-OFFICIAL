import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/platform/operator-read-audit/admission", () => ({ authorizeAdminOperatorRead: vi.fn(async () => undefined) }));
import { makeRedisMock } from "./support/redis-mock";

const redis = makeRedisMock();
const mocks = vi.hoisted(() => ({
  isSuperAdmin: vi.fn(),
  getAllTenants: vi.fn(),
  alertOnce: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => redis }));
vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: mocks.isSuperAdmin }));
vi.mock("@/lib/tenants", () => ({ getAllTenants: mocks.getAllTenants, getTenantConfig: vi.fn() }));
vi.mock("@/lib/delivery-email", () => ({ sendNewLeadEmail: vi.fn() }));
vi.mock("@/platform/infra/monitoring", () => ({ alertOnce: mocks.alertOnce }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: vi.fn() }));

import { GET } from "@/app/api/admin/client-leads/route";
import ClientLeadsPage from "@/app/admin/client-leads/page";
import { getClientLeadsForOperator, reconcileLeadMirror } from "@/lib/client-leads";
import { LEAD_MIRROR_PENDING_KEY, setLeadMirrorDb, type LeadMirrorDb } from "@/lib/lead-mirror";

type Rpc = (name: string, args: Record<string, unknown>) => unknown;
let rpc: ReturnType<typeof vi.fn<Rpc>>;
function useDb(impl: Rpc) {
  rpc = vi.fn<Rpc>(impl);
  setLeadMirrorDb({ rpc } as unknown as LeadMirrorDb);
}

function putRedisLead(tenant: string, id: string, createdAt: string, name = "Redis Person") {
  redis.store.set(`lead:${tenant}:${id}`, { id, name, message: "From Redis", createdAt });
  redis.zsets.set(`leads:${tenant}`, new Map([...(redis.zsets.get(`leads:${tenant}`) ?? new Map()), [id, Date.parse(createdAt)]]));
}

const pgRow = (tenantId: string, leadId: string, capturedAt: string) => ({
  id: `row-${leadId}`,
  tenantId,
  siteName: tenantId === "gldf" ? "Great Lakes Dried Fruit" : "McClear's Cottage",
  leadId,
  name: "Postgres Person",
  email: "pg@example.test",
  message: "From Postgres",
  source: "contact-form",
  fields: null,
  capturedAt,
  workspaceId: null,
});

beforeEach(() => {
  redis.store.clear();
  redis.zsets.clear();
  mocks.isSuperAdmin.mockReset();
  mocks.isSuperAdmin.mockResolvedValue(true);
  mocks.getAllTenants.mockReset();
  mocks.getAllTenants.mockResolvedValue([
    { id: "gldf", siteName: "Great Lakes Dried Fruit" },
    { id: "mclears-cottage", siteName: "McClear's Cottage" },
  ]);
  mocks.alertOnce.mockReset();
  mocks.redirect.mockClear();
  useDb(async (name, args) => {
    if (name !== "read_tenant_leads") return { data: { status: "recorded", id: "row-x", workspaceId: null }, error: null };
    const rows = [pgRow("gldf", "lead_pg1", "2026-10-04T10:00:00.000Z"), pgRow("mclears-cottage", "lead_both", "2026-10-03T10:00:00.000Z")];
    return { data: rows.filter((row) => !args.p_tenant_id || row.tenantId === args.p_tenant_id), error: null };
  });
});
afterEach(() => setLeadMirrorDb(undefined));

describe("getClientLeadsForOperator", () => {
  it("merges Postgres and the Redis window, newest first, marking what only Redis holds", async () => {
    putRedisLead("mclears-cottage", "lead_both", "2026-10-03T10:00:00.000Z");
    putRedisLead("mclears-cottage", "lead_redis", "2026-10-05T09:00:00.000Z");
    const result = await getClientLeadsForOperator();
    expect(result.postgres).toBe("ok");
    expect(result.redis).toBe("ok");
    expect(result.leads.map((lead) => [lead.leadId, lead.stored])).toEqual([
      ["lead_redis", "redis_only"],
      ["lead_pg1", "postgres"],
      ["lead_both", "postgres"],
    ]);
    expect(result.leads[0]).toMatchObject({ siteName: "McClear's Cottage", expiresAt: "2027-01-03T09:00:00.000Z" });
  });

  it("falls back to Redis when Postgres fails, and says so", async () => {
    useDb(async () => ({ data: null, error: { message: "relation does not exist" } }));
    putRedisLead("gldf", "lead_redis", "2026-10-05T09:00:00.000Z");
    const result = await getClientLeadsForOperator({ tenant: "gldf" });
    expect(result.postgres).toBe("unavailable");
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0]).toMatchObject({ leadId: "lead_redis", stored: "redis_only", tenantId: "gldf" });
  });

  it("reads one tenant only when asked", async () => {
    putRedisLead("gldf", "lead_g", "2026-10-05T09:00:00.000Z");
    putRedisLead("mclears-cottage", "lead_m", "2026-10-05T09:00:00.000Z");
    const result = await getClientLeadsForOperator({ tenant: "mclears-cottage" });
    expect(new Set(result.leads.map((lead) => lead.tenantId))).toEqual(new Set(["mclears-cottage"]));
    expect(rpc).toHaveBeenCalledWith("read_tenant_leads", { p_tenant_id: "mclears-cottage", p_limit: 100, p_before: null });
  });
});

describe("reconcileLeadMirror", () => {
  it("copies pending leads, drops ones Redis no longer has, and keeps failures pending", async () => {
    putRedisLead("gldf", "lead_ok", "2026-10-05T09:00:00.000Z");
    putRedisLead("gldf", "lead_bad", "2026-10-05T09:01:00.000Z");
    redis.zsets.set(LEAD_MIRROR_PENDING_KEY, new Map([["gldf:lead_ok", 1], ["gldf:lead_gone", 2], ["gldf:lead_bad", 3]]));
    useDb(async (_name, args) =>
      (args.p_lead as { leadId: string }).leadId === "lead_bad"
        ? { data: null, error: { message: "boom" } }
        : { data: { status: "recorded", id: "row", workspaceId: null }, error: null },
    );
    const result = await reconcileLeadMirror();
    expect(result).toMatchObject({ checked: 3, repaired: 1, missing: 1, failed: 1, remaining: 1 });
    expect([...redis.zsets.get(LEAD_MIRROR_PENDING_KEY)!.keys()]).toEqual(["gldf:lead_bad"]);
    expect((rpc.mock.calls[0]![1] as { p_via: string }).p_via).toBe("repair");
  });
});

describe("operator access", () => {
  it("API: 403 for anyone who isn't a super admin, and reads nothing", async () => {
    mocks.isSuperAdmin.mockResolvedValue(false);
    const res = await GET(new Request("http://localhost/api/admin/client-leads"));
    expect(res.status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
    expect(mocks.getAllTenants).not.toHaveBeenCalled();
  });

  it("API: super admin gets the merged list", async () => {
    const res = await GET(new Request("http://localhost/api/admin/client-leads?tenant=gldf&limit=10"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.leads.map((lead: { leadId: string }) => lead.leadId)).toEqual(["lead_pg1"]);
    expect(rpc).toHaveBeenCalledWith("read_tenant_leads", { p_tenant_id: "gldf", p_limit: 10, p_before: null });
  });

  it("API: rejects a malformed tenant", async () => {
    const res = await GET(new Request("http://localhost/api/admin/client-leads?tenant=GLDF%2F..%2Fx"));
    expect(res.status).toBe(400);
  });

  it("page: redirects a non-super-admin before reading any lead", async () => {
    mocks.isSuperAdmin.mockResolvedValue(false);
    await expect(ClientLeadsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("NEXT_REDIRECT /sign-in");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("page: renders for a super admin", async () => {
    const element = await ClientLeadsPage({ searchParams: Promise.resolve({ tenant: "gldf" }) });
    expect(element).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith("read_tenant_leads", expect.objectContaining({ p_tenant_id: "gldf" }));
  });
});
