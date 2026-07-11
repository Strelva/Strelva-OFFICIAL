import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReviewItem } from "@/lib/types";

// The PROACTIVE layer above the pending queue. Invariants under test:
//  - the scan aggregates latent, not-yet-drafted work across ALL active tenants,
//    grouped by kind, degrading a per-tenant read failure to "no signal";
//  - "Draft these" routes each client through the EXISTING governed draft path so
//    a draft lands PENDING (never published) — review replies via the queued
//    review_reply_draft event, stale/health via generateProactiveSuggestions;
//  - honest partial failure: one client throwing is reported, never aborts the rest.

const mockGetAllTenants = vi.fn();
const mockGetTenantConfig = vi.fn();
const mockGetReviews = vi.fn();
const mockGetRetention = vi.fn();
const mockGetScanSummaries = vi.fn();
const mockGenerateProactive = vi.fn();
const mockDraftReviewReply = vi.fn();
const mockStoreRecentReply = vi.fn();
const mockAddEvent = vi.fn();
const mockGetEvents = vi.fn();

vi.mock("@/lib/tenants", () => ({
  getAllTenants: (...a: unknown[]) => mockGetAllTenants(...a),
  isActiveTenant: (t: { active?: boolean }) => t.active !== false,
  getTenantConfig: (...a: unknown[]) => mockGetTenantConfig(...a),
}));
vi.mock("@/lib/reviews", () => ({ getReviews: (...a: unknown[]) => mockGetReviews(...a) }));
vi.mock("@/lib/retention", () => ({
  getOwnerRetentionSignals: (...a: unknown[]) => mockGetRetention(...a),
}));
vi.mock("@/lib/scan-store", () => ({
  getScanSummaries: (...a: unknown[]) => mockGetScanSummaries(...a),
}));
vi.mock("@/lib/proactive-suggestions", () => ({
  generateProactiveSuggestions: (...a: unknown[]) => mockGenerateProactive(...a),
}));
vi.mock("@/lib/review-replies", () => ({
  draftReviewReply: (...a: unknown[]) => mockDraftReviewReply(...a),
  storeRecentReply: (...a: unknown[]) => mockStoreRecentReply(...a),
}));
vi.mock("@/lib/events", () => ({
  addEvent: (...a: unknown[]) => mockAddEvent(...a),
  getEvents: (...a: unknown[]) => mockGetEvents(...a),
}));

import {
  scanPortfolioOpportunities,
  draftOpportunityForClients,
} from "@/app/admin/actions/portfolio-opportunities";

function review(over: Partial<ReviewItem>): ReviewItem {
  return {
    id: "r1",
    source: "google",
    author: "Sam",
    rating: 2,
    text: "Slow service",
    date: "2026-06-30T00:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetScanSummaries.mockResolvedValue({});
  mockGetReviews.mockResolvedValue([]);
  mockGetRetention.mockResolvedValue({ noAiUsageDays: null });
  mockGetEvents.mockResolvedValue([]);
  mockAddEvent.mockResolvedValue({ id: "evt_new" });
  mockStoreRecentReply.mockResolvedValue(undefined);
  // Default: the governed generator queued one suggestion (a real draft landed).
  mockGenerateProactive.mockResolvedValue(1);
  mockDraftReviewReply.mockResolvedValue("Sam, sorry the wait was long. We've tightened staffing.");
});

describe("scanPortfolioOpportunities", () => {
  it("aggregates latent work across tenants, grouped by kind and biggest-lever first", async () => {
    mockGetAllTenants.mockResolvedValue([
      { id: "acme", siteName: "Acme Co", active: true },
      { id: "bolt", siteName: "Bolt Studio", active: true },
      { id: "cove", siteName: "Cove", active: true },
      { id: "gone", siteName: "Archived", active: false }, // filtered out
    ]);
    mockGetReviews.mockImplementation(async (id: string) => {
      // acme + bolt have unreplied reviews; cove is fully replied.
      if (id === "acme") return [review({ reply: "" }), review({ id: "r2", reply: undefined })];
      if (id === "bolt") return [review({ reply: "  " })];
      if (id === "cove") return [review({ reply: "thanks!" })];
      return [];
    });
    mockGetRetention.mockImplementation(async (id: string) => ({
      noAiUsageDays: id === "acme" ? 45 : id === "bolt" ? 5 : 33, // acme + cove stale
    }));
    mockGetScanSummaries.mockResolvedValue({
      acme: { grade: "A", overallScore: 92 },
      bolt: { grade: "D", overallScore: 61 }, // low health
      cove: { grade: "B", overallScore: 84 },
    });

    const snap = await scanPortfolioOpportunities();

    // Never surfaces the archived tenant.
    const allClients = snap.groups.flatMap((g) => g.clients.map((c) => c.tenantId));
    expect(allClients).not.toContain("gone");

    const byKind = Object.fromEntries(snap.groups.map((g) => [g.kind, g]));
    expect(byKind.unreplied_reviews.clients.map((c) => c.tenantId).sort()).toEqual(["acme", "bolt"]);
    expect(byKind.unreplied_reviews.clients.find((c) => c.tenantId === "acme")?.detail).toBe(
      "2 reviews awaiting a reply",
    );
    expect(byKind.stale_sites.clients.map((c) => c.tenantId).sort()).toEqual(["acme", "cove"]);
    expect(byKind.low_health.clients.map((c) => c.tenantId)).toEqual(["bolt"]);

    // Biggest-lever first: the 2-client groups precede the 1-client group.
    expect(snap.groups[snap.groups.length - 1].kind).toBe("low_health");
    expect(snap.totalOpportunities).toBe(5); // 2 unreplied + 2 stale + 1 low-health
  });

  it("degrades a per-tenant read failure to no signal rather than failing the scan", async () => {
    mockGetAllTenants.mockResolvedValue([
      { id: "acme", siteName: "Acme Co", active: true },
      { id: "bolt", siteName: "Bolt Studio", active: true },
    ]);
    mockGetReviews.mockImplementation(async (id: string) => {
      if (id === "acme") return [review({ reply: "" })];
      throw new Error("redis down");
    });

    const snap = await scanPortfolioOpportunities();
    const unreplied = snap.groups.find((g) => g.kind === "unreplied_reviews");
    expect(unreplied?.clients.map((c) => c.tenantId)).toEqual(["acme"]);
  });

  it("returns nothing when there is no latent work", async () => {
    mockGetAllTenants.mockResolvedValue([{ id: "acme", siteName: "Acme Co", active: true }]);
    const snap = await scanPortfolioOpportunities();
    expect(snap.groups).toEqual([]);
    expect(snap.totalOpportunities).toBe(0);
  });
});

describe("draftOpportunityForClients — governed, lands PENDING not published", () => {
  it("drafts review replies as a pending review_reply_draft (never auto-published)", async () => {
    mockGetTenantConfig.mockResolvedValue({ id: "acme", siteName: "Acme Co" });
    mockGetReviews.mockResolvedValue([
      review({ id: "r1", externalId: "g_r1", reply: "" }),
    ]);

    const results = await draftOpportunityForClients("unreplied_reviews", ["acme"]);

    expect(results).toEqual([{ tenantId: "acme", drafted: true }]);
    expect(mockDraftReviewReply).toHaveBeenCalledTimes(1);
    // The event is queued PENDING with the governed review_reply_draft kind.
    expect(mockAddEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "acme",
        type: "review",
        status: "pending",
        metadata: expect.objectContaining({ kind: "review_reply_draft", reviewId: "g_r1" }),
      }),
    );
  });

  it("is idempotent — skips a review that already has a pending draft", async () => {
    mockGetTenantConfig.mockResolvedValue({ id: "acme", siteName: "Acme Co" });
    mockGetReviews.mockResolvedValue([review({ id: "r1", externalId: "g_r1", reply: "" })]);
    mockGetEvents.mockResolvedValue([
      { type: "review", status: "pending", metadata: { kind: "review_reply_draft", reviewId: "g_r1" } },
    ]);

    const results = await draftOpportunityForClients("unreplied_reviews", ["acme"]);

    expect(results).toEqual([{ tenantId: "acme", drafted: false, reason: "already_drafted" }]);
    expect(mockDraftReviewReply).not.toHaveBeenCalled();
    expect(mockAddEvent).not.toHaveBeenCalled();
  });

  it("routes stale/health through the governed generateProactiveSuggestions path", async () => {
    const results = await draftOpportunityForClients("stale_sites", ["acme", "bolt"]);
    expect(results).toEqual([
      { tenantId: "acme", drafted: true },
      { tenantId: "bolt", drafted: true },
    ]);
    expect(mockGenerateProactive).toHaveBeenNthCalledWith(1, "acme");
    expect(mockGenerateProactive).toHaveBeenNthCalledWith(2, "bolt");
    // Nothing is published — only the governed generator is invoked.
    expect(mockDraftReviewReply).not.toHaveBeenCalled();
  });

  it("reports a client that produced 0 drafts as skipped, not drafted (no phantom)", async () => {
    // A stale client with no content engine and no unreplied review: the governed
    // generator queues nothing, so the pass must report it honestly as
    // nothing_to_draft — never a phantom "drafted for N clients".
    mockGenerateProactive.mockImplementation(async (id: string) => (id === "acme" ? 1 : 0));

    const results = await draftOpportunityForClients("stale_sites", ["acme", "bolt"]);

    expect(results).toEqual([
      { tenantId: "acme", drafted: true },
      { tenantId: "bolt", drafted: false, reason: "nothing_to_draft" },
    ]);
  });

  it("reports honest partial failure — one client throwing never aborts the rest", async () => {
    mockGenerateProactive.mockImplementation(async (id: string) => {
      if (id === "bolt") throw new Error("boom");
      return 1;
    });

    const results = await draftOpportunityForClients("low_health", ["acme", "bolt", "cove"]);

    expect(results).toEqual([
      { tenantId: "acme", drafted: true },
      { tenantId: "bolt", drafted: false, reason: "boom" },
      { tenantId: "cove", drafted: true },
    ]);
  });
});
