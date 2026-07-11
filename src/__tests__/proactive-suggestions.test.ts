import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewItem } from "@/lib/types";

// generateProactiveSuggestions must return the REAL number of suggestions it
// queued so a "draft these" pass can report honestly. The bug: a stale/low-health
// client with NO content engine skips every content nudge and can queue ZERO
// suggestions, yet the old void return let the UI claim "drafted".

const mockAddSuggestion = vi.fn();
const mockDedupe = vi.fn();
const mockGetReviews = vi.fn();
const mockGetRetention = vi.fn();
const mockGetBlogPosts = vi.fn();
const mockGetTenantConfig = vi.fn();

vi.mock("@/lib/suggestions", () => ({
  addSuggestion: (...a: unknown[]) => mockAddSuggestion(...a),
  dedupePendingSuggestionEvents: (...a: unknown[]) => mockDedupe(...a),
}));
vi.mock("@/lib/reviews", () => ({ getReviews: (...a: unknown[]) => mockGetReviews(...a) }));
vi.mock("@/lib/retention", () => ({
  getOwnerRetentionSignals: (...a: unknown[]) => mockGetRetention(...a),
}));
vi.mock("@/lib/cms/blog-public", () => ({
  getBlogPostsForSite: (...a: unknown[]) => mockGetBlogPosts(...a),
}));
vi.mock("@/lib/tenants", () => ({
  getTenantConfig: (...a: unknown[]) => mockGetTenantConfig(...a),
}));

import { generateProactiveSuggestions } from "@/lib/proactive-suggestions";

function review(over: Partial<ReviewItem>): ReviewItem {
  return {
    id: "r1",
    source: "google",
    author: "Sam",
    rating: 2,
    text: "Slow",
    date: "2026-06-30T00:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAddSuggestion.mockResolvedValue({ id: "sug_1" });
  mockDedupe.mockResolvedValue(0);
  mockGetReviews.mockResolvedValue([]);
  mockGetRetention.mockResolvedValue({ noAiUsageDays: null });
  mockGetBlogPosts.mockResolvedValue([]);
  mockGetTenantConfig.mockResolvedValue({ id: "acme", features: [] });
});

describe("generateProactiveSuggestions honest count", () => {
  it("returns 0 for a stale client with NO content engine and nothing else to draft", async () => {
    // Stale, but no blog → the stale/first-post nudges are gated off; no unreplied
    // review either. The dedupe-cleanup pass runs but is NOT a draft.
    mockGetTenantConfig.mockResolvedValue({ id: "acme", features: [] });
    mockGetRetention.mockResolvedValue({ noAiUsageDays: 45 });

    const count = await generateProactiveSuggestions("acme");

    expect(count).toBe(0);
    expect(mockAddSuggestion).not.toHaveBeenCalled();
    // The content-nudge cleanup still ran on the no-content path.
    expect(mockDedupe).toHaveBeenCalledTimes(1);
  });

  it("counts a real review draft even when the site has no content engine", async () => {
    mockGetTenantConfig.mockResolvedValue({ id: "acme", features: [] });
    mockGetReviews.mockResolvedValue([review({ reply: "" })]);

    const count = await generateProactiveSuggestions("acme");

    expect(count).toBe(1);
    expect(mockAddSuggestion).toHaveBeenCalledTimes(1);
  });

  it("counts each nudge queued for a content-engine site (stale + first post + review)", async () => {
    mockGetTenantConfig.mockResolvedValue({ id: "acme", features: ["blog"] });
    mockGetReviews.mockResolvedValue([review({ reply: "" })]);
    mockGetRetention.mockResolvedValue({ noAiUsageDays: 45 });
    mockGetBlogPosts.mockResolvedValue([]); // no posts → first-post nudge fires

    const count = await generateProactiveSuggestions("acme");

    expect(count).toBe(3);
    expect(mockAddSuggestion).toHaveBeenCalledTimes(3);
    expect(mockDedupe).not.toHaveBeenCalled();
  });
});
