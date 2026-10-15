import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ decide: vi.fn() }));
vi.mock("@/platform/infra/business-ai-budget", () => ({ ModelBudgetPausedError: class extends Error {}, ModelBudgetUnavailableError: class extends Error {} }));
vi.mock("@/platform/infra/auth", () => ({ verifyAuth: async () => true, requireTenantPermission: async () => null }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: async () => "gldf" }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/lib/request-body", () => ({ readJsonObject: async (request: Request) => request.json() }));
vi.mock("@/lib/operator-decisions", () => ({
  sessionTenantDecider: async () => ({ kind: "owner" }),
  decideTenantEvent: mocks.decide,
  operatorRefusal: () => null,
}));

import { PATCH } from "@/app/api/events/[id]/route";

const call = () => PATCH(new Request("https://admin.gldf.strelva.com/api/events/evt_1", { method: "PATCH", body: JSON.stringify({ status: "approved" }) }), { params: Promise.resolve({ id: "evt_1" }) });
beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/events/[id] while Google's approval is pending", () => {
  it("answers success with waiting, not an error", async () => {
    mocks.decide.mockResolvedValue({ changed: false, reason: "google_access_pending" });
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, changed: false, waiting: "google" });
  });

  it("still reports an ordinary change as before", async () => {
    mocks.decide.mockResolvedValue({ changed: true });
    expect(await (await call()).json()).toEqual({ success: true, changed: true });
  });
});
