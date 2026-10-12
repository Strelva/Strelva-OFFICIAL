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

vi.mock("@/platform/infra/auth", () => ({ isSuperAdmin: (...a: unknown[]) => mockIsSuperAdmin(...a) }));
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

describe("retired operator review drafting", () => {
  it("rejects non-admins without touching client records", async () => {
    mockIsSuperAdmin.mockResolvedValue(false);
    expect(await draftReviewReplyForReview("gldf", "r1")).toEqual({ ok: false, drafted: false, reason: "unauthorized" });
    expect(mockGetReviews).not.toHaveBeenCalled();
    expect(mockAddEvent).not.toHaveBeenCalled();
  });
  it.each([["gldf", "r1"], ["missing", "unknown"], ["", ""]])("retires platform-authorized drafting for %s/%s before reads and effects", async (tenant, reviewId) => {
    expect(await draftReviewReplyForReview(tenant, reviewId)).toEqual({ ok: false, drafted: false, reason: "platform_content_authority_retired" });
    for (const call of [mockGetTenantConfig, mockGetReviews, mockDraftReviewReply, mockGetEvents, mockAddEvent, mockStoreRecentReply]) expect(call).not.toHaveBeenCalled();
  });
});
