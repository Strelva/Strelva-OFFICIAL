import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({ verifyAuth: async () => true, getAuthUserId: async () => "operator", requireTenantPermission: async () => null, isSuperAdmin: async () => true }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: async () => "fixture" }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/lib/event-actions", () => ({ resolveEventAction: mocks.resolve }));
import { PATCH as queue } from "@/app/api/queue/[id]/route";
import { PATCH as events } from "@/app/api/events/[id]/route";
beforeEach(() => { vi.clearAllMocks(); mocks.resolve.mockResolvedValue({ changed: false, reason: "permission_denied" }); });
describe("publication API refusal", () => {
  it.each([["queue", queue, { action: "approved" }], ["events", events, { status: "approved" }]] as const)("%s refuses a superadmin when the governed owner-only publication denies authority", async (_name, handler, body) => {
    const response = await handler(new Request("http://localhost/api/queue/event", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "event" }) });
    expect(response.status).toBe(403); expect(await response.json()).toMatchObject({ error: expect.stringContaining("Nothing changed") });
    expect(mocks.resolve).toHaveBeenCalledWith("fixture", "event", "approved", "operator");
  });
});
