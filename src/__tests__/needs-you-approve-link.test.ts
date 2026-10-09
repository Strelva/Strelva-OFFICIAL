import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Workspace one-tap links for Needs you, through the same /api/approve route
// as today's tenant review links. GET only confirms; POST decides through the
// Needs you service, which resolves through the source's own resolver.

const mockRead = vi.hoisted(() => vi.fn());
const mockDecide = vi.hoisted(() => vi.fn());
const mockReview = vi.hoisted(() => vi.fn(async (): Promise<string[] | null | undefined> => undefined));
const mockService = vi.hoisted(() => vi.fn());
const mockReleased = vi.hoisted(() => vi.fn(() => true));
const mockResolveEventAction = vi.hoisted(() => vi.fn());

vi.mock("@/platform/needs-you/server", () => ({
  needsYouReleaseEnabled: mockReleased,
  needsYouAppOrigin: () => "https://app.example.test",
  needsYouStore: { read: mockRead },
  needsYouService: (...args: unknown[]) => { mockService(...args); return { decide: mockDecide, review: mockReview }; },
}));
vi.mock("@/app/workspace/business-details/native-website-facts", () => ({ createConfirmedNativeFactsEffect: () => "native-facts-effect" }));
vi.mock("@/lib/event-actions", () => ({ resolveEventAction: mockResolveEventAction }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: vi.fn(async () => ({ id: "gldf", siteName: "GLDF" })) }));
vi.mock("@/lib/tenant-urls", () => ({ getTenantDashboardUrl: () => "https://admin.gldf.example.test/dashboard" }));

const WS = "aaaaaaaa-0000-4000-8000-000000000001";
const ITEM = "aaaaaaaa-0000-4000-8000-0000000000b1";
const REV = "a".repeat(64);
const claims = { workspaceId: WS, itemId: ITEM, action: "approve" as const, recipient: "Owner@Example.test", revision: REV };

function item(over: Record<string, unknown> = {}) {
  return {
    id: ITEM, workspaceId: WS, title: "Reply to a new inquiry", approveEffect: "The reply sends.", notYetEffect: "Nothing sends.",
    revisionHash: REV, state: "open", signInRequired: false, openHref: null, expiresAt: new Date(Date.now() + 86_400_000).toISOString(), ...over,
  };
}

async function get(token: string) {
  const { GET } = await import("@/app/api/approve/route");
  return GET(new Request(`https://app.example.test/api/approve?token=${encodeURIComponent(token)}`));
}
async function post(token: string) {
  const { POST } = await import("@/app/api/approve/route");
  const body = new URLSearchParams({ token });
  return POST(new Request("https://app.example.test/api/approve", { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReleased.mockReturnValue(true);
  process.env.APPROVE_LINK_SECRET = "test-approve-secret";
  mockRead.mockResolvedValue(item());
  mockDecide.mockResolvedValue({ status: "done", item: item({ state: "approved" }) });
});
afterEach(() => vi.resetModules());

describe("workspace approve tokens", () => {
  it("bind workspace, item, action, recipient and revision, lowercasing the recipient", async () => {
    const { signWorkspaceApproveToken, verifyWorkspaceApproveToken } = await import("@/lib/approve-link");
    expect(verifyWorkspaceApproveToken(signWorkspaceApproveToken(claims))).toEqual({ ...claims, recipient: "owner@example.test" });
  });

  it("refuse tampering, expiry and malformed claims", async () => {
    const { signWorkspaceApproveToken, verifyWorkspaceApproveToken } = await import("@/lib/approve-link");
    const token = signWorkspaceApproveToken(claims);
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, "base64url").toString()), workspaceId: "aaaaaaaa-0000-4000-8000-000000000009" })).toString("base64url");
    expect(verifyWorkspaceApproveToken(`${forged}.${sig}`)).toBeNull();
    expect(verifyWorkspaceApproveToken(token, Date.now() + 15 * 86_400_000)).toBeNull();
    expect(() => signWorkspaceApproveToken({ ...claims, revision: "nope" })).not.toThrow();
    expect(verifyWorkspaceApproveToken(signWorkspaceApproveToken({ ...claims, revision: "nope" }))).toBeNull();
  });

  it("never verify as the other link kind", async () => {
    const { signApproveToken, signWorkspaceApproveToken, verifyApproveToken, verifyWorkspaceApproveToken, verifyAnyApproveToken } = await import("@/lib/approve-link");
    const tenantToken = signApproveToken({ eventId: "evt_1", tenantId: "gldf", action: "approve" });
    const workspaceToken = signWorkspaceApproveToken(claims);
    expect(verifyWorkspaceApproveToken(tenantToken)).toBeNull();
    expect(verifyApproveToken(workspaceToken)).toBeNull();
    expect(verifyAnyApproveToken(tenantToken)?.kind).toBe("tenant");
    expect(verifyAnyApproveToken(workspaceToken)?.kind).toBe("workspace");
  });
});

describe("GET with a workspace link (scanner-safe)", () => {
  it("offers a signed full website preview before confirming, while its release is on", async () => {
    for (const name of ["STRELVA_WORKSPACE_RELEASE", "STRELVA_OWNER_ENTRY", "STRELVA_NEEDS_YOU_RELEASE", "STRELVA_OWNER_DECISION_LINKS_RELEASE", "STRELVA_WEBSITE_REBUILD_RELEASE"]) vi.stubEnv(name, "1");
    try {
      const { signWorkspaceApproveToken } = await import("@/lib/approve-link");
      mockRead.mockResolvedValue(item({ sourceLifecycle: "website_document", title: "Review exact website copy" }));
      const token = signWorkspaceApproveToken(claims);
      const html = await (await get(token)).text();
      expect(html).toContain("Review the complete website preview before deciding");
      expect(html).toContain(`/api/owner-website-preview?token=${encodeURIComponent(token)}`);
      expect(mockDecide).not.toHaveBeenCalled();
      expect(mockResolveEventAction).not.toHaveBeenCalled();
      vi.stubEnv("STRELVA_OWNER_DECISION_LINKS_RELEASE", "0");
      expect(await (await get(token)).text()).not.toContain("/api/owner-website-preview");
    } finally { vi.unstubAllEnvs(); }
  });

  it("confirms without deciding", async () => {
    const { signWorkspaceApproveToken } = await import("@/lib/approve-link");
    const token = signWorkspaceApproveToken(claims);
    const res = await get(token);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain("Approve: Reply to a new inquiry");
    expect(html).toContain("The reply sends.");
    expect(html).toContain('method="POST"');
    expect(mockDecide).not.toHaveBeenCalled();
    expect(mockResolveEventAction).not.toHaveBeenCalled();
    expect(mockRead).toHaveBeenCalledWith(WS, ITEM);
  });

  it("shows agent attribution in a booking decision and resolves without a login", async () => {
    const { signWorkspaceApproveToken } = await import("@/lib/approve-link");
    const bookingItem = item({ title: "Booking request: Booked through Claude · Dana, Fri Nov 6 2:00 PM", approveEffect: "The booking is confirmed for this time. Booked through Claude.", sourceLifecycle: "booking_request" });
    mockRead.mockResolvedValue(bookingItem);
    mockDecide.mockResolvedValue({ status: "done", item: { ...bookingItem, state: "approved" } });
    const token = signWorkspaceApproveToken(claims);
    expect(await (await get(token)).text()).toContain("Booked through Claude");
    expect(mockDecide).not.toHaveBeenCalled();
    expect((await post(token)).status).toBe(200);
    expect(mockDecide).toHaveBeenCalledWith(expect.objectContaining({ by: { kind: "owner_link", recipient: "owner@example.test" } }));
  });

  it("says the item changed when the revision moved or it was superseded", async () => {
    const { signWorkspaceApproveToken } = await import("@/lib/approve-link");
    mockRead.mockResolvedValueOnce(item({ revisionHash: "b".repeat(64) }));
    expect(await (await get(signWorkspaceApproveToken(claims))).text()).toContain("This changed since we emailed you");
    mockRead.mockResolvedValueOnce(item({ state: "superseded" }));
    expect(await (await get(signWorkspaceApproveToken(claims))).text()).toContain("This changed since we emailed you");
  });

  it("offers no one-tap for access, money or exit", async () => {
    const { signWorkspaceApproveToken } = await import("@/lib/approve-link");
    mockRead.mockResolvedValueOnce(item({ signInRequired: true }));
    const html = await (await get(signWorkspaceApproveToken(claims))).text();
    expect(html).toContain("Sign in to decide this");
    expect(html).not.toContain('method="POST"');
  });

  it("refuses a link for an item in another business, and everything while the release is off", async () => {
    const { signWorkspaceApproveToken } = await import("@/lib/approve-link");
    mockRead.mockResolvedValueOnce(null);
    expect((await get(signWorkspaceApproveToken(claims))).status).toBe(400);
    mockReleased.mockReturnValue(false);
    expect((await get(signWorkspaceApproveToken(claims))).status).toBe(400);
    expect((await post(signWorkspaceApproveToken(claims))).status).toBe(400);
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it("shows every value a business-facts approval applies, and offers nothing when that review is gone (#509)", async () => {
    const { signWorkspaceApproveToken } = await import("@/lib/approve-link");
    const long = `${"Long owner copy. ".repeat(130)}<script>end</script>`;
    mockRead.mockResolvedValueOnce(item({ title: "Confirm changes to your business details", sourceLifecycle: "business_facts" }));
    mockReview.mockResolvedValueOnce([`Description: ${long}`, 'Service "Cleaning" Price: $99 → $999', "Phone: 716-555-0101 → 716-555-0199"]);
    const html = await (await get(signWorkspaceApproveToken(claims))).text();
    expect(html).toContain('Service &quot;Cleaning&quot; Price: $99 → $999');
    expect(html).toContain("Phone: 716-555-0101 → 716-555-0199");
    expect(html).toContain("Long owner copy. ".repeat(130).trim());
    expect(html).toContain("&lt;script&gt;end&lt;/script&gt;");
    expect(html).not.toContain("<script>end");
    expect(html).toContain('method="POST"');
    expect(mockReview).toHaveBeenCalledWith(expect.objectContaining({ id: ITEM, revisionHash: REV }));
    mockReview.mockResolvedValueOnce(null);
    const gone = await (await get(signWorkspaceApproveToken(claims))).text();
    expect(gone).toContain("This changed since we emailed you");
    expect(gone).not.toContain('method="POST"');
    expect(mockDecide).not.toHaveBeenCalled();
  });

  it("says already handled for a closed item", async () => {
    const { signWorkspaceApproveToken } = await import("@/lib/approve-link");
    mockRead.mockResolvedValueOnce(item({ state: "approved" }));
    expect(await (await get(signWorkspaceApproveToken(claims))).text()).toContain("Already handled");
  });
});

describe("POST with a workspace link", () => {
  it("decides as the emailed recipient with the bound revision", async () => {
    const { signWorkspaceApproveToken } = await import("@/lib/approve-link");
    const res = await post(signWorkspaceApproveToken({ ...claims, action: "not-yet" }));
    expect(res.status).toBe(200);
    expect(mockDecide).toHaveBeenCalledWith({ workspaceId: WS, itemId: ITEM, revision: REV, decision: "not_yet", by: { kind: "owner_link", recipient: "owner@example.test" } });
    expect(mockService).toHaveBeenCalledWith(expect.anything(), { businessFactsConfirmed: "native-facts-effect" });
    expect(await res.text()).toContain("Not yet");
  });

  it.each([
    ["already_handled", 200, "Already handled"],
    ["changed", 200, "This changed since we emailed you"],
    ["expired", 200, "This link expired"],
    ["sign_in", 200, "Sign in to decide this"],
    ["not_owner", 403, "This link isn't for this account"],
    ["failed", 200, "Could not finish this"],
    ["done_unverified", 200, "Confirmation is still pending"],
  ])("maps %s to an honest page", async (status, code, text) => {
    const { signWorkspaceApproveToken } = await import("@/lib/approve-link");
    mockDecide.mockResolvedValueOnce({ status, item: item() });
    const res = await post(signWorkspaceApproveToken(claims));
    expect(res.status).toBe(code);
    expect(await res.text()).toContain(text.replace("'", "&#39;"));
  });

  it("a failure after an accepted effect reports uncertainty without inviting a retry", async () => {
    const { signWorkspaceApproveToken } = await import("@/lib/approve-link");
    mockDecide.mockRejectedValueOnce(new Error("db down"));
    const html = await (await post(signWorkspaceApproveToken(claims))).text();
    expect(html).toContain("Strelva is checking the outcome");
    expect(html).toContain("The change may have gone through");
    expect(html).not.toContain("Nothing was done");
    expect(html).not.toContain('method="POST"');
  });

  it("leaves today's tenant review links on resolveEventAction", async () => {
    const { signApproveToken } = await import("@/lib/approve-link");
    mockResolveEventAction.mockResolvedValue({ changed: true });
    await post(signApproveToken({ eventId: "evt_1", tenantId: "gldf", action: "approve" }));
    expect(mockResolveEventAction).toHaveBeenCalledWith("gldf", "evt_1", "approved");
    expect(mockDecide).not.toHaveBeenCalled();
  });
});
