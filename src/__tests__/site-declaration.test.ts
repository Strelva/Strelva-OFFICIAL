import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/tenants", () => ({ getTenantConfig: vi.fn(), updateTenant: vi.fn() }));
vi.mock("@/lib/revalidate-client", () => ({ revalidateClientSite: vi.fn(async () => ({ success: true })) }));
const audit = vi.hoisted(() => vi.fn(async () => ({})));
vi.mock("@/lib/storage", () => ({ logAuditEvent: audit }));

import { readSiteDeclaration, refreshSiteDeclaration, sameCommit, verifySiteRelease } from "@/products/websites/site-declaration";

const FULL = "0123456789abcdef0123456789abcdef01234567";
const URL = "https://client.example/api/reb-capabilities";
const manifest = (extra: Record<string, unknown>) => ({ contractVersion: "v1", sections: {}, designTokens: [], supportsPageConfig: true, supportsNavigationConfig: false, supportsFooterConfig: false, supportsDraftPreview: false, supportsInlineEditing: false, customOnlyFeatures: [], customComponents: [], ...extra });
const reply = (body: unknown, status = 200) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response);
const tenant = (customRepo: Record<string, unknown> = { capabilityManifestUrl: URL }) => async () => ({ id: "t1", customRepo });

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("NODE_ENV", "production"); });
afterEach(() => vi.unstubAllEnvs());

describe("sameCommit", () => {
  it("matches a short sha against a full one, case-insensitively", () => {
    expect(sameCommit(FULL.slice(0, 7), FULL)).toBe(true);
    expect(sameCommit(FULL.toUpperCase(), FULL.slice(0, 12))).toBe(true);
    expect(sameCommit("abcdef1", FULL)).toBe(false);
    expect(sameCommit("abc", "abc")).toBe(false);
    expect(sameCommit(null, FULL)).toBe(false);
  });
});

describe("readSiteDeclaration", () => {
  it("does not fetch without a manifest URL or for an unsafe one", async () => {
    const fetch = reply(manifest({}));
    expect((await readSiteDeclaration("t1", { tenantConfig: tenant({}), fetch })).reachable).toBe(false);
    expect((await readSiteDeclaration("t1", { tenantConfig: tenant({ capabilityManifestUrl: "http://10.0.0.1/cap" }), fetch })).reachable).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not follow redirects and treats a 3xx as unreached", async () => {
    const fetch = reply({}, 302);
    expect((await readSiteDeclaration("t1", { tenantConfig: tenant(), fetch })).reachable).toBe(false);
    expect(fetch).toHaveBeenCalledWith(URL, expect.objectContaining({ redirect: "manual", cache: "no-store" }));
  });

  it("reads the declared source and live commit", async () => {
    const fetch = reply(manifest({ contentSource: "strelva", release: { commitSha: FULL.toUpperCase() } }));
    expect(await readSiteDeclaration("t1", { tenantConfig: tenant(), fetch })).toEqual({ reachable: true, contentSource: "strelva", liveCommit: FULL });
  });
});

describe("verifySiteRelease", () => {
  const deps = (fetch: ReturnType<typeof reply>, extra: Record<string, unknown> = {}) => ({ tenantConfig: tenant(), fetch, revalidate: vi.fn(async () => ({ success: true })), sleep: vi.fn(async () => {}), persist: vi.fn(async () => ({})), ...extra });

  it("is not_checked, with no fetch, when the site has no manifest URL", async () => {
    const fetch = reply(manifest({}));
    const result = await verifySiteRelease("t1", FULL, deps(fetch, { tenantConfig: tenant({}) }));
    expect(result.readBack).toBe("not_checked");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("confirms when the live commit matches by prefix", async () => {
    const d = deps(reply(manifest({ release: { commitSha: FULL.slice(0, 7) } })));
    const result = await verifySiteRelease("t1", FULL, d);
    expect(result).toMatchObject({ readBack: "confirmed", revalidated: true });
    expect(d.revalidate).toHaveBeenCalledWith("t1", "all");
    expect(d.sleep).not.toHaveBeenCalled();
  });

  it("retries twice while a different commit is live, then does not confirm", async () => {
    const d = deps(reply(manifest({ release: { commitSha: "fffffff" } })));
    const result = await verifySiteRelease("t1", FULL, d);
    expect(result.readBack).toBe("not_confirmed");
    expect(d.sleep).toHaveBeenCalledTimes(2);
    expect(d.fetch).toHaveBeenCalledTimes(3);
  });

  it("does not confirm an unreachable site and does not check a site that declares no commit", async () => {
    expect((await verifySiteRelease("t1", FULL, deps(reply({}, 302)))).readBack).toBe("not_confirmed");
    expect((await verifySiteRelease("t1", FULL, deps(reply(manifest({}))))).readBack).toBe("not_checked");
  });

  it("never throws when revalidation fails", async () => {
    const d = deps(reply(manifest({ release: { commitSha: FULL } })), { revalidate: vi.fn(async () => { throw new Error("down"); }) });
    await expect(verifySiteRelease("t1", FULL, d)).resolves.toMatchObject({ readBack: "confirmed", revalidated: false });
  });

  it("persists a changed declared content source once, keeping the manifest URL", async () => {
    const d = deps(reply(manifest({ contentSource: "strelva", release: { commitSha: FULL } })), { tenantConfig: tenant({ capabilityManifestUrl: URL, contentSource: "repo" }) });
    await verifySiteRelease("t1", FULL, d);
    expect(d.persist).toHaveBeenCalledTimes(1);
    expect(d.persist).toHaveBeenCalledWith("t1", expect.objectContaining({ capabilityManifestUrl: URL, contentSource: "strelva", declarationCheckedAt: expect.any(String) }));
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "tenant.content-source.declared", metadata: { from: "repo", to: "strelva" } }));
  });

  it("does not persist when the site declares nothing or the same source", async () => {
    const none = deps(reply(manifest({})), { tenantConfig: tenant({ capabilityManifestUrl: URL, contentSource: "strelva" }) });
    await refreshSiteDeclaration("t1", none);
    const same = deps(reply(manifest({ contentSource: "strelva" })), { tenantConfig: tenant({ capabilityManifestUrl: URL, contentSource: "strelva" }) });
    await refreshSiteDeclaration("t1", same);
    expect(none.persist).not.toHaveBeenCalled();
    expect(same.persist).not.toHaveBeenCalled();
  });
});
