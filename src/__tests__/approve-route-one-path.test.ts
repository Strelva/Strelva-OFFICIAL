import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// STRELVA_ONE_APPROVAL_PATH: an emailed review or legacy link for a business
// with a workspace decides through that business's Needs you item. Off, or for
// a tenant with no business, the direct resolver runs exactly as before.

const mockResolveEventAction = vi.hoisted(() => vi.fn());
const mockGetEventRaw = vi.hoisted(() => vi.fn());
const mockWorkspaceForTenant = vi.hoisted(() => vi.fn());
const mockAuthority = vi.hoisted(() => vi.fn());
const mockAllowed = vi.hoisted(() => vi.fn());
const needsYou = vi.hoisted(() => ({ openForSource: vi.fn(), review: vi.fn(), decide: vi.fn() }));

vi.mock("@/lib/events", () => ({ getEventRaw: mockGetEventRaw }));
vi.mock("@/platform/agency-brand/server", () => ({ resolveTenantBrand: async () => ({ agencyId: null }), resolveOwnerBrand: async () => ({ agencyId: null }) }));
vi.mock("@/lib/event-actions", () => ({ resolveEventAction: mockResolveEventAction }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: async () => ({ id: "gldf", siteName: "GLDF" }) }));
vi.mock("@/lib/tenant-urls", () => ({ getTenantDashboardUrl: (t: { id: string }, path: string) => `https://admin.${t.id}.strelva.com${path}` }));
vi.mock("@/platform/release-flags/store", () => ({ releaseWorkspaceForTenant: mockWorkspaceForTenant }));
vi.mock("@/lib/review-approval-authority", () => ({
  readReviewApprovalAuthority: mockAuthority,
  reviewApprovalTokenAllowed: mockAllowed,
  isManagedReviewApproval: (event: { type?: string; metadata?: { kind?: string } }) => event.type === "review" && event.metadata?.kind === "review_reply_draft",
}));
vi.mock("@/experience/workspace/needs-you-server", () => ({
  needsYouReleaseEnabled: () => true,
  needsYouAppOrigin: () => "https://app.strelva.example",
  needsYouStore: {},
  needsYouService: () => needsYou,
}));
vi.mock("@/app/workspace/business-details/native-website-facts", () => ({ createConfirmedNativeFactsEffect: () => undefined }));

const WS = "aaaaaaaa-0000-4000-8000-000000000001";
const claims = { eventId: "evt_1", tenantId: "gldf", action: "approve" as const };
const item = (over: Record<string, unknown> = {}) => ({
  id: "bbbbbbbb-0000-4000-8000-000000000001", workspaceId: WS, route: "owner_decides", state: "open", title: "Reply to Dana's review", revisionHash: "a".repeat(64),
  approveEffect: "Strelva posts this reply on Google.", notYetEffect: "Nothing is posted.", openHref: null, systemId: null, actor: null, ...over,
});

async function tokens() {
  const { signApproveToken, signReviewApproveToken } = await import("@/lib/approve-link");
  return { legacy: signApproveToken(claims), review: signReviewApproveToken({ ...claims, workspaceId: WS, recipient: "owner@example.test", authorityVersion: "c".repeat(64) }) };
}
async function get(token: string) {
  const { GET } = await import("@/app/api/approve/route");
  return GET(new Request(`https://admin.gldf.strelva.com/api/approve?token=${encodeURIComponent(token)}`));
}
async function post(token: string) {
  const { POST } = await import("@/app/api/approve/route");
  return POST(new Request("https://admin.gldf.strelva.com/api/approve", { method: "POST", body: new URLSearchParams({ token }), headers: { "content-type": "application/x-www-form-urlencoded" } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APPROVE_LINK_SECRET = "test-approve-secret";
  process.env.STRELVA_ONE_APPROVAL_PATH = "1";
  process.env.STRELVA_NEEDS_YOU_RELEASE = "1";
  mockWorkspaceForTenant.mockResolvedValue(WS);
  mockAuthority.mockResolvedValue({ recipient: "owner@example.test" });
  mockAllowed.mockResolvedValue(true);
  mockGetEventRaw.mockResolvedValue({ tenantId: "gldf", type: "review", title: "Reply", metadata: { kind: "review_reply_draft" } });
  mockResolveEventAction.mockResolvedValue({ changed: true });
  needsYou.openForSource.mockResolvedValue(item());
  needsYou.review.mockResolvedValue(undefined);
  needsYou.decide.mockResolvedValue({ status: "done", item: item({ state: "approved" }), receipt: null });
});
afterEach(() => {
  delete process.env.STRELVA_ONE_APPROVAL_PATH;
  delete process.env.STRELVA_NEEDS_YOU_RELEASE;
  vi.resetModules();
});

describe("/api/approve through Needs you", () => {
  it("GET shows the item and decides nothing", async () => {
    const { review } = await tokens();
    const html = await (await get(review)).text();
    expect(html).toContain("Approve: Reply to Dana");
    expect(html).toContain("Posts this reply on Google.");
    expect(html).toContain(review);
    expect(needsYou.decide).not.toHaveBeenCalled();
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });

  it("POST decides through the item and keeps the link token as the authorization", async () => {
    const { review } = await tokens();
    const response = await post(review);
    expect(await response.text()).toContain("Approved");
    expect(needsYou.decide).toHaveBeenCalledWith({
      workspaceId: WS, itemId: item().id, revision: "a".repeat(64), decision: "approve",
      by: { kind: "owner_link", recipient: "owner@example.test", legacyToken: review },
    });
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });

  it("a legacy tenant link uses the recorded owner recipient", async () => {
    const { legacy } = await tokens();
    await post(legacy);
    expect(needsYou.decide).toHaveBeenCalledWith(expect.objectContaining({ by: { kind: "owner_link", recipient: "owner@example.test", legacyToken: legacy } }));
  });

  it("not yet maps to the not_yet decision", async () => {
    const { signReviewApproveToken } = await import("@/lib/approve-link");
    await post(signReviewApproveToken({ ...claims, action: "not-yet", workspaceId: WS, recipient: "owner@example.test", authorityVersion: "c".repeat(64) }));
    expect(needsYou.decide).toHaveBeenCalledWith(expect.objectContaining({ decision: "not_yet" }));
  });

  it("a replayed POST reads Already handled", async () => {
    needsYou.decide.mockResolvedValue({ status: "already_handled", item: item({ state: "approved" }) });
    const { review } = await tokens();
    expect(await (await post(review)).text()).toContain("Already handled");
  });

  it("falls back to the direct resolver with the flag off", async () => {
    process.env.STRELVA_ONE_APPROVAL_PATH = "0";
    const { review } = await tokens();
    await post(review);
    expect(needsYou.decide).not.toHaveBeenCalled();
    expect(mockResolveEventAction).toHaveBeenCalledWith("gldf", "evt_1", "approved", "user", { reviewApprovalToken: review });
  });

  it("falls back to the direct resolver for a tenant with no business", async () => {
    mockWorkspaceForTenant.mockResolvedValue(null);
    const { review } = await tokens();
    await post(review);
    expect(needsYou.decide).not.toHaveBeenCalled();
    expect(mockResolveEventAction).toHaveBeenCalledTimes(1);
  });

  it("falls back to the direct resolver when the item is on the Strelva reviews route", async () => {
    needsYou.openForSource.mockResolvedValue(item({ route: "strelva_reviews" }));
    const { review } = await tokens();
    await post(review);
    expect(needsYou.decide).not.toHaveBeenCalled();
    expect(mockResolveEventAction).toHaveBeenCalledTimes(1);
  });

  it("still refuses a tampered token and a moved business", async () => {
    const { review } = await tokens();
    const [payload] = review.split(".");
    expect((await post(`${payload}.forged`)).status).toBe(400);
    mockAllowed.mockResolvedValue(false);
    const moved = await post(review);
    expect(moved.status).toBe(403);
    expect(needsYou.decide).not.toHaveBeenCalled();
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });

  it("shows the honest pause when the model budget is paused", async () => {
    const { ModelBudgetPausedError } = await import("@/platform/infra/business-ai-budget");
    needsYou.decide.mockRejectedValue(new ModelBudgetPausedError(0, 0, {}));
    const { review } = await tokens();
    expect(await (await post(review)).text()).toContain("Building is paused");
  });
});
