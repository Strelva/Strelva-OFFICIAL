import { beforeEach, describe, expect, it, vi } from "vitest";

const ACTOR = "30000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), role: vi.fn(), event: vi.fn() }));
vi.mock("@/platform/infra/auth", () => ({
  verifyAuth: async () => true,
  getAuthUserId: async () => ACTOR,
  // Reach the real decision boundary even if an earlier permission gate allows it.
  requireTenantPermission: async () => null,
  isSuperAdmin: async () => true,
}));
vi.mock("@/platform/infra/db/server-client", () => ({
  getSessionUser: async () => ({ id: ACTOR, email: "operator@example.test", email_confirmed_at: "2026-10-01T00:00:00Z" }),
}));
vi.mock("@/platform/infra/db/repositories", () => ({
  getMembershipRole: mocks.role,
  getTenantAgencySeat: async () => null,
}));
vi.mock("@/platform/infra/inspect-mode", () => ({ isInspecting: async () => false }));
vi.mock("@/lib/tenant", () => ({ getTenantFromHeaders: async () => "fixture" }));
vi.mock("@/lib/subscription", () => ({ requireActiveSubscription: async () => null }));
vi.mock("@/lib/events", () => ({ getEventRaw: mocks.event }));
vi.mock("@/lib/event-actions", () => ({ resolveEventAction: mocks.resolve }));

import { PATCH as queue } from "@/app/api/queue/[id]/route";
import { PATCH as events } from "@/app/api/events/[id]/route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.role.mockResolvedValue(null);
  mocks.event.mockResolvedValue({ id: "event", tenantId: "fixture", metadata: { kind: "inquiry_capability_publish", reviewAudience: "owner" } });
  mocks.resolve.mockResolvedValue({ changed: false, reason: "permission_denied" });
});

const routes = [["queue", queue, { action: "approved" }], ["events", events, { status: "approved" }]] as const;
function request(body: unknown) {
  return new Request("http://localhost/api/queue/event", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

describe("publication API refusal", () => {
  it.each(routes)("%s refuses platform support before invoking client publication", async (_name, handler, body) => {
    const response = await handler(request(body), { params: Promise.resolve({ id: "event" }) });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Platform support cannot decide client content") });
    expect(mocks.resolve).not.toHaveBeenCalled();
  });

  it.each(routes)("%s still respects governed refusal when a superadmin acts as an ordinary business owner", async (_name, handler, body) => {
    mocks.role.mockResolvedValue("owner");
    const response = await handler(request(body), { params: Promise.resolve({ id: "event" }) });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: expect.stringContaining("Nothing changed") });
    expect(mocks.resolve).toHaveBeenCalledWith("fixture", "event", "approved", ACTOR);
  });
});
