import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => null }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
import { createRedisInquiryDeliveryStore } from "@/products/inquiries/delivery-store";
import { reconcileInquiryProviderEvent } from "@/products/inquiries/reconciliation";
import { deliverInquiryAction } from "@/products/inquiries/delivery";
import { setClientRecordDb, type ClientRecordDb } from "@/platform/client-records/mirror";
import { inquiryDeliveryRecord, firstReplyRecord } from "@/platform/client-records/stores";
const rows = new Map<string, { recordId: string; payload: Record<string, unknown>; capturedAt: string }>();
let failRpc: string | null = null;
let failKind: string | null = null;
const at = "2026-10-08T12:00:00Z";
const accepted = { tenantId: "acme", inquiryId: "lead-a", action: "reply" as const, status: "accepted" as const, attemptId: "attempt-a", attempts: 1, startedAt: at, acceptedAt: at, providerMessageId: "provider-a" };
const db: ClientRecordDb = { rpc(name, args) {
  if (name === failRpc) return Promise.resolve({ data: null, error: { message: "offline" } });
  if (name === "client_record_parity_streak") return Promise.resolve({ data: { days: 7 }, error: null });
  if (name === "read_tenant_client_records_page") return Promise.resolve({ data: [...rows].filter(([key]) => key.startsWith(`${args.p_tenant_id}|${args.p_store}|`)).map(([, row]) => row), error: null });
  if (name === "find_inquiry_delivery_reply_target") return Promise.resolve({ data: null, error: null });
  if (name === "record_tenant_client_record") {
    const payload = args.p_payload as Record<string, unknown>;
    if (payload.kind === failKind || args.p_store === failKind) return Promise.resolve({ data: null, error: { message: "offline" } });
    const key = `${args.p_tenant_id}|${args.p_store}|${args.p_record_id}`;
    if (args.p_mode === "keep_first" && rows.has(key) && Date.parse(rows.get(key)!.capturedAt) <= Date.parse(String(args.p_captured_at))) return Promise.resolve({ data: { status: "kept" }, error: null });
    rows.set(key, { recordId: String(args.p_record_id), payload, capturedAt: String(args.p_captured_at) });
    return Promise.resolve({ data: { status: "recorded" }, error: null });
  }
  return Promise.resolve({ data: null, error: { message: "unexpected_rpc" } });
} };
function seed(kind: Parameters<typeof inquiryDeliveryRecord>[0], key: string, value: unknown) {
  const row = inquiryDeliveryRecord(kind, key, value, at);
  rows.set(`acme|inquiry_delivery|${row.recordId}`, row);
}
function cache() {
  const values = new Map<string, unknown>();
  const redis = {
    get: vi.fn(async (key: string) => values.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown, options?: { nx?: boolean }) => { if (options?.nx && values.has(key)) return null; values.set(key, value); return "OK"; }),
    del: vi.fn(async (key: string) => { values.delete(key); return 1; }),
    zadd: vi.fn(async () => 1), zrange: vi.fn(async () => []), zremrangebyrank: vi.fn(async () => 0),
    eval: vi.fn(async (script: string, keys: string[], args: string[]) => {
      const key = keys[0];
      if (key === undefined) throw new Error("Controlled Redis script requires its first key");
      if (script.includes('local ttl = tonumber(ARGV[5])')) { keys.forEach((key, index) => { if (args[index]) values.set(key, args[index]); }); return 1; }
      if (script.includes('if current.attemptId ~= ARGV[2]') || script.includes('local currentPriority = priority')) { values.set(key, args[0]); return args[0]; }
      if (script.includes('return "claimed"')) { if(values.get(key) === "completed") return "completed"; values.set(key, args[0]); return "claimed"; }
      if (script.includes('if redis.call("GET", KEYS[1]) == ARGV[1]')) { values.delete(key); return 1; }
      if (script.includes('if redis.call("GET", KEYS[1]) ~= ARGV[1]')) { values.set(key, "completed"); return 1; }
      return 1;
    }),
  };
  return { values, redis, store: createRedisInquiryDeliveryStore(redis as never) };
}
const attempt = { tenantId: "acme", inquiryId: "lead-a", action: "reply" as const, now: at, maxAttempts: 3, budget: { policyVersion: "p", limit: 5, now: at, timezone: "UTC" } };
beforeEach(() => {
  rows.clear(); failRpc = null; failKind = null; setClientRecordDb(db);
  vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1"); vi.stubEnv("DUAL_WRITE_PG", "1");
  vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", "inquiry_delivery,inquiry_timeline,inquiry_reply");
  vi.stubEnv("STRELVA_INQUIRY_RECORDS", "0");
});
afterEach(() => { setClientRecordDb(undefined); vi.unstubAllEnvs(); });
describe("qualified inquiry delivery authority", () => {
  it("recovers the accepted checkpoint and provider routing without Redis", async () => {
    seed("checkpoint", "lead-a:reply", accepted);
    seed("provider_target", "provider-a", accepted);
    const store = createRedisInquiryDeliveryStore(null);
    expect(await store.getCheckpoint(attempt)).toMatchObject({ status: "accepted", providerMessageId: "provider-a" });
    expect(await store.findByProviderMessageId!({ tenantId: "acme", providerMessageId: "provider-a" })).toEqual({ inquiryId: "lead-a", action: "reply" });
    expect(store.durable).toBe(false); // Atomic sends still require the Redis claim/budget prerequisite.
  });
  it.each(["accepted", "unknown"] as const)("recovers %s through the real orchestrator with Redis absent and never sends", async status => {
    seed("checkpoint", "lead-a:reply", status === "accepted" ? accepted : { ...accepted, status: "unknown", acceptedAt: undefined, providerMessageId: undefined, retryable: false });
    const transport = { send: vi.fn(), verify: vi.fn() };
    const inquiry = { id: "lead-a", tenantId: "acme", name: "Example visitor", email: "visitor@example.test", receivedAt: at };
    const result = await deliverInquiryAction(inquiry, "reply", {
      policy: { version: "p", paused: false, autoReply: { mode: "auto", enabled: true, delayHours: 0, budgetHours: 24, maxAttempts: 3 }, ownerNotification: "legacy" },
      responsibilityGate: { allowed: true, action: "reply", evaluation: { decision: "allow", action: "reply", reason: "current responsibility", clause: null, disclosedAs: "Strelva" }, budget: attempt.budget },
      deps: { store: createRedisInquiryDeliveryStore(null), transport, now: () => new Date(at), isWorkspaceExited: async () => false,
        resolveRoute: async () => ({ tenantId: "acme", businessName: "Example business", customerEmail: inquiry.email, ownerEmail: null, ownerNotification: "legacy", customerReplyTo: null }) },
    });
    expect(result).toMatchObject({ status: status === "accepted" ? "accepted_unverified" : "reconciliation_required", retryable: false });
    if (status === "accepted") expect(result).toMatchObject({ providerMessageId: "provider-a", acceptedAt: at });
    expect(transport.send).not.toHaveBeenCalled(); expect(transport.verify).not.toHaveBeenCalled();
  });
  it("does not substitute cached markers or inbound routing on a selected durable outage", async () => {
    const input = cache(); input.values.set("reb:inquiry-delivery:acme:lead-a:reply", accepted);
    failRpc = "read_tenant_client_records_page";
    await expect(input.store.getCheckpoint(attempt)).rejects.toThrow(/durable_read_unavailable/);
    failRpc = "find_inquiry_delivery_reply_target";
    input.values.set("reb:inquiry-reply-address:reply%40example.test", { tenantId: "acme", inquiryId: "lead-a", replyTo: "reply@example.test" });
    await expect(input.store.findByReplyAddressAny!({ replyTo: "reply@example.test" })).rejects.toThrow();
  });
  it("does not acquire a send when its durable sending marker cannot be committed", async () => {
    const input = cache(); failKind = "checkpoint";
    await expect(input.store.beginAttempt(attempt)).rejects.toThrow(/durable_write/);
    failKind = null;
    expect(await input.store.beginAttempt(attempt)).toMatchObject({ acquired: false, reason: "reconciliation_required" });
  });
  it("persists acceptance last and repairs the same accepted attempt without another send", async () => {
    const input = cache(); const begun = await input.store.beginAttempt(attempt);
    expect(begun.acquired).toBe(true);
    const acceptance = { ...attempt, attemptId: begun.attemptId!, acceptedAt: at, providerMessageId: "provider-a" };
    failKind = "provider_target";
    await expect(input.store.markAccepted(acceptance)).rejects.toThrow(/durable_write/);
    expect(await input.store.getCheckpoint(attempt)).toMatchObject({ status: "sending" });
    failKind = null;
    await expect(input.store.markAccepted(acceptance)).resolves.toMatchObject({ status: "accepted" });
    const recovered = createRedisInquiryDeliveryStore(null);
    expect(await recovered.getCheckpoint(attempt)).toMatchObject({ status: "accepted" });
    expect(await recovered.findByProviderMessageId!({ tenantId: "acme", providerMessageId: "provider-a" })).toEqual({ inquiryId: "lead-a", action: "reply" });
    expect(rows.get("acme|inquiry_reply|lead-a")?.payload).toEqual(firstReplyRecord("lead-a", at, "reply").payload);
    expect(await input.store.beginAttempt(attempt)).toMatchObject({ acquired: false, reason: "already_accepted" });
  });
  it("repairs a cached completed provider event into durable dedupe before acknowledging completion", async () => {
    const input = cache(); input.values.set("reb:inquiry-delivery-event:acme:event-a", "completed");
    expect(await input.store.claimProviderEvent!({ tenantId: "acme", providerEventId: "event-a" })).toEqual({ status: "completed" });
    input.values.clear();
    expect(await input.store.claimProviderEvent!({ tenantId: "acme", providerEventId: "event-a" })).toEqual({ status: "completed" });
    expect(input.redis.eval).not.toHaveBeenCalled();
  });
  it("keeps qualified timeline events and earliest first reply while Redis is absent", async () => {
    const store = createRedisInquiryDeliveryStore(null);
    const event = { tenantId: "acme", inquiryId: "lead-a", type: "notification_accepted" as const, summary: "Accepted, delivery remains unverified", outcome: "accepted" as const, at };
    await store.appendTimeline(event);
    if (!store.listTimeline) throw new Error("Timeline reader is required for this recovery control");
    expect(await store.listTimeline({ tenantId: "acme", inquiryId: "lead-a" })).toEqual([expect.objectContaining(event)]);
    expect(rows.size).toBe(1);
  });
  it("keeps provider acceptance honest when the separately selected first-reply projection fails", async () => {
    vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", "inquiry_reply"); failKind = "inquiry_reply";
    const input = cache();
    const transport = { send: vi.fn(async () => ({ status: "accepted" as const, providerMessageId: "provider-a", acceptedAt: at })), verify: vi.fn(async () => ({ status: "verified" as const })) };
    const inquiry = { id: "lead-a", tenantId: "acme", name: "Example visitor", email: "visitor@example.test", receivedAt: at };
    const options: Parameters<typeof deliverInquiryAction>[2] = {
      policy: { version: "p", paused: false, autoReply: { mode: "auto", enabled: true, delayHours: 0, budgetHours: 24, maxAttempts: 3 }, ownerNotification: "legacy" },
      responsibilityGate: { allowed: true, action: "reply", evaluation: { decision: "allow", action: "reply", reason: "current responsibility", clause: null, disclosedAs: "Strelva" }, budget: attempt.budget },
      deps: { store: input.store, transport, now: () => new Date(at), isWorkspaceExited: async () => false,
        resolveRoute: async () => ({ tenantId: "acme", businessName: "Example business", customerEmail: inquiry.email, ownerEmail: null, ownerNotification: "legacy", customerReplyTo: null }) },
    };
    const result = await deliverInquiryAction(inquiry, "reply", options);
    expect(result).toMatchObject({ status: "reconciliation_required", acceptedAt: at, providerMessageId: "provider-a", retryable: false });
    expect(transport.send).toHaveBeenCalledTimes(1);
    expect(transport.verify).not.toHaveBeenCalled();
    const second = await deliverInquiryAction(inquiry, "reply", options);
    expect(second).toMatchObject({ status: "reconciliation_required", providerMessageId: "provider-a", retryable: false });
    expect(transport.send).toHaveBeenCalledTimes(1); expect(transport.verify).not.toHaveBeenCalled();
    failKind = null;
    const third = await deliverInquiryAction(inquiry, "reply", options);
    expect(third).toMatchObject({ status: "verified", providerMessageId: "provider-a" });
    expect(rows.get("acme|inquiry_reply|lead-a")?.payload).toEqual(firstReplyRecord("lead-a", at, "reply").payload);
    expect(transport.send).toHaveBeenCalledTimes(1); expect(transport.verify).toHaveBeenCalledTimes(1);
  });
  it("does not ACK a cached provider winner until its native checkpoint is repaired", async () => {
    const input = cache(); seed("checkpoint", "lead-a:reply", accepted);
    const outcome = { tenantId: "acme", inquiryId: "lead-a", action: "reply" as const, providerMessageId: "provider-a", providerEventId: "event-a", outcome: "delivered" as const, at };
    failKind = "checkpoint";
    await expect(input.store.markProviderOutcome(outcome)).rejects.toThrow(/durable_write/);
    const event = { type: "email.delivered", created_at: at, data: { email_id: "provider-a", tags: { strelva_tenant_id: "acme", strelva_inquiry_id: "lead-a", strelva_action: "reply" } } };
    const completion = vi.spyOn(input.store, "completeProviderEvent");
    expect(await reconcileInquiryProviderEvent({ event, eventId: "event-a", store: input.store, persistMessageReceipt: async () => "persisted" as const })).toMatchObject({ status: "unavailable" });
    expect(completion).not.toHaveBeenCalled();
    failKind = null;
    expect(await reconcileInquiryProviderEvent({ event, eventId: "event-a", store: input.store, persistMessageReceipt: async () => "persisted" as const })).toMatchObject({ status: "recorded" });
    expect(completion).toHaveBeenCalledTimes(1);
    input.values.clear();
    expect(await input.store.getCheckpoint(attempt)).toMatchObject({ status: "delivered", providerEventId: "event-a" });
  });
});
