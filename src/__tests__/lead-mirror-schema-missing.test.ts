import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRedisMock } from "./support/redis-mock";

// Release packet finding 3: DUAL_WRITE_PG defaults on, so a 1.0 deploy before
// `tenant_leads` exists must not fail and page on every lead. The mirror sees
// the missing schema once, pages once, stops calling the RPC, keeps every
// lead recoverable, and resumes by itself once the table exists.

const redis = makeRedisMock();
let redisAvailable = true;
const mocks = vi.hoisted(() => ({
  alertOnce: vi.fn(),
  tenant: vi.fn(),
  sendNewLeadEmail: vi.fn(),
}));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => (redisAvailable ? redis : null) }));
vi.mock("@/platform/infra/monitoring", () => ({ alertOnce: mocks.alertOnce }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.tenant, getAllTenants: async () => [] }));
vi.mock("@/lib/delivery-email", () => ({ sendNewLeadEmail: mocks.sendNewLeadEmail }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: async () => false, rateLimitKey: () => "schema-missing-test" }));
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

import {
  LEAD_MIRROR_LAST_FAILURE_KEY,
  LEAD_MIRROR_PENDING_KEY,
  LEAD_MIRROR_SCHEMA_MISSING_KEY,
  LEAD_MIRROR_SCHEMA_RECHECK_MS,
  getLeadMirrorHealth,
  mirrorLead,
  setLeadMirrorDb,
  type LeadMirrorDb,
  type LeadMirrorSchemaMissing,
} from "@/lib/lead-mirror";
import { reconcileLeadMirror } from "@/lib/client-leads";
import { POST } from "@/app/api/v1/leads/[tenant]/route";

const MISSING_FN = { code: "PGRST202", message: "Could not find the function public.record_tenant_lead(p_lead, p_tenant_id, p_via) in the schema cache" };
const RECORDED = { data: { status: "recorded", id: "row-1", workspaceId: null }, error: null };

const lead = (n: number) => ({ id: `lead_0000000${n}-1111-4111-8111-111111111111`, name: "Ada Rivera", email: "ada@example.test", createdAt: "2026-10-06T12:00:00.000Z" });

type Rpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
let rpc: ReturnType<typeof vi.fn<Rpc>>;
function useDb(impl: Rpc) {
  rpc = vi.fn<Rpc>(impl);
  setLeadMirrorDb({ rpc } as unknown as LeadMirrorDb);
}
const marker = () => redis.store.get(LEAD_MIRROR_SCHEMA_MISSING_KEY) as LeadMirrorSchemaMissing | undefined;
const pending = () => [...(redis.zsets.get(LEAD_MIRROR_PENDING_KEY)?.keys() ?? [])];
const schemaAlerts = () => mocks.alertOnce.mock.calls.filter(call => call[0] === "lead_mirror_schema_missing");
const failedAlerts = () => mocks.alertOnce.mock.calls.filter(call => call[0] === "lead_mirror_failed");

beforeEach(() => {
  redis.store.clear();
  redis.zsets.clear();
  redisAvailable = true;
  mocks.alertOnce.mockReset();
  mocks.sendNewLeadEmail.mockReset();
  mocks.sendNewLeadEmail.mockResolvedValue(false);
  mocks.tenant.mockReset();
  mocks.tenant.mockImplementation(async (id: string) =>
    id === "mclears-cottage" ? { id, stableId: "c0ffee00-0000-4000-8000-0000000000c1", siteName: "McClear's Cottage", ownerEmail: "owner@example.test", active: true } : undefined,
  );
  vi.unstubAllEnvs();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => { setLeadMirrorDb(undefined); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("lead mirror with no tenant_leads schema", () => {
  it("detects the missing RPC on the first lead, records one marker and pages once", async () => {
    useDb(async () => ({ data: null, error: MISSING_FN }));
    await expect(mirrorLead("gldf", lead(1), "h1")).resolves.toEqual({ status: "failed", reason: "schema_missing" });
    expect(marker()).toMatchObject({ detail: expect.stringContaining("PGRST202") });
    expect(schemaAlerts()).toHaveLength(1);
    expect(schemaAlerts()[0]![1]).toBe("high");
    expect(failedAlerts()).toHaveLength(0);
    expect(pending()).toEqual([`gldf:${lead(1).id}`]);
    await expect(getLeadMirrorHealth()).resolves.toMatchObject({ schemaMissing: { detail: expect.stringContaining("PGRST202") } });
  });

  it("recognises a missing table too (42P01, PGRST205)", async () => {
    useDb(async () => ({ data: null, error: { code: "42P01", message: 'relation "public.tenant_leads" does not exist' } }));
    await expect(mirrorLead("gldf", lead(1), "h1")).resolves.toEqual({ status: "failed", reason: "schema_missing" });
    redis.store.clear();
    useDb(async () => ({ data: null, error: { code: "PGRST205", message: "Could not find the table" } }));
    await expect(mirrorLead("gldf", lead(2), "h2")).resolves.toEqual({ status: "failed", reason: "schema_missing" });
  });

  it("while marked: no further RPC, no further page, every lead still queued for the backfill", async () => {
    useDb(async () => ({ data: null, error: MISSING_FN }));
    await mirrorLead("gldf", lead(1), "h1");
    expect(rpc).toHaveBeenCalledTimes(1);
    for (const n of [2, 3, 4]) {
      await expect(mirrorLead("gldf", lead(n), `h${n}`)).resolves.toEqual({ status: "skipped", reason: "schema_missing" });
    }
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(schemaAlerts()).toHaveLength(1);
    expect(failedAlerts()).toHaveLength(0);
    expect(pending()).toHaveLength(4);
  });

  it("rechecks once the window passes, and a found table clears the marker and resumes copies", async () => {
    useDb(async () => ({ data: null, error: MISSING_FN }));
    await mirrorLead("gldf", lead(1), "h1");
    // Still missing at the next check: one RPC, marker kept, no second page.
    redis.store.set(LEAD_MIRROR_SCHEMA_MISSING_KEY, { ...marker()!, checkedAt: new Date(Date.now() - LEAD_MIRROR_SCHEMA_RECHECK_MS - 1).toISOString() });
    const since = marker()!.since;
    await expect(mirrorLead("gldf", lead(2), "h2")).resolves.toEqual({ status: "failed", reason: "schema_missing" });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(marker()!.since).toBe(since);
    expect(schemaAlerts()).toHaveLength(1);
    // The migration lands; the next due check copies and clears.
    redis.store.set(LEAD_MIRROR_SCHEMA_MISSING_KEY, { ...marker()!, checkedAt: new Date(Date.now() - LEAD_MIRROR_SCHEMA_RECHECK_MS - 1).toISOString() });
    useDb(async () => RECORDED);
    await expect(mirrorLead("gldf", lead(3), "h3")).resolves.toMatchObject({ status: "recorded" });
    expect(marker()).toBeUndefined();
    await expect(mirrorLead("gldf", lead(4), "h4")).resolves.toMatchObject({ status: "recorded" });
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("the backfill always tries and its success clears the marker", async () => {
    useDb(async () => ({ data: null, error: MISSING_FN }));
    await mirrorLead("gldf", lead(1), "h1");
    useDb(async () => RECORDED);
    await expect(mirrorLead("gldf", lead(1), "h1", { via: "backfill" })).resolves.toMatchObject({ status: "recorded" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(marker()).toBeUndefined();
  });

  it("a transient error keeps today's behavior: per-reason page, no marker", async () => {
    useDb(async () => ({ data: null, error: { code: "57014", message: "canceling statement due to statement timeout" } }));
    await expect(mirrorLead("gldf", lead(1), "h1")).resolves.toEqual({ status: "failed", reason: "error" });
    await expect(mirrorLead("gldf", lead(2), "h2")).resolves.toEqual({ status: "failed", reason: "error" });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(marker()).toBeUndefined();
    expect(failedAlerts()).toHaveLength(2);
    expect(redis.store.get(LEAD_MIRROR_LAST_FAILURE_KEY)).toMatchObject({ reason: "error" });
  });

  it("Redis down: no marker can be kept, so each lead tries Postgres as before", async () => {
    redisAvailable = false;
    useDb(async () => ({ data: null, error: MISSING_FN }));
    await mirrorLead("gldf", lead(1), "h1");
    await mirrorLead("gldf", lead(2), "h2");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe("reconcile cron with no tenant_leads schema", () => {
  async function seedPending(n: number) {
    for (let i = 1; i <= n; i++) {
      const l = lead(i);
      redis.store.set(`lead:gldf:${l.id}`, l);
      redis.zsets.set(LEAD_MIRROR_PENDING_KEY, (redis.zsets.get(LEAD_MIRROR_PENDING_KEY) ?? new Map()).set(`gldf:${l.id}`, i));
    }
  }

  it("stops at the first missing-schema answer instead of failing every lead", async () => {
    await seedPending(5);
    useDb(async () => ({ data: null, error: MISSING_FN }));
    const result = await reconcileLeadMirror({ limit: 200 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ schemaMissing: true, failed: 0, repaired: 0, remaining: 5 });
    expect(schemaAlerts()).toHaveLength(1);
  });

  it("while marked and not due, makes no RPC at all", async () => {
    await seedPending(3);
    useDb(async () => ({ data: null, error: MISSING_FN }));
    await reconcileLeadMirror({ limit: 200 });
    await reconcileLeadMirror({ limit: 200 });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(schemaAlerts()).toHaveLength(1);
  });

  it("copies the whole backlog on the first due run after the migration", async () => {
    await seedPending(3);
    useDb(async () => ({ data: null, error: MISSING_FN }));
    await reconcileLeadMirror({ limit: 200 });
    redis.store.set(LEAD_MIRROR_SCHEMA_MISSING_KEY, { ...marker()!, checkedAt: new Date(Date.now() - LEAD_MIRROR_SCHEMA_RECHECK_MS - 1).toISOString() });
    useDb(async () => RECORDED);
    const result = await reconcileLeadMirror({ limit: 200 });
    expect(result).toMatchObject({ repaired: 3, failed: 0, remaining: 0 });
    expect(result.schemaMissing).toBeUndefined();
    expect(marker()).toBeUndefined();
  });
});

describe("POST /api/v1/leads with no tenant_leads schema", () => {
  const submission = { name: "Ada Rivera", email: "ada@example.test", message: "Is the cottage free June 3-5?", source: "contact-form" };
  const post = () => POST(
    new Request("https://app.strelva.com/api/v1/leads/mclears-cottage", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://mclearscottage.com" },
      body: JSON.stringify(submission),
    }),
    { params: Promise.resolve({ tenant: "mclears-cottage" }) },
  );

  it("answers the visitor exactly as before, first lead and every later one", async () => {
    useDb(async () => ({ data: null, error: MISSING_FN }));
    for (const message of ["first", "second", "third"]) {
      const res = await (POST(
        new Request("https://app.strelva.com/api/v1/leads/mclears-cottage", {
          method: "POST",
          headers: { "content-type": "application/json", origin: "https://mclearscottage.com" },
          body: JSON.stringify({ ...submission, message }),
        }),
        { params: Promise.resolve({ tenant: "mclears-cottage" }) },
      ));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
    }
    expect(redis.zsets.get("leads:mclears-cottage")?.size).toBe(3);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(pending()).toHaveLength(3);
    expect(schemaAlerts()).toHaveLength(1);
    expect(failedAlerts()).toHaveLength(0);
  });

  it("a marker the capture can't read (Redis read throws) still answers ok", async () => {
    useDb(async () => ({ data: null, error: MISSING_FN }));
    vi.spyOn(redis, "get").mockRejectedValue(new Error("redis down"));
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
