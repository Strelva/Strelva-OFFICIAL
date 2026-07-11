import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewItem } from "@/lib/types";

// The operator ReviewIntelPanel's inline "Draft reply" server action. Invariants:
//  - super-admin is re-verified independently (the /admin layout gate does not
//    protect a server action POST surface);
//  - it routes through the SAME governed review_reply_draft path — a PENDING event,
//    never a direct publish to Google;
//  - idempotent: a review that already has a pending draft is not re-queued.

const mockIsSuperAdmin = vi.fn();
const mockGetReviews = vi.fn();
const mockGetTenantConfig = vi.fn();
const mockDraftReviewReply = vi.fn();
const mockStoreRecentReply = vi.fn();
const mockAddEvent = vi.fn();
const mockGetEvents = vi.fn();

vi.mock("@/lib/auth", () => ({ isSuperAdmin: (...a: unknown[]) => mockIsSuperAdmin(...a) }));
vi.mock("@/lib/reviews", () => ({ getReviews: (...a: unknown[]) => mockGetReviews(...a) }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: (...a: unknown[]) => mockGetTenantConfig(...a) }));
vi.mock("@/lib/review-replies", () => ({
  draftReviewReply: (...a: unknown[]) => mockDraftReviewReply(...a),
  storeRecentReply: (...a: unknown[]) => mockStoreRecentReply(...a),
}));
vi.mock("@/lib/events", () => ({
  addEvent: (...a: unknown[]) => mockAddEvent(...a),
  getEvents: (...a: unknown[]) => mockGetEvents(...a),
}));

import { draftReviewReplyForReview } from "@/app/admin/clients/[id]/review-actions";

function review(over: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: "r1",
    source: "google",
    author: "Sam",
    rating: 2,
    text: "Slow service",
    date: "2026-06-30T00:00:00.000Z",
    externalId: "ext-r1",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsSuperAdmin.mockResolvedValue(true);
  mockGetTenantConfig.mockResolvedValue({ id: "gldf", siteName: "GLDF" });
  mockGetReviews.mockResolvedValue([review()]);
  mockGetEvents.mockResolvedValue([]);
  mockDraftReviewReply.mockResolvedValue("Thanks so much, Sam.");
  mockAddEvent.mockResolvedValue({ id: "evt_new" });
  mockStoreRecentReply.mockResolvedValue(undefined);
});

describe("draftReviewReplyForReview", () => {
  it("rejects a non-super-admin without touching the queue", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    const res = await draftReviewReplyForReview("gldf", "r1");
    expect(res).toEqual({ ok: false, drafted: false, reason: "unauthorized" });
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("queues a PENDING review_reply_draft (never publishes) for a matched review", async () => {
    const res = await draftReviewReplyForReview("gldf", "r1");
    expect(res).toEqual({ ok: true, drafted: true });
    expect(mockAddEvent).toHaveBeenCalledTimes(1);
    const event = mockAddEvent.mock.calls[0][0];
    expect(event.status).toBe("pending");
    expect(event.type).toBe("review");
    expect(event.metadata.kind).toBe("review_reply_draft");
    // dedupe key follows the poller convention (provider externalId)
    expect(event.metadata.reviewId).toBe("ext-r1");
  });

  it("is idempotent when a pending draft already exists", async () => {
    mockGetEvents.mockResolvedValue([
      { type: "review", metadata: { kind: "review_reply_draft", reviewId: "ext-r1" } },
    ]);
    const res = await draftReviewReplyForReview("gldf", "r1");
    expect(res).toEqual({ ok: true, drafted: false, reason: "already_drafted" });
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("no-ops honestly when the review already has a reply", async () => {
    mockGetReviews.mockResolvedValue([review({ reply: "Already handled" })]);
    const res = await draftReviewReplyForReview("gldf", "r1");
    expect(res).toEqual({ ok: true, drafted: false, reason: "already_replied" });
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("reports a draft failure without throwing", async () => {
    mockDraftReviewReply.mockRejectedValue(new Error("model down"));
    const res = await draftReviewReplyForReview("gldf", "r1");
    expect(res).toEqual({ ok: false, drafted: false, reason: "draft_failed" });
  });
});
