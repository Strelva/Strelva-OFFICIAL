import { afterEach, describe, expect, it, vi } from "vitest";
import { composeRecordEffects } from "@/app/workspace/business-details/record-effects";
const actor = { userId: "7e000000-0000-4000-8000-000000000001", verifiedEmail: "owner@example.test" };
const workspaceId = "7e000000-0000-4000-8000-000000000010";
const record = { workspaceId, revision: 3, sequence: 3, changeCount: 1, undoOf: null, contacts: { created: 0, merged: 0, unchanged: 0 }, replayed: false };
afterEach(() => vi.unstubAllEnvs());
describe("independent record effects", () => {
  it("prepares native hours once from the same committed revision while Google failure remains truthful", async () => {
    vi.stubEnv("STRELVA_WEBSITE_NATIVE_FACTS_ENABLED", "1");
    const google = [{ tenantId: "gldf", locationId: "location", kind: "hours" as const, status: "failed" as const }];
    const change = vi.fn(async () => ({ record, google }));const prepare = vi.fn(async () => ({ ready: ["gldf"], needsReview: [] }));
    const result = await composeRecordEffects(change, prepare)(actor, workspaceId, 2, { facts: { hours: { value: {} } } }, { source: "owner" });
    expect(result).toEqual({ record, google, native: { ready: ["gldf"], needsReview: [] } });
    expect(prepare).toHaveBeenCalledExactlyOnceWith(actor, workspaceId, 3, ["hours"]);
  });
  it("returns the accepted record and Google receipt when native preparation fails", async () => {
    vi.stubEnv("STRELVA_WEBSITE_NATIVE_FACTS_ENABLED", "1");
    const google = [{ tenantId: "gldf", locationId: "location", kind: "info" as const, status: "posted" as const }];
    const result = await composeRecordEffects(vi.fn(async () => ({ record, google })), vi.fn(async () => { throw Error("read failed"); }))(actor, workspaceId, 2, {}, { source: "owner" });
    expect(result.record).toBe(record);expect(result.google).toBe(google);expect(result).toHaveProperty("nativePropagationError", expect.stringContaining("saved"));
  });
  it("does no native work when off, unchanged, or the business commit fails", async () => {
    const prepare = vi.fn();
    vi.stubEnv("STRELVA_WEBSITE_NATIVE_FACTS_ENABLED", "0");
    await composeRecordEffects(vi.fn(async () => ({ record, google: [] })), prepare)(actor, workspaceId, 2, {}, { source: "owner" });
    vi.stubEnv("STRELVA_WEBSITE_NATIVE_FACTS_ENABLED", "1");
    await composeRecordEffects(vi.fn(async () => ({ record: { ...record, changeCount: 0 }, google: [] })), prepare)(actor, workspaceId, 2, {}, { source: "owner" });
    await expect(composeRecordEffects(vi.fn(async () => { throw Error("conflict"); }), prepare)(actor, workspaceId, 2, {}, { source: "owner" })).rejects.toThrow("conflict");
    expect(prepare).not.toHaveBeenCalled();
  });
});
