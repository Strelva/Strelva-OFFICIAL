import { beforeEach, describe, expect, it, vi } from "vitest";

const mockHeadersGet = vi.fn((key: string) => {
  if (key === "x-tenant") return "test-tenant";
  return null;
});
const mockGetPageConfig = vi.fn();
const mockGetDraftPageConfig = vi.fn();
const mockSetPageConfig = vi.fn();
const mockSetDraftPageConfig = vi.fn();
const mockClearDraftPageConfig = vi.fn();
const mockListDrafts = vi.fn();
const mockGetDraftContent = vi.fn();
const mockGetContent = vi.fn();
const mockSetContent = vi.fn();
const mockAppendVersion = vi.fn();
const mockRecordSectionUpdate = vi.fn();
const mockLogActivity = vi.fn();
const mockLogAuditEvent = vi.fn();
const mockClearDraft = vi.fn();
const mockAddEvent = vi.fn();
const mockRevalidateClientSite = vi.fn();

vi.mock("next/headers", () => ({
  headers: vi.fn(() =>
    Promise.resolve({
      get: mockHeadersGet,
    })
  ),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  verifyAuth: vi.fn(() => Promise.resolve(true)),
  requireTenantAccess: vi.fn(() => Promise.resolve(null)),
  requireTenantPermission: vi.fn(() => Promise.resolve(null)),
  getActorContext: vi.fn(() =>
    Promise.resolve({ isImpersonating: false, email: "owner@example.com" })
  ),
}));

vi.mock("@/lib/subscription", () => ({
  requireActiveSubscription: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/components/templates/registry", () => ({
  getTemplateForTenant: vi.fn(() =>
    Promise.resolve({
      id: "wellness",
      components: { hero: () => null, services: () => null, cta: () => null },
      contentSections: ["hero", "services"],
    })
  ),
}));

vi.mock("@/lib/storage", () => ({
  getPageConfig: (...args: unknown[]) => mockGetPageConfig(...args),
  getDraftPageConfig: (...args: unknown[]) => mockGetDraftPageConfig(...args),
  setPageConfig: (...args: unknown[]) => mockSetPageConfig(...args),
  setDraftPageConfig: (...args: unknown[]) => mockSetDraftPageConfig(...args),
  clearDraftPageConfig: (...args: unknown[]) => mockClearDraftPageConfig(...args),
  listDrafts: (...args: unknown[]) => mockListDrafts(...args),
  getDraftContent: (...args: unknown[]) => mockGetDraftContent(...args),
  getContent: (...args: unknown[]) => mockGetContent(...args),
  setContent: (...args: unknown[]) => mockSetContent(...args),
  appendVersion: (...args: unknown[]) => mockAppendVersion(...args),
  recordSectionUpdate: (...args: unknown[]) => mockRecordSectionUpdate(...args),
  logActivity: (...args: unknown[]) => mockLogActivity(...args),
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
  clearDraft: (...args: unknown[]) => mockClearDraft(...args),
}));

vi.mock("@/lib/revalidate-client", () => ({
  revalidateClientSite: (...args: unknown[]) => mockRevalidateClientSite(...args),
}));

vi.mock("@/lib/events", () => ({
  addEvent: (...args: unknown[]) => mockAddEvent(...args),
}));

const PAGE_CONFIG = {
  home: {
    sections: [
      { type: "hero", visible: true, order: 0, layout: { gap: "normal", padding: "normal" } },
    ],
  },
};

const HERO_DRAFT = {
  headline: "Draft headline",
  subheadline: "Draft subheadline",
  tagline: "Draft tagline",
  ctaText: "Book now",
  ctaLink: "/book",
  backgroundImageUrl: "",
};

describe("site editor publish routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPageConfig.mockResolvedValue({ home: { sections: [] } });
    mockGetDraftPageConfig.mockResolvedValue(null);
    mockSetPageConfig.mockResolvedValue(undefined);
    mockSetDraftPageConfig.mockResolvedValue(undefined);
    mockClearDraftPageConfig.mockResolvedValue(undefined);
    mockListDrafts.mockResolvedValue({});
    mockGetDraftContent.mockResolvedValue(null);
    mockGetContent.mockResolvedValue({ headline: "Live headline" });
    mockSetContent.mockResolvedValue(undefined);
    mockAppendVersion.mockResolvedValue(undefined);
    mockRecordSectionUpdate.mockResolvedValue(undefined);
    mockLogActivity.mockResolvedValue(undefined);
    mockLogAuditEvent.mockResolvedValue(undefined);
    mockClearDraft.mockResolvedValue(undefined);
    mockAddEvent.mockResolvedValue({ id: "evt_1" });
    mockRevalidateClientSite.mockResolvedValue({ success: true, skipped: true });
  });

  it("GET /api/page-config?draft=true returns the draft page config when present", async () => {
    mockGetDraftPageConfig.mockResolvedValue(PAGE_CONFIG);
    const { GET } = await import("@/app/api/page-config/route");

    const response = await GET(new Request("http://localhost/api/page-config?draft=true"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(PAGE_CONFIG);
    expect(mockGetDraftPageConfig).toHaveBeenCalledWith("test-tenant");
  }, 10000);

  it("PUT /api/page-config?draft=true saves a validated draft instead of live config", async () => {
    const { PUT } = await import("@/app/api/page-config/route");
    const request = new Request("http://localhost/api/page-config?draft=true", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(PAGE_CONFIG),
    });

    const response = await PUT(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, draft: true });
    expect(mockSetDraftPageConfig).toHaveBeenCalledWith(PAGE_CONFIG, "test-tenant");
    expect(mockSetPageConfig).not.toHaveBeenCalled();
  });

  it("POST /api/publish publishes all content drafts and the page-config draft", async () => {
    mockListDrafts.mockResolvedValue({ hero: true });
    mockGetDraftContent.mockResolvedValue(HERO_DRAFT);
    mockGetDraftPageConfig.mockResolvedValue(PAGE_CONFIG);
    mockRevalidateClientSite.mockResolvedValue({ success: true });
    const { POST } = await import("@/app/api/publish/route");

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      publishedSections: ["hero"],
      publishedPageConfig: true,
      liveSite: { status: "revalidated" },
    });
    expect(mockSetContent).toHaveBeenCalledWith("hero", HERO_DRAFT, "test-tenant");
    expect(mockClearDraft).toHaveBeenCalledWith("hero", "test-tenant");
    expect(mockSetPageConfig).toHaveBeenCalledWith(PAGE_CONFIG, "test-tenant");
    expect(mockClearDraftPageConfig).toHaveBeenCalledWith("test-tenant");
    expect(mockRevalidateClientSite).toHaveBeenCalledWith("test-tenant", ["/"]);
  });

  it("POST /api/publish reports when publishing only updates Scaffold content", async () => {
    mockRevalidateClientSite.mockResolvedValue({ success: true, skipped: true });
    const { POST } = await import("@/app/api/publish/route");

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      publishedSections: [],
      publishedPageConfig: false,
      liveSite: { status: "not_configured" },
    });
  });

  it("DELETE /api/publish discards content drafts and the page-config draft", async () => {
    mockListDrafts.mockResolvedValue({ hero: true, services: true });
    mockGetDraftPageConfig.mockResolvedValue(PAGE_CONFIG);
    const { DELETE } = await import("@/app/api/publish/route");

    const response = await DELETE();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      discardedSections: ["hero", "services"],
      discardedPageConfig: true,
    });
    expect(mockClearDraft).toHaveBeenCalledWith("hero", "test-tenant");
    expect(mockClearDraft).toHaveBeenCalledWith("services", "test-tenant");
    expect(mockClearDraftPageConfig).toHaveBeenCalledWith("test-tenant");
    expect(mockLogAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "site_editor.drafts_discarded",
        metadata: {
          sections: ["hero", "services"],
          pageConfig: true,
        },
      })
    );
  });

  it("POST /api/change-requests creates a pending admin-routed request", async () => {
    const { POST } = await import("@/app/api/change-requests/route");
    const request = new Request("http://localhost/api/change-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: "Change the hero animation",
        requestKind: "template",
        page: "home",
        section: "hero",
        field: "headline",
        label: "Hero headline",
        nodeType: "text",
      }),
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(mockAddEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "test-tenant",
        source: "website",
        type: "change_request",
        status: "pending",
        body: "Change the hero animation",
        title: "Requested template change: Hero headline",
        metadata: expect.objectContaining({
          requestKind: "template",
        }),
      })
    );
  });
});
