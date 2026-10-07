import { afterEach, describe, expect, it, vi } from "vitest";
const holder = vi.hoisted(() => ({ values: new Map<string, unknown>(), pending: new Set<string>() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => ({
  set: async (key: string, value: unknown) => { holder.values.set(key, value); },
  get: async (key: string) => holder.values.get(key) ?? null,
  zadd: async (_key: string, entry: { member: string }) => { holder.pending.add(entry.member); },
  zrange: async () => [...holder.pending], zcard: async () => holder.pending.size,
  zrem: async (_key: string, member: string) => { holder.pending.delete(member); },
  del: async (key: string) => { holder.values.delete(key); },
}) }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
import { mirrorClientRecordRemoval, pendingPayloadKey, setClientRecordDb } from "@/platform/client-records/mirror";
import { repairPendingClientRecords } from "@/platform/client-records/move";
afterEach(() => { vi.unstubAllEnvs(); setClientRecordDb(undefined); holder.values.clear(); holder.pending.clear(); vi.useRealTimers(); });
describe("client record removal repair", () => {
  it("retains the deletion time across a delayed retry so SQL can reject stale deletion", async () => {
    vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1"); vi.stubEnv("DUAL_WRITE_PG", "1");
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    const rpc = vi.fn(async () => ({ data: null as unknown, error: { message: "unavailable" } as { message: string } | null }));
    setClientRecordDb({ rpc });
    expect((await mirrorClientRecordRemoval("provider_connections", "one", "google")).status).toBe("failed");
    const member = "provider_connections|one|google";
    expect(holder.values.get(pendingPayloadKey(member))).toEqual({ recordId: "google", remove: true, capturedAt: "2026-10-07T12:00:00.000Z" });
    vi.setSystemTime(new Date("2026-10-07T13:00:00Z"));
    rpc.mockResolvedValue({ data: { status: "kept" }, error: null });
    expect(await repairPendingClientRecords()).toMatchObject({ repaired: 1, remaining: 0 });
    expect(rpc.mock.calls.at(-1)).toEqual(["record_tenant_client_record", expect.objectContaining({ p_mode: "remove", p_captured_at: "2026-10-07T12:00:00.000Z" })]);
  });
});
