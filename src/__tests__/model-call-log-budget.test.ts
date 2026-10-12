import { expect, it, vi } from "vitest";
const rpc = vi.hoisted(() => vi.fn(async () => ({ error: null })));
vi.mock("@/platform/infra/db/client", () => ({ getSupabase: () => ({ rpc }) }));
vi.mock("@/platform/infra/ask-cost-alert", () => ({ recordAskCostAlert: async () => undefined }));
import { postgresModelCallSink, type ModelCallRow } from "@/platform/infra/model-call-log";

it("sends original provider start and its exact reservation to the service-role log", async () => {
  const row: ModelCallRow = { calledAt: "2026-10-31T23:59:59Z", budgetReservationId: "d0000000-0000-4000-8000-000000000001", purpose: "ask", workspaceId: "a0000000-0000-4000-8000-000000000001", systemId: null, tenantId: null, actorKind: "owner", modelLabel: "test/model", attempt: 1, step: 1, inputTokens: null, outputTokens: null, latencyMs: 2000, outcome: "error", errorKind: "timeout", costUsd: null, costSource: "unknown", priceTableVersion: null };
  await postgresModelCallSink.record([row, { ...row, budgetReservationId: undefined }]);
  expect(rpc).toHaveBeenCalledWith("record_model_calls", { p_calls: [row, { ...row, budgetReservationId: null }] });
});
