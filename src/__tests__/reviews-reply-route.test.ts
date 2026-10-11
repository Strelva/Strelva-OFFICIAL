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
const mockGetEventRaw = vi.fn();
const mockSuperAdmin = vi.fn();
const mockSession = vi.fn();
const mockMembershipRole = vi.fn();
const mockAgencySeat = vi.fn();
const mockAudit = vi.fn();

const OWNER_ID = "20000000-0000-4000-8000-000000000001";
const OPERATOR_ID = "20000000-0000-4000-8000-0000000000aa";
const STAFF_ID = "20000000-0000-4000-8000-0000000000bb";
const AGENCY_ID = "20000000-0000-4000-8000-0000000000cc";

// The real decider and operator decision (src/lib/operator-decisions.ts) run;
// the session, super_admins and memberships reads and the audit write are stubbed.
vi.mock("@/platform/infra/auth", () => ({
  verifyAuth: vi.fn(() => Promise.resolve(true)),
  requireTenantAccess: vi.fn(() => Promise.resolve(null)),
  isSuperAdmin: () => mockSuperAdmin(),
  getAuthUserId: async () => ((await mockSession()) as { id: string } | null)?.id ?? null,
}));
vi.mock("@/platform/infra/db/server-client", () => ({ getSessionUser: () => mockSession() }));
vi.mock("@/platform/infra/db/repositories", () => ({
  getMembershipRole: (...args: unknown[]) => mockMembershipRole(...args),
  getTenantAgencySeat: (...args: unknown[]) => mockAgencySeat(...args),
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
  getEventRaw: (...args: unknown[]) => mockGetEventRaw(...args),
}));

vi.mock("@/lib/event-actions", () => ({
  resolveEventAction: (...args: unknown[]) => mockResolveEventAction(...args),
  operatorActorId: (id: string) => `operator:${id}`,
  agencyStaffActorId: (agency: string, id: string) => `agency-staff:${agency}:${id}`,
}));

vi.mock("@/lib/storage", () => ({
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
  logAuditEvent: (...args: unknown[]) => mockAudit(...args),
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
  // Signed in as the tenant's owner unless a test says otherwise.
  mockSuperAdmin.mockResolvedValue(false);
  mockSession.mockResolvedValue({ id: OWNER_ID, email: "owner@example.test", email_confirmed_at: "2026-10-01T00:00:00Z" });
  mockMembershipRole.mockResolvedValue("owner");
  mockAgencySeat.mockResolvedValue(null);
  mockAudit.mockResolvedValue(undefined);
  mockGetEventRaw.mockImplementation(async (id: string) => ({
    id, tenantId: "test-tenant", type: "review", status: "pending", metadata: { kind: "review_reply_draft", reviewId: "gbp_abc" },
  }));
});

function signInAsOperator() {
  mockSuperAdmin.mockResolvedValue(true);
  mockSession.mockResolvedValue({ id: OPERATOR_ID, email: "operator@strelva.example.test", email_confirmed_at: "2026-10-01T00:00:00Z" });
  mockMembershipRole.mockResolvedValue(null);
}

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
    expect(mockResolveEventAction).toHaveBeenCalledWith("test-tenant", "evt_new", "approved", OWNER_ID);
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
    expect(mockResolveEventAction).toHaveBeenCalledWith("test-tenant", "evt_existing", "approved", OWNER_ID);
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

  it("an owner reply writes no operator audit row and logs the owner's activity", async () => {
    await postReply({ reviewId: "rev_1", reply: "Thanks Jane!" });
    expect(mockAudit).not.toHaveBeenCalled();
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ actor: "user" }), "test-tenant");
  });

  it("a Strelva operator replies as the operator, with audit rows around the post (#530)", async () => {
    signInAsOperator();
    const res = await postReply({ reviewId: "rev_1", reply: "Thanks Jane!" });
    expect(res.status).toBe(200);
    expect(mockMembershipRole).toHaveBeenCalledWith(OPERATOR_ID, "test-tenant");
    expect(mockResolveEventAction).toHaveBeenCalledWith("test-tenant", "evt_new", "approved", `operator:${OPERATOR_ID}`);
    expect(mockAudit).toHaveBeenCalledTimes(2);
    expect(mockAudit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      tenant: "test-tenant", action: "dashboard.review_reply.approved", targetId: "evt_new",
      actor: expect.objectContaining({ userId: OPERATOR_ID, type: "super_admin" }),
      metadata: expect.objectContaining({ phase: "attempt", actor: `operator:${OPERATOR_ID}` }),
    }));
    expect(mockAudit).toHaveBeenNthCalledWith(2, expect.objectContaining({ metadata: expect.objectContaining({ phase: "result", changed: true }) }));
    expect(mockAudit.mock.invocationCallOrder[0]!).toBeLessThan(mockResolveEventAction.mock.invocationCallOrder[0]!);
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ actor: "admin" }), "test-tenant");
  });

  it("a super admin who owns the tenant replies as its owner", async () => {
    signInAsOperator();
    mockMembershipRole.mockResolvedValue("owner");
    await postReply({ reviewId: "rev_1", reply: "Thanks Jane!" });
    expect(mockResolveEventAction).toHaveBeenCalledWith("test-tenant", "evt_new", "approved", OPERATOR_ID);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("an operator never rewrites or posts a draft routed to the owner", async () => {
    signInAsOperator();
    mockGetEvents.mockResolvedValue([{
      id: "evt_owner", type: "review", status: "pending",
      metadata: { kind: "review_reply_draft", reviewId: "gbp_abc", draftedReply: "Owner's call", reviewAudience: "owner" },
    }]);
    const res = await postReply({ reviewId: "rev_1", reply: "Operator text" });
    expect(res.status).toBe(403);
    expect(mockUpdateEvent).not.toHaveBeenCalled();
    expect(mockResolveEventAction).not.toHaveBeenCalled();
    expect(mockReplyToReview).not.toHaveBeenCalled();
  });

  it("an operator posts nothing when the audit row can't be written", async () => {
    signInAsOperator();
    mockAudit.mockRejectedValue(new Error("audit down"));
    const res = await postReply({ reviewId: "rev_1", reply: "Thanks Jane!" });
    expect(res.status).toBe(502);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
    expect(mockReplyToReview).not.toHaveBeenCalled();
  });

  it("agency staff on the provider seat reply as the agency, audited, never as the owner", async () => {
    mockSession.mockResolvedValue({ id: STAFF_ID, email: "staff@agency.example.test", email_confirmed_at: "2026-10-01T00:00:00Z" });
    mockMembershipRole.mockResolvedValue("admin");
    mockAgencySeat.mockResolvedValue(AGENCY_ID);
    const res = await postReply({ reviewId: "rev_1", reply: "Thanks Jane!" });
    expect(res.status).toBe(200);
    expect(mockResolveEventAction).toHaveBeenCalledWith("test-tenant", "evt_new", "approved", `agency-staff:${AGENCY_ID}:${STAFF_ID}`);
    expect(mockAudit).toHaveBeenNthCalledWith(1, expect.objectContaining({
      actor: { userId: STAFF_ID, email: "staff@agency.example.test", type: "user", isSuperAdmin: false },
      metadata: expect.objectContaining({ phase: "attempt", actor: `agency-staff:${AGENCY_ID}:${STAFF_ID}`, agencyWorkspaceId: AGENCY_ID }),
    }));
    expect(mockLogActivity).toHaveBeenCalledWith(expect.objectContaining({ actor: "admin" }), "test-tenant");
  });

  it("agency staff never rewrite or post a draft routed to the owner", async () => {
    mockSession.mockResolvedValue({ id: STAFF_ID, email: "staff@agency.example.test", email_confirmed_at: "2026-10-01T00:00:00Z" });
    mockMembershipRole.mockResolvedValue("admin");
    mockAgencySeat.mockResolvedValue(AGENCY_ID);
    mockGetEvents.mockResolvedValue([{
      id: "evt_owner", type: "review", status: "pending",
      metadata: { kind: "review_reply_draft", reviewId: "gbp_abc", draftedReply: "Owner's call", reviewAudience: "owner" },
    }]);
    expect((await postReply({ reviewId: "rev_1", reply: "Agency text" })).status).toBe(403);
    expect(mockUpdateEvent).not.toHaveBeenCalled();
    expect(mockResolveEventAction).not.toHaveBeenCalled();
    expect(mockReplyToReview).not.toHaveBeenCalled();
  });

  it("404s for an unknown review id", async () => {
    const res = await postReply({ reviewId: "rev_missing", reply: "Hello" });
    expect(res.status).toBe(404);
  });
});
