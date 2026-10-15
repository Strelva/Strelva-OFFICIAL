import { googleReviewContent } from "@/platform/infra/google-review-content";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// These tests exercise legacy cron behavior; listing policy has separate coverage.
// Keep the lazy workspace port from importing the entire listing product mid-test.
vi.mock("@/products/google-listing/server", () => ({
  listingDraftingAllowed: vi.fn(async () => true),
  noteTenantListingRead: vi.fn(async () => undefined),
}));

vi.mock("@/lib/tenants", () => ({ getAllTenants: (...a: unknown[]) => mockGetAllTenants(...a) }));
vi.mock("@/lib/events", () => ({
  getEvents: (...a: unknown[]) => mockGetEvents(...a),
  // The crons read Redis-authoritative via getEventsRaw (execution path); in
  // tests it returns the same fixtures as getEvents.
  getEventsRaw: (...a: unknown[]) => mockGetEvents(...a),
  updateEvent: (...a: unknown[]) => mockUpdateEvent(...a),
  addEvent: (...a: unknown[]) => mockAddEvent(...a),
}));
vi.mock("@/lib/event-actions", () => ({ AUTO_REPLY_ACTOR: "auto-reply-policy", resolveEventAction: (...a: unknown[]) => mockResolveEventAction(...a) }));
vi.mock("@/lib/reviews/reply-voice", () => ({ getReplyVoice: (...a: unknown[]) => mockGetReplyVoice(...a) }));
vi.mock("@/lib/reviews", () => ({ getReviews: (...a: unknown[]) => mockGetReviews(...a) }));
vi.mock("@/lib/review-replies", () => ({
  draftReviewReplyWithProvenance: (...a: unknown[]) => mockDraftReviewReply(...a),
  storeRecentReply: (...a: unknown[]) => mockStoreRecentReply(...a),
  isReviewReplyDeclined: (...a: unknown[]) => mockIsReviewReplyDeclined(...a),
}));

const mockWorkspaceForTenant = vi.fn();
const mockRecordPolicyDecision = vi.fn();
vi.mock("@/platform/release-flags/store", () => ({ releaseWorkspaceForTenant: (...a: unknown[]) => mockWorkspaceForTenant(...a) }));
vi.mock("@/server/needs-you/server", () => ({
  needsYouReleaseEnabled: () => true,
  needsYouService: () => ({ recordPolicyDecision: (...a: unknown[]) => mockRecordPolicyDecision(...a) }),
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
      replyGeneration: "model",
      providerContent: googleReviewContent(new Date(NOW)),
      reviewId: "rev1",
      rating: 5,
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

  it("never auto-posts an expired provider context", async () => {
    const expired = draft({ autoPostAt: new Date(NOW - 60_000).toISOString() });
    expired.metadata!.providerContent = googleReviewContent(new Date(NOW - 30 * 86400000));
    mockGetEvents.mockResolvedValue([expired]);
    expect((await runDueAutoPosts(NOW)).posted).toBe(0);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });

  it("posts a draft whose window has elapsed", async () => {
    mockGetEvents.mockResolvedValue([draft({ autoPostAt: new Date(NOW - 60_000).toISOString() })]);
    const res = await runDueAutoPosts(NOW);
    expect(mockResolveEventAction).toHaveBeenCalledWith("acme", "e1", "approved", "auto-reply-policy");
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
    const updater = mockUpdateEvent.mock.calls[0]![1] as (e: UnifiedEvent) => UnifiedEvent;
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

  it("never auto-posts a 1 or 2 star reply stamped before the rating rule; it stays with the owner", async () => {
    const due = new Date(NOW - 60_000).toISOString();
    const low = draft({ id: "low", autoPostAt: due });
    low.metadata = { ...low.metadata, rating: 2 };
    const unknown = draft({ id: "unknown", autoPostAt: due });
    unknown.metadata = { ...unknown.metadata, rating: undefined };
    mockGetEvents.mockResolvedValue([low, unknown]);
    const res = await runDueAutoPosts(NOW);
    expect(res).toEqual({ posted: 0, failed: 0 });
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });

  it.each(["template", undefined, "unexpected"])("holds due drafts with %s provenance for the owner", async (replyGeneration) => {
    const event = draft({ autoPostAt: new Date(NOW - 60_000).toISOString() });
    event.metadata!.replyGeneration = replyGeneration;
    mockGetEvents.mockResolvedValue([event]);
    expect(await runDueAutoPosts(NOW)).toEqual({ posted: 0, failed: 0 });
    expect(mockResolveEventAction).not.toHaveBeenCalled();
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
  return { providerContent: googleReviewContent(new Date(NOW)), id: "r1", externalId: "ext1", source: "google", author: "Sam", rating: 5, text: "great", reply: null, ...over };
}

describe("draftReplyBacklog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllTenants.mockResolvedValue([{ id: "acme", active: true }]);
    mockGetReplyVoice.mockResolvedValue({ mode: "approve" });
    mockGetEvents.mockResolvedValue([]); // no already-pending drafts
    mockIsReviewReplyDeclined.mockResolvedValue(false);
    mockDraftReviewReply.mockResolvedValue({ text: "thanks Sam", generation: "model" });
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

  it.each(["approve", "auto"])("queues a template for owner review in %s mode", async (mode) => {
    mockGetReplyVoice.mockResolvedValue({ mode });
    mockGetReviews.mockResolvedValue([review()]);
    mockDraftReviewReply.mockResolvedValue({ text: "A local template", generation: "template" });
    expect(await draftReplyBacklog(NOW)).toEqual({ drafted: 1 });
    expect(mockAddEvent.mock.calls[0]?.[0]).toMatchObject({ status: "pending", body: "A local template", metadata: { replyGeneration: "template" } });
    expect(mockAddEvent.mock.calls[0]?.[0].metadata.autoPostAt).toBeUndefined();
  });

  it("stamps autoPostAt only in auto mode", async () => {
    mockGetReplyVoice.mockResolvedValue({ mode: "auto" });
    mockGetReviews.mockResolvedValue([review()]);
    await draftReplyBacklog(NOW);
    const evt = mockAddEvent.mock.calls[0]?.[0];
    expect(evt?.metadata?.kind).toBe("review_reply_draft");
    expect(evt?.metadata?.autoPostAt).toBeTruthy();
  });

  it("never stamps autoPostAt for a 1 or 2 star review, even in auto mode", async () => {
    mockGetReplyVoice.mockResolvedValue({ mode: "auto" });
    mockGetReviews.mockResolvedValue([review({ id: "r1", externalId: "ext1", rating: 1 }), review({ id: "r2", externalId: "ext2", rating: 2 }), review({ id: "r3", externalId: "ext3", rating: 3 })]);
    await draftReplyBacklog(NOW);
    const stamped = mockAddEvent.mock.calls.map(([evt]) => [evt?.metadata?.rating, Boolean(evt?.metadata?.autoPostAt)]);
    expect(stamped).toEqual([[1, false], [2, false], [3, true]]);
  });

  it("does NOT stamp autoPostAt in approve mode", async () => {
    mockGetReplyVoice.mockResolvedValue({ mode: "approve" });
    mockGetReviews.mockResolvedValue([review()]);
    await draftReplyBacklog(NOW);
    const evt = mockAddEvent.mock.calls[0]?.[0];
    expect(evt?.metadata?.autoPostAt).toBeUndefined();
  });
});

describe("runDueAutoPosts with STRELVA_AUTO_POST_DECISION_RECORD", () => {
  const due = () => new Date(NOW - 60_000).toISOString();
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRELVA_AUTO_POST_DECISION_RECORD = "1";
    mockGetAllTenants.mockResolvedValue([{ id: "acme", active: true }]);
    mockGetReplyVoice.mockResolvedValue({ mode: "auto" });
    mockResolveEventAction.mockResolvedValue({ changed: true });
    mockUpdateEvent.mockResolvedValue({ changed: true });
    mockWorkspaceForTenant.mockResolvedValue("aaaaaaaa-0000-4000-8000-000000000001");
    mockRecordPolicyDecision.mockResolvedValue({ status: "done", item: null });
    mockGetEvents.mockResolvedValue([draft({ autoPostAt: due() })]);
  });
  afterEach(() => { delete process.env.STRELVA_AUTO_POST_DECISION_RECORD; });

  it("flag off makes the same direct call as before", async () => {
    delete process.env.STRELVA_AUTO_POST_DECISION_RECORD;
    await runDueAutoPosts(NOW);
    expect(mockRecordPolicyDecision).not.toHaveBeenCalled();
    expect(mockResolveEventAction).toHaveBeenCalledWith("acme", "e1", "approved", "auto-reply-policy");
  });

  it("a linked tenant records a review.reply handle_after_notice item with the attempt in its revision", async () => {
    const res = await runDueAutoPosts(NOW);
    expect(res).toEqual({ posted: 1, failed: 0 });
    expect(mockResolveEventAction).not.toHaveBeenCalled();
    const input = mockRecordPolicyDecision.mock.calls[0]![0] as { workspaceId: string; policy: string; item: { kind: string; route: string; sourceId: string; revisionHash: string } };
    expect(input).toMatchObject({ workspaceId: "aaaaaaaa-0000-4000-8000-000000000001", policy: "auto_reply_policy", item: { kind: "review.reply", route: "handle_after_notice", sourceId: "acme:e1" } });
    expect(input.item.revisionHash).toMatch(/^[0-9a-f]{64}$/);
    // The next attempt is a different row.
    const retry = draft({ autoPostAt: due() });
    retry.metadata = { ...retry.metadata, autoPostAttempts: 1 };
    mockGetEvents.mockResolvedValue([retry]);
    await runDueAutoPosts(NOW);
    expect((mockRecordPolicyDecision.mock.calls[1]![0] as typeof input).item.revisionHash).not.toBe(input.item.revisionHash);
  });

  it("already_handled does not post, fail or count an attempt", async () => {
    mockRecordPolicyDecision.mockResolvedValue({ status: "already_handled", item: null });
    expect(await runDueAutoPosts(NOW)).toEqual({ posted: 0, failed: 0 });
    expect(mockUpdateEvent).not.toHaveBeenCalled();
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });

  it("a reply the owner holds open is not posted and not counted", async () => {
    mockRecordPolicyDecision.mockResolvedValue({ status: "owner_decides", item: null });
    expect(await runDueAutoPosts(NOW)).toEqual({ posted: 0, failed: 0 });
    expect(mockUpdateEvent).not.toHaveBeenCalled();
  });

  it("a failed post counts an attempt as before", async () => {
    mockRecordPolicyDecision.mockResolvedValue({ status: "failed", item: null });
    expect(await runDueAutoPosts(NOW)).toEqual({ posted: 0, failed: 1 });
    expect(mockUpdateEvent).toHaveBeenCalledTimes(1);
  });

  it("an unlinked tenant takes the direct path", async () => {
    mockWorkspaceForTenant.mockResolvedValue(null);
    await runDueAutoPosts(NOW);
    expect(mockRecordPolicyDecision).not.toHaveBeenCalled();
    expect(mockResolveEventAction).toHaveBeenCalledWith("acme", "e1", "approved", "auto-reply-policy");
  });

  it("unsupported, or a record that cannot be written, takes the direct path", async () => {
    mockRecordPolicyDecision.mockResolvedValue({ status: "unsupported", item: null });
    await runDueAutoPosts(NOW);
    mockRecordPolicyDecision.mockRejectedValue(new Error("function does not exist"));
    await runDueAutoPosts(NOW);
    expect(mockResolveEventAction).toHaveBeenCalledTimes(2);
  });
});
