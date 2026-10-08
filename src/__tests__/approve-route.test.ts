import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The /api/approve route is a two-step: GET renders a confirm page and NEVER
// mutates (email scanners/prefetchers auto-fetch the link), POST does the real
// resolve. POST must verify the HMAC token, map approve→"approved" /
// not-yet→"dismissed" onto resolveEventAction, reject tampered/expired links, and
// be idempotent (already-resolved → friendly page, not an error).

const mockResolveEventAction = vi.hoisted(() => vi.fn());
const mockBrand = vi.hoisted(() => vi.fn());
vi.mock("@/platform/agency-brand/server", () => ({ resolveTenantBrand: mockBrand, resolveOwnerBrand: mockBrand }));

const mockGetTenantConfig = vi.hoisted(() => vi.fn());

vi.mock("@/lib/event-actions", () => ({ resolveEventAction: mockResolveEventAction }));
// Existing tenant links must not load the unreleased workspace decision runtime.
vi.mock("@/platform/needs-you/server", () => { throw new Error("Legacy approval loaded workspace runtime"); });
vi.mock("@/app/api/owner-website-preview/preview", () => { throw new Error("Legacy approval loaded website renderer"); });
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mockGetTenantConfig }));
vi.mock("@/lib/tenant-urls", () => ({
  getTenantDashboardUrl: (t: { id: string }, path: string) => `https://admin.${t.id}.strelva.com${path}`,
}));
// These cases exercise legacy tenant links. Workspace-link behavior has its
// own route tests; avoid loading its unrelated execution graph in each reset.
vi.mock("@/platform/needs-you/server", () => ({
  needsYouReleaseEnabled: () => false,
  needsYouAppOrigin: () => "https://app.strelva.example",
  needsYouService: {}, needsYouStore: {},
}));

const claims = { eventId: "evt_1", tenantId: "gldf", action: "approve" as const };

async function getReq(token: string | null) {
  const url = token
    ? `https://admin.gldf.strelva.com/api/approve?token=${encodeURIComponent(token)}`
    : "https://admin.gldf.strelva.com/api/approve";
  const { GET } = await import("@/app/api/approve/route");
  return GET(new Request(url));
}

async function postReq(token: string | null) {
  const body = new URLSearchParams();
  if (token !== null) body.set("token", token);
  const { POST } = await import("@/app/api/approve/route");
  return POST(
    new Request("https://admin.gldf.strelva.com/api/approve", {
      method: "POST",
      body,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBrand.mockResolvedValue({ agencyId: null });
  process.env.APPROVE_LINK_SECRET = "test-approve-secret";
  mockGetTenantConfig.mockResolvedValue({ id: "gldf", siteName: "GLDF" });
  mockResolveEventAction.mockResolvedValue({ changed: true });
});
afterEach(() => vi.resetModules());

describe("GET /api/approve (confirm step — must NOT mutate)", () => {
  it("valid approve link renders a confirm page and resolves NOTHING (scanner-safe)", async () => {
    const { signApproveToken } = await import("@/lib/approve-link");
    const token = signApproveToken(claims);
    const res = await getReq(token);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(mockResolveEventAction).not.toHaveBeenCalled(); // the whole point
    expect(html).toContain("Approve this reply?");
    expect(html).toContain('method="POST"');
    expect(html).toContain(token); // the token rides on the POST form
  });

  it("not-yet link renders a Skip confirm page, still no mutation", async () => {
    const { signApproveToken } = await import("@/lib/approve-link");
    const res = await getReq(signApproveToken({ ...claims, action: "not-yet" }));
    expect(res.status).toBe(200);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
    expect(await res.text()).toContain("Skip this reply?");
  });

  it("rejects a missing/invalid token on GET too", async () => {
    expect((await getReq(null)).status).toBe(400);
    const { signApproveToken } = await import("@/lib/approve-link");
    const [payload] = signApproveToken(claims).split(".");
    expect((await getReq(`${payload}.forged`)).status).toBe(400);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });
});

describe("POST /api/approve (the real resolve)", () => {
  it("approves: verifies token and calls resolveEventAction with 'approved'", async () => {
    const { signApproveToken } = await import("@/lib/approve-link");
    const res = await postReq(signApproveToken(claims));
    expect(res.status).toBe(200);
    expect(mockResolveEventAction).toHaveBeenCalledWith("gldf", "evt_1", "approved");
    expect(await res.text()).toContain("Approved");
  });

  it("not-yet maps to 'dismissed'", async () => {
    const { signApproveToken } = await import("@/lib/approve-link");
    const res = await postReq(signApproveToken({ ...claims, action: "not-yet" }));
    expect(res.status).toBe(200);
    expect(mockResolveEventAction).toHaveBeenCalledWith("gldf", "evt_1", "dismissed");
    expect(await res.text()).toContain("Skipped");
  });

  it("rejects a tampered token without resolving anything", async () => {
    const { signApproveToken } = await import("@/lib/approve-link");
    const [payload] = signApproveToken(claims).split(".");
    const res = await postReq(`${payload}.forged`);
    expect(res.status).toBe(400);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
    expect(await res.text()).toContain("invalid or expired");
  });

  it("rejects an expired token", async () => {
    const { signApproveToken } = await import("@/lib/approve-link");
    const past = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const res = await postReq(signApproveToken(claims, past));
    expect(res.status).toBe(400);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });

  it("rejects a missing token", async () => {
    const res = await postReq(null);
    expect(res.status).toBe(400);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });

  it("is idempotent: already-resolved renders a friendly page (200), not an error", async () => {
    mockResolveEventAction.mockResolvedValue({ changed: false, reason: "already_resolved" });
    const { signApproveToken } = await import("@/lib/approve-link");
    const res = await postReq(signApproveToken(claims));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Already handled");
  });

  it("treats a not_found event as already handled (200)", async () => {
    mockResolveEventAction.mockResolvedValue({ changed: false, reason: "not_found" });
    const { signApproveToken } = await import("@/lib/approve-link");
    const res = await postReq(signApproveToken(claims));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Already handled");
  });

  it("scopes to tenant: a wrong-tenant resolution is refused (403)", async () => {
    mockResolveEventAction.mockResolvedValue({ changed: false, reason: "wrong_tenant" });
    const { signApproveToken } = await import("@/lib/approve-link");
    const res = await postReq(signApproveToken(claims));
    expect(res.status).toBe(403);
  });

  it("refuses a tenant link once the site has a business: nothing resolves (#524)", async () => {
    const recipients = await import("@/lib/owner-recipient");
    recipients.setOwnerRecipientResolver(async () => ({ email: "trusted@gldf.example", name: null, from: "record", workspaceId: "w1", tenantId: "gldf" }));
    const { signApproveToken } = await import("@/lib/approve-link");
    const token = signApproveToken(claims);
    const res = await postReq(token);
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("Decide this in Strelva");
    expect(mockResolveEventAction).not.toHaveBeenCalled();
    const confirm = await getReq(token);
    expect(confirm.status).toBe(403);
    expect(await confirm.text()).not.toContain('method="POST"');
  });

  it("refuses a tenant link when the site's business can't be read (fail closed)", async () => {
    const recipients = await import("@/lib/owner-recipient");
    recipients.setOwnerRecipientResolver(async () => { throw new Error("db down"); });
    const { signApproveToken } = await import("@/lib/approve-link");
    const res = await postReq(signApproveToken(claims));
    expect(res.status).toBe(403);
    expect(mockResolveEventAction).not.toHaveBeenCalled();
  });

  it("a site with no business keeps its tenant link", async () => {
    const recipients = await import("@/lib/owner-recipient");
    recipients.setOwnerRecipientResolver(async () => ({ email: "owner@gldf.example", name: null, from: "tenant", workspaceId: null, tenantId: "gldf" }));
    const { signApproveToken } = await import("@/lib/approve-link");
    const res = await postReq(signApproveToken(claims));
    expect(res.status).toBe(200);
    expect(mockResolveEventAction).toHaveBeenCalledWith("gldf", "evt_1", "approved");
  });
});

describe("owner link agency presentation", () => {
  it("brands a scanner-safe confirmation and a successful decision with escaped identity", async () => {
    mockBrand.mockResolvedValue({ agencyId: "agency", name: '<Agency & "Web">', logoUrl: null, accentColor: "#ffff00", replyTo: "reply@agency.example", credit: "runs_on_strelva" });
    const { signApproveToken } = await import("@/lib/approve-link"); const token = signApproveToken(claims);
    const confirm = await getReq(token); const html = await confirm.text();
    expect(html).toContain("&lt;Agency &amp; &quot;Web&quot;&gt;"); expect(html).toContain("Runs on Strelva."); expect(html).toContain("background:#ffff00;color:#000000"); expect(html).toContain('method="POST"'); expect(mockResolveEventAction).not.toHaveBeenCalled();
    const result = await postReq(token); expect(result.status).toBe(200); expect(await result.text()).toContain("Runs on Strelva."); expect(mockResolveEventAction).toHaveBeenCalledTimes(1);
  });
  it("preserves a completed decision when brand storage is unavailable", async () => {
    mockBrand.mockRejectedValue(new Error("Brand storage offline"));
    const { signApproveToken } = await import("@/lib/approve-link");
    const response = await postReq(signApproveToken(claims)); expect(response.status).toBe(200); expect(mockResolveEventAction).toHaveBeenCalledTimes(1);
  });
});
