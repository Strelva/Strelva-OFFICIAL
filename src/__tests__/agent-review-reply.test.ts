import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Trust coverage for the chat agent's review + social tools:
 *
 * 1. `reply_to_review` must NEVER claim a Google reply is live. For a
 *    Google-source review with a connected Google account it queues a
 *    `review_reply_draft` pending event (the same governed path the review
 *    cron uses — the real write happens on owner approval via
 *    publishReviewReply in event-actions). For sources with no publish path
 *    (Yelp/manual, or Google without a connection) it saves the reply in the
 *    dashboard store and says so honestly.
 *
 * 2. `schedule_social_post` must NOT be registered — no publisher exists, so
 *    "scheduling" a post was a silent no-op that never published.
 *
 * Mirrors the agent-custom-change harness: drive the real POST handler with a
 * stand-in streamText that invokes the chosen tool's `execute`.
 */

const mockAddEvent = vi.fn();
const mockReplyToReview = vi.fn();
const mockGetConnection = vi.fn<() => Promise<unknown>>(() =>
  Promise.resolve({ status: "connected" })
);

type AgentTools = Record<string, { execute: (args: unknown) => Promise<unknown> }>;

// Set per test: which tool the stand-in streamText drives, with what args.
let mockDrive: { name: string; args: unknown } | null = null;
let mockCapturedTools: AgentTools = {};
let mockLastOutput: unknown = null;

const GOOGLE_REVIEW = {
  id: "rev_google_1",
  source: "google",
  author: "Jane",
  rating: 5,
  text: "Great service",
  date: "2026-06-01T00:00:00.000Z",
  externalId: "g-ext-123",
};

const YELP_REVIEW = {
  id: "rev_yelp_1",
  source: "yelp",
  author: "Bob",
  rating: 4,
  text: "Solid",
  date: "2026-06-02T00:00:00.000Z",
};

vi.mock("@/lib/events", () => ({
  addEvent: (...args: unknown[]) => mockAddEvent(...args),
  getOpenChangeRequest: () => Promise.resolve(null),
}));

vi.mock("@/lib/reviews", () => ({
  getReviews: () => Promise.resolve([GOOGLE_REVIEW, YELP_REVIEW]),
  replyToReview: (...args: unknown[]) => mockReplyToReview(...args),
}));

vi.mock("ai", () => ({
  tool: (def: unknown) => def,
  stepCountIs: () => () => true,
  streamText: (opts: { tools: AgentTools }) => {
    mockCapturedTools = opts.tools;
    return {
      fullStream: (async function* () {
        if (!mockDrive) return;
        const output = await opts.tools[mockDrive.name].execute(mockDrive.args);
        mockLastOutput = output;
        yield { type: "tool-call", toolName: mockDrive.name, input: mockDrive.args };
        yield { type: "tool-result", output };
      })(),
    };
  },
}));

vi.mock("@/lib/ai-models", () => ({
  getPrimaryModel: () => ({ model: { id: "primary" }, label: "primary" }),
  getFallbackModel: () => null,
  isTransientModelError: () => false,
}));

vi.mock("@/lib/tenant", () => ({
  getTenantFromHeaders: () => Promise.resolve("test-tenant"),
}));

vi.mock("@/lib/auth", () => ({
  requireTenantAccess: () => Promise.resolve(null),
  requireTenantPermission: () => Promise.resolve(null),
  getAuthUserId: () => Promise.resolve("user_test"),
  isSuperAdmin: () => Promise.resolve(false),
}));

vi.mock("@/lib/rate-limit", () => ({
  isRateLimitedAsync: () => Promise.resolve(false),
}));

vi.mock("@/lib/subscription", () => ({
  requireActiveSubscription: () => Promise.resolve(null),
}));

vi.mock("@/lib/tenants", () => ({
  getTenantConfig: () => Promise.resolve({ siteName: "Rohlax" }),
}));

vi.mock("@/components/templates/registry", () => ({
  getTemplateForTenant: () => Promise.resolve({ id: "wellness", contentSections: ["hero"] }),
}));

vi.mock("@/lib/site-capabilities", () => ({
  getSiteCapabilityManifest: () =>
    Promise.resolve({
      sections: { hero: { allowedActions: ["draft"] } },
      supportsPageConfig: false,
      supportsNavigationConfig: false,
      supportsFooterConfig: false,
      supportsDraftPreview: false,
      supportsInlineEditing: false,
      designTokens: [],
      customOnlyFeatures: [],
      customRequestEndpoint: "/api/custom-request",
    }),
  manifestAllowsAction: () => true,
}));

vi.mock("@/lib/proof-signals", () => ({
  classifySource: () => "owner",
  recordAgentToolCall: vi.fn(),
}));

vi.mock("@/lib/capabilities", () => ({
  capabilityPromptFragment: () => "",
  sanitizePromptValue: (v: unknown) => (typeof v === "string" ? v : ""),
}));

vi.mock("@/lib/connections", () => ({
  getConnections: () => Promise.resolve([]),
  getConnection: () => mockGetConnection(),
}));

vi.mock("@/lib/storage", () => ({
  getContent: () => Promise.resolve({}),
  getClickCounts: () => Promise.resolve(0),
  logActivity: () => Promise.resolve(),
}));

async function drainResponse(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

function buildRequest() {
  return new Request("http://localhost/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: "Reply to that review" }],
    }),
  });
}

async function runAgent(drive: { name: string; args: unknown } | null) {
  mockDrive = drive;
  const { POST } = await import("@/app/api/agent/route");
  const res = await POST(buildRequest());
  return drainResponse(res);
}

describe("agent reply_to_review tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDrive = null;
    mockLastOutput = null;
    mockAddEvent.mockResolvedValue({ id: "evt_reply_1" });
    mockGetConnection.mockResolvedValue({ status: "connected" });
    mockReplyToReview.mockImplementation((_tenant: string, id: string, reply: string) => {
      const review = [GOOGLE_REVIEW, YELP_REVIEW].find((r) => r.id === id);
      return Promise.resolve(review ? { ...review, reply } : null);
    });
  });

  it("queues a review_reply_draft for a Google review when Google is connected — never posts or claims live", async () => {
    await runAgent({
      name: "reply_to_review",
      args: { reviewId: "rev_google_1", replyText: "Jane, glad the visit went well." },
    });

    expect(mockAddEvent).toHaveBeenCalledTimes(1);
    expect(mockAddEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "test-tenant",
        source: "ai",
        type: "review",
        status: "pending",
        body: "Jane, glad the visit went well.",
        metadata: expect.objectContaining({
          kind: "review_reply_draft",
          // The Google provider review id, not the internal store id —
          // publishReviewReply needs it to build the reply URL on approval.
          reviewId: "g-ext-123",
          author: "Jane",
          rating: 5,
          draftedReply: "Jane, glad the visit went well.",
        }),
      })
    );
    // The internal store is NOT written — the reply isn't live yet.
    expect(mockReplyToReview).not.toHaveBeenCalled();

    const output = mockLastOutput as { agentResultStatus: string; message: string };
    expect(output.agentResultStatus).toBe("queued");
    expect(output.message).toContain("approv");
    expect(output.message).not.toMatch(/^Replied/);
  });

  it("saves a Yelp reply to the dashboard store and is honest that it was not published", async () => {
    await runAgent({
      name: "reply_to_review",
      args: { reviewId: "rev_yelp_1", replyText: "Bob, appreciate the honest review." },
    });

    expect(mockReplyToReview).toHaveBeenCalledWith(
      "test-tenant",
      "rev_yelp_1",
      "Bob, appreciate the honest review."
    );
    expect(mockAddEvent).not.toHaveBeenCalled();

    const output = mockLastOutput as { agentResultStatus: string; message: string };
    expect(output.agentResultStatus).toBe("drafted");
    expect(output.message).toContain("post it on Yelp yourself");
  });

  it("falls back to the dashboard-only save when Google is not connected", async () => {
    mockGetConnection.mockResolvedValue(null);

    await runAgent({
      name: "reply_to_review",
      args: { reviewId: "rev_google_1", replyText: "Jane, glad the visit went well." },
    });

    expect(mockAddEvent).not.toHaveBeenCalled();
    expect(mockReplyToReview).toHaveBeenCalledWith(
      "test-tenant",
      "rev_google_1",
      "Jane, glad the visit went well."
    );

    const output = mockLastOutput as { message: string };
    expect(output.message).toContain("post it on Google yourself");
  });
});

describe("agent social tools", () => {
  it("does not register schedule_social_post — no publisher exists, so scheduling would be a silent no-op", async () => {
    await runAgent(null);

    const toolNames = Object.keys(mockCapturedTools);
    expect(toolNames).not.toContain("schedule_social_post");
    // Drafts are real — the draft/list tools stay registered.
    expect(toolNames).toContain("draft_social_post");
    expect(toolNames).toContain("list_social_posts");
    expect(toolNames).toContain("reply_to_review");
  });
});
