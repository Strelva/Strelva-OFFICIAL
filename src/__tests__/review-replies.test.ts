/**
 * Review engine tests.
 *
 * Covers:
 * - lintReplyDraft: every banned phrase, hashtags, contact info
 * - Near-duplicate detection
 * - Regenerate-then-fallback path
 * - Deterministic fallback template
 * - Cron integration: pending event created (never auto-published)
 * - publishReviewReply: verified event on matching read-back, failed event on mismatch
 * - publishReviewReply: failed event + Slack when scope missing
 *
 * All external APIs (Gemini, GBP HTTP, Redis, Slack, connections) are mocked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  lintReplyDraft,
  buildDeterministicReply,
  BANNED_PHRASES,
} from "@/lib/review-replies";

// ─── Top-level mock registrations ─────────────────────────────────────────────

// Redis
const mockLrange = vi.fn(() => Promise.resolve([] as string[]));
const mockLpush = vi.fn(() => Promise.resolve(1));
const mockLtrim = vi.fn(() => Promise.resolve("OK"));
const mockExpire = vi.fn(() => Promise.resolve(1));
const mockRedisGet = vi.fn((_key: string) => Promise.resolve(null as unknown));
const mockRedisSet = vi.fn(() => Promise.resolve("OK"));
const mockRedisZadd = vi.fn(() => Promise.resolve(1));

vi.mock("@/lib/redis", () => ({
  getRedis: () => ({
    lrange: (...args: Parameters<typeof mockLrange>) => mockLrange(...args),
    lpush: (...args: Parameters<typeof mockLpush>) => mockLpush(...args),
    ltrim: (...args: Parameters<typeof mockLtrim>) => mockLtrim(...args),
    expire: (...args: Parameters<typeof mockExpire>) => mockExpire(...args),
    get: (...args: Parameters<typeof mockRedisGet>) => mockRedisGet(...args),
    set: (...args: Parameters<typeof mockRedisSet>) => mockRedisSet(...args),
    zadd: (...args: Parameters<typeof mockRedisZadd>) => mockRedisZadd(...args),
  }),
}));

// Gemini
const mockGenerateText = vi.fn(() => Promise.resolve({ text: "" }));
vi.mock("ai", () => ({
  generateText: (...args: Parameters<typeof mockGenerateText>) => mockGenerateText(...args),
}));
vi.mock("@ai-sdk/google", () => ({
  google: () => "mock-gemini-model",
}));

// Events
const mockAddEvent = vi.fn((_payload: unknown) => Promise.resolve({ id: "evt_test" }));
const mockGetEvent = vi.fn((_id: string) => Promise.resolve(null as unknown));
const mockUpdateEvent = vi.fn((_id: string, _updater: unknown) =>
  Promise.resolve({ event: null, changed: false })
);
vi.mock("@/lib/events", () => ({
  addEvent: (...args: Parameters<typeof mockAddEvent>) => mockAddEvent(...args),
  getEvent: (...args: Parameters<typeof mockGetEvent>) => mockGetEvent(...args),
  updateEvent: (...args: Parameters<typeof mockUpdateEvent>) => mockUpdateEvent(...args),
}));

// Connections
const mockGetConnection = vi.fn((_tenantId: string, _provider: string) =>
  Promise.resolve(null as unknown)
);
vi.mock("@/lib/connections", () => ({
  getConnection: (...args: Parameters<typeof mockGetConnection>) =>
    mockGetConnection(...args),
  saveConnection: vi.fn(),
  updateLastSynced: vi.fn(),
}));

// Slack
const mockSendSlack = vi.fn((_msg: unknown) => Promise.resolve(true));
vi.mock("@/lib/slack", () => ({
  sendSlackNotification: (...args: Parameters<typeof mockSendSlack>) =>
    mockSendSlack(...args),
}));

// Tenants (used by cron)
const mockGetAllTenants = vi.fn(() =>
  Promise.resolve([{ id: "t1", active: true }])
);
const mockGetTenantConfig = vi.fn((_id: string) =>
  Promise.resolve({ id: "t1", siteName: "Acme Plumbing" })
);
vi.mock("@/lib/tenants", () => ({
  getAllTenants: (...args: Parameters<typeof mockGetAllTenants>) =>
    mockGetAllTenants(...args),
  getTenantConfig: (...args: Parameters<typeof mockGetTenantConfig>) =>
    mockGetTenantConfig(...args),
}));

// Global fetch — typed loosely so per-test overrides can return varied shapes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFetch = vi.fn<(...args: any[]) => Promise<any>>(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: () => Promise.resolve(""),
    json: () => Promise.resolve({}),
  })
);
global.fetch = mockFetch as unknown as typeof global.fetch;

// ─── Lint tests ────────────────────────────────────────────────────────────────

describe("lintReplyDraft", () => {
  it("passes a clean draft", () => {
    const result = lintReplyDraft(
      "Bob, really appreciate the review. Glad we could help with the boiler."
    );
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("catches every banned phrase", () => {
    for (const phrase of BANNED_PHRASES) {
      const text = `Here is the reply: ${phrase}. Your experience was good.`;
      const result = lintReplyDraft(text);
      expect(result.ok, `should catch banned phrase: "${phrase}"`).toBe(false);
      expect(
        result.violations.some((v) =>
          v.toLowerCase().includes(phrase.toLowerCase())
        ),
        `violation list should reference: "${phrase}"`
      ).toBe(true);
    }
  });

  it("catches hashtags", () => {
    const result = lintReplyDraft("Great review! #HVAC #BestPlumber");
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes("hashtag"))).toBe(true);
  });

  it("catches phone numbers", () => {
    const result = lintReplyDraft("Call us at 555-123-4567 anytime.");
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes("phone"))).toBe(true);
  });

  it("catches email addresses", () => {
    const result = lintReplyDraft("Email us at hello@example.com to follow up.");
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes("email"))).toBe(true);
  });

  it("catches https:// URLs", () => {
    const result = lintReplyDraft("Book again at https://example.com/book");
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes("URL"))).toBe(true);
  });

  it("catches www. URLs", () => {
    const result = lintReplyDraft("Visit www.example.com for more info.");
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.includes("URL"))).toBe(true);
  });

  it("is case-insensitive for banned phrases", () => {
    const result = lintReplyDraft(
      "We're SO GLAD to hear about your experience."
    );
    expect(result.ok).toBe(false);
  });

  it("accumulates multiple violations", () => {
    const result = lintReplyDraft(
      "Thrilled to hear this! #greatservice Email us at x@y.com"
    );
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(1);
  });
});

// ─── Deterministic fallback ────────────────────────────────────────────────────

describe("buildDeterministicReply", () => {
  it("produces a lint-passing reply for 5-star", () => {
    const reply = buildDeterministicReply("Alice", 5);
    expect(reply).toContain("Alice");
    expect(lintReplyDraft(reply).ok).toBe(true);
  });

  it("produces a lint-passing reply for 3-star", () => {
    const reply = buildDeterministicReply("Bob", 3);
    expect(reply).toContain("Bob");
    expect(lintReplyDraft(reply).ok).toBe(true);
  });

  it("produces a lint-passing reply for 1-star", () => {
    const reply = buildDeterministicReply("Carol", 1);
    expect(reply).toContain("Carol");
    expect(lintReplyDraft(reply).ok).toBe(true);
  });

  it("handles empty reviewer name gracefully", () => {
    const reply = buildDeterministicReply("", 5);
    expect(reply.length).toBeGreaterThan(0);
    expect(lintReplyDraft(reply).ok).toBe(true);
  });
});

// ─── Near-duplicate detection ─────────────────────────────────────────────────

describe("isNearDuplicate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLrange.mockResolvedValue([]);
  });

  it("returns false when no recent replies exist", async () => {
    const { isNearDuplicate } = await import("@/lib/review-replies");
    const result = await isNearDuplicate(
      "t1",
      "Alice, really happy with the job."
    );
    expect(result).toBe(false);
  });

  it("returns true for an exact-match recent reply", async () => {
    const text = "Alice, appreciate the fast repair work. Happy to help.";
    mockLrange.mockResolvedValue([text]);
    const { isNearDuplicate } = await import("@/lib/review-replies");
    const result = await isNearDuplicate("t1", text);
    expect(result).toBe(true);
  });

  it("returns false when candidate is sufficiently different", async () => {
    mockLrange.mockResolvedValue([
      "Bob, the installation went great. Appreciate it.",
    ]);
    const { isNearDuplicate } = await import("@/lib/review-replies");
    const result = await isNearDuplicate(
      "t1",
      "Carol, we appreciate the feedback regarding the electrical panel replacement last week."
    );
    expect(result).toBe(false);
  });
});

// ─── draftReviewReply: Gemini path + fallback ──────────────────────────────────

describe("draftReviewReply", () => {
  const review = {
    reviewId: "rev_001",
    reviewerName: "Dave",
    rating: 5,
    comment: "Fixed our furnace fast, great work.",
  };
  const tenant = { id: "t1", siteName: "Acme Plumbing" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockLrange.mockResolvedValue([]);
  });

  it("returns the first clean Gemini draft", async () => {
    mockGenerateText.mockResolvedValueOnce({
      text: "Dave, glad we got the furnace sorted quickly. Great having you as a customer.",
    });
    const { draftReviewReply } = await import("@/lib/review-replies");
    const result = await draftReviewReply(review, tenant);
    expect(result).toContain("Dave");
    expect(lintReplyDraft(result).ok).toBe(true);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("regenerates when first draft fails lint, returns second clean draft", async () => {
    mockGenerateText
      .mockResolvedValueOnce({
        text: "Dave, thrilled to hear about the furnace!",
      })
      .mockResolvedValueOnce({
        text: "Dave, furnace repairs sorted. Much appreciated.",
      });

    const { draftReviewReply } = await import("@/lib/review-replies");
    const result = await draftReviewReply(review, tenant);

    expect(result).toBe("Dave, furnace repairs sorted. Much appreciated.");
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });

  it("falls back to deterministic template when both Gemini passes fail lint", async () => {
    const badDraft = "Thrilled to hear your kind words, Dave! #HVAC";
    mockGenerateText
      .mockResolvedValueOnce({ text: badDraft })
      .mockResolvedValueOnce({ text: badDraft });

    const { draftReviewReply } = await import("@/lib/review-replies");
    const result = await draftReviewReply(review, tenant);

    expect(result).toContain("Dave");
    expect(lintReplyDraft(result).ok).toBe(true);
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });

  it("falls back to deterministic template when Gemini throws", async () => {
    mockGenerateText.mockRejectedValue(new Error("Gemini unavailable"));

    const { draftReviewReply } = await import("@/lib/review-replies");
    const result = await draftReviewReply(review, tenant);

    expect(result).toContain("Dave");
    expect(lintReplyDraft(result).ok).toBe(true);
  });

  it("falls back when near-duplicate detected on both passes", async () => {
    const existingReply =
      "Dave, glad we got the furnace sorted quickly. Great having you.";
    mockLrange.mockResolvedValue([existingReply]);

    mockGenerateText
      .mockResolvedValueOnce({ text: existingReply })
      .mockResolvedValueOnce({ text: existingReply });

    const { draftReviewReply } = await import("@/lib/review-replies");
    const result = await draftReviewReply(review, tenant);

    expect(lintReplyDraft(result).ok).toBe(true);
  });
});

// ─── Cron integration: new review → pending draft event ───────────────────────

type MockAddEventCall = [{ type: string; source: string; status: string; metadata?: Record<string, unknown> }];

describe("poll-google-reviews cron: review reply drafting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLrange.mockResolvedValue([]);

    mockFetch.mockImplementation((url: unknown) => {
      if (
        typeof url === "string" &&
        url.includes("mybusiness.googleapis.com")
      ) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              reviews: [
                {
                  reviewId: "rev_new_001",
                  reviewer: { displayName: "Eve" },
                  starRating: "FIVE",
                  comment: "Amazing service, fixed quickly.",
                  createTime: "2026-06-10T10:00:00Z",
                  updateTime: "2026-06-10T10:00:00Z",
                  name: "accounts/1/locations/1/reviews/rev_new_001",
                },
              ],
            }),
          text: () => Promise.resolve(""),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve(""),
      });
    });

    mockRedisGet.mockImplementation((key: unknown) => {
      if (typeof key === "string" && key.startsWith("google-meta:")) {
        return Promise.resolve({ accountId: "accounts/1", locationId: "loc_1" });
      }
      return Promise.resolve(null);
    });

    mockGetConnection.mockResolvedValue({
      provider: "google",
      tenantId: "t1",
      accessToken: "tok_valid",
      status: "connected",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    mockGenerateText.mockResolvedValue({
      text: "Eve, appreciate the review. Happy the repair was quick.",
    });
  });

  it("creates a google review event AND a pending reply-draft event for each new review", async () => {
    const { GET } = await import(
      "@/app/api/cron/poll-google-reviews/route"
    );
    await GET();

    const calls = mockAddEvent.mock.calls as MockAddEventCall[];

    const reviewEvent = calls.find(
      ([e]) => e.type === "review" && e.source === "google"
    );
    const draftEvent = calls.find(
      ([e]) => e.metadata?.kind === "review_reply_draft"
    );

    expect(reviewEvent).toBeDefined();
    expect(draftEvent).toBeDefined();
  });

  it("draft event is always status=pending (governance: never auto-publish)", async () => {
    const { GET } = await import(
      "@/app/api/cron/poll-google-reviews/route"
    );
    await GET();

    const calls = mockAddEvent.mock.calls as MockAddEventCall[];
    const draftCall = calls.find(
      ([e]) => e.metadata?.kind === "review_reply_draft"
    );
    expect(draftCall).toBeDefined();
    expect(draftCall![0].status).toBe("pending");
  });

  it("draft event metadata includes reviewId and draftedReply", async () => {
    const { GET } = await import(
      "@/app/api/cron/poll-google-reviews/route"
    );
    await GET();

    const calls = mockAddEvent.mock.calls as MockAddEventCall[];
    const draftCall = calls.find(
      ([e]) => e.metadata?.kind === "review_reply_draft"
    );
    expect(draftCall![0].metadata?.reviewId).toBe("rev_new_001");
    expect(typeof draftCall![0].metadata?.draftedReply).toBe("string");
    expect(
      (draftCall![0].metadata?.draftedReply as string).length
    ).toBeGreaterThan(0);
  });
});

// ─── publishReviewReply ───────────────────────────────────────────────────────

type MockPublishAddEventCall = [{ type: string; metadata?: Record<string, unknown> }];

describe("publishReviewReply", () => {
  const tenantId = "t1";
  const reviewId = "rev_001";
  const replyText = "Alice, appreciate the feedback. Glad to help.";

  function connectedWithScope() {
    return {
      provider: "google" as const,
      tenantId,
      accessToken: "tok_valid",
      status: "connected" as const,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      scopes: ["https://www.googleapis.com/auth/business.manage"],
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetConnection.mockResolvedValue(connectedWithScope());

    mockRedisGet.mockImplementation((key: unknown) => {
      if (typeof key === "string" && key.startsWith("google-meta:")) {
        return Promise.resolve({
          accountId: "accounts/1",
          locationId: "loc_1",
        });
      }
      return Promise.resolve(null);
    });

    mockFetch.mockImplementation((_url: unknown, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("{}"),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            reviewReply: { comment: replyText },
          }),
      });
    });
  });

  it("returns published=true, verified=true and emits change_verified on matching read-back", async () => {
    const { publishReviewReply } = await import("@/lib/gbp-replies");
    const result = await publishReviewReply(tenantId, reviewId, replyText);

    expect(result.published).toBe(true);
    expect(result.verified).toBe(true);

    const calls = mockAddEvent.mock.calls as MockPublishAddEventCall[];
    const verifiedCall = calls.find(([e]) => e.type === "change_verified");
    expect(verifiedCall).toBeDefined();
    expect(verifiedCall![0].metadata?.kind).toBe("review_reply_verified");
  });

  it("returns verified=false and emits change_verify_failed when read-back text differs", async () => {
    mockFetch.mockImplementation((_url: unknown, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve("{}"),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            reviewReply: { comment: "DIFFERENT TEXT — google modified it" },
          }),
      });
    });

    const { publishReviewReply } = await import("@/lib/gbp-replies");
    const result = await publishReviewReply(tenantId, reviewId, replyText);

    expect(result.published).toBe(true);
    expect(result.verified).toBe(false);

    const calls = mockAddEvent.mock.calls as MockPublishAddEventCall[];
    const failedCall = calls.find(([e]) => e.type === "change_verify_failed");
    expect(failedCall).toBeDefined();
  });

  it("returns published=false + emits failure + Slack when write scope is missing", async () => {
    mockGetConnection.mockResolvedValue({
      ...connectedWithScope(),
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
    });

    const { publishReviewReply } = await import("@/lib/gbp-replies");
    const result = await publishReviewReply(tenantId, reviewId, replyText);

    expect(result.published).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.evidence).toContain("missing_gbp_write_scope");

    const calls = mockAddEvent.mock.calls as MockPublishAddEventCall[];
    const failedCall = calls.find(([e]) => e.type === "change_verify_failed");
    expect(failedCall).toBeDefined();

    expect(mockSendSlack).toHaveBeenCalled();
  });

  it("treats absent scopes field (legacy connection) as unknown — attempts the call", async () => {
    mockGetConnection.mockResolvedValue({
      provider: "google" as const,
      tenantId,
      accessToken: "tok_legacy",
      status: "connected" as const,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      // no scopes field
    });

    const { publishReviewReply } = await import("@/lib/gbp-replies");
    const result = await publishReviewReply(tenantId, reviewId, replyText);

    expect(result.published).toBe(true);
  });

  it("returns published=false and emits change_verify_failed when GBP API returns 403", async () => {
    mockFetch.mockImplementation((_url: unknown, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return Promise.resolve({
          ok: false,
          status: 403,
          text: () => Promise.resolve("Insufficient permissions"),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({}),
      });
    });

    const { publishReviewReply } = await import("@/lib/gbp-replies");
    const result = await publishReviewReply(tenantId, reviewId, replyText);

    expect(result.published).toBe(false);
    expect(result.verified).toBe(false);
    expect(result.evidence).toContain("publish_api_error");

    const calls = mockAddEvent.mock.calls as MockPublishAddEventCall[];
    const failedCall = calls.find(([e]) => e.type === "change_verify_failed");
    expect(failedCall).toBeDefined();
  });
});
