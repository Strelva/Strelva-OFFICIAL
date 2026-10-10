import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import { signApproveToken, signReviewApproveToken, verifyReviewApproveToken, verifyAnyApproveToken, verifyApproveToken, verifyWorkspaceApproveToken, APPROVE_LINK_TTL_MS } from "@/lib/approve-link";
import { reviewApprovalTokenAllowed, readReviewApprovalAuthority } from "@/lib/review-approval-authority";

const deps = vi.hoisted(() => ({ rpc: vi.fn(), event: vi.fn(), resolve: vi.fn(), send: vi.fn(), redis: vi.fn() }));
vi.mock("@/platform/infra/db/client", () => ({ isSupabaseConfigured: () => true, getSupabase: () => ({ rpc: deps.rpc }) }));
vi.mock("@/lib/events", () => ({ getEventRaw: deps.event }));
vi.mock("@/lib/event-actions", () => ({ resolveEventAction: deps.resolve }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: async () => ({ id: "fixture-site", siteName: "Fixture", ownerEmail: "owner@example.test" }) }));
vi.mock("@/lib/tenant-urls", () => ({ getTenantDashboardUrl: (_t: unknown, path: string) => `https://admin.example.test${path}` }));
vi.mock("@/platform/agency-brand/server", () => ({ resolveTenantBrand: async () => ({ agencyId: null }), resolveOwnerBrand: async () => ({ agencyId: null }) }));
vi.mock("@/lib/delivery-email", () => ({ sendReviewNeedsReplyEmail: deps.send }));
vi.mock("@/platform/infra/redis", () => ({ getRedis: deps.redis }));
vi.mock("@/platform/infra/rate-limit", () => ({ isRateLimitedAsync: async () => false, rateLimitKey: () => "fixture" }));
const workspace = "90300000-0000-4000-8000-000000000007";
const baseClaims = { tenantId: "fixture-site", eventId: "event-fixture", action: "approve" as const };
let authority = { tenantId: "fixture-site", workspaceId: workspace, recipient: "owner@example.test", version: "a".repeat(64), conversionAt: new Date(Date.now() + 1000).toISOString(), legacyAllowed: true };
const bound = () => signReviewApproveToken({ ...baseClaims, workspaceId: workspace, recipient: authority.recipient, authorityVersion: authority.version });
async function request(token: string, method: "GET" | "POST") {
  const route = await import("@/app/api/approve/route");
  return method === "GET" ? route.GET(new Request(`https://admin.example.test/api/approve?token=${encodeURIComponent(token)}`))
    : route.POST(new Request("https://admin.example.test/api/approve", { method, body: new URLSearchParams({ token }) }));
}
beforeEach(() => {
  vi.clearAllMocks();
  process.env.APPROVE_LINK_SECRET = "fixture-review-secret";
  authority = { tenantId: "fixture-site", workspaceId: workspace, recipient: "owner@example.test", version: "a".repeat(64), conversionAt: new Date(Date.now() + 1000).toISOString(), legacyAllowed: true };
  deps.rpc.mockImplementation(async (name: string) => ({ data: name === "read_tenant_review_approval_authority" ? authority
    : { email: authority.recipient, name: null, from: "record", workspaceId: authority.workspaceId, tenantId: authority.tenantId }, error: null }));
  deps.event.mockResolvedValue({ id: baseClaims.eventId, tenantId: "fixture-site", type: "review", metadata: { kind: "review_reply_draft" }, status: "pending" });
  deps.resolve.mockResolvedValue({ changed: true });
  deps.send.mockResolvedValue(true);
  deps.redis.mockReturnValue({ set: async () => "OK", del: vi.fn() });
});
afterEach(() => { vi.useRealTimers(); });

describe("review approval continuity", () => {
  it("keeps old GET scanner safe and old POST working across unchanged conversion", async () => {
    const token = signApproveToken(baseClaims);
    const get = await request(token, "GET");
    expect(get.status).toBe(200); expect(await get.text()).toContain('method="POST"'); expect(deps.resolve).not.toHaveBeenCalled();
    expect((await request(token, "POST")).status).toBe(200);
    expect(deps.resolve).toHaveBeenCalledWith("fixture-site", "event-fixture", "approved", "user", { reviewApprovalToken: token });
  });
  it("rejects newly signed recipient-unbound tokens after conversion cutoff", async () => {
    authority.conversionAt = new Date(Date.now() - 10000).toISOString();
    expect(await reviewApprovalTokenAllowed(signApproveToken(baseClaims), { id: "fixture-site" })).toBe(false);
  });
  it("preserves future bound review decisions and isolates token domains", async () => {
    const token = bound();
    expect(verifyAnyApproveToken(token)?.kind).toBe("review"); expect(verifyApproveToken(token)).toBeNull(); expect(verifyWorkspaceApproveToken(token)).toBeNull();
    expect((await request(token, "POST")).status).toBe(200);
    expect(deps.resolve).toHaveBeenCalledWith("fixture-site", "event-fixture", "approved", "user", { reviewApprovalToken: token });
  });
  it.each(["workspace_collection_publish", "workspace_newsletter_issue", "workspace_google_listing_draft", "inquiry_message_review", "make_real"])("denies publishing kind %s for a review token", async kind => {
    deps.event.mockResolvedValue({ tenantId: "fixture-site", type: "change_request", metadata: { kind } });
    expect((await request(bound(), "GET")).status).toBe(403); expect((await request(bound(), "POST")).status).toBe(403);
    expect(deps.resolve).not.toHaveBeenCalled();
  });
  it("rejects wrong-tenant events even with a valid signature", async () => {
    deps.event.mockResolvedValue({ tenantId: "other-site", type: "review", metadata: { kind: "review_reply_draft" } });
    expect((await request(bound(), "POST")).status).toBe(403); expect(deps.resolve).not.toHaveBeenCalled();
    expect(await reviewApprovalTokenAllowed(bound(), { id: "other-site" })).toBe(false);
  });
  it("rejects forged/expired bound tokens before any resolver", async () => {
    const token = bound(); expect((await request(token.slice(0, -3) + "bad", "POST")).status).toBe(400);
    const expired = signReviewApproveToken({ ...baseClaims, workspaceId: workspace, recipient: authority.recipient, authorityVersion: authority.version }, Date.now() - APPROVE_LINK_TTL_MS - 1000);
    expect(verifyReviewApproveToken(expired)).toBeNull(); expect((await request(expired, "POST")).status).toBe(400); expect(deps.resolve).not.toHaveBeenCalled();
  });
  it("rejects both old and bound tokens after trust/ownership change-back", async () => {
    const old = signApproveToken(baseClaims), future = bound();
    authority.legacyAllowed = false; authority.version = "b".repeat(64);
    expect((await request(old, "POST")).status).toBe(403); expect((await request(future, "POST")).status).toBe(403); expect(deps.resolve).not.toHaveBeenCalled();
  });
  it("denies accepted owner legacy tokens, while newly bound current owner can decide", async () => {
    authority.legacyAllowed = false;
    expect((await request(signApproveToken(baseClaims), "POST")).status).toBe(403);
    expect((await request(bound(), "POST")).status).toBe(200);
  });
  it("fails closed on unavailable or malformed authority", async () => {
    deps.rpc.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect((await request(bound(), "POST")).status).toBe(403);
    deps.rpc.mockResolvedValue({ data: { ...authority, legacyAllowed: "yes" }, error: null });
    expect(await readReviewApprovalAuthority("fixture-site")).toBeNull(); expect(deps.resolve).not.toHaveBeenCalled();
  });
  it("fails closed on timeout", async () => {
    vi.useFakeTimers(); deps.rpc.mockReturnValue(new Promise(() => {}));
    const result = readReviewApprovalAuthority("fixture-site"); await vi.advanceTimersByTimeAsync(1501); expect(await result).toBeNull();
  });
  it("keeps converted review email action buttons with exact current authority", async () => {
    const { maybeAlertNewReview } = await import("@/lib/review-alert");
    await maybeAlertNewReview({ tenant: { id: "fixture-site", siteName: "Fixture", ownerEmail: "owner@example.test" } as never,
      reviewId: "review-fixture", review: { author: "Fixture Owner", rating: 5 }, draftedReply: "Thank you", reviewsUrl: "https://admin.example.test/dashboard/reviews", reviewEventId: baseClaims.eventId });
    const mail = deps.send.mock.calls[0]![0];
    for (const [key, action] of [["approveUrl", "approve"], ["notYetUrl", "not-yet"]] as const) {
      const token = new URL(mail[key]).searchParams.get("token")!;
      expect(verifyReviewApproveToken(token)).toEqual({ ...baseClaims, action, workspaceId: workspace, recipient: authority.recipient, authorityVersion: authority.version });
    }
  });
});
