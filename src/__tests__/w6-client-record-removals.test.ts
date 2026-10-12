import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { isolatedRedisAvailable, startIsolatedRedis, type IsolatedRedis } from "./support/isolated-redis";
const holder = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => holder.client }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
import { mirrorClientRecordRemoval, pendingPayloadKey, setClientRecordDb } from "@/platform/client-records/mirror";
import { repairPendingClientRecords } from "@/platform/client-records/move";
afterEach(() => { vi.unstubAllEnvs(); setClientRecordDb(undefined); vi.useRealTimers(); });
describe.skipIf(!isolatedRedisAvailable)("client record removal repair", () => {
  let redis: IsolatedRedis;
  beforeAll(async () => { redis = await startIsolatedRedis("client-record-removal"); holder.client = redis.client; });
  beforeEach(() => { redis.cli("FLUSHDB"); });
  afterAll(async () => { await redis?.stop(); });
  it("retains the deletion time across a delayed retry so SQL can reject stale deletion", async () => {
    vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1"); vi.stubEnv("DUAL_WRITE_PG", "1");
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    const rpc = vi.fn(async () => ({ data: null as unknown, error: { message: "unavailable" } as { message: string } | null }));
    setClientRecordDb({ rpc });
    expect((await mirrorClientRecordRemoval("provider_connections", "one", "google")).status).toBe("failed");
    const member = "provider_connections|one|google";
    expect(await redis.client.get(pendingPayloadKey(member))).toEqual({ recordId: "google", remove: true, capturedAt: "2026-10-07T12:00:00.000Z" });
    vi.setSystemTime(new Date("2026-10-07T13:00:00Z"));
    rpc.mockResolvedValue({ data: { status: "kept" }, error: null });
    expect(await repairPendingClientRecords()).toMatchObject({ repaired: 1, remaining: 0 });
    expect(rpc.mock.calls.at(-1)).toEqual(["record_tenant_client_record", expect.objectContaining({ p_mode: "remove", p_captured_at: "2026-10-07T12:00:00.000Z" })]);
  });
});
