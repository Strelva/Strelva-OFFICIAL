import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSupabase = vi.fn();
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => mockGetSupabase() }));

import {
  BusinessEffortAccessError, BusinessEffortConflictError, BusinessEffortNotFoundError,
  BusinessEffortUnavailableError, BusinessEffortValidationError, PostgresBusinessEffortStore,
  readBusinessEffortOverview, recordBusinessEffort, voidBusinessEffort, type BusinessEffortStore,
} from "@/platform/business-effort";

const NOW = new Date("2026-09-28T15:00:00.000Z");
const ACTOR = { userId: "00000000-0000-4000-8000-000000000001", verifiedEmail: "Operator@Example.test" };
const BUSINESS = "10000000-0000-4000-8000-00000000000a";
const ENTRY = "20000000-0000-4000-8000-000000000001";
const row = {
  id: ENTRY, businessId: BUSINESS, minutes: 30, category: "support", occurredOn: "2026-09-27", note: null,
  recordedBy: ACTOR.userId, recordedAt: "2026-09-28T15:00:00.123456+00:00", void: null,
};
const input = { entryId: ENTRY, businessId: BUSINESS, minutes: 30, category: "support" as const, occurredOn: "2026-09-27" };

function fakeStore(): BusinessEffortStore & { [K in keyof BusinessEffortStore]: ReturnType<typeof vi.fn> } {
  return {
    record: vi.fn().mockResolvedValue(row),
    void: vi.fn().mockResolvedValue({ ...row, void: { reason: "Duplicate", voidedBy: ACTOR.userId, voidedAt: "2026-09-28T16:00:00+00:00" } }),
    listBusinesses: vi.fn().mockResolvedValue([]),
    listEntries: vi.fn().mockResolvedValue([]),
  };
}

describe("business effort service", () => {
  it("rejects a missing operator identity before reaching storage", async () => {
    const store = fakeStore();
    await expect(recordBusinessEffort(store, null, input, NOW)).rejects.toBeInstanceOf(BusinessEffortAccessError);
    await expect(voidBusinessEffort(store, null, { entryId: ENTRY, reason: "x" })).rejects.toBeInstanceOf(BusinessEffortAccessError);
    await expect(readBusinessEffortOverview(store, null, NOW)).rejects.toBeInstanceOf(BusinessEffortAccessError);
    expect(store.record).not.toHaveBeenCalled();
    expect(store.listEntries).not.toHaveBeenCalled();
  });

  it.each([
    ["zero minutes", { minutes: 0 }],
    ["fractional minutes", { minutes: 12.5 }],
    ["more than a day", { minutes: 1441 }],
    ["unknown category", { category: "build" }],
    ["impossible date", { occurredOn: "2026-02-30" }],
    ["future date", { occurredOn: "2026-09-29" }],
    ["date before 2020", { occurredOn: "2019-12-31" }],
    ["long note", { note: "x".repeat(281) }],
    ["bad business id", { businessId: "gldf" }],
  ])("rejects %s", async (_label, change) => {
    const store = fakeStore();
    await expect(recordBusinessEffort(store, ACTOR, { ...input, ...change } as typeof input, NOW)).rejects.toBeInstanceOf(BusinessEffortValidationError);
    expect(store.record).not.toHaveBeenCalled();
  });

  it("records a valid entry with a trimmed optional note", async () => {
    const store = fakeStore();
    await recordBusinessEffort(store, ACTOR, { ...input, minutes: 1440, occurredOn: "2026-09-28", note: "  Launch call  " }, NOW);
    expect(store.record).toHaveBeenCalledWith(ACTOR, { ...input, minutes: 1440, occurredOn: "2026-09-28", note: "Launch call" });
    await recordBusinessEffort(store, ACTOR, { ...input, note: "   " }, NOW);
    expect(store.record).toHaveBeenLastCalledWith(ACTOR, { ...input, note: undefined });
  });

  it("requires a void reason", async () => {
    const store = fakeStore();
    await expect(voidBusinessEffort(store, ACTOR, { entryId: ENTRY, reason: "  " })).rejects.toBeInstanceOf(BusinessEffortValidationError);
    await voidBusinessEffort(store, ACTOR, { entryId: ENTRY, reason: " Duplicate " });
    expect(store.void).toHaveBeenCalledWith(ACTOR, { entryId: ENTRY, reason: "Duplicate" });
  });

  it("reads the measure window and computes the measure", async () => {
    const store = fakeStore();
    store.listBusinesses.mockResolvedValue([{ id: BUSINESS, name: "Juniper", tenantIds: ["gldf"], firstEffortOn: "2026-08-01" }]);
    store.listEntries.mockResolvedValue([{ ...row, occurredOn: "2026-08-10", minutes: 45 }]);
    const overview = await readBusinessEffortOverview(store, ACTOR, NOW);
    expect(store.listEntries).toHaveBeenCalledWith(ACTOR, { from: "2025-10-01" });
    expect(overview.measure.businesses[0]).toMatchObject({ businessId: BUSINESS, latest: { month: "2026-08", minutes: 45 }, direction: "insufficient_data" });
  });
});

describe("Postgres business effort store", () => {
  const rpc = vi.fn();
  beforeEach(() => {
    rpc.mockReset();
    mockGetSupabase.mockReturnValue({ rpc });
  });

  it("passes the verified identity and command to the SQL boundary", async () => {
    rpc.mockResolvedValue({ data: row, error: null });
    await expect(PostgresBusinessEffortStore.record(ACTOR, { ...input, note: undefined })).resolves.toEqual(row);
    expect(rpc).toHaveBeenCalledWith("record_business_effort", {
      p_user_id: ACTOR.userId, p_verified_email: "operator@example.test", p_entry_id: ENTRY, p_business_id: BUSINESS,
      p_minutes: 30, p_category: "support", p_occurred_on: "2026-09-27", p_note: null,
    });
  });

  it("reports storage unavailable when Supabase is not configured", async () => {
    mockGetSupabase.mockReturnValue(null);
    await expect(PostgresBusinessEffortStore.listBusinesses(ACTOR)).rejects.toBeInstanceOf(BusinessEffortUnavailableError);
  });

  it("reports storage unavailable when the call throws", async () => {
    rpc.mockRejectedValue(new TypeError("fetch failed"));
    await expect(PostgresBusinessEffortStore.listEntries(ACTOR, { from: "2025-10-01" })).rejects.toBeInstanceOf(BusinessEffortUnavailableError);
  });

  it.each([
    [{ code: "P0001", message: "business_effort_access_denied" }, BusinessEffortAccessError],
    [{ code: "P0001", message: "business_effort_invalid" }, BusinessEffortValidationError],
    [{ code: "P0001", message: "business_effort_business_not_found" }, BusinessEffortNotFoundError],
    [{ code: "P0001", message: "business_effort_entry_not_found" }, BusinessEffortNotFoundError],
    [{ code: "P0001", message: "business_effort_conflict" }, BusinessEffortConflictError],
    [{ code: "PGRST202", message: "Could not find the function public.record_business_effort" }, BusinessEffortUnavailableError],
    [{ code: "42P01", message: "relation does not exist" }, BusinessEffortUnavailableError],
  ])("maps %o", async (error, expected) => {
    rpc.mockResolvedValue({ data: null, error });
    await expect(PostgresBusinessEffortStore.record(ACTOR, { ...input, note: undefined })).rejects.toBeInstanceOf(expected);
  });

  it("treats an unexpected row shape as unreadable rather than empty", async () => {
    rpc.mockResolvedValue({ data: [{ id: "not-a-business" }], error: null });
    await expect(PostgresBusinessEffortStore.listBusinesses(ACTOR)).rejects.toBeInstanceOf(BusinessEffortUnavailableError);
  });
});
