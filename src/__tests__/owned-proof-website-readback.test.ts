import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
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
  it.each([["a".repeat(64), "healthy"], ["b".repeat(64), "hash_mismatch"], ["", "hash_missing"]])("checks the actual HTTP Host and returned hash %s as %s", async (hash, status) => {
    let observed: IncomingMessage | undefined;
    await withOwnedServer((request, response, sites) => {
      observed = request;
      if (request.headers.host !== sites.host) { response.writeHead(404); response.end(); return; }
      response.setHeader("content-type", "text/html");
      response.end(`<html><head><meta name="strelva-site-hash" content="${hash}"></head></html>`);
    }, async ownedTarget => {
      const result = await checkWebsiteHealth({ ...ownedTarget, workspaceId: "owned-proof", workId: "native-work", revision: 2, contentHash: "a".repeat(64) });
      expect(observed?.headers.host).toBe(new URL(ownedTarget.url).host);
      expect(observed?.url).toBe("/sites/fictional-bakery");
      expect(observed?.headers.cookie).toBeUndefined();
      expect(observed?.headers.authorization).toBeUndefined();
      expect(observed?.headers["x-forwarded-host"]).toBeUndefined();
      expect(result.status).toBe(status);
      expect(result.url).toBe(ownedTarget.url);
    });
  });
  it.each(["redirect", "oversized", "non-HTML"])("fails the actual HTTP %s response without following a redirect", async kind => {
    let requests = 0;
    await withOwnedServer((_request, response) => {
      requests++;
      if (kind === "redirect") { response.writeHead(302, { location: "/api/private" }); response.end(); }
      else { response.setHeader("content-type", kind === "non-HTML" ? "application/json" : "text/html"); response.end(kind === "oversized" ? "x".repeat(2_000_001) : "{}"); }
    }, async ownedTarget => {
      expect(await fetchOwnedProofWebsite(ownedTarget)).toBeNull();
      expect(requests).toBe(1);
    });
  });
  it("fails an incomplete HTTP response", async () => {
    await withOwnedServer((_request, response) => {
      response.setHeader("content-type", "text/html"); response.write("<html>"); response.destroy();
    }, async ownedTarget => { expect(await fetchOwnedProofWebsite(ownedTarget)).toBeNull(); });
  });
  it("aborts a stalled HTTP read with the unchanged eight-second total deadline", async () => {
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    const deadline = vi.spyOn(AbortSignal, "timeout").mockImplementation(() => timeout(25));
    try {
      await withOwnedServer((_request, response) => {
        response.setHeader("content-type", "text/html"); response.write("<html>");
      }, async ownedTarget => { expect(await fetchOwnedProofWebsite(ownedTarget)).toBeNull(); });
      expect(deadline).toHaveBeenCalledWith(8000);
    } finally { deadline.mockRestore(); }
  });
  it("refuses redirects, oversized bodies and non-HTML responses", async () => {
    for (const response of [new Response(null, { status: 302, headers: { location: "http://localhost:3456/api/private" } }), new Response("x".repeat(2_000_001), { headers: { "content-type": "text/html" } }), new Response("{}", { headers: { "content-type": "application/json" } })]) {
      const read = vi.fn<typeof fetch>(async () => response);
      expect(await fetchOwnedProofWebsite(target, read)).toBeNull(); expect(read).toHaveBeenCalledTimes(1);
    }
  });
});

async function withOwnedServer(
  serve: (request: IncomingMessage, response: ServerResponse, sites: URL) => void,
  check: (target: { tenantId: string; url: string }) => Promise<void>,
) {
  const server = createServer((request, response) => serve(request, response, sites));
  await new Promise<void>(resolve => server.listen(0, "localhost", resolve));
  const port = (server.address() as AddressInfo).port;
  const sites = new URL(`http://sites.localhost:${port}`);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", `http://localhost:${port}`);
  vi.stubEnv("NEXT_PUBLIC_SITES_PATH_ORIGIN", sites.origin);
  try { await check({ tenantId: "fictional-bakery", url: `${sites.origin}/sites/fictional-bakery/` }); }
  finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}
