import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The review-nudge cron must:
//  - send only when a review URL is derivable (Google Place ID on config),
//  - respect the ~30-day per-tenant throttle,
//  - stamp the throttle only when a send actually happened.

const mockGetAllTenants = vi.hoisted(() => vi.fn());
const mockSendReviewRequestEmail = vi.hoisted(() => vi.fn());
const mockRecordHeartbeat = vi.hoisted(() => vi.fn());
const mockRedisGet = vi.hoisted(() => vi.fn());
const mockRedisSet = vi.hoisted(() => vi.fn());
const mockGetRedis = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenants", () => ({
  getAllTenants: mockGetAllTenants,
  isActiveTenant: (t: { active: boolean }) => t.active,
}));
vi.mock("@/lib/delivery-email", () => ({ sendReviewRequestEmail: mockSendReviewRequestEmail }));
vi.mock("@/lib/heartbeat", () => ({ recordHeartbeat: mockRecordHeartbeat }));
vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));

const DAY_MS = 24 * 60 * 60 * 1000;

function tenant(over: Record<string, unknown>) {
  return {
    id: "t1",
    siteName: "T1",
    active: true,
    ownerEmail: "owner@t1.com",
    ...over,
  };
}

describe("GET /api/cron/review-nudge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedis.mockReturnValue({ get: mockRedisGet, set: mockRedisSet });
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue(undefined);
    mockSendReviewRequestEmail.mockResolvedValue(true);
    mockRecordHeartbeat.mockResolvedValue(undefined);
  });

  afterEach(() => vi.resetModules());

  it("sends and stamps the throttle for a tenant with a Google Place ID", async () => {
    mockGetAllTenants.mockResolvedValue([
      tenant({ id: "gldf", siteName: "GLDF", reviewsConfig: { googlePlaceId: "PLACE_123" } }),
    ]);
    const { GET } = await import("@/app/api/cron/review-nudge/route");
    const res = await GET();
    const body = await res.json();

    expect(body).toMatchObject({ ok: true, sent: 1, skippedNoUrl: 0 });
    expect(mockSendReviewRequestEmail).toHaveBeenCalledTimes(1);
    expect(mockSendReviewRequestEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@t1.com",
        businessName: "GLDF",
        reviewUrl: "https://search.google.com/local/writereview?placeid=PLACE_123",
        // Opts into the CRM comms log so a real nudge accrues on the tenant timeline.
        tenantId: "gldf",
      }),
    );
    expect(mockRedisSet).toHaveBeenCalledWith("reb:review-nudge-sent:gldf", expect.any(Number));
  });

  it("skips a tenant with no review URL (no Place ID)", async () => {
    mockGetAllTenants.mockResolvedValue([tenant({ id: "norev", reviewsConfig: {} })]);
    const { GET } = await import("@/app/api/cron/review-nudge/route");
    const body = await (await GET()).json();

    expect(body).toMatchObject({ sent: 0, skippedNoUrl: 1 });
    expect(mockSendReviewRequestEmail).not.toHaveBeenCalled();
    expect(mockRedisSet).not.toHaveBeenCalled();
  });

  it("respects the 30-day gap — skips when last-sent is recent", async () => {
    mockRedisGet.mockResolvedValue(Date.now() - 5 * DAY_MS); // sent 5 days ago
    mockGetAllTenants.mockResolvedValue([
      tenant({ id: "recent", reviewsConfig: { googlePlaceId: "P" } }),
    ]);
    const { GET } = await import("@/app/api/cron/review-nudge/route");
    const body = await (await GET()).json();

    expect(body).toMatchObject({ sent: 0, skippedThrottled: 1 });
    expect(mockSendReviewRequestEmail).not.toHaveBeenCalled();
  });

  it("sends when the last nudge is older than 30 days", async () => {
    mockRedisGet.mockResolvedValue(Date.now() - 40 * DAY_MS);
    mockGetAllTenants.mockResolvedValue([
      tenant({ id: "old", reviewsConfig: { googlePlaceId: "P" } }),
    ]);
    const { GET } = await import("@/app/api/cron/review-nudge/route");
    const body = await (await GET()).json();

    expect(body).toMatchObject({ sent: 1 });
    expect(mockSendReviewRequestEmail).toHaveBeenCalledTimes(1);
  });

  it("does NOT stamp the throttle when the send was suppressed (client pause)", async () => {
    mockSendReviewRequestEmail.mockResolvedValue(false); // paused / failed
    mockGetAllTenants.mockResolvedValue([
      tenant({ id: "paused", reviewsConfig: { googlePlaceId: "P" } }),
    ]);
    const { GET } = await import("@/app/api/cron/review-nudge/route");
    const body = await (await GET()).json();

    expect(body).toMatchObject({ sent: 0, skippedNotSent: 1 });
    expect(mockRedisSet).not.toHaveBeenCalled();
  });
});
