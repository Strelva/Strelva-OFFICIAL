import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/tenants", () => ({ getTenantConfig: mocks.get, updateTenant: mocks.update }));
vi.mock("@/lib/revalidate-client", () => ({ revalidateClientSite: mocks.revalidate }));
vi.mock("@/lib/storage", () => ({ logAuditEvent: mocks.audit }));

import { siteDeclarationPorts } from "@/app/api/_site-declaration";

const FULL = "0123456789abcdef0123456789abcdef01234567";
const manifest = (extra: Record<string, unknown> = {}) => ({ contractVersion: "v1", sections: {}, designTokens: [], supportsPageConfig: true, supportsNavigationConfig: false, supportsFooterConfig: false, supportsDraftPreview: false, supportsInlineEditing: false, customOnlyFeatures: [], customComponents: [], ...extra });

describe("site declaration ports at the app edge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads the two declarations through the control plane's manifest schema", () => {
    const { parseManifest } = siteDeclarationPorts();
    expect(parseManifest(manifest({ contentSource: "strelva", release: { commitSha: FULL } }))).toEqual({ contentSource: "strelva", commitSha: FULL });
    expect(parseManifest(manifest())).toEqual({ contentSource: null, commitSha: null });
    expect(parseManifest({ not: "a manifest" })).toBeNull();
    expect(parseManifest(manifest({ release: { commitSha: "nope" } }))).toBeNull();
  });

  it("merges a declaration into the tenant's customRepo without losing the manifest URL", async () => {
    mocks.get.mockResolvedValue({ id: "t1", customRepo: { capabilityManifestUrl: "https://x.example/cap", repoUrl: "https://github.com/x/y" } });
    await siteDeclarationPorts().persist("t1", { contentSource: "strelva", declarationCheckedAt: "2026-10-15T12:00:00Z" });
    expect(mocks.update).toHaveBeenCalledWith("t1", { customRepo: { capabilityManifestUrl: "https://x.example/cap", repoUrl: "https://github.com/x/y", contentSource: "strelva", declarationCheckedAt: "2026-10-15T12:00:00Z" } });
  });

  it("writes a system-actor audit row, and revalidates everything", async () => {
    await siteDeclarationPorts().audit({ tenantId: "t1", from: null, to: "strelva" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ tenant: "t1", action: "tenant.content-source.declared", actor: { userId: null, email: null, type: "system", isSuperAdmin: false }, metadata: { from: null, to: "strelva" } }));
    await siteDeclarationPorts().revalidate("t1");
    expect(mocks.revalidate).toHaveBeenCalledWith("t1", "all");
  });
});
