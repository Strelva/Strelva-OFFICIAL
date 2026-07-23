import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedEvent } from "@/lib/types";

// The auto-post cron for "auto" reply mode. Safety invariants:
//  - only publishes drafts whose autoPostAt window has ELAPSED;
//  - approve-mode drafts (no autoPostAt) are never auto-posted;
//  - re-checks the LIVE mode, so a client who switched off "auto" after a draft
//    was stamped never has it fire;
//  - publishes through the SAME governed resolveEventAction("approved") path.

const mockGetAllTenants = vi.fn();
const mockGetEvents = vi.fn();
const mockUpdateEvent = vi.fn();
const mockResolveEventAction = vi.fn();
const mockGetReplyVoice = vi.fn();
const mockAddEvent = vi.fn();
const mockGetReviews = vi.fn();
const mockDraftReviewReply = vi.fn();
const mockStoreRecentReply = vi.fn();
const mockIsReviewReplyDeclined = vi.fn();

vi.mock("@/lib/tenants", () => ({ getAllTenants: (...a: unknown[]) => mockGetAllTenants(...a) }));
vi.mock("@/lib/events", () => ({
  getEvents: (...a: unknown[]) => mockGetEvents(...a),
  // The crons read Redis-authoritative via getEventsRaw (execution path); in
  // tests it returns the same fixtures as getEvents.
  getEventsRaw: (...a: unknown[]) => mockGetEvents(...a),
  updateEvent: (...a: unknown[]) => mockUpdateEvent(...a),
  addEvent: (...a: unknown[]) => mockAddEvent(...a),
}));
vi.mock("@/lib/event-actions", () => ({ resolveEventAction: (...a: unknown[]) => mockResolveEventAction(...a) }));
vi.mock("@/lib/reviews/reply-voice", () => ({ getReplyVoice: (...a: unknown[]) => mockGetReplyVoice(...a) }));
vi.mock("@/lib/reviews", () => ({ getReviews: (...a: unknown[]) => mockGetReviews(...a) }));
vi.mock("@/lib/review-replies", () => ({
  draftReviewReply: (...a: unknown[]) => mockDraftReviewReply(...a),
  storeRecentReply: (...a: unknown[]) => mockStoreRecentReply(...a),
  isReviewReplyDeclined: (...a: unknown[]) => mockIsReviewReplyDeclined(...a),
}));

import { runDueAutoPosts, draftReplyBacklog } from "@/lib/reviews/auto-reply";

const NOW = 1_800_000_000_000;

function draft(over: Partial<UnifiedEvent> & { autoPostAt?: string | null } = {}): UnifiedEvent {
  const { autoPostAt, ...rest } = over;
  return {
    id: "e1",
    tenantId: "acme",
    source: "ai",
    type: "review",
    title: "Drafted reply",
    body: "thanks",
    status: "pending",
    time: new Date(NOW).toISOString(),
    metadata: {
      kind: "review_reply_draft",
      reviewId: "rev1",
      ...(autoPostAt !== undefined ? { autoPostAt } : {}),
    },
    ...rest,
  } as UnifiedEvent;
}

describe("runDueAutoPosts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllTenants.mockResolvedValue([{ id: "acme", active: true }]);
    mockGetReplyVoice.mockResolvedValue({ mode: "auto" });
    mockResolveEventAction.mockResolvedValue({ changed: true });
    mockUpdateEvent.mockResolvedValue({ changed: true });
  });

  it("posts a draft whose window has elapsed", async () => {
    mockGetEvents.mockResolvedValue([draft({ autoPostAt: new Date(NOW - 60_000).toISOString() })]);
    const res = await runDueAutoPosts(NOW);
    expect(mockResolveEventAction).toHaveBeenCalledWith("acme", "e1", "approved");
    expect(res.posted).toBe(1);
  });

  it("reports a due draft as failed when governance leaves it pending", async () => {
    mockGetEvents.mockResolvedValue([draft({ autoPostAt: new Date(NOW - 60_000).toISOString() })]);
    mockResolveEventAction.mockResolvedValue({ changed: false, reason: "provider_failed" });
    const res = await runDueAutoPosts(NOW);
    expect(res).toEqual({ posted: 0, failed: 1 });
  });

  it("bumps the attempt counter on failure and gives up after the cap", async () => {
    // A draft on its 3rd (final) failed attempt should be flagged autoPostFailed.
    const failing = draft({ autoPostAt: new Date(NOW - 60_000).toISOString() });
    failing.metadata = { ...failing.metadata, autoPostAttempts: 2 };
    mockGetEvents.mockResolvedValue([failing]);
    mockResolveEventAction.mockResolvedValue({ changed: false, reason: "provider_failed" });
    await runDueAutoPosts(NOW);
    expect(mockUpdateEvent).toHaveBeenCalledTimes(1);
    const updater = mockUpdateEvent.mock.calls[0][1] as (e: UnifiedEvent) => UnifiedEvent;
    const next = updater(failing);
    expect(next.metadata?.autoPostAttempts).toBe(3);
    expect(next.metadata?.autoPostFailed).toBe(true);
  });

  it("skips a draft already flagged autoPostFailed", async () => {
    const dead = draft({ autoPostAt: new Date(NOW - 60_000).toISOString() });
    dead.metadata = { ...dead.metadata, autoPostFailed: true };
    mockGetEvents.mockResolvedValue([dead]);
    const res = await runDueAutoPosts(NOW);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
    expect(res).toEqual({ posted: 0, failed: 0 });
  });

  it("does NOT post a draft still inside its window", async () => {
    mockGetEvents.mockResolvedValue([draft({ autoPostAt: new Date(NOW + 3_600_000).toISOString() })]);
    const res = await runDueAutoPosts(NOW);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
    expect(res.posted).toBe(0);
  });

  it("does NOT post an approve-mode draft (no autoPostAt)", async () => {
    mockGetEvents.mockResolvedValue([draft({})]);
    await runDueAutoPosts(NOW);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });

  it("does NOT post when the client has switched off 'auto'", async () => {
    mockGetReplyVoice.mockResolvedValue({ mode: "approve" });
    mockGetEvents.mockResolvedValue([draft({ autoPostAt: new Date(NOW - 60_000).toISOString() })]);
    await runDueAutoPosts(NOW);
    expect(mockGetEvents).not.toHaveBeenCalled();
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });

  it("ignores non-review pending events", async () => {
    mockGetEvents.mockResolvedValue([
      { ...draft({ autoPostAt: new Date(NOW - 60_000).toISOString() }), metadata: { kind: "gbp_post_draft" } } as UnifiedEvent,
    ]);
    await runDueAutoPosts(NOW);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });

  it("skips inactive tenants", async () => {
    mockGetAllTenants.mockResolvedValue([{ id: "acme", active: false }]);
    await runDueAutoPosts(NOW);
    expect(mockGetReplyVoice).not.toHaveBeenCalled();
  });
});

// draftReplyBacklog — drafts replies for reviews that predate the client turning
// replies on. Guards under test (Deep Audit #2, #35): Google-only, respect a
// durable dismissal, per-tenant cap, and the auto-mode autoPostAt stamp.
function review(over: Record<string, unknown> = {}) {
  return { id: "r1", externalId: "ext1", source: "google", author: "Sam", rating: 5, text: "great", reply: null, ...over };
}

describe("draftReplyBacklog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllTenants.mockResolvedValue([{ id: "acme", active: true }]);
    mockGetReplyVoice.mockResolvedValue({ mode: "approve" });
    mockGetEvents.mockResolvedValue([]); // no already-pending drafts
    mockIsReviewReplyDeclined.mockResolvedValue(false);
    mockDraftReviewReply.mockResolvedValue("thanks Sam");
    mockAddEvent.mockResolvedValue(undefined);
    mockStoreRecentReply.mockResolvedValue(undefined);
  });

  it("never drafts for non-Google reviews (an unresolvable id would fail every run)", async () => {
    mockGetReviews.mockResolvedValue([review({ source: "yelp" }), review({ id: "r2", externalId: "ext2", source: "facebook" })]);
    const res = await draftReplyBacklog(NOW);
    expect(res.drafted).toBe(0);
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("never re-drafts a review the owner already dismissed", async () => {
    mockGetReviews.mockResolvedValue([review()]);
    mockIsReviewReplyDeclined.mockResolvedValue(true);
    const res = await draftReplyBacklog(NOW);
    expect(res.drafted).toBe(0);
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("honors the per-tenant cap", async () => {
    mockGetReviews.mockResolvedValue(
      Array.from({ length: 10 }, (_, i) => review({ id: `r${i}`, externalId: `ext${i}` })),
    );
    const res = await draftReplyBacklog(NOW, 3);
    expect(res.drafted).toBe(3);
    expect(mockAddEvent).toHaveBeenCalledTimes(3);
  });

  it("stamps autoPostAt only in auto mode", async () => {
    mockGetReplyVoice.mockResolvedValue({ mode: "auto" });
    mockGetReviews.mockResolvedValue([review()]);
    await draftReplyBacklog(NOW);
    const evt = mockAddEvent.mock.calls[0]?.[0];
    expect(evt?.metadata?.kind).toBe("review_reply_draft");
    expect(evt?.metadata?.autoPostAt).toBeTruthy();
  });

  it("does NOT stamp autoPostAt in approve mode", async () => {
    mockGetReplyVoice.mockResolvedValue({ mode: "approve" });
    mockGetReviews.mockResolvedValue([review()]);
    await draftReplyBacklog(NOW);
    const evt = mockAddEvent.mock.calls[0]?.[0];
    expect(evt?.metadata?.autoPostAt).toBeUndefined();
  });
});
