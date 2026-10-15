import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ db: vi.fn(), rpc: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: mocks.db }));
import { upsertContentDataWithReceipt } from "@/platform/infra/db/repositories";
beforeEach(() => { vi.resetAllMocks(); mocks.db.mockReturnValue({ rpc: mocks.rpc }); });
describe("atomic content repository", () => {
  it("calls one RPC for content plus receipt, without a separate upsert", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: "receipt-1" }, error: null });
    await expect(upsertContentDataWithReceipt("alpha", "hero", { headline: "After" })).resolves.toBe("receipt-1");
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("write_operator_content", { p_tenant_id: "alpha", p_section: "hero", p_data: { headline: "After" } });
  });
  it("rejects unavailable storage before publication", async () => {
    mocks.db.mockReturnValue(null);
    await expect(upsertContentDataWithReceipt("alpha", "hero", {})).rejects.toThrow("Supabase is not configured");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("preserves transaction rejection", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("transaction rejected") });
    await expect(upsertContentDataWithReceipt("alpha", "hero", {})).rejects.toThrow("transaction rejected");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([null, {}, { id: 42 }])("does not reject committed content on malformed receipt response %j", async response => {
    mocks.rpc.mockResolvedValue({ data: response, error: null });
    await expect(upsertContentDataWithReceipt("alpha", "hero", {})).resolves.toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});

import { publishSiteDraftsAtomic } from "@/platform/infra/db/repositories";
describe("atomic site publish repository", () => {
  const rows = [{ section: "settings", contentKey: "siteSettings", data: { a: 1 }, versionId: "v_1", changes: null }];
  it("calls one RPC with exact arguments and maps receipts", async () => {
    mocks.rpc.mockResolvedValue({ data: { receipts: { settings: "r1", hero: 7 } }, error: null });
    await expect(publishSiteDraftsAtomic("alpha", rows, null, "user", true)).resolves.toEqual({ settings: "r1", hero: null });
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith("publish_site_drafts", {
      p_tenant_id: "alpha", p_sections: rows, p_page_config: null, p_author: "user", p_with_receipts: true,
    });
  });
  it("propagates errors", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("rejected") });
    await expect(publishSiteDraftsAtomic("alpha", rows, null, "user", false)).rejects.toThrow("rejected");
  });
  it.each([null, {}, { receipts: [] }])("returns {} for malformed response %j", async response => {
    mocks.rpc.mockResolvedValue({ data: response, error: null });
    await expect(publishSiteDraftsAtomic("alpha", rows, null, "user", false)).resolves.toEqual({});
  });
});
