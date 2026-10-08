import { describe, expect, it } from "vitest";
import { readAllClientRecords } from "@/platform/client-records/move";
import type { ClientRecordDb } from "@/platform/client-records/mirror";

describe("complete durable client record reads", () => {
  it("reads beyond 1000 with the timestamp and record-id tie breaker", async () => {
    const at = "2026-10-06 12:00:00.123456+00";
    const rows = Array.from({ length: 1001 }, (_, n) => ({ recordId: String(1001 - n).padStart(4, "0"), capturedAt: at, payload: { n } }));
    const requests: Record<string, unknown>[] = [];
    const db: ClientRecordDb = { rpc(name, args) {
      expect(name).toBe("read_tenant_client_records_page");
      requests.push(args);
      const start = args.p_after_record_id === null ? 0 : rows.findIndex((r) => r.recordId === args.p_after_record_id) + 1;
      return Promise.resolve({ data: rows.slice(start, start + 1000), error: null });
    } };
    expect(await readAllClientRecords("orders", "acme", db)).toEqual(rows);
    expect(requests[1]).toMatchObject({ p_before: at, p_after_record_id: "0002" });
  });
  it("does not return partial data when a later page fails", async () => {
    let page = 0;
    const db: ClientRecordDb = { rpc() { return Promise.resolve(++page === 1
      ? { data: Array.from({ length: 1000 }, (_, n) => ({ recordId: String(n), capturedAt: "2026-10-06", payload: {} })), error: null }
      : { data: null, error: { message: "database down" } }); } };
    await expect(readAllClientRecords("threads", "acme", db)).rejects.toThrow("client_records_page_failed");
  });
});
