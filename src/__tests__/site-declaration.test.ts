import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readSiteDeclaration, refreshSiteDeclaration, sameCommit, verifySiteRelease, type DeclaredTenant, type SiteDeclarationPorts } from "@/products/websites/site-declaration";

const FULL = "0123456789abcdef0123456789abcdef01234567";
const URL = "https://client.example/api/reb-capabilities";
const reply = (body: unknown, status = 200) => vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response);
const manifest = (extra: { contentSource?: "strelva" | "repo"; commitSha?: string | null } = {}) => ({ valid: true, ...extra });

/** Ports with a manifest parser that reads the two declarations from `{ valid, contentSource, commitSha }`. */
function ports(customRepo: DeclaredTenant["customRepo"], body: unknown, status = 200, extra: Partial<SiteDeclarationPorts> = {}) {
  const fetch = reply(body, status);
  const value = {
    tenantConfig: vi.fn(async () => ({ id: "t1", customRepo })),
    parseManifest: vi.fn((raw: unknown) => {
      const m = raw as { valid?: boolean; contentSource?: "strelva" | "repo"; commitSha?: string | null };
      return m.valid ? { contentSource: m.contentSource ?? null, commitSha: m.commitSha ?? null } : null;
    }),
    persist: vi.fn(async () => ({})),
    audit: vi.fn(async () => ({})),
    revalidate: vi.fn(async () => ({ success: true })),
    sleep: vi.fn(async () => {}),
    fetch,
    ...extra,
  } satisfies SiteDeclarationPorts;
  return value;
}

beforeEach(() => { vi.stubEnv("NODE_ENV", "production"); });
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
    const none = ports({}, manifest());
    expect((await readSiteDeclaration("t1", none)).reachable).toBe(false);
    const unsafe = ports({ capabilityManifestUrl: "http://10.0.0.1/cap" }, manifest());
    expect((await readSiteDeclaration("t1", unsafe)).reachable).toBe(false);
    expect(none.fetch).not.toHaveBeenCalled();
    expect(unsafe.fetch).not.toHaveBeenCalled();
  });

  it("does not follow redirects and treats a 3xx or an invalid manifest as unreached", async () => {
    const redirect = ports({ capabilityManifestUrl: URL }, {}, 302);
    expect((await readSiteDeclaration("t1", redirect)).reachable).toBe(false);
    expect(redirect.fetch).toHaveBeenCalledWith(URL, expect.objectContaining({ redirect: "manual", cache: "no-store" }));
    expect((await readSiteDeclaration("t1", ports({ capabilityManifestUrl: URL }, { valid: false }))).reachable).toBe(false);
  });

  it("reads the declared source and live commit", async () => {
    const p = ports({ capabilityManifestUrl: URL }, manifest({ contentSource: "strelva", commitSha: FULL.toUpperCase() }));
    expect(await readSiteDeclaration("t1", p)).toEqual({ reachable: true, contentSource: "strelva", liveCommit: FULL });
  });
});

describe("verifySiteRelease", () => {
  it("is not_checked, with no fetch, when the site has no manifest URL", async () => {
    const p = ports({}, manifest());
    const result = await verifySiteRelease("t1", FULL, p);
    expect(result.readBack).toBe("not_checked");
    expect(p.fetch).not.toHaveBeenCalled();
  });

  it("confirms when the live commit matches by prefix, after refreshing the site", async () => {
    const p = ports({ capabilityManifestUrl: URL }, manifest({ commitSha: FULL.slice(0, 7) }));
    const result = await verifySiteRelease("t1", FULL, p);
    expect(result).toMatchObject({ readBack: "confirmed", revalidated: true });
    expect(p.revalidate).toHaveBeenCalledWith("t1");
    expect(p.sleep).not.toHaveBeenCalled();
  });

  it("retries twice while a different commit is live, then does not confirm", async () => {
    const p = ports({ capabilityManifestUrl: URL }, manifest({ commitSha: "fffffff" }));
    expect((await verifySiteRelease("t1", FULL, p)).readBack).toBe("not_confirmed");
    expect(p.sleep).toHaveBeenCalledTimes(2);
    expect(p.fetch).toHaveBeenCalledTimes(3);
  });

  it("does not confirm an unreachable site and does not check a site that declares no commit", async () => {
    expect((await verifySiteRelease("t1", FULL, ports({ capabilityManifestUrl: URL }, {}, 302))).readBack).toBe("not_confirmed");
    expect((await verifySiteRelease("t1", FULL, ports({ capabilityManifestUrl: URL }, manifest()))).readBack).toBe("not_checked");
  });

  it("never throws when revalidation fails", async () => {
    const p = ports({ capabilityManifestUrl: URL }, manifest({ commitSha: FULL }), 200, { revalidate: vi.fn(async () => { throw new Error("down"); }) });
    await expect(verifySiteRelease("t1", FULL, p)).resolves.toMatchObject({ readBack: "confirmed", revalidated: false });
  });

  it("persists a changed declared content source once, and records who/what changed it", async () => {
    const p = ports({ capabilityManifestUrl: URL, contentSource: "repo" }, manifest({ contentSource: "strelva", commitSha: FULL }));
    await verifySiteRelease("t1", FULL, p);
    expect(p.persist).toHaveBeenCalledTimes(1);
    expect(p.persist).toHaveBeenCalledWith("t1", { contentSource: "strelva", declarationCheckedAt: expect.any(String) });
    expect(p.audit).toHaveBeenCalledWith({ tenantId: "t1", from: "repo", to: "strelva" });
  });

  it("does not persist when the site declares nothing or the same source", async () => {
    const none = ports({ capabilityManifestUrl: URL, contentSource: "strelva" }, manifest());
    await refreshSiteDeclaration("t1", none);
    const same = ports({ capabilityManifestUrl: URL, contentSource: "strelva" }, manifest({ contentSource: "strelva" }));
    await refreshSiteDeclaration("t1", same);
    expect(none.persist).not.toHaveBeenCalled();
    expect(same.persist).not.toHaveBeenCalled();
  });
});
