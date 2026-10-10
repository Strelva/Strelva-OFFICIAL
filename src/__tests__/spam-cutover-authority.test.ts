import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const seam = vi.hoisted(() => ({ rows: new Map<string, unknown>(), fail: false, days: 7, redis: false, cache: vi.fn(), hold: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => seam.redis ? { set: seam.cache, zadd: seam.cache, zremrangebyrank: seam.cache } : null }));
vi.mock("@/lib/inquiry-records", () => ({ holdSpamForReview: seam.hold }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => null }));
import { setClientRecordDb } from "@/platform/client-records/mirror";
import { recordSpam, getSpam } from "@/lib/spam-pit";
beforeEach(() => {
 seam.rows.clear(); seam.fail=false; seam.days=7; seam.redis=false; seam.cache.mockReset(); seam.hold.mockReset();
 vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", "spam_held"); vi.stubEnv("STRELVA_CLIENT_RECORDS_DUAL_WRITE", "1"); vi.stubEnv("DUAL_WRITE_PG", "1");
 setClientRecordDb({ rpc: async (name, args) => {
  if (name === "client_record_parity_streak") return { data: { days: seam.days }, error: null };
  if (seam.fail) return { data: null, error: { message: "store unavailable" } };
  if (name === "record_tenant_client_record") { seam.rows.set(String(args.p_record_id), { recordId: args.p_record_id, payload: args.p_payload, capturedAt: args.p_captured_at }); return { data: { status: "recorded" }, error: null }; }
  return { data: [...seam.rows.values()], error: null };
 } });
});
afterEach(() => { setClientRecordDb(undefined); vi.unstubAllEnvs(); });
describe("selected durable spam capture", () => {
 it("captures bounded recoverable submissions without Redis and reads them from the same authority", async () => {
  const record = await recordSpam("one", { reason: "honeypot", name: " False positive ", fields: { phone: " 123 " } });
  expect(record).toMatchObject({ name: "False positive", fields: { phone: "123" } });
  expect(await getSpam("one")).toEqual([record]); expect(seam.hold).toHaveBeenCalledWith("one", record);
 });
 it("does not acknowledge a failed durable capture or create a cache-only row", async () => {
  seam.fail=true; seam.redis=true;
  await expect(recordSpam("one", { reason: "honeypot" })).rejects.toThrow("client_records_write_failed");
  expect(seam.cache).not.toHaveBeenCalled(); expect(seam.hold).not.toHaveBeenCalled();
 });
 it("refuses unqualified cutover before recording a submission", async () => {
  seam.days=6;
  await expect(recordSpam("one", { reason: "honeypot" })).rejects.toThrow("client_records_cutover_not_qualified");
  expect(seam.rows.size).toBe(0);
 });
 it("does not make an accepted durable write retryable when the rollback cache fails", async () => {
  seam.redis=true; seam.cache.mockRejectedValue(new Error("cache down"));
  const record=await recordSpam("one", { reason: "honeypot" });
  expect(await getSpam("one")).toEqual([record]);
 });
 it("preserves the pre-cutover unconfigured return", async () => {
  vi.stubEnv("STRELVA_CLIENT_RECORDS_READ", ""); expect(await recordSpam("one", { reason: "honeypot" })).toBeNull();
 });
});
