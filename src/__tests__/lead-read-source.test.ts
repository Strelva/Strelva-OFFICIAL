import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRedisMock } from "./support/redis-mock";

// The read-source switch inside src/lib/leads.ts (inquiry 1.0 delta, section
// 6): redis (today), compare, postgres, and Postgres authority on capture.
// The real leads module, the real lead mirror and lead-reads modules, a Redis
// double, and an in-memory stand-in for the tenant_leads RPCs.

const redis = makeRedisMock();
const originalSet = redis.set;
let redisAvailable = true;
const mocks = vi.hoisted(() => ({ tenant: vi.fn(), sendNewLeadEmail: vi.fn(), alertOnce: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => (redisAvailable ? redis : null) }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.tenant, getAllTenants: async () => [{ id: "t1" }, { id: "t2" }] }));
vi.mock("@/lib/delivery-email", () => ({ sendNewLeadEmail: mocks.sendNewLeadEmail }));
vi.mock("@/platform/infra/monitoring", () => ({ alertOnce: mocks.alertOnce }));
vi.mock("@/lib/owner-recipient", () => ({ ownerNoticeEmail: async (t: { ownerEmail?: string }) => t.ownerEmail ?? null }));

import { captureLead, getLeadById, getLeads, getLeadSummary, leadSubmissionHash, type LeadRecord } from "@/lib/leads";
import { LEAD_MIRROR_PENDING_KEY, setLeadMirrorDb, type LeadMirrorDb } from "@/lib/lead-mirror";
import { compareLeadLists, leadFromPostgres, leadReadSource, resetLeadReadCache } from "@/lib/lead-reads";
import { runLeadReadParity } from "@/lib/client-leads";

type Row = { tenant: string; leadId: string; hash: string; lead: Record<string, unknown>; capturedAt: string };
let rows: Row[] = [];
let streakDays = 0;
let parity: Array<Record<string, unknown>> = [];
let pgDown = false;

function pgItem(row: Row) {
  return {
    leadId: row.leadId,
    name: row.lead.name,
    email: row.lead.email ?? null,
    message: row.lead.message ?? null,
    source: row.lead.source ?? null,
    fields: row.lead.fields ?? null,
    capabilityId: row.lead.capabilityId ?? null,
    capabilityVersion: row.lead.capabilityVersion ?? null,
    capturedAt: row.capturedAt,
    submissionHash: row.hash,
  };
}

const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
  if (pgDown) return { data: null, error: { message: "connection refused" } };
  if (name === "record_tenant_lead") {
    const lead = args.p_lead as Record<string, unknown>;
    const tenant = String(args.p_tenant_id);
    const same = rows.find((r) => r.tenant === tenant && r.leadId === lead.leadId);
    if (same) return { data: { status: "exists", id: same.leadId, workspaceId: null }, error: null };
    const dup = rows.find((r) => r.tenant === tenant && r.hash === lead.submissionHash
      && Math.abs(Date.parse(r.capturedAt) - Date.parse(String(lead.capturedAt))) <= 300_000);
    if (dup) return { data: { status: "duplicate", id: dup.leadId, leadId: dup.leadId, workspaceId: null }, error: null };
    rows.push({ tenant, leadId: String(lead.leadId), hash: String(lead.submissionHash), lead, capturedAt: String(lead.capturedAt) });
    return { data: { status: "recorded", id: lead.leadId, workspaceId: null }, error: null };
  }
  if (name === "read_tenant_leads") {
    const list = rows.filter((r) => r.tenant === args.p_tenant_id)
      .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
      .slice(0, Number(args.p_limit));
    return { data: list.map(pgItem), error: null };
  }
  if (name === "read_tenant_lead") {
    const row = rows.find((r) => r.tenant === args.p_tenant_id && r.leadId === args.p_lead_id);
    return { data: row ? pgItem(row) : null, error: null };
  }
  if (name === "read_tenant_lead_digests") {
    return { data: Object.fromEntries(rows.filter((r) => r.tenant === args.p_tenant_id).map((r) => [r.leadId, r.hash])), error: null };
  }
  if (name === "client_record_parity_streak") return { data: { store: args.p_store, days: streakDays }, error: null };
  if (name === "record_client_record_parity") {
    parity.push(args);
    return { data: { ok: args.p_missing === 0 && args.p_mismatched === 0 }, error: null };
  }
  return { data: null, error: { message: `unexpected ${name}` } };
});

function redisOnlyLead(tenant: string, id: string, createdAt: string, name = "Redis Only"): LeadRecord {
  const lead: LeadRecord = { id, name, message: "hi", createdAt };
  redis.store.set(`lead:${tenant}:${id}`, lead);
  const zset = redis.zsets.get(`leads:${tenant}`) ?? new Map<string, number>();
  zset.set(id, Date.parse(createdAt));
  redis.zsets.set(`leads:${tenant}`, zset);
  return lead;
}

function pgOnlyLead(tenant: string, id: string, capturedAt: string, name = "Postgres Only"): void {
  const lead = { leadId: id, name, message: "old", capturedAt };
  rows.push({ tenant, leadId: id, hash: leadSubmissionHash({ id, name, message: "old", createdAt: capturedAt }), lead, capturedAt });
}

beforeEach(() => {
  redis.store.clear();
  redis.zsets.clear();
  redisAvailable = true;
  rows = [];
  parity = [];
  streakDays = 0;
  pgDown = false;
  rpc.mockClear();
  mocks.alertOnce.mockReset();
  mocks.alertOnce.mockResolvedValue(undefined);
  mocks.sendNewLeadEmail.mockReset();
  mocks.sendNewLeadEmail.mockResolvedValue(true);
  mocks.tenant.mockReset();
  mocks.tenant.mockResolvedValue({ id: "t1", siteName: "McClear's", ownerEmail: "owner@example.test" });
  setLeadMirrorDb({ rpc } as unknown as LeadMirrorDb);
  resetLeadReadCache();
  vi.stubEnv("DUAL_WRITE_PG", "1");
  vi.stubEnv("STRELVA_LEADS_READ", "");
  vi.stubEnv("STRELVA_LEADS_AUTHORITY", "");
});

afterEach(() => {
  redis.set = originalSet;
  setLeadMirrorDb(undefined);
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("read source", () => {
  it("defaults to Redis and does no Postgres read", async () => {
    const lead = redisOnlyLead("t1", "lead_a", "2026-10-05T10:00:00.000Z");
    expect(await leadReadSource()).toBe("redis");
    expect(await getLeads("t1")).toEqual([lead]);
    expect(await getLeadById("t1", "lead_a")).toEqual(lead);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats a typo as Redis (fails closed)", async () => {
    vi.stubEnv("STRELVA_LEADS_READ", "postgress");
    expect(await leadReadSource()).toBe("redis");
  });

  it("postgres is only honoured after 7 days of parity; before that it compares", async () => {
    vi.stubEnv("STRELVA_LEADS_READ", "postgres");
    streakDays = 6;
    expect(await leadReadSource()).toBe("compare");
    resetLeadReadCache();
    streakDays = 7;
    expect(await leadReadSource()).toBe("postgres");
  });

  it("an unreadable streak keeps compare, never postgres", async () => {
    vi.stubEnv("STRELVA_LEADS_READ", "postgres");
    pgDown = true;
    expect(await leadReadSource()).toBe("compare");
  });
});

describe("compare mode", () => {
  beforeEach(() => vi.stubEnv("STRELVA_LEADS_READ", "compare"));

  it("serves Redis and reports a lead Redis has and Postgres lacks", async () => {
    const lead = redisOnlyLead("t1", "lead_r", "2026-10-05T10:00:00.000Z");
    const served = await getLeads("t1");
    expect(served).toEqual([lead]);
    expect(mocks.alertOnce).toHaveBeenCalledWith("lead_read_parity_miss", "high", expect.objectContaining({ tenant: "t1", missing: 1 }), 3600);
  });

  it("does not report a Postgres lead older than Redis's window (explained: Redis expired it)", async () => {
    redisOnlyLead("t1", "lead_both", "2026-10-05T10:00:00.000Z", "Both");
    pgOnlyLead("t1", "lead_both", "2026-10-05T10:00:00.000Z", "Both");
    pgOnlyLead("t1", "lead_ancient", "2026-01-01T10:00:00.000Z");
    expect((await getLeads("t1")).map((l) => l.id)).toEqual(["lead_both"]);
    expect(mocks.alertOnce).not.toHaveBeenCalled();
  });

  it("a Postgres failure still serves Redis", async () => {
    const lead = redisOnlyLead("t1", "lead_r", "2026-10-05T10:00:00.000Z");
    pgDown = true;
    expect(await getLeads("t1")).toEqual([lead]);
    expect(await getLeadById("t1", "lead_r")).toEqual(lead);
  });

  it("by-id compare reports a lead missing from Postgres", async () => {
    redisOnlyLead("t1", "lead_r", "2026-10-05T10:00:00.000Z");
    await getLeadById("t1", "lead_r");
    expect(mocks.alertOnce).toHaveBeenCalledWith("lead_read_parity_miss", "high", expect.objectContaining({ reader: "by_id" }), 3600);
  });
});

describe("postgres mode (flipped reads)", () => {
  beforeEach(() => {
    vi.stubEnv("STRELVA_LEADS_READ", "postgres");
    streakDays = 7;
  });

  it("reads a lead older than 90 days that Redis no longer has", async () => {
    pgOnlyLead("t1", "lead_ancient", "2026-01-01T10:00:00.000Z");
    const leads = await getLeads("t1", 500);
    expect(leads.map((l) => l.id)).toEqual(["lead_ancient"]);
    expect(leads[0]).toEqual({ id: "lead_ancient", name: "Postgres Only", message: "old", createdAt: "2026-01-01T10:00:00.000Z" });
    expect(await getLeadById("t1", "lead_ancient")).toMatchObject({ id: "lead_ancient", createdAt: "2026-01-01T10:00:00.000Z" });
  });

  it("never shows less than Redis: a lead still pending its Postgres copy is merged in, newest first", async () => {
    pgOnlyLead("t1", "lead_pg", "2026-10-01T10:00:00.000Z");
    redisOnlyLead("t1", "lead_pending", "2026-10-05T10:00:00.000Z");
    expect((await getLeads("t1")).map((l) => l.id)).toEqual(["lead_pending", "lead_pg"]);
    expect(await getLeadById("t1", "lead_pending")).toMatchObject({ id: "lead_pending" });
  });

  it("a Postgres failure serves Redis (rollback without a switch flip)", async () => {
    const lead = redisOnlyLead("t1", "lead_r", "2026-10-05T10:00:00.000Z");
    pgOnlyLead("t1", "lead_r", "2026-10-05T10:00:00.000Z");
    resetLeadReadCache();
    await leadReadSource();
    pgDown = true;
    expect(await getLeads("t1")).toEqual([lead]);
    expect(await getLeadById("t1", "lead_r")).toEqual(lead);
  });

  it("a Redis outage no longer fails the read", async () => {
    pgOnlyLead("t1", "lead_pg", "2026-10-01T10:00:00.000Z");
    redisAvailable = false;
    expect((await getLeads("t1")).map((l) => l.id)).toEqual(["lead_pg"]);
  });

  it("the summary counts from Postgres", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.parse("2026-10-06T00:00:00.000Z"));
    pgOnlyLead("t1", "lead_1", "2026-10-01T10:00:00.000Z");
    pgOnlyLead("t1", "lead_2", "2026-10-02T10:00:00.000Z");
    pgOnlyLead("t1", "lead_old", "2026-06-01T10:00:00.000Z");
    const summary = await getLeadSummary("t1", 30);
    expect(summary.count).toBe(2);
    expect(summary.recent.map((l) => l.id)).toEqual(["lead_2", "lead_1"]);
    vi.useRealTimers();
  });

  it("rollback: switching back to redis serves Redis again; both stores kept every write", async () => {
    const captured = await captureLead("t1", { name: "Dana", email: "dana@example.test", message: "Party for 30" });
    expect(captured.status).toBe("captured");
    expect(rows).toHaveLength(1);
    expect(redis.store.has(`lead:t1:${(captured as { lead: LeadRecord }).lead.id}`)).toBe(true);
    vi.stubEnv("STRELVA_LEADS_READ", "redis");
    expect((await getLeads("t1")).map((l) => l.name)).toEqual(["Dana"]);
  });
});

describe("Postgres authority on capture", () => {
  beforeEach(() => vi.stubEnv("STRELVA_LEADS_AUTHORITY", "postgres"));

  it("writes tenant_leads first, then Redis as the cache, then notifies once", async () => {
    const order: string[] = [];
    rpc.mockImplementationOnce(async (name, args) => {
      order.push(name);
      const lead = args.p_lead as Record<string, unknown>;
      rows.push({ tenant: "t1", leadId: String(lead.leadId), hash: String(lead.submissionHash), lead, capturedAt: String(lead.capturedAt) });
      expect(redis.zsets.get("leads:t1")).toBeUndefined();
      return { data: { status: "recorded", id: lead.leadId, workspaceId: null }, error: null };
    });
    const result = await captureLead("t1", { name: "Dana", email: "dana@example.test", message: "Party for 30" });
    expect(order).toEqual(["record_tenant_lead"]);
    expect(result.status).toBe("captured");
    expect(redis.zsets.get("leads:t1")?.size).toBe(1);
    expect(mocks.sendNewLeadEmail).toHaveBeenCalledTimes(1);
  });

  it("Postgres decides duplicates: a double submit is one lead and one notice", async () => {
    const first = await captureLead("t1", { name: "Dana", message: "Party for 30" });
    const second = await captureLead("t1", { name: "Dana", message: "Party for 30" });
    expect(first.status).toBe("captured");
    expect(second).toMatchObject({ status: "duplicate", lead: { id: (first as { lead: LeadRecord }).lead.id } });
    expect(rows).toHaveLength(1);
    expect(mocks.sendNewLeadEmail).toHaveBeenCalledTimes(1);
  });

  it("Postgres down: the visitor still succeeds, the lead is in Redis and the pending queue", async () => {
    pgDown = true;
    const result = await captureLead("t1", { name: "Dana", message: "Party for 30" });
    expect(result.status).toBe("captured");
    const id = (result as { lead: LeadRecord }).lead.id;
    expect(redis.store.get(`lead:t1:${id}`)).toMatchObject({ name: "Dana" });
    expect(redis.zsets.get(LEAD_MIRROR_PENDING_KEY)?.has(`t1:${id}`)).toBe(true);
  });

  it("Redis down after Postgres kept the lead: the visitor still succeeds", async () => {
    redis.set = vi.fn(async () => { throw new Error("redis down"); }) as typeof redis.set;
    const result = await captureLead("t1", { name: "Dana", message: "Party for 30" });
    expect(result.status).toBe("captured");
    expect(rows).toHaveLength(1);
  });

  it("both stores down: today's error (not made worse)", async () => {
    pgDown = true;
    redis.set = vi.fn(async () => { throw new Error("redis down"); }) as typeof redis.set;
    await expect(captureLead("t1", { name: "Dana", message: "Party for 30" })).rejects.toThrow("redis down");
  });

  it("without Supabase configured, capture behaves exactly as today", async () => {
    setLeadMirrorDb(null);
    const result = await captureLead("t1", { name: "Dana", message: "Party for 30" });
    expect(result.status).toBe("captured");
    expect(redis.zsets.get("leads:t1")?.size).toBe(1);
  });

  it("the DUAL_WRITE_PG kill switch also turns authority off", async () => {
    vi.stubEnv("DUAL_WRITE_PG", "0");
    const result = await captureLead("t1", { name: "Dana", message: "Party for 30" });
    expect(result.status).toBe("captured");
    expect(rows).toHaveLength(0);
  });
});

describe("daily parity", () => {
  it("does nothing while reads are on Redis", async () => {
    expect(await runLeadReadParity({ mode: "redis" })).toMatchObject({ ran: false, checked: 0 });
    expect(parity).toEqual([]);
  });

  it("records one result per tenant; a lead missing from Postgres breaks parity", async () => {
    const both = await captureLead("t1", { name: "Dana", message: "Party for 30" });
    expect(both.status).toBe("captured");
    redisOnlyLead("t2", "lead_lost", "2026-10-05T10:00:00.000Z");
    const run = await runLeadReadParity({ mode: "compare" });
    expect(run).toMatchObject({ ran: true, checked: 2, inParity: 1, outOfParity: [{ tenant: "t2", missing: 1, mismatched: 0 }] });
    expect(parity).toEqual([
      expect.objectContaining({ p_store: "tenant_leads", p_tenant_id: "t1", p_missing: 0, p_mismatched: 0 }),
      expect.objectContaining({ p_store: "tenant_leads", p_tenant_id: "t2", p_missing: 1 }),
    ]);
  });

  it("a hash mismatch is unexplained", async () => {
    redisOnlyLead("t1", "lead_x", "2026-10-05T10:00:00.000Z", "Dana");
    rows.push({ tenant: "t1", leadId: "lead_x", hash: "zzz", lead: {}, capturedAt: "2026-10-05T10:00:00.000Z" });
    const run = await runLeadReadParity({ mode: "compare", tenants: async () => ["t1"] });
    expect(run.outOfParity).toEqual([{ tenant: "t1", missing: 0, mismatched: 1 }]);
  });

  it("an unreadable store records nothing that day", async () => {
    pgDown = true;
    const run = await runLeadReadParity({ mode: "compare", tenants: async () => ["t1"] });
    expect(run.failed).toHaveLength(1);
    expect(parity).toEqual([]);
  });
});

describe("mapping", () => {
  it("lead_id -> id and captured_at -> createdAt; nulls omitted", () => {
    expect(leadFromPostgres({ leadId: "lead_1", name: "A", email: null, message: null, source: "contact-form", fields: { guests: "30" }, capabilityId: null, capabilityVersion: null, capturedAt: "2026-10-05T10:00:00.000Z" }))
      .toEqual({ id: "lead_1", name: "A", source: "contact-form", fields: { guests: "30" }, createdAt: "2026-10-05T10:00:00.000Z" });
    expect(leadFromPostgres({ name: "no id" })).toBeNull();
  });

  it("compares only the window both lists cover", () => {
    const at = (id: string, createdAt: string) => ({ id, name: id, createdAt });
    const diff = compareLeadLists(
      [at("a", "2026-10-05T00:00:00Z"), at("b", "2026-10-04T00:00:00Z")],
      [at("a", "2026-10-05T00:00:00Z"), at("c", "2026-10-04T12:00:00Z"), at("old", "2026-01-01T00:00:00Z")],
    );
    expect(diff).toEqual({ missingFromPostgres: ["b"], missingFromRedis: ["c"], postgresOlder: 1 });
  });
});
