import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The order-review-request cron must:
//  - email the owner their review link once an order has aged past the delay,
//  - only for tenants with a derivable review URL (Google Place ID),
//  - dedupe per-order (NX marker), and roll the marker back on a suppressed send,
//  - ignore orders that are too fresh or past the request window.

const mockGetAllTenants = vi.hoisted(() => vi.fn());
const mockGetOrders = vi.hoisted(() => vi.fn());
const mockSend = vi.hoisted(() => vi.fn());
const mockRecordHeartbeat = vi.hoisted(() => vi.fn());
const mockRedisSet = vi.hoisted(() => vi.fn());
const mockRedisDel = vi.hoisted(() => vi.fn());
const mockGetRedis = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenants", () => ({
  getAllTenants: mockGetAllTenants,
  isActiveTenant: (t: { active: boolean }) => t.active,
}));
vi.mock("@/lib/orders", () => ({ getOrders: mockGetOrders }));
vi.mock("@/lib/delivery-email", () => ({ sendReviewRequestEmail: mockSend }));
vi.mock("@/lib/heartbeat", () => ({ recordHeartbeat: mockRecordHeartbeat }));
vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));

const DAY_MS = 24 * 60 * 60 * 1000;

function tenant(over: Record<string, unknown> = {}) {
  return {
    id: "gldf",
    siteName: "GLDF",
    active: true,
    ownerEmail: "owner@gldf.com",
    reviewsConfig: { googlePlaceId: "PLACE_123" },
    ...over,
  };
}

function order(ageDays: number, id = "ord_1") {
  return {
    id,
    amountCents: 4200,
    currency: "USD",
    itemCount: 1,
    items: [{ name: "Widget", quantity: 1 }],
    createdAt: new Date(Date.now() - ageDays * DAY_MS).toISOString(),
  };
}

async function run() {
  const { GET } = await import("@/app/api/cron/order-review-request/route");
  return (await GET()).json();
}

describe("GET /api/cron/order-review-request", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedis.mockReturnValue({ set: mockRedisSet, del: mockRedisDel });
    mockRedisSet.mockResolvedValue("OK");
    mockRedisDel.mockResolvedValue(undefined);
    mockSend.mockResolvedValue(true);
    mockRecordHeartbeat.mockResolvedValue(undefined);
    mockGetOrders.mockResolvedValue([]);
  });
  afterEach(() => vi.resetModules());

  it("schedules a review request for an order aged past the delay", async () => {
    mockGetAllTenants.mockResolvedValue([tenant()]);
    mockGetOrders.mockResolvedValue([order(4)]); // delay is 3 days, window +7
    const body = await run();
    expect(body).toMatchObject({ sent: 1 });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "owner@gldf.com",
        businessName: "GLDF",
        reviewUrl: "https://search.google.com/local/writereview?placeid=PLACE_123",
        // Opts into the CRM comms log so a real send accrues on the tenant timeline.
        tenantId: "gldf",
      }),
    );
    expect(mockRedisSet).toHaveBeenCalledWith(
      "reb:order-review-request-sent:gldf:ord_1",
      expect.any(Number),
      expect.objectContaining({ nx: true }),
    );
  });

  it("skips a tenant with no review URL", async () => {
    mockGetAllTenants.mockResolvedValue([tenant({ reviewsConfig: {} })]);
    mockGetOrders.mockResolvedValue([order(4)]);
    const body = await run();
    expect(body).toMatchObject({ sent: 0, skippedNoUrl: 1 });
    expect(mockGetOrders).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("ignores an order still inside the delay window (too fresh)", async () => {
    mockGetAllTenants.mockResolvedValue([tenant()]);
    mockGetOrders.mockResolvedValue([order(1)]);
    const body = await run();
    expect(body).toMatchObject({ sent: 0 });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("ignores an order past the request window (too old)", async () => {
    mockGetAllTenants.mockResolvedValue([tenant()]);
    mockGetOrders.mockResolvedValue([order(30)]);
    const body = await run();
    expect(body).toMatchObject({ sent: 0 });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("dedupes per order — a claimed marker (NX miss) skips the send", async () => {
    mockRedisSet.mockResolvedValue(null);
    mockGetAllTenants.mockResolvedValue([tenant()]);
    mockGetOrders.mockResolvedValue([order(4)]);
    const body = await run();
    expect(body).toMatchObject({ sent: 0 });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("respects the client pause: rolls back the marker when the send is suppressed", async () => {
    mockSend.mockResolvedValue(false);
    mockGetAllTenants.mockResolvedValue([tenant()]);
    mockGetOrders.mockResolvedValue([order(4)]);
    const body = await run();
    expect(body).toMatchObject({ sent: 0, skippedNotSent: 1 });
    expect(mockRedisDel).toHaveBeenCalledWith("reb:order-review-request-sent:gldf:ord_1");
  });
});
