import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ source: vi.fn(), rows: vi.fn(), mirror: vi.fn(), rpc: vi.fn(), stores: vi.fn() }));
vi.mock("@/platform/client-records/move", async original => ({ ...await original<typeof import("@/platform/client-records/move")>(), clientRecordReadStores: mocks.stores, clientRecordReadSource: mocks.source, readAllClientRecords: mocks.rows }));
vi.mock("@/platform/client-records/mirror", async original => ({ ...await original<typeof import("@/platform/client-records/mirror")>(), mirrorClientRecord: mocks.mirror, clientRecordDb: () => ({ rpc: mocks.rpc }) }));
import { createRedisInquiryDeliveryStore } from "@/products/inquiries/delivery-store";
import { CLIENT_RECORD_STORE_DEFINITIONS, inquiryDeliveryRecord } from "@/platform/client-records/stores";
const accepted = { tenantId: "previous-slug", inquiryId: "inquiry-a", action: "reply", status: "accepted", attemptId: "attempt-a", attempts: 1, startedAt: "2026-10-01T00:00:00Z", acceptedAt: "2026-10-01T00:00:01Z", providerMessageId: "provider-a" };
function redisStore() {
  const values = new Map<string, unknown>();
  const redis = { get: vi.fn(async (key: string) => values.get(key) ?? null), set: vi.fn(async (key: string, value: unknown, opts?: { nx?: boolean }) => { if (opts?.nx && values.has(key)) return null; values.set(key, value); return "OK"; }), eval: vi.fn(async () => 1), del: vi.fn(async () => 1), zadd: vi.fn(async () => 1), zrange: vi.fn(async () => []), scan: vi.fn(async (_cursor: unknown, _options: { match: string }) => ["0", [...values.keys()]]) };
  return { values, redis, store: createRedisInquiryDeliveryStore(redis as never) };
}
beforeEach(() => { vi.clearAllMocks(); mocks.stores.mockReturnValue(new Set(["inquiry_delivery"])); mocks.source.mockResolvedValue("postgres"); mocks.rows.mockResolvedValue([]); mocks.mirror.mockResolvedValue({ status: "recorded" }); mocks.rpc.mockResolvedValue({ data: { status: "recorded" }, error: null }); });
describe("durable inquiry delivery operational data", () => {
  it("recovers accepted send markers after cache expiry and blocks another send", async () => {
    const input = redisStore(); mocks.rows.mockResolvedValue([inquiryDeliveryRecord("checkpoint", "inquiry-a:reply", accepted)]);
    expect(await input.store.getCheckpoint({ tenantId: "tenant-a", inquiryId: "inquiry-a", action: "reply" })).toMatchObject({ tenantId: "tenant-a", status: "accepted" });
    const result = await input.store.beginAttempt({ tenantId: "tenant-a", inquiryId: "inquiry-a", action: "reply", maxAttempts: 3, now: "2026-10-07T00:00:00Z", budget: { policyVersion: "p", limit: 10, now: "2026-10-07T00:00:00Z", timezone: "UTC" } });
    expect(result).toMatchObject({ acquired: false, reason: "already_accepted" }); expect(input.redis.eval).not.toHaveBeenCalled();
    expect(input.redis.set).toHaveBeenCalledWith("reb:inquiry-delivery:tenant-a:inquiry-a:reply", expect.objectContaining({ status: "accepted" }), { nx: true, ex: 90 * 24 * 60 * 60 });
  });
  it("does not overwrite a current provider failure when recovering old accepted state", async () => {
    const input = redisStore(); input.values.set("reb:inquiry-delivery:tenant-a:inquiry-a:reply", { ...accepted, tenantId: "tenant-a", status: "bounced" });
    mocks.rows.mockResolvedValue([inquiryDeliveryRecord("checkpoint", "inquiry-a:reply", accepted)]);
    expect(await input.store.beginAttempt({ tenantId: "tenant-a", inquiryId: "inquiry-a", action: "reply", maxAttempts: 3, now: "2026-10-07T00:00:00Z", budget: { policyVersion: "p", limit: 10, now: "2026-10-07T00:00:00Z", timezone: "UTC" } })).toMatchObject({ acquired: false, checkpoint: { status: "bounced" } });
    expect(input.redis.set).not.toHaveBeenCalled();
  });
  it("fails closed for a cache miss during a flipped database outage", async () => {
    const input = redisStore(); mocks.rows.mockRejectedValue(new Error("database unavailable"));
    await expect(input.store.beginAttempt({ tenantId: "tenant-a", inquiryId: "inquiry-a", action: "reply", maxAttempts: 3, now: "2026-10-07T00:00:00Z", budget: { policyVersion: "p", limit: 10, now: "2026-10-07T00:00:00Z", timezone: "UTC" } })).rejects.toThrow("durable_read_unavailable");
    expect(input.redis.eval).not.toHaveBeenCalled();
  });
  it("keeps flag-off checkpoint reads entirely on the existing Redis key", async () => {
    mocks.stores.mockReturnValue(new Set()); const input = redisStore(); input.values.set("reb:inquiry-delivery:tenant-a:inquiry-a:reply", { ...accepted, tenantId: "tenant-a" });
    expect(await input.store.getCheckpoint({ tenantId: "tenant-a", inquiryId: "inquiry-a", action: "reply" })).toMatchObject({ status: "accepted" });
    expect(mocks.rows).not.toHaveBeenCalled(); expect(mocks.source).not.toHaveBeenCalled();
  });
  it("keeps flag-off provider claiming on the original atomic path without another Redis read", async () => {
    mocks.stores.mockReturnValue(new Set()); const input = redisStore(); input.redis.eval.mockResolvedValue("claimed" as never);
    expect(await input.store.claimProviderEvent({ tenantId: "tenant-a", providerEventId: "event-a" })).toMatchObject({ status: "claimed" });
    expect(input.redis.get).not.toHaveBeenCalled(); expect(mocks.rows).not.toHaveBeenCalled(); expect(input.redis.eval).toHaveBeenCalledTimes(1);
  });
  it("recovers inbound routing, reply state and completed provider events without replay", async () => {
    const input = redisStore(); mocks.rows.mockResolvedValue([
      inquiryDeliveryRecord("provider_target", "provider-a", { ...accepted, action: "reply" }),
      inquiryDeliveryRecord("reply_target", "reply%40example.test", { tenantId: "previous-slug", inquiryId: "inquiry-a", replyTo: "reply@example.test" }),
      inquiryDeliveryRecord("reply_state", "inquiry-a", { tenantId: "previous-slug", inquiryId: "inquiry-a", providerMessageId: "inbound-a", providerEventId: "event-a", receivedAt: "2026-10-01T00:01:00Z" }),
      inquiryDeliveryRecord("provider_event", "event-a", "completed"),
    ]);
    expect(await input.store.findByProviderMessageId!({ tenantId: "tenant-a", providerMessageId: "provider-a" })).toEqual({ inquiryId: "inquiry-a", action: "reply" });
    expect(await input.store.findByReplyAddress!({ tenantId: "tenant-a", replyTo: "reply@example.test" })).toEqual({ inquiryId: "inquiry-a" });
    expect(await input.store.getReplyState!({ tenantId: "tenant-a", inquiryId: "inquiry-a" })).toMatchObject({ tenantId: "tenant-a", providerEventId: "event-a" });
    expect(await input.store.claimProviderEvent!({ tenantId: "tenant-a", providerEventId: "event-a" })).toEqual({ status: "completed" }); expect(input.redis.eval).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: { tenantId: "tenant-a", inquiryId: "inquiry-a" }, error: null });
    expect(await input.store.findByReplyAddressAny!({ replyTo: "reply@example.test" })).toEqual({ tenantId: "tenant-a", inquiryId: "inquiry-a" });
  });
  it("backfills completed dedupe receipts but never temporary provider claim tokens", async () => {
    const input = redisStore(); input.values.set("reb:inquiry-delivery-event:tenant-a:completed-event", "completed"); input.values.set("reb:inquiry-delivery-event:tenant-a:claim-event", "temporary-claim-token");
    input.redis.scan.mockImplementation(async (_cursor: unknown, options: { match: string }) => ["0", [...input.values.keys()].filter(key => key.startsWith(options.match.slice(0,-1))) ] as never);
    const rows = await CLIENT_RECORD_STORE_DEFINITIONS.inquiry_delivery.readRedis(input.redis as never,"tenant-a");
    expect(rows).toHaveLength(1); expect(rows[0]?.payload).toEqual({ kind: "provider_event", key: "completed-event", value: "completed" });
  });
});
