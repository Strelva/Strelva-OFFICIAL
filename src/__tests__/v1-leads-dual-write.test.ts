import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRedisMock } from "./support/redis-mock";

// The public lead beacon client sites post to, with the real Redis store and
// the real Postgres copy: the visitor's response must be exactly what it was
// before the dual-write, whatever Postgres does.

const redis = makeRedisMock();
let redisAvailable = true;
const mocks = vi.hoisted(() => ({
  tenant: vi.fn(),
  sendNewLeadEmail: vi.fn(),
  alertOnce: vi.fn(),
}));

vi.mock("@/platform/infra/redis", () => ({ getRedis: () => (redisAvailable ? redis : null) }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.tenant }));
vi.mock("@/lib/delivery-email", () => ({ sendNewLeadEmail: mocks.sendNewLeadEmail }));
vi.mock("@/lib/monitoring", () => ({ alertOnce: mocks.alertOnce }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: async () => false, rateLimitKey: () => "v1-leads-test" }));
vi.mock("@/lib/spam-pit", () => ({ recordSpam: vi.fn() }));
vi.mock("@/products/inquiries/server", () => ({
  INQUIRY_WORKSPACE_EXIT_CODE: "workspace_exit_future_work_blocked",
  InquiryWorkspaceExitUnavailableError: class extends Error {},
  getInquiryRepository: vi.fn(),
  inquiryReleaseEnabled: () => false,
  projectPublishedInquiry: vi.fn(),
  recordInquiryEvidence: vi.fn(),
  resolveInquiryWorkspace: vi.fn(),
  validateInquiryFields: vi.fn(),
}));

import { POST } from "@/app/api/v1/leads/[tenant]/route";
import { LEAD_MIRROR_PENDING_KEY, LEAD_MIRROR_TIMEOUT_MS, setLeadMirrorDb, type LeadMirrorDb } from "@/lib/lead-mirror";

type Rpc = (name: string, args: Record<string, unknown>) => unknown;
let rpc: ReturnType<typeof vi.fn<Rpc>>;

function useDb(impl: Rpc) {
  rpc = vi.fn<Rpc>(impl);
  setLeadMirrorDb({ rpc } as unknown as LeadMirrorDb);
}

function post(tenant: string, body: unknown) {
  return POST(
    new Request(`https://app.strelva.com/api/v1/leads/${tenant}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://mclearscottage.com" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ tenant }) },
  );
}

const submission = { name: "Ada Rivera", email: "ada@example.test", message: "Is the cottage free June 3-5?", source: "contact-form" };

function redisLeads(tenant: string) {
  return [...(redis.zsets.get(`leads:${tenant}`)?.keys() ?? [])].map((id) => redis.store.get(`lead:${tenant}:${id}`) as Record<string, unknown>);
}

beforeEach(() => {
  redis.store.clear();
  redis.zsets.clear();
  redisAvailable = true;
  mocks.tenant.mockReset();
  mocks.tenant.mockImplementation(async (id: string) =>
    id === "mclears-cottage" ? { id, stableId: "c0ffee00-0000-4000-8000-0000000000c1", siteName: "McClear's Cottage", ownerEmail: "owner@example.test", active: true } : undefined,
  );
  mocks.sendNewLeadEmail.mockReset();
  mocks.sendNewLeadEmail.mockResolvedValue(false);
  mocks.alertOnce.mockReset();
  useDb(async () => ({ data: { status: "recorded", id: "row-1", workspaceId: null }, error: null }));
});
afterEach(() => setLeadMirrorDb(undefined));

describe("POST /api/v1/leads/[tenant] dual-write", () => {
  it("keeps the lead in Redis and Postgres and answers exactly as before", async () => {
    const res = await post("mclears-cottage", submission);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    const [stored] = redisLeads("mclears-cottage");
    expect(stored).toMatchObject({ name: "Ada Rivera", message: submission.message });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0]![0]).toBe("record_tenant_lead");
    expect(rpc.mock.calls[0]![1]).toMatchObject({
      p_tenant_id: "mclears-cottage",
      p_via: "dual_write",
      p_lead: { leadId: stored!.id, name: "Ada Rivera", email: "ada@example.test", capturedAt: stored!.createdAt },
    });
    expect(mocks.sendNewLeadEmail).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "mclears-cottage" }));
  });

  it("Postgres down: the visitor still gets 200 {ok:true}; the lead is in Redis and pending repair", async () => {
    useDb(() => Promise.reject(new Error("connect ECONNREFUSED")));
    const res = await post("mclears-cottage", submission);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [stored] = redisLeads("mclears-cottage");
    expect(stored).toBeTruthy();
    expect(redis.zsets.get(LEAD_MIRROR_PENDING_KEY)?.has(`mclears-cottage:${stored!.id}`)).toBe(true);
    expect(mocks.alertOnce).toHaveBeenCalledWith("lead_mirror_failed", "high", { reason: "error" }, 3600);
  });

  it("Postgres hanging: the submission returns within the bound", async () => {
    useDb(() => new Promise(() => {}));
    const started = Date.now();
    const res = await post("mclears-cottage", submission);
    const elapsed = Date.now() - started;
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(elapsed).toBeGreaterThanOrEqual(LEAD_MIRROR_TIMEOUT_MS - 50);
    expect(elapsed).toBeLessThan(LEAD_MIRROR_TIMEOUT_MS + 750);
    expect(redis.zsets.get(LEAD_MIRROR_PENDING_KEY)?.size).toBe(1);
  }, 10_000);

  it("duplicate submit: one lead in Redis, and the retry replays the same lead id to Postgres", async () => {
    useDb(() => Promise.reject(new Error("first attempt fails")));
    await post("mclears-cottage", submission);
    useDb(async () => ({ data: { status: "recorded", id: "row-1", workspaceId: null }, error: null }));
    const res = await post("mclears-cottage", submission);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const leads = redisLeads("mclears-cottage");
    expect(leads).toHaveLength(1);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect((rpc.mock.calls[0]![1] as { p_lead: { leadId: string } }).p_lead.leadId).toBe(leads[0]!.id);
    expect(mocks.sendNewLeadEmail).toHaveBeenCalledTimes(1);
  });

  it("oversized payload: truncated to the contract limits in both stores, still 200", async () => {
    const res = await post("mclears-cottage", {
      name: "N".repeat(5000),
      email: "ada@example.test",
      message: "M".repeat(200_000),
      source: "S".repeat(500),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    const [stored] = redisLeads("mclears-cottage");
    expect((stored!.name as string).length).toBe(200);
    expect((stored!.message as string).length).toBe(5000);
    const payload = (rpc.mock.calls[0]![1] as { p_lead: Record<string, string> }).p_lead;
    expect(payload.name!.length).toBe(200);
    expect(payload.message!.length).toBe(5000);
    expect(payload.source!.length).toBe(80);
  });

  it("unknown tenant: 404 as before, nothing written anywhere", async () => {
    const res = await post("no-such-site", submission);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Tenant not found" });
    expect(redis.zsets.size).toBe(0);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("Redis gone: still 200 {ok:true} as before, and Postgres keeps the lead", async () => {
    redisAvailable = false;
    const res = await post("mclears-cottage", submission);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect((rpc.mock.calls[0]![1] as { p_lead: { name: string } }).p_lead.name).toBe("Ada Rivera");
  });

  // Audit finding 5 (2026-10-05): with Redis gone, the beacon must not claim
  // receipt unless the Postgres copy actually holds the lead.
  it("Redis gone and the Postgres copy fails: 503, never a 200 receipt", async () => {
    redisAvailable = false;
    useDb(async () => ({ data: null, error: { message: "connection refused" } }));
    const res = await post("mclears-cottage", submission);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "Lead storage is temporarily unavailable.", code: "lead_storage_unavailable" });
  });

  it("Redis gone and the Postgres copy is not configured: 503, never a 200 receipt", async () => {
    redisAvailable = false;
    setLeadMirrorDb(null);
    const res = await post("mclears-cottage", submission);
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ code: "lead_storage_unavailable" });
  });

  it("a missing name is still a 400 and writes nothing", async () => {
    const res = await post("mclears-cottage", { email: "ada@example.test" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "name is required" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
