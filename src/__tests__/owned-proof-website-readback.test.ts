import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchOwnedProofWebsite } from "@/products/websites/owned-proof-readback";
import { checkWebsiteHealth } from "@/products/websites/site-health";

const target = { tenantId: "fictional-bakery", url: "http://sites.localhost:3456/sites/fictional-bakery/" };
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "test"); vi.stubEnv("STRELVA_LOCAL_AUTH_PROOF", "1"); vi.stubEnv("STRELVA_FULL_MODEL_PROFILE", "full-native");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3456"); vi.stubEnv("NEXT_PUBLIC_SITES_PATH_ORIGIN", "http://sites.localhost:3456");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("owned native website HTTP read-back boundary", () => {
  it("reads only the real sites route on the owned app socket, without credentials or redirect following", async () => {
    const read = vi.fn<typeof fetch>(async () => new Response("<html>actual response</html>", { headers: { "content-type": "text/html; charset=utf-8" } }));
    expect(await fetchOwnedProofWebsite(target, read)).toBe("<html>actual response</html>");
    const [url, options] = read.mock.calls[0]!;
    expect(String(url)).toBe("http://localhost:3456/sites/fictional-bakery");
    expect(options).toMatchObject({ method: "GET", headers: { host: "sites.localhost:3456" }, credentials: "omit", redirect: "manual" });
    expect(options!.signal).toBeInstanceOf(AbortSignal);
  });
  it.each([["NODE_ENV", "production"], ["STRELVA_LOCAL_AUTH_PROOF", "0"], ["STRELVA_FULL_MODEL_PROFILE", "full-dark"], ["NEXT_PUBLIC_APP_URL", "http://localhost:4567"], ["NEXT_PUBLIC_APP_URL", "http://127.0.0.1:3456"], ["NEXT_PUBLIC_APP_URL", "http://localhost:3456/api/private"], ["NEXT_PUBLIC_SITES_PATH_ORIGIN", "http://localhost:3456"]])("has no local transport when %s is %s", async (key, value) => {
    vi.stubEnv(key, value); const read = vi.fn<typeof fetch>();
    expect(await fetchOwnedProofWebsite(target, read)).toBeUndefined(); expect(read).not.toHaveBeenCalled();
  });
  it.each(["http://sites.localhost:3456/api/workspace", "http://sites.localhost:3456/sites/another-tenant/", "http://sites.localhost:3456/sites/fictional-bakery/?next=/api/private", "http://user:password@sites.localhost:3456/sites/fictional-bakery/", "http://sites.localhost:4567/sites/fictional-bakery/", "http://127.0.0.1:3456/sites/fictional-bakery/"])("never follows arbitrary or mismatched destination %s", async url => {
    const read = vi.fn<typeof fetch>(); expect(await fetchOwnedProofWebsite({ ...target, url }, read)).toBeUndefined(); expect(read).not.toHaveBeenCalled();
  });
  it.each([["a".repeat(64), "healthy"], ["b".repeat(64), "hash_mismatch"], ["", "hash_missing"]])("checks the actual returned hash %s as %s", async (hash, status) => {
    const read = vi.fn<typeof fetch>(async () => new Response(`<html><head><meta name="strelva-site-hash" content="${hash}"></head></html>`, { headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", read);
    const result = await checkWebsiteHealth({ ...target, workspaceId: "owned-proof", workId: "native-work", revision: 2, contentHash: "a".repeat(64) });
    expect(result.status).toBe(status); expect(read).toHaveBeenCalledTimes(1);
    expect(String(read.mock.calls[0]![0])).toBe("http://localhost:3456/sites/fictional-bakery");
    expect(result.url).toBe(target.url);
  });
  it("refuses redirects, oversized bodies and non-HTML responses", async () => {
    for (const response of [new Response(null, { status: 302, headers: { location: "http://localhost:3456/api/private" } }), new Response("x".repeat(2_000_001), { headers: { "content-type": "text/html" } }), new Response("{}", { headers: { "content-type": "application/json" } })]) {
      const read = vi.fn<typeof fetch>(async () => response);
      expect(await fetchOwnedProofWebsite(target, read)).toBeNull(); expect(read).toHaveBeenCalledTimes(1);
    }
  });
});
