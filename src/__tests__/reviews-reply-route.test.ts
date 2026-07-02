import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * POST /api/reviews/reply — the owner's reply must actually PUBLISH to Google
 * (via the governed review_reply_draft → event-actions path) when the review
 * is a Google review and GBP is connected, and must fall back to the local
 * copy-paste save everywhere else. A failed publish must save NOTHING locally
 * so the card can't claim a reply is handled when it isn't live.
 */

const mockGetReviews = vi.fn();
const mockReplyToReview = vi.fn();
const mockGetConnection = vi.fn();
const mockGetEvents = vi.fn();
const mockAddEvent = vi.fn();
const mockUpdateEvent = vi.fn();
const mockResolveEventAction = vi.fn();
const mockLogActivity = vi.fn();

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(() => Promise.resolve(true)),
  requireTenantAccess: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/tenant", () => ({
  getTenantFromHeaders: vi.fn(() => Promise.resolve("test-tenant")),
}));

vi.mock("@/lib/reviews", () => ({
  getReviews: (...args: unknown[]) => mockGetReviews(...args),
  replyToReview: (...args: unknown[]) => mockReplyToReview(...args),
}));

vi.mock("@/lib/connections", () => ({
  getConnection: (...args: unknown[]) => mockGetConnection(...args),
}));

vi.mock("@/lib/events", () => ({
  getEvents: (...args: unknown[]) => mockGetEvents(...args),
  addEvent: (...args: unknown[]) => mockAddEvent(...args),
  updateEvent: (...args: unknown[]) => mockUpdateEvent(...args),
}));

vi.mock("@/lib/event-actions", () => ({
  resolveEventAction: (...args: unknown[]) => mockResolveEventAction(...args),
}));

vi.mock("@/lib/storage", () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
}));

const googleReview = {
  id: "rev_1",
  source: "google",
  author: "Jane",
  rating: 5,
  text: "Great",
  date: "2026-06-20T00:00:00.000Z",
  externalId: "gbp_abc",
};

const manualReview = {
  id: "rev_2",
  source: "manual",
  author: "Bob",
  rating: 4,
  text: "Nice",
  date: "2026-06-21T00:00:00.000Z",
};

function replyRequest(body: unknown): Request {
  return new Request("http://localhost/api/reviews/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function postReply(body: unknown): Promise<Response> {
  const { POST } = await import("@/app/api/reviews/reply/route");
  return POST(replyRequest(body));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetReviews.mockResolvedValue([googleReview, manualReview]);
  mockReplyToReview.mockImplementation((_t: string, id: string, reply: string) =>
    Promise.resolve({ ...(id === "rev_1" ? googleReview : manualReview), reply, repliedAt: "2026-07-01T00:00:00.000Z" })
  );
  mockGetConnection.mockResolvedValue({ provider: "google", status: "connected" });
  mockGetEvents.mockResolvedValue([]);
  mockAddEvent.mockImplementation((event: Record<string, unknown>) =>
    Promise.resolve({ ...event, id: "evt_new", createdAt: new Date().toISOString() })
  );
  mockUpdateEvent.mockResolvedValue({ event: null, changed: true });
  mockResolveEventAction.mockResolvedValue({ changed: true });
});

describe("POST /api/reviews/reply", () => {
  it("publishes a Google review reply through the governed approval path", async () => {
    const res = await postReply({ reviewId: "rev_1", reply: "Thanks Jane!" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.published).toBe(true);
    expect(data.review.reply).toBe("Thanks Jane!");

    // Queued a review_reply_draft addressed by the GBP review id, then
    // approved it with the owner as actor via event-actions (the reuse, not a
    // direct publishReviewReply call).
    expect(mockAddEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "review",
        status: "pending",
        metadata: expect.objectContaining({
          kind: "review_reply_draft",
          reviewId: "gbp_abc",
          draftedReply: "Thanks Jane!",
        }),
      })
    );
    expect(mockResolveEventAction).toHaveBeenCalledWith("test-tenant", "evt_new", "approved");
    expect(mockReplyToReview).toHaveBeenCalledWith("test-tenant", "rev_1", "Thanks Jane!");
  });

  it("reuses the poller's pending draft event instead of queueing a duplicate", async () => {
    mockGetEvents.mockResolvedValue([
      {
        id: "evt_existing",
        type: "review",
        status: "pending",
        metadata: { kind: "review_reply_draft", reviewId: "gbp_abc", draftedReply: "AI draft" },
      },
    ]);

    const res = await postReply({ reviewId: "rev_1", reply: "Owner's final text" });
    expect(res.status).toBe(200);
    expect(mockAddEvent).not.toHaveBeenCalled();
    expect(mockUpdateEvent).toHaveBeenCalledWith("evt_existing", expect.any(Function));
    expect(mockResolveEventAction).toHaveBeenCalledWith("test-tenant", "evt_existing", "approved");
  });

  it("returns 502 and saves nothing locally when the publish fails", async () => {
    mockResolveEventAction.mockResolvedValue({ changed: false, reason: "review_reply_failed" });

    const res = await postReply({ reviewId: "rev_1", reply: "Thanks Jane!" });
    expect(res.status).toBe(502);
    const data = await res.json();
    expect(data.published).toBe(false);
    expect(mockReplyToReview).not.toHaveBeenCalled();
    expect(mockLogActivity).not.toHaveBeenCalled();
  });

  it("saves locally without touching the publish machinery for non-Google reviews", async () => {
    const res = await postReply({ reviewId: "rev_2", reply: "Thanks Bob!" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.published).toBe(false);
    expect(mockGetConnection).not.toHaveBeenCalled();
    expect(mockAddEvent).not.toHaveBeenCalled();
    expect(mockResolveEventAction).not.toHaveBeenCalled();
    expect(mockReplyToReview).toHaveBeenCalledWith("test-tenant", "rev_2", "Thanks Bob!");
  });

  it("falls back to the local save when GBP is not connected", async () => {
    mockGetConnection.mockResolvedValue({ provider: "google", status: "error" });

    const res = await postReply({ reviewId: "rev_1", reply: "Thanks Jane!" });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.published).toBe(false);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
    expect(mockReplyToReview).toHaveBeenCalledWith("test-tenant", "rev_1", "Thanks Jane!");
  });

  it("404s for an unknown review id", async () => {
    const res = await postReply({ reviewId: "rev_missing", reply: "Hello" });
    expect(res.status).toBe(404);
  });
});
