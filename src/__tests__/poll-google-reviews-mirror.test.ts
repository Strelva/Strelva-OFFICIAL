import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A transient addReview (Reviews-tab mirror) failure must leave that reviewId
// OUT of the seen-set cursor so the next poll retries it — otherwise the review
// is in the activity feed but lost from the Reviews tab forever.

const mockGetAllTenants = vi.hoisted(() => vi.fn());
const mockGetTenantConfig = vi.hoisted(() => vi.fn());
const mockGetConnection = vi.hoisted(() => vi.fn());
const mockSaveConnection = vi.hoisted(() => vi.fn());
const mockUpdateLastSynced = vi.hoisted(() => vi.fn());
const mockAddEvent = vi.hoisted(() => vi.fn());
const mockAddReview = vi.hoisted(() => vi.fn());
const mockGetRedis = vi.hoisted(() => vi.fn());
const mockDraftReviewReply = vi.hoisted(() => vi.fn());
const mockStoreRecentReply = vi.hoisted(() => vi.fn());
const mockAlert = vi.hoisted(() => vi.fn());
const mockRecordHeartbeat = vi.hoisted(() => vi.fn());

vi.mock("@/lib/tenants", () => ({
  getAllTenants: mockGetAllTenants,
  getTenantConfig: mockGetTenantConfig,
}));
vi.mock("@/lib/connections", () => ({
  getConnection: mockGetConnection,
  saveConnection: mockSaveConnection,
  updateLastSynced: mockUpdateLastSynced,
}));
vi.mock("@/lib/events", () => ({ addEvent: mockAddEvent }));
vi.mock("@/lib/reviews", () => ({ addReview: mockAddReview }));
vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));
vi.mock("@/lib/review-replies", () => ({
  draftReviewReply: mockDraftReviewReply,
  storeRecentReply: mockStoreRecentReply,
}));
vi.mock("@/lib/monitoring", () => ({ alert: mockAlert }));
vi.mock("@/lib/heartbeat", () => ({ recordHeartbeat: mockRecordHeartbeat }));
vi.mock("@/lib/concurrency", () => ({
  // Deterministic sequential runner in place of the real pool.
  mapPool: async <T,>(items: T[], _n: number, fn: (item: T) => Promise<unknown>) => {
    for (const item of items) await fn(item);
  },
}));

function googleReview(id: string, author: string) {
  return {
    reviewId: id,
    reviewer: { displayName: author },
    starRating: "FIVE" as const,
    comment: `comment ${id}`,
    createTime: "2026-06-01T00:00:00Z",
    updateTime: "2026-06-01T00:00:00Z",
  };
}

const LAST_KEY = "google-reviews:last:t1";
let redisSet: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});

  mockGetAllTenants.mockResolvedValue([{ id: "t1", active: true }]);
  mockGetTenantConfig.mockResolvedValue({ id: "t1", siteName: "T1" });
  mockGetConnection.mockResolvedValue({
    tenantId: "t1",
    status: "connected",
    accessToken: "tok",
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  });
  mockAddEvent.mockResolvedValue({ id: "evt" });
  mockDraftReviewReply.mockResolvedValue("drafted reply");
  mockStoreRecentReply.mockResolvedValue(undefined);
  mockUpdateLastSynced.mockResolvedValue(undefined);
  mockRecordHeartbeat.mockResolvedValue(undefined);

  redisSet = vi.fn().mockResolvedValue(undefined);
  mockGetRedis.mockReturnValue({
    get: vi.fn(async (key: string) => {
      if (key === "google-meta:t1") return { accountId: "a", locationId: "l" };
      if (key === LAST_KEY) return null; // no reviews seen before
      return null;
    }),
    set: redisSet,
  });

  // r1 mirror throws (transient Redis blip); r2 mirror succeeds.
  mockAddReview.mockImplementation((_tenant: string, review: { externalId: string }) =>
    review.externalId === "r1"
      ? Promise.reject(new Error("redis blip"))
      : Promise.resolve({ ...review, id: "row" }),
  );

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("mybusiness.googleapis.com")) {
        return {
          ok: true,
          json: async () => ({ reviews: [googleReview("r1", "Alice"), googleReview("r2", "Bob")] }),
        } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("poll-google-reviews mirror-failure cursor", () => {
  it("excludes a reviewId whose addReview threw from the seen-set, but keeps its mirrored sibling", async () => {
    const { GET } = await import("@/app/api/cron/poll-google-reviews/route");
    await GET();

    // Both reviews were attempted against the Reviews-tab mirror.
    expect(mockAddReview).toHaveBeenCalledTimes(2);

    // The seen-set write for the cursor.
    const seenWrite = redisSet.mock.calls.find((c) => c[0] === LAST_KEY);
    expect(seenWrite).toBeDefined();
    const persistedIds = seenWrite![1] as string[];

    // r2 mirrored cleanly -> stays seen. r1 failed -> excluded so it retries.
    expect(persistedIds).toContain("r2");
    expect(persistedIds).not.toContain("r1");
  });
});
