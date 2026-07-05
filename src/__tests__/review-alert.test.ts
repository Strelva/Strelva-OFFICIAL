import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// maybeAlertNewReview must email the owner at most once per review (NX marker),
// respect the client email pause (roll the marker back so it retries), and no-op
// without an owner email or a dedup store.

const mockSend = vi.hoisted(() => vi.fn());
const mockRedisSet = vi.hoisted(() => vi.fn());
const mockRedisDel = vi.hoisted(() => vi.fn());
const mockGetRedis = vi.hoisted(() => vi.fn());

vi.mock("@/lib/delivery-email", () => ({ sendReviewNeedsReplyEmail: mockSend }));
vi.mock("@/lib/redis", () => ({ getRedis: mockGetRedis }));

function tenant(over: Record<string, unknown> = {}) {
  return { id: "gldf", siteName: "GLDF", ownerEmail: "owner@gldf.com", ...over } as never;
}

const base = {
  reviewId: "rev_1",
  review: { author: "Jane", rating: 5, text: "Great" },
  reviewsUrl: "https://admin.gldf.strelva.com/dashboard/reviews",
};

describe("maybeAlertNewReview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRedis.mockReturnValue({ set: mockRedisSet, del: mockRedisDel });
    mockRedisSet.mockResolvedValue("OK"); // NX claim succeeds
    mockRedisDel.mockResolvedValue(undefined);
    mockSend.mockResolvedValue(true);
  });
  afterEach(() => vi.resetModules());

  it("sends once and keeps the dedup marker on a real send", async () => {
    const { maybeAlertNewReview, reviewAlertSentKey } = await import("@/lib/review-alert");
    const ok = await maybeAlertNewReview({ tenant: tenant(), ...base });
    expect(ok).toBe(true);
    expect(mockRedisSet).toHaveBeenCalledWith(
      reviewAlertSentKey("gldf", "rev_1"),
      "1",
      expect.objectContaining({ nx: true }),
    );
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockRedisDel).not.toHaveBeenCalled();
  });

  it("does not send twice — a claimed marker (NX miss) short-circuits", async () => {
    mockRedisSet.mockResolvedValue(null); // already claimed
    const { maybeAlertNewReview } = await import("@/lib/review-alert");
    const ok = await maybeAlertNewReview({ tenant: tenant(), ...base });
    expect(ok).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("respects the client pause: rolls the marker back when the send is suppressed", async () => {
    mockSend.mockResolvedValue(false); // paused / failed
    const { maybeAlertNewReview, reviewAlertSentKey } = await import("@/lib/review-alert");
    const ok = await maybeAlertNewReview({ tenant: tenant(), ...base });
    expect(ok).toBe(false);
    expect(mockRedisDel).toHaveBeenCalledWith(reviewAlertSentKey("gldf", "rev_1"));
  });

  it("no-ops without an owner email", async () => {
    const { maybeAlertNewReview } = await import("@/lib/review-alert");
    const ok = await maybeAlertNewReview({ tenant: tenant({ ownerEmail: undefined }), ...base });
    expect(ok).toBe(false);
    expect(mockRedisSet).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("no-ops without a dedup store", async () => {
    mockGetRedis.mockReturnValue(null);
    const { maybeAlertNewReview } = await import("@/lib/review-alert");
    const ok = await maybeAlertNewReview({ tenant: tenant(), ...base });
    expect(ok).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("forwards approve/not-yet links to the sender when a draft exists", async () => {
    const { maybeAlertNewReview } = await import("@/lib/review-alert");
    await maybeAlertNewReview({
      tenant: tenant(),
      ...base,
      draftedReply: "Thanks Jane!",
      approveUrl: "https://admin.gldf.strelva.com/api/approve?token=A",
      notYetUrl: "https://admin.gldf.strelva.com/api/approve?token=N",
    });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        draftedReply: "Thanks Jane!",
        approveUrl: "https://admin.gldf.strelva.com/api/approve?token=A",
        notYetUrl: "https://admin.gldf.strelva.com/api/approve?token=N",
      }),
    );
  });
});
