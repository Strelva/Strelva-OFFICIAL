import { describe, expect, it, vi } from "vitest";
import { assertBusinessAiBudget, businessAiCapUsd, ModelBudgetPausedError } from "@/platform/infra/business-ai-budget";

const WS = "11111111-1111-4111-8111-111111111111";
const on = { STRELVA_BUSINESS_AI_BUDGET: "1" };
const budget = (spentUsd: string, capCents: number | null, subscribed: boolean) => async () => ({ spentUsd, since: "2026-10-01T00:00:00Z", capCents, subscribed });

describe("business AI budget (ADR 0015)", () => {
  it("does nothing unless the flag is on, and never counts operator work or the public check's probe", async () => {
    const read = vi.fn(budget("999", 100, true));
    await assertBusinessAiBudget({ purpose: "ask", workspaceId: WS }, { environment: {}, read });
    await assertBusinessAiBudget({ purpose: "operator", workspaceId: WS }, { environment: on, read });
    await assertBusinessAiBudget({ purpose: "visibility_probe", workspaceId: WS }, { environment: on, read });
    await assertBusinessAiBudget({ purpose: "ask", workspaceId: null }, { environment: on, read });
    expect(read).not.toHaveBeenCalled();
  });

  it("pauses at the subscription's own cap, and at the free cap only when one is configured", async () => {
    await expect(assertBusinessAiBudget({ purpose: "ask", workspaceId: WS }, { environment: on, read: budget("12.00", 1200, true) })).rejects.toBeInstanceOf(ModelBudgetPausedError);
    await expect(assertBusinessAiBudget({ purpose: "rebuild", workspaceId: WS }, { environment: on, read: budget("11.99", 1200, true) })).resolves.toBeUndefined();
    await expect(assertBusinessAiBudget({ purpose: "ask", workspaceId: WS }, { environment: on, read: budget("50", null, false) })).resolves.toBeUndefined();
    await expect(assertBusinessAiBudget({ purpose: "ask", workspaceId: WS }, { environment: { ...on, STRELVA_FREE_MONTHLY_AI_CAP_USD: "2" }, read: budget("2", null, false) })).rejects.toThrow("Building pauses");
    expect(businessAiCapUsd({ capCents: null, subscribed: true }, { STRELVA_FREE_MONTHLY_AI_CAP_USD: "2" })).toBeNull();
  });

  it("never blocks a call when the budget can't be read", async () => {
    await expect(assertBusinessAiBudget({ purpose: "ask", workspaceId: WS }, { environment: { ...on, STRELVA_FREE_MONTHLY_AI_CAP_USD: "0" }, read: async () => { throw new Error("db down"); } })).resolves.toBeUndefined();
    await expect(assertBusinessAiBudget({ purpose: "ask", workspaceId: WS }, { environment: { ...on, STRELVA_FREE_MONTHLY_AI_CAP_USD: "0" }, read: async () => null })).resolves.toBeUndefined();
  });
});
