import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

/**
 * Regression tests for the cross-tenant IDOR fix: GET /api/content/[section]
 * and GET /api/page-config must enforce requireTenantAccess (like their
 * PUT/DELETE siblings) so a logged-in user of one tenant cannot read another
 * tenant's content / unpublished drafts. We assert the denied response is
 * returned AND that the data-reading functions are never called when denied.
 */

const mockRequireTenantAccess = vi.fn<(t: string) => Promise<Response | null>>();

vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve({ get: (k: string) => (k === "x-tenant" ? "tenant-a" : null) }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/tenant", () => ({
  requireTenantFromHeaders: () => Promise.resolve("tenant-a"),
  getTenantFromHeaders: () => Promise.resolve("tenant-a"),
}));

vi.mock("@/lib/auth", () => ({
  requireTenantAccess: (t: string) => mockRequireTenantAccess(t),
  requireTenantPermission: () => Promise.resolve(null),
  verifyAuth: () => Promise.resolve(true),
  getActorContext: () => Promise.resolve({ email: "owner@example.com" }),
  isSuperAdmin: () => Promise.resolve(false),
}));

const mockGetContent = vi.fn(() => Promise.resolve({ headline: "tenant-a secret" }));
const mockGetDraftContent = vi.fn(() =>
  Promise.resolve({ headline: "tenant-a draft secret" })
);
const mockGetPageConfig = vi.fn(() => Promise.resolve({ home: { sections: [] } }));
const mockGetDraftPageConfig = vi.fn(() =>
  Promise.resolve({ home: { sections: ["draft-secret"] } })
);

vi.mock("@/lib/storage", () => ({
  getContent: (...a: unknown[]) => mockGetContent(...(a as [])),
  getDraftContent: (...a: unknown[]) => mockGetDraftContent(...(a as [])),
  getPageConfig: (...a: unknown[]) => mockGetPageConfig(...(a as [])),
  getDraftPageConfig: (...a: unknown[]) => mockGetDraftPageConfig(...(a as [])),
  setContent: vi.fn(),
  recordSectionUpdate: vi.fn(),
  logActivity: vi.fn(),
  logAuditEvent: vi.fn(),
  setDraftContent: vi.fn(),
  clearDraft: vi.fn(),
  appendVersion: vi.fn(),
  clearDraftPageConfig: vi.fn(),
  setDraftPageConfig: vi.fn(),
  setPageConfig: vi.fn(),
}));

vi.mock("@/components/templates/registry", () => ({
  getTemplateForTenant: () => Promise.resolve({ contentSections: ["hero"] }),
}));

vi.mock("@/lib/revalidate-client", () => ({ revalidateClientSite: vi.fn() }));
vi.mock("@/lib/content-revalidation", () => ({
  clientRevalidationTargetForSections: vi.fn(() => []),
}));
vi.mock("@/lib/verify-live", () => ({ scheduleVerification: vi.fn() }));
vi.mock("@/lib/subscription", () => ({
  requireActiveSubscription: () => Promise.resolve(null),
}));

const DENIED = () => NextResponse.json({ error: "Forbidden" }, { status: 403 });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("content GET cross-tenant access", () => {
  it("returns the denied response and never reads content when access is denied", async () => {
    mockRequireTenantAccess.mockResolvedValue(DENIED());
    const { GET } = await import("@/app/api/content/[section]/route");
    const res = await GET(new Request("http://localhost/api/content/hero?draft=true"), {
      params: Promise.resolve({ section: "hero" }),
    });
    expect(res.status).toBe(403);
    expect(mockGetContent).not.toHaveBeenCalled();
    expect(mockGetDraftContent).not.toHaveBeenCalled();
  });

  it("returns content when access is allowed", async () => {
    mockRequireTenantAccess.mockResolvedValue(null);
    const { GET } = await import("@/app/api/content/[section]/route");
    const res = await GET(new Request("http://localhost/api/content/hero"), {
      params: Promise.resolve({ section: "hero" }),
    });
    expect(res.status).toBe(200);
    expect(mockGetContent).toHaveBeenCalled();
  });
});

describe("page-config GET cross-tenant access", () => {
  it("returns the denied response and never reads config when access is denied", async () => {
    mockRequireTenantAccess.mockResolvedValue(DENIED());
    const { GET } = await import("@/app/api/page-config/route");
    const res = await GET(new Request("http://localhost/api/page-config"));
    expect(res.status).toBe(403);
    expect(mockGetPageConfig).not.toHaveBeenCalled();
  });

  it("never leaks drafts cross-tenant on ?draft=true when denied", async () => {
    mockRequireTenantAccess.mockResolvedValue(DENIED());
    const { GET } = await import("@/app/api/page-config/route");
    const res = await GET(new Request("http://localhost/api/page-config?draft=true"));
    expect(res.status).toBe(403);
    expect(mockGetDraftPageConfig).not.toHaveBeenCalled();
  });

  it("returns config when access is allowed", async () => {
    mockRequireTenantAccess.mockResolvedValue(null);
    const { GET } = await import("@/app/api/page-config/route");
    const res = await GET(new Request("http://localhost/api/page-config"));
    expect(res.status).toBe(200);
    expect(mockGetPageConfig).toHaveBeenCalled();
  });
});
