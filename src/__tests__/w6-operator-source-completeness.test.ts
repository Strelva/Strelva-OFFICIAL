import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAssignmentOffers, readUnkeptLeads } from "@/server/operator-queue/sources";
const mocks = vi.hoisted(() => ({ zrange: vi.fn(), from: vi.fn(), range: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: () => ({ zrange: mocks.zrange }) }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ from: mocks.from }) }));
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "1"); });
afterEach(() => { vi.unstubAllEnvs(); });
function query() {
  const q = { select: vi.fn(), eq: vi.fn(), gt: vi.fn(), order: vi.fn(), range: mocks.range, limit: vi.fn() };
  for (const fn of [q.select,q.eq,q.gt,q.order]) fn.mockReturnValue(q);
  mocks.from.mockReturnValue(q); return q;
}
const rows = (size: number) => Array.from({ length: size }, (_, i) => ({ id: `id${i}`, workspace_id: "business", work_id: "work", offered_at: "2026-10-07T00:00:00Z", expires_at: "2026-11-07T00:00:00Z" }));
describe("complete flag-on queue sources", () => {
  it("loads assignment pages beyond five hundred instead of silently truncating", async () => {
    const q = query(); mocks.range.mockResolvedValueOnce({ data: rows(500), error: null }).mockResolvedValueOnce({ data: rows(3), error: null });
    const result = await readAssignmentOffers(Date.now()); expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.rows).toHaveLength(503); expect(mocks.range.mock.calls).toEqual([[0,499],[500,999]]); expect(q.limit).not.toHaveBeenCalled();
  });
  it("marks the source unavailable when a later page fails", async () => {
    query(); mocks.range.mockResolvedValueOnce({ data: rows(500), error: null }).mockResolvedValueOnce({ data: null, error: { message: "unavailable" } });
    expect(await readAssignmentOffers(Date.now())).toMatchObject({ ok: false });
  });
  it("keeps the original flag-off assignment request", async () => {
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "0"); const q=query(); q.limit.mockResolvedValue({ data: rows(1), error:null });
    expect(await readAssignmentOffers(Date.now())).toMatchObject({ ok:true }); expect(q.limit).toHaveBeenCalledWith(500); expect(mocks.range).not.toHaveBeenCalled();
  });
  it("reads every unkept lead in the new queue and preserves the legacy window off", async () => {
    mocks.zrange.mockResolvedValue([]); await readUnkeptLeads(); expect(mocks.zrange).toHaveBeenLastCalledWith(expect.any(String),0,-1,{withScores:true});
    vi.stubEnv("STRELVA_OPERATOR_QUEUE_RELEASE", "0"); await readUnkeptLeads(); expect(mocks.zrange).toHaveBeenLastCalledWith(expect.any(String),0,499,{withScores:true});
  });
});
