import { describe, expect, it, vi } from "vitest";
import { assertBusinessAiBudget, businessAiCapUsd, ModelBudgetPausedError, ModelBudgetUnavailableError, readBusinessAiBudget, reserveBusinessAiBudget, type BusinessAiBudget } from "@/platform/infra/business-ai-budget";

const WS = "11111111-1111-4111-8111-111111111111";
const ID = "22222222-2222-4222-8222-222222222222";
const on = { STRELVA_BUSINESS_AI_BUDGET: "1" };
const budget = (spentUsd = "0", capCents: number | null = 1200, subscribed = true): BusinessAiBudget => ({
  spentUsd, reservedUsd: "0", since: "2026-10-01T00:00:00Z", resetsAt: "2026-11-01T00:00:00Z", capCents, subscribed, unknownCostCalls: 0,
});
const context = { purpose: "ask" as const, workspaceId: WS, maximumCostUsd: "0.01" };

describe("business AI budget (ADR 0015)", () => {
  it("keeps the flag and operator/public-check exemptions", async () => {
    const read = vi.fn(async () => budget("999"));
    await assertBusinessAiBudget(context, { environment: {}, read });
    await assertBusinessAiBudget({ ...context, purpose: "operator" }, { environment: on, read });
    await assertBusinessAiBudget({ ...context, purpose: "visibility_probe" }, { environment: on, read });
    await expect(assertBusinessAiBudget({ ...context, workspaceId: null }, { environment: on, read })).rejects.toBeInstanceOf(ModelBudgetUnavailableError);
    expect(read).not.toHaveBeenCalled();
  });

  it("reserves the bound before admitting a below-cap call", async () => {
    const reserve = vi.fn(async () => ({ status: "reserved" as const, reservationId: ID, budget: { ...budget("11.99"), reservedUsd: "0.01" } }));
    await expect(assertBusinessAiBudget(context, { environment: on, read: async () => budget("11.99"), reserve })).resolves.toBe(ID);
    expect(reserve).toHaveBeenCalledWith(WS, "0.01", null);
  });

  it("uses committed usage and trusts the atomic database decision over a stale read", async () => {
    const reserve = vi.fn(async () => ({ status: "paused" as const, reservationId: null, budget: { ...budget("11.95"), reservedUsd: "0.05" } }));
    await expect(assertBusinessAiBudget(context, { environment: on, read: async () => budget("11.99"), reserve })).rejects.toBeInstanceOf(ModelBudgetPausedError);
    await expect(assertBusinessAiBudget(context, { environment: on, read: async () => ({ ...budget("11"), reservedUsd: "1" }), reserve })).rejects.toBeInstanceOf(ModelBudgetPausedError);
    expect(reserve).toHaveBeenCalledTimes(1);
  });

  it("uses the configured free cap and never substitutes it for an uncapped subscription", async () => {
    const reserve = vi.fn(async () => ({ status: "reserved" as const, reservationId: ID, budget: budget("0", null, false) }));
    await expect(assertBusinessAiBudget(context, { environment: { ...on, STRELVA_FREE_MONTHLY_AI_CAP_USD: "2" }, read: async () => budget("0", null, false), reserve })).resolves.toBe(ID);
    expect(reserve).toHaveBeenCalledWith(WS, "0.01", "2");
    await expect(assertBusinessAiBudget(context, { environment: on, read: async () => budget("50", null, false), reserve })).resolves.toBeNull();
    expect(businessAiCapUsd({ capCents: null, subscribed: true }, { STRELVA_FREE_MONTHLY_AI_CAP_USD: "2" })).toBeNull();
    expect(() => businessAiCapUsd({ capCents: null, subscribed: false }, { STRELVA_FREE_MONTHLY_AI_CAP_USD: "broken" })).toThrow(ModelBudgetUnavailableError);
  });

  it("fails closed for unreadable, malformed and unknown unreserved spend", async () => {
    for (const read of [async () => { throw new Error("db down"); }, async () => null, async () => ({ ...budget(), spentUsd: "NaN" }), async () => ({ ...budget(), unknownCostCalls: 1 })]) {
      await expect(assertBusinessAiBudget(context, { environment: on, read })).rejects.toBeInstanceOf(ModelBudgetUnavailableError);
    }
  });

  it("fails closed when bounds or reservations cannot be confirmed", async () => {
    const read = async () => budget();
    const reserve = vi.fn(async () => null);
    for (const maximumCostUsd of [undefined, "0", "-1", "NaN", "0.000000001"]) {
      await expect(assertBusinessAiBudget({ ...context, maximumCostUsd }, { environment: on, read, reserve })).rejects.toBeInstanceOf(ModelBudgetUnavailableError);
    }
    expect(reserve).not.toHaveBeenCalled();
    await expect(assertBusinessAiBudget(context, { environment: on, read, reserve })).rejects.toBeInstanceOf(ModelBudgetUnavailableError);
    await expect(assertBusinessAiBudget(context, { environment: on, read, reserve: async () => { throw new Error("lost response"); } })).rejects.toBeInstanceOf(ModelBudgetUnavailableError);
    await expect(assertBusinessAiBudget(context, { environment: on, read, reserve: async () => ({ status: "reserved", reservationId: null, budget: budget() }) })).rejects.toBeInstanceOf(ModelBudgetUnavailableError);
  });

  it("validates database contracts and suppresses read/reservation transport failures", async () => {
    const rpc = vi.fn(async () => ({ data: budget(), error: null }));
    expect(await readBusinessAiBudget(WS, { rpc })).toEqual(budget());
    expect(rpc).toHaveBeenCalledWith("business_ai_budget", { p_workspace_id: WS });
    const reserveRpc = vi.fn(async () => ({ data: { status: "reserved", reservationId: ID, budget: budget() }, error: null }));
    expect(await reserveBusinessAiBudget(WS, "0.01", "2", { rpc: reserveRpc })).toMatchObject({ reservationId: ID });
    expect(reserveRpc).toHaveBeenCalledWith("reserve_business_ai_budget", { p_workspace_id: WS, p_maximum_cost_usd: "0.01", p_free_cap_usd: "2" });
    expect(await readBusinessAiBudget(WS, { rpc: async () => { throw new Error("down"); } })).toBeNull();
    expect(await reserveBusinessAiBudget(WS, "0.01", null, { rpc: async () => ({ data: {}, error: null }) })).toBeNull();
  });
});
