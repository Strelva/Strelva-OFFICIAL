import { describe, it, expect, vi, beforeEach } from "vitest";

// Atomic-claim test for the one-active-request gate in the change-requests
// route. getOpenChangeRequest is check-then-create and not atomic, so the route
// wraps it in a per-tenant SET NX claim (`reb:change-request-claim:{tenant}`).
// We model the NX claim and assert: claim acquired before the open-request
// check, loser gets a 409 without creating an event, and the claim is released
// after the create (and on error).

const mockAddEvent = vi.hoisted(() => vi.fn());
const mockGetOpenChangeRequest = vi.hoisted(() => vi.fn());
const mockRequireTenantFromHeaders = vi.hoisted(() => vi.fn());
const mockRequireTenantAccess = vi.hoisted(() => vi.fn());
const mockRequireTenantPermission = vi.hoisted(() => vi.fn());
const mockVerifyAuth = vi.hoisted(() => vi.fn());
const mockIsSuperAdmin = vi.hoisted(() => vi.fn());
const mockRequireActiveSubscription = vi.hoisted(() => vi.fn());
const mockReadJsonObject = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());

// In-memory Redis NX claim model.
const locks = vi.hoisted(() => new Set<string>());
const mockRedisSet = vi.hoisted(() =>
  vi.fn(async (key: string, _value: unknown, opts?: { nx?: boolean }) => {
    if (opts?.nx) {
      if (locks.has(key)) return null;
      locks.add(key);
      return "OK";
    }
    return "OK";
  })
);
const mockRedisDel = vi.hoisted(() =>
  vi.fn(async (key: string) => {
    locks.delete(key);
    return 1;
  })
);

vi.mock("@/lib/events", () => ({
  addEvent: mockAddEvent,
  getOpenChangeRequest: mockGetOpenChangeRequest,
}));
vi.mock("@/lib/redis", () => ({
  getRedis: () => ({ set: mockRedisSet, del: mockRedisDel }),
}));
vi.mock("@/lib/tenant", () => ({
  requireTenantFromHeaders: mockRequireTenantFromHeaders,
}));
vi.mock("@/lib/auth", () => ({
  requireTenantAccess: mockRequireTenantAccess,
  requireTenantPermission: mockRequireTenantPermission,
  verifyAuth: mockVerifyAuth,
  isSuperAdmin: mockIsSuperAdmin,
}));
vi.mock("@/lib/subscription", () => ({
  requireActiveSubscription: mockRequireActiveSubscription,
}));
vi.mock("@/lib/request-body", () => ({
  readJsonObject: mockReadJsonObject,
}));
vi.mock("@/lib/tenants", () => ({
  getTenantConfig: mockGetTenantConfig,
}));
vi.mock("@/lib/custom-repos", () => ({
  getCustomRepoMetadata: () => ({}),
  getTenantDeliveryModel: () => "custom_repo",
  getTriageDueAt: () => new Date().toISOString(),
}));

import { POST } from "@/app/api/change-requests/route";

const req = () =>
  new Request("http://x/", { method: "POST", body: JSON.stringify({ prompt: "do a thing" }) });

beforeEach(() => {
  vi.clearAllMocks();
  locks.clear();
  mockVerifyAuth.mockResolvedValue(true);
  mockRequireTenantFromHeaders.mockResolvedValue("tenant-a");
  mockRequireTenantAccess.mockResolvedValue(null);
  mockRequireTenantPermission.mockResolvedValue(null);
  mockRequireActiveSubscription.mockResolvedValue(null);
  mockIsSuperAdmin.mockResolvedValue(false);
  mockReadJsonObject.mockResolvedValue({ prompt: "do a thing" });
  mockGetOpenChangeRequest.mockResolvedValue(null);
  mockGetTenantConfig.mockResolvedValue({ id: "tenant-a" });
  mockAddEvent.mockResolvedValue({ id: "evt_new", title: "Requested custom change for site" });
});

describe("change-requests POST — atomic claim", () => {
  it("acquires the per-tenant claim before checking for an open request", async () => {
    let claimedBeforeCheck = false;
    mockGetOpenChangeRequest.mockImplementation(async () => {
      claimedBeforeCheck = locks.has("reb:change-request-claim:tenant-a");
      return null;
    });

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(claimedBeforeCheck).toBe(true);
    // Released after the event was created.
    expect(mockRedisDel).toHaveBeenCalledWith("reb:change-request-claim:tenant-a");
    expect(locks.has("reb:change-request-claim:tenant-a")).toBe(false);
  });

  it("returns 409 and does not create when the claim is already held (concurrent create)", async () => {
    locks.add("reb:change-request-claim:tenant-a");

    const res = await POST(req());
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("active_request_exists");
    expect(mockGetOpenChangeRequest).not.toHaveBeenCalled();
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("still returns the open-request 409 when one exists, and releases the claim", async () => {
    mockGetOpenChangeRequest.mockResolvedValue({
      id: "evt_open",
      title: "Requested custom change: existing",
      createdAt: "2026-06-01T00:00:00.000Z",
      metadata: { requestedAt: "2026-06-01T00:00:00.000Z" },
    });

    const res = await POST(req());
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("active_request_exists");
    expect(json.activeRequest.id).toBe("evt_open");
    expect(mockAddEvent).not.toHaveBeenCalled();
    // Claim released even though we 409'd inside the try.
    expect(locks.has("reb:change-request-claim:tenant-a")).toBe(false);
  });

  it("super-admins are never claim-gated and can always create", async () => {
    mockIsSuperAdmin.mockResolvedValue(true);
    locks.add("reb:change-request-claim:tenant-a"); // even if someone holds it

    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(mockRedisSet).not.toHaveBeenCalled();
    expect(mockAddEvent).toHaveBeenCalled();
  });

  it("releases the claim when event creation throws", async () => {
    mockAddEvent.mockRejectedValue(new Error("boom"));

    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(locks.has("reb:change-request-claim:tenant-a")).toBe(false);
  });
});
