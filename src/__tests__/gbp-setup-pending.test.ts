/**
 * GBP write-side: pending-approval ("being set up") soft-fail.
 *
 * The Business Profile API quota is 0 until Google grants access (a 3–10 day
 * application). During that window every write is rejected with 403
 * SERVICE_DISABLED / accessNotConfigured (or 429 quota). These must fail SOFT:
 * a clear owner-facing "being set up" result and a gentle informational event —
 * NOT a raw error, a crash, or a scary "FAILED" Slack ping.
 *
 * A generic 403 (a real permission problem) must still be treated as a hard
 * failure so the owner is told to reconnect.
 *
 * All external APIs (GBP HTTP, Redis, Slack, connections) are mocked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// HTTP is mocked below. Resolve its public test hosts without a real DNS lookup.
vi.mock("node:dns", () => ({ promises: { lookup: vi.fn(async () => ({ address: "93.184.216.34", family: 4 })) } }));

const mockRedisGet = vi.fn((_key: string) => Promise.resolve(null as unknown));

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    get: (...args: Parameters<typeof mockRedisGet>) => mockRedisGet(...args),
    set: vi.fn(() => Promise.resolve("OK")),
    zadd: vi.fn(() => Promise.resolve(1)),
  }),
}));

const mockGetConnection = vi.fn((_tenantId: string, _provider: string) =>
  Promise.resolve(null as unknown)
);

vi.mock("@/lib/connections", () => ({
  getConnection: (...args: Parameters<typeof mockGetConnection>) => mockGetConnection(...args),
  saveConnection: vi.fn(),
  updateLastSynced: vi.fn(),
}));

const mockAddEvent = vi.fn((_payload: unknown) => Promise.resolve({ id: "evt_test" }));

vi.mock("@/lib/events", () => ({
  addEvent: (...args: Parameters<typeof mockAddEvent>) => mockAddEvent(...args),
}));

const mockSendSlack = vi.fn((_msg: unknown) => Promise.resolve(true));

vi.mock("@/lib/slack", () => ({
  sendSlackNotification: (...args: Parameters<typeof mockSendSlack>) => mockSendSlack(...args),
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetch = vi.fn<(...args: any[]) => Promise<any>>(() =>
  Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve("{}"), json: () => Promise.resolve({}) })
);
global.fetch = mockFetch as unknown as typeof global.fetch;

const TENANT = "t1";
const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";

function connectedWithScope() {
  return {
    provider: "google" as const,
    tenantId: TENANT,
    accessToken: "tok_valid",
    status: "connected" as const,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    scopes: [GBP_SCOPE],
  };
}

function setupGbpMeta() {
  mockRedisGet.mockImplementation((key: unknown) => {
    if (typeof key === "string" && key.startsWith("google-meta:")) {
      return Promise.resolve({ accountId: "accounts/1", locationId: "loc_123" });
    }
    return Promise.resolve(null);
  });
}

type MockEventCall = [{ type: string; status?: string; metadata?: Record<string, unknown> }];

// The real Google error body when the Business Profile API access grant is
// still pending: 403 with reason accessNotConfigured / SERVICE_DISABLED.
const SETUP_PENDING_BODY = JSON.stringify({
  error: {
    code: 403,
    status: "PERMISSION_DENIED",
    message:
      "Business Profile API has not been used in project 123456789 before or it is disabled.",
    details: [{ reason: "SERVICE_DISABLED" }],
  },
});

const regularHours = {
  periods: [
    {
      openDay: "MONDAY" as const,
      openTime: { hours: 9, minutes: 0 },
      closeDay: "MONDAY" as const,
      closeTime: { hours: 17, minutes: 0 },
    },
  ],
};

describe("GBP pending-approval soft-fail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    mockGetConnection.mockResolvedValue(connectedWithScope());
    setupGbpMeta();
  });

  it("updateBusinessHours returns a soft 'being set up' result on 403 SERVICE_DISABLED — no scary FAILED ping", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve(SETUP_PENDING_BODY),
    });

    const { updateBusinessHours } = await import("@/lib/gbp-management");
    const result = await updateBusinessHours(TENANT, { regularHours });

    expect(result.success).toBe(false);
    expect(result.pendingSetup).toBe(true);
    expect(result.ownerMessage).toContain("being set up");

    // A gentle informational event, not the scary change_verify_failed FAILED path.
    const calls = mockAddEvent.mock.calls as MockEventCall[];
    const soft = calls.find(([e]) => e.metadata?.kind === "gbp_setup_pending");
    expect(soft).toBeDefined();
    expect(soft![0].status).toBe("auto_approved");
    // No "FAILED" Slack ping fires for the expected setup window.
    expect(mockSendSlack).not.toHaveBeenCalled();
  });

  it("createGbpPost soft-fails on 429 quota-exhausted while access is pending", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: () =>
        Promise.resolve(
          JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Quota exceeded" } })
        ),
    });

    const { createGbpPost } = await import("@/lib/gbp-management");
    const result = await createGbpPost(TENANT, { summary: "We're open Saturdays!" });

    expect(result.success).toBe(false);
    expect(result.pendingSetup).toBe(true);
    expect(result.ownerMessage).toContain("being set up");
    expect(mockSendSlack).not.toHaveBeenCalled();
  });

  it("uploadGbpPhoto soft-fails while access is pending", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve(SETUP_PENDING_BODY),
    });

    const { uploadGbpPhoto } = await import("@/lib/gbp-management");
    const result = await uploadGbpPhoto(TENANT, "https://example.com/photo.jpg", "EXTERIOR");

    expect(result.success).toBe(false);
    expect(result.pendingSetup).toBe(true);
    expect(result.ownerMessage).toContain("being set up");
  });

  it("a GENUINE 403 (real permission problem) stays a hard failure, not 'being set up'", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve("Forbidden: the caller does not have permission on this location"),
    });

    const { updateBusinessHours } = await import("@/lib/gbp-management");
    const result = await updateBusinessHours(TENANT, { regularHours });

    expect(result.success).toBe(false);
    expect(result.pendingSetup).toBeUndefined();
    expect(result.evidence).toContain("api_error");

    const calls = mockAddEvent.mock.calls as MockEventCall[];
    expect(calls.find(([e]) => e.type === "change_verify_failed")).toBeDefined();
    expect(calls.find(([e]) => e.metadata?.kind === "gbp_setup_pending")).toBeUndefined();
  });
});
