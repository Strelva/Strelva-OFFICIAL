import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRedisMock } from "./support/redis-mock";

const redis = makeRedisMock();
let redisAvailable = true;
const alertOnce = vi.hoisted(() => vi.fn());
vi.mock("@/lib/redis", () => ({ getRedis: () => (redisAvailable ? redis : null) }));
vi.mock("@/lib/monitoring", () => ({ alertOnce }));

import {
  LEAD_MIRROR_LAST_FAILURE_KEY,
  LEAD_MIRROR_FAILURE_TIMEOUT_MS,
  LEAD_MIRROR_PENDING_KEY,
  getLeadMirrorHealth,
  leadMirrorPayload,
  mirrorLead,
  setLeadMirrorDb,
  type LeadMirrorDb,
} from "@/lib/lead-mirror";

const lead = {
  id: "lead_11111111-1111-4111-8111-111111111111",
  name: "Ada Rivera",
  email: "ada@example.test",
  message: "Do you ship to Ohio?",
  source: "contact-form",
  createdAt: "2026-10-05T12:00:00.000Z",
};

function db(impl: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>) {
  const rpc = vi.fn(impl);
  setLeadMirrorDb({ rpc } as unknown as LeadMirrorDb);
  return rpc;
}

beforeEach(() => {
  redis.store.clear();
  redis.zsets.clear();
  redisAvailable = true;
  alertOnce.mockReset();
  vi.unstubAllEnvs();
});
afterEach(() => { setLeadMirrorDb(undefined); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("mirrorLead", () => {
  it("writes the lead through record_tenant_lead with the submission hash", async () => {
    const rpc = db(async () => ({ data: { status: "recorded", id: "row-1", workspaceId: null }, error: null }));
    await expect(mirrorLead("gldf", lead, "abc123")).resolves.toEqual({ status: "recorded", id: "row-1", workspaceId: null });
    expect(rpc).toHaveBeenCalledWith("record_tenant_lead", {
      p_tenant_id: "gldf",
      p_lead: {
        leadId: lead.id,
        submissionHash: "abc123",
        name: "Ada Rivera",
        email: "ada@example.test",
        message: "Do you ship to Ohio?",
        source: "contact-form",
        capturedAt: lead.createdAt,
      },
      p_via: "dual_write",
    });
    expect(redis.zsets.get(LEAD_MIRROR_PENDING_KEY)).toBeUndefined();
  });

  it("Postgres down: never throws, records the lead as pending and pages", async () => {
    db(async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    });
    await expect(mirrorLead("gldf", lead, "abc123")).resolves.toEqual({ status: "failed", reason: "error" });
    expect([...redis.zsets.get(LEAD_MIRROR_PENDING_KEY)!.keys()]).toEqual([`gldf:${lead.id}`]);
    expect(redis.store.get(LEAD_MIRROR_LAST_FAILURE_KEY)).toMatchObject({ tenant: "gldf", leadId: lead.id, reason: "error" });
    expect(alertOnce).toHaveBeenCalledWith("lead_mirror_failed", "high", { reason: "error" }, 3600);
    await expect(getLeadMirrorHealth()).resolves.toMatchObject({ known: true, pending: 1, lastFailure: { reason: "error" } });
  });

  it("Postgres hanging: gives up at the bound and aborts the request", async () => {
    let signal: AbortSignal | undefined;
    const never = new Promise<never>(() => {});
    setLeadMirrorDb({
      rpc: () => Object.assign(never, {
        abortSignal(s: AbortSignal) {
          signal = s;
          return never;
        },
      }),
    } as unknown as LeadMirrorDb);
    const started = Date.now();
    await expect(mirrorLead("gldf", lead, "abc123", { timeoutMs: 50 })).resolves.toEqual({ status: "failed", reason: "timeout" });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(signal?.aborted).toBe(true);
    expect(redis.zsets.get(LEAD_MIRROR_PENDING_KEY)?.has(`gldf:${lead.id}`)).toBe(true);
  });

  it("classifies database refusals", async () => {
    db(async () => ({ data: null, error: { message: "tenant_lead_unknown_tenant" } }));
    await expect(mirrorLead("ghost", lead, "abc123")).resolves.toEqual({ status: "failed", reason: "unknown_tenant" });
    db(async () => ({ data: null, error: { message: "tenant_lead_invalid" } }));
    await expect(mirrorLead("gldf", lead, "abc123")).resolves.toEqual({ status: "failed", reason: "invalid" });
    db(async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.record_tenant_lead" } }));
    await expect(mirrorLead("gldf", lead, "abc123")).resolves.toEqual({ status: "failed", reason: "schema_missing" });
    // A missing schema pauses live copies (lead-mirror-schema-missing.test.ts); clear it.
    redis.store.clear();
    db(async () => ({ data: { surprise: true }, error: null }));
    await expect(mirrorLead("gldf", lead, "abc123")).resolves.toEqual({ status: "failed", reason: "error" });
  });

  it("bounds the complete failure path when both Redis and alert deduplication stall", async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => {});
    setLeadMirrorDb({ rpc: () => never } as unknown as LeadMirrorDb);
    const queued = vi.spyOn(redis, "zadd").mockReturnValue(never);
    const trim = vi.spyOn(redis, "zremrangebyrank");
    alertOnce.mockReturnValue(never);
    let finished = false;
    const result = mirrorLead("gldf", lead, "abc123", { timeoutMs: 50 }).then(value => { finished = true; return value; });
    await vi.advanceTimersByTimeAsync(50);
    expect(queued).toHaveBeenCalledTimes(1);
    expect(alertOnce).toHaveBeenCalledTimes(1);
    expect(finished).toBe(false);
    await vi.advanceTimersByTimeAsync(LEAD_MIRROR_FAILURE_TIMEOUT_MS);
    await expect(result).resolves.toEqual({ status: "failed", reason: "timeout" });
    expect(trim).not.toHaveBeenCalled();
  });

  it("does not start later Redis writes after a stalled queue request returns past the reporting deadline", async () => {
    vi.useFakeTimers();
    db(async () => ({ data: null, error: { message: "database unavailable" } }));
    let release!: (value: number) => void;
    vi.spyOn(redis, "zadd").mockReturnValue(new Promise(resolve => { release = resolve; }));
    const trim = vi.spyOn(redis, "zremrangebyrank");
    const result = mirrorLead("gldf", lead, "abc123");
    await vi.advanceTimersByTimeAsync(LEAD_MIRROR_FAILURE_TIMEOUT_MS);
    await expect(result).resolves.toEqual({ status: "failed", reason: "error" });
    release(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(trim).not.toHaveBeenCalled();
    expect(redis.store.has(LEAD_MIRROR_LAST_FAILURE_KEY)).toBe(false);
  });

  it("still pages when Redis is gone too", async () => {
    redisAvailable = false;
    db(async () => ({ data: null, error: { message: "boom" } }));
    await expect(mirrorLead("gldf", lead, "abc123")).resolves.toEqual({ status: "failed", reason: "error" });
    expect(alertOnce).toHaveBeenCalledTimes(1);
  });

  it("backfill failures are reported by the script, not recorded as pending", async () => {
    db(async () => ({ data: null, error: { message: "boom" } }));
    await mirrorLead("gldf", lead, "abc123", { via: "backfill" });
    expect(redis.zsets.get(LEAD_MIRROR_PENDING_KEY)).toBeUndefined();
    expect(alertOnce).not.toHaveBeenCalled();
  });

  it("is a no-op when the kill switch is off or Supabase is unconfigured", async () => {
    const rpc = db(async () => ({ data: { status: "recorded", id: "x" }, error: null }));
    vi.stubEnv("DUAL_WRITE_PG", "0");
    await expect(mirrorLead("gldf", lead, "abc123")).resolves.toEqual({ status: "skipped", reason: "disabled" });
    expect(rpc).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    setLeadMirrorDb(null);
    await expect(mirrorLead("gldf", lead, "abc123")).resolves.toEqual({ status: "skipped", reason: "unconfigured" });
  });
});

describe("leadMirrorPayload", () => {
  it("bounds every field to the store's limits and drops what Postgres can't hold", () => {
    const payload = leadMirrorPayload(
      {
        ...lead,
        name: "N".repeat(1000),
        email: "e".repeat(400),
        message: `Hi\u0000 there ${"m".repeat(20_000)}`,
        source: "s".repeat(200),
        fields: Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`field${i}`, "v".repeat(9000)])),
        capabilityId: "c".repeat(500),
        capabilityVersion: 0,
      },
      "abc123",
    );
    expect((payload.name as string).length).toBe(200);
    expect((payload.email as string).length).toBe(320);
    expect((payload.message as string).length).toBe(5000);
    expect(payload.message as string).not.toContain("\u0000");
    expect((payload.source as string).length).toBe(80);
    expect(Object.keys(payload.fields as object)).toHaveLength(30);
    expect(Object.values(payload.fields as Record<string, string>).every((v) => v.length === 5000)).toBe(true);
    expect((payload.capabilityId as string).length).toBe(200);
    expect(payload).not.toHaveProperty("capabilityVersion");
  });

  it("replaces a surrogate half cut by truncation", () => {
    const payload = leadMirrorPayload({ ...lead, message: `${"a".repeat(4999)}\u{1F600}` }, "abc123");
    expect(payload.message).toBe(`${"a".repeat(4999)}�`);
  });
});
