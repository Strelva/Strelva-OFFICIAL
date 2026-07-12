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
const mockResolveEventAction = vi.fn();
const mockGetReplyVoice = vi.fn();

vi.mock("@/lib/tenants", () => ({ getAllTenants: (...a: unknown[]) => mockGetAllTenants(...a) }));
vi.mock("@/lib/events", () => ({ getEvents: (...a: unknown[]) => mockGetEvents(...a) }));
vi.mock("@/lib/event-actions", () => ({ resolveEventAction: (...a: unknown[]) => mockResolveEventAction(...a) }));
vi.mock("@/lib/reviews/reply-voice", () => ({ getReplyVoice: (...a: unknown[]) => mockGetReplyVoice(...a) }));

import { runDueAutoPosts } from "@/lib/reviews/auto-reply";

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
  });

  it("posts a draft whose window has elapsed", async () => {
    mockGetEvents.mockResolvedValue([draft({ autoPostAt: new Date(NOW - 60_000).toISOString() })]);
    const res = await runDueAutoPosts(NOW);
    expect(mockResolveEventAction).toHaveBeenCalledWith("acme", "e1", "approved");
    expect(res.posted).toBe(1);
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
