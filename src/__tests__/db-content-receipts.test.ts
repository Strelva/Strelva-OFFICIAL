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
