import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelCallRow } from "@/platform/infra/model-call-log";

const mocks = vi.hoisted(() => ({ redis: vi.fn(), incrby: vi.fn(), incr: vi.fn(), expire: vi.fn(), warn: vi.fn() }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: mocks.redis }));
vi.mock("@/platform/infra/logger", () => ({ logger: { warn: mocks.warn } }));
import { askCostThreshold, recordAskCostAlert } from "@/platform/infra/ask-cost-alert";

const row: ModelCallRow = { calledAt: "2026-10-07T10:00:00Z", purpose: "ask", workspaceId: "business-one", systemId: null,
  tenantId: null, actorKind: "owner", modelLabel: "test/model", attempt: 1, step: 1, inputTokens: 100, outputTokens: 100,
  latencyMs: 100, outcome: "ok", errorKind: null, costUsd: "0.25", costSource: "estimate", priceTableVersion: "test" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("STRELVA_ASK_RELEASE", "1");
  vi.stubEnv("STRELVA_ASK_COST_ALERT_USD", "1");
  mocks.redis.mockReturnValue({ incrby: mocks.incrby, incr: mocks.incr, expire: mocks.expire });
});
afterEach(() => vi.unstubAllEnvs());

describe("Ask daily cost warning", () => {
  it.each([undefined, "", "0", "-1", "NaN", "Infinity"])("invalid/unset threshold %s does nothing", async threshold => {
    vi.stubEnv("STRELVA_ASK_COST_ALERT_USD", threshold);
    expect(askCostThreshold()).toBeNull();
    await recordAskCostAlert([row]);
    expect(mocks.redis).not.toHaveBeenCalled();
    expect(mocks.warn).not.toHaveBeenCalled();
  });
  it.each([undefined, "0"])("Ask off (%s) does not touch Redis or warn", async flag => {
    vi.stubEnv("STRELVA_ASK_RELEASE", flag);
    await recordAskCostAlert([row]);
    expect(mocks.redis).not.toHaveBeenCalled();
    expect(mocks.warn).not.toHaveBeenCalled();
  });
  it("warns only at the crossing and scopes the total to the business and UTC day", async () => {
    mocks.incrby.mockResolvedValueOnce(1_000_000_000).mockResolvedValueOnce(1_250_000_000);
    await recordAskCostAlert([row, row]);
    expect(mocks.incrby).toHaveBeenCalledWith("reb:ask-cost:business-one:2026-10-07", 250_000_000);
    expect(mocks.expire).toHaveBeenCalledWith("reb:ask-cost:business-one:2026-10-07", 90 * 86400);
    expect(mocks.warn).toHaveBeenCalledOnce();
    expect(mocks.warn).toHaveBeenCalledWith("[ask] daily business cost threshold reached", expect.objectContaining({
      workspaceId: "business-one", measuredUsd: 1, thresholdUsd: 1, excludesUnknownCosts: true,
    }));
  });
  it("keeps unknown costs separate and ignores other purposes and missing businesses", async () => {
    await recordAskCostAlert([{ ...row, costUsd: null }, { ...row, purpose: "report" }, { ...row, workspaceId: null }]);
    expect(mocks.incr).toHaveBeenCalledWith("reb:ask-cost:business-one:2026-10-07:unknown");
    expect(mocks.incrby).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith("[ask] cost unknown", expect.objectContaining({ workspaceId: "business-one" }));
  });
  it("measurement failures never fail the customer's turn", async () => {
    mocks.incrby.mockRejectedValueOnce(new Error("Redis unavailable"));
    await expect(recordAskCostAlert([row])).resolves.toBeUndefined();
    expect(mocks.warn).not.toHaveBeenCalled();
  });
});
