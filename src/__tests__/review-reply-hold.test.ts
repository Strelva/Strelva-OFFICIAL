import { googleReviewContent } from "@/platform/infra/google-review-content";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnifiedEvent } from "@/lib/types";

// An agency or Strelva operator can hold automatic review replies. The owner's
// stored "auto" choice is kept, but every consumer reads "approve" while held.

const redis = new Map<string, unknown>();
vi.mock("@/platform/infra/redis", () => ({
  getRedis: () => ({
    get: async (key: string) => redis.get(key) ?? null,
    set: async (key: string, value: unknown) => { redis.set(key, value); return "OK"; },
  }),
}));
const controls = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/platform/ai-controls/service", () => ({ readTenantAiControls: controls.read }));
vi.mock("@/products/google-listing/server", () => ({ listingDraftingAllowed: vi.fn(async () => true), noteTenantListingRead: vi.fn(async () => undefined) }));
const events = vi.hoisted(() => ({ list: vi.fn(), update: vi.fn(), resolve: vi.fn(), tenants: vi.fn(), reviews: vi.fn(), draft: vi.fn() }));
vi.mock("@/lib/tenants", () => ({ getAllTenants: events.tenants }));
vi.mock("@/lib/events", () => ({ getEvents: events.list, getEventsRaw: events.list, updateEvent: events.update, addEvent: vi.fn() }));
vi.mock("@/lib/event-actions", () => ({ AUTO_REPLY_ACTOR: "auto-reply-policy", resolveEventAction: events.resolve }));
vi.mock("@/lib/reviews", () => ({ getReviews: events.reviews }));
vi.mock("@/products/google-listing/connection-policy", () => ({ assertGoogleConnectionEligible: async () => undefined }));
vi.mock("@/lib/review-replies", () => ({ draftReviewReplyWithProvenance: events.draft, storeRecentReply: vi.fn(), isReviewReplyDeclined: () => false }));

const { getReplyVoice } = await import("@/lib/reviews/reply-voice");
const { runDueAutoPosts, draftReplyBacklog } = await import("@/lib/reviews/auto-reply");
const { readWorkspaceReviews } = await import("@/products/google-listing/linked-reviews");
const { routeDetail, KIND_WORDS } = await import("@/platform/needs-you/policy-words");

const NOW = 1_800_000_000_000;
const stored = { mode: "auto", guidance: "Warm.", templates: [], updatedAt: null };
const state = (over: Record<string, unknown> = {}) => ({ paused: false, monthlyCapCents: null, reviewAutoPost: "client_choice", revision: 1, setBy: { kind: "agency", agencyName: "North Studio" }, changedAt: "2026-10-12T15:00:00Z", ...over });

beforeEach(() => {
  vi.clearAllMocks();
  redis.clear();
  redis.set("reb:reply-voice:acme", stored);
  controls.read.mockResolvedValue(null);
});

describe("getReplyVoice with a hold", () => {
  it("keeps auto when the flag is off or there is no row", async () => {
    expect((await getReplyVoice("acme")).mode).toBe("auto");
    controls.read.mockResolvedValue(state());
    expect((await getReplyVoice("acme")).mode).toBe("auto");
  });

  it.each([
    ["held", state({ reviewAutoPost: "held" }), "agency", "North Studio"],
    ["paused", state({ paused: true }), "agency", "North Studio"],
    ["operator-held", state({ reviewAutoPost: "held", setBy: { kind: "operator", agencyName: null } }), "operator", null],
    ["unavailable", { unavailable: true }, "operator", null],
  ])("reads approve and says who holds it when %s", async (_name, value, by, name) => {
    controls.read.mockResolvedValue(value);
    const voice = await getReplyVoice("acme");
    expect(voice).toMatchObject({ mode: "approve", heldBy: by, heldByName: name, guidance: "Warm." });
    // The owner's stored choice is untouched and returns when the hold lifts.
    expect(redis.get("reb:reply-voice:acme")).toEqual(stored);
  });

  it("leaves off as off and does not read the controls for an approve voice", async () => {
    redis.set("reb:reply-voice:acme", { ...stored, mode: "off" });
    controls.read.mockResolvedValue(state({ reviewAutoPost: "held" }));
    expect((await getReplyVoice("acme")).mode).toBe("off");
    redis.set("reb:reply-voice:acme", { ...stored, mode: "approve" });
    expect((await getReplyVoice("acme")).heldBy).toBeUndefined();
    expect(controls.read).not.toHaveBeenCalled();
  });
});

function draft(autoPostAt?: string): UnifiedEvent {
  return {
    id: "e1", tenantId: "acme", source: "ai", type: "review", title: "Drafted reply", body: "thanks", status: "pending", time: new Date(NOW).toISOString(),
    metadata: { kind: "review_reply_draft", replyGeneration: "model", providerContent: googleReviewContent(new Date(NOW)), reviewId: "rev1", rating: 5, ...(autoPostAt ? { autoPostAt } : {}) },
  } as unknown as UnifiedEvent;
}

describe("the crons while held", () => {
  beforeEach(() => {
    events.tenants.mockResolvedValue([{ id: "acme", active: true }]);
    events.resolve.mockResolvedValue({ changed: true });
    events.update.mockResolvedValue({ changed: true });
  });

  it("runDueAutoPosts posts nothing for a held tenant even with a past autoPostAt", async () => {
    events.list.mockResolvedValue([draft(new Date(NOW - 60_000).toISOString())]);
    controls.read.mockResolvedValue(state({ reviewAutoPost: "held" }));
    expect(await runDueAutoPosts(NOW)).toEqual({ posted: 0, failed: 0 });
    expect(events.resolve).not.toHaveBeenCalled();
    controls.read.mockResolvedValue(null);
    expect((await runDueAutoPosts(NOW)).posted).toBe(1);
  });

  it("draftReplyBacklog stamps no autoPostAt while held", async () => {
    events.list.mockResolvedValue([]);
    events.reviews.mockResolvedValue([{ id: "rev1", externalId: "rev1", source: "google", author: "Sam", rating: 5, text: "Great", date: "2026-10-01", reply: null }]);
    events.draft.mockResolvedValue({ reply: "Thanks, Sam!", generation: "model" });
    controls.read.mockResolvedValue(state({ reviewAutoPost: "held" }));
    const added = await import("@/lib/events");
    await draftReplyBacklog(NOW);
    for (const call of vi.mocked(added.addEvent).mock.calls) expect(JSON.stringify(call[0])).not.toContain("autoPostAt");
  });
});

describe("the reviews place", () => {
  const site = { tenantId: "acme", siteName: "Acme", denied: false };
  const deps = (hold: unknown) => ({
    sites: async () => ({ sites: [site], denied: [] }),
    reviews: async () => [],
    googleConnected: async () => true,
    placeId: async () => null,
    replyMode: async () => "approve" as const,
    replyHold: async () => hold as never,
    pendingDrafts: async () => [],
  });
  it("carries who holds automatic replies", async () => {
    const read = readWorkspaceReviews;
    const actor = { userId: "u", verifiedEmail: "o@example.test" };
    expect((await read(actor as never, "ws", deps({ by: "agency", name: "North Studio" }) as never)).sites[0]!.autoPostHeld).toEqual({ by: "agency", name: "North Studio" });
    expect((await read(actor as never, "ws", deps(null) as never)).sites[0]!.autoPostHeld).toBeNull();
  });
});

describe("owner copy", () => {
  it("names the 3-5 star rule and the real notice window", () => {
    expect(KIND_WORDS["review.reply"].example).toBe("Answering a 3, 4 or 5 star Google review");
    expect(routeDetail("handle_after_notice", "review.reply")).toBe("Strelva waits 12 hours so you can stop it, then does it.");
    expect(routeDetail("handle_after_notice", "structure")).toBe("Strelva waits a while so you can stop it, then does it.");
    expect(routeDetail("owner_decides", "review.reply")).toBe("Nothing happens until you say yes.");
  });
});
