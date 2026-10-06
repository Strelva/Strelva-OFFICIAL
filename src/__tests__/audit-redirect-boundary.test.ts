import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Audit finding 3 (2026-10-05): the anonymous audit followed redirects
 * automatically, so an external site could bounce the reader into an internal
 * address. One network log records every URL any transport opened.
 */
const net = vi.hoisted(() => ({ requested: [] as string[], lookups: [] as unknown[], dns: {} as Record<string, string>, routes: {} as Record<string, { status: number; location?: string; body?: string; type?: string }> }));
vi.mock("node:dns", () => ({ promises: { lookup: async (hostname: string) => { const address = net.dns[hostname]; if (!address) throw new Error(`ENOTFOUND ${hostname}`); return { address, family: 4 }; } } }));
function transport() {
  return { request: (url: URL, options: { lookup: (host: string, opts: unknown, cb: (...args: unknown[]) => void) => void }, onResponse: (response: unknown) => void) => {
    net.requested.push(url.href); net.lookups.push(options.lookup);
    const route = net.routes[url.href] ?? { status: 404, body: "missing" };
    const request = Object.assign(new EventEmitter(), {
      end() { queueMicrotask(() => {
        const response = Object.assign(new EventEmitter(), { statusCode: route.status, headers: { ...(route.location ? { location: route.location } : {}), "content-type": route.type ?? "text/html" }, resume() {} });
        onResponse(response);
        if (!route.location) { if (route.body) response.emit("data", Buffer.from(route.body)); response.emit("end"); }
        request.emit("close");
      }); },
      destroy(error?: Error) { if (error) request.emit("error", error); request.emit("close"); return request; },
    });
    return request;
  } };
}
vi.mock("node:http", () => transport());
vi.mock("node:https", () => transport());
/** Behaves like undici: follows redirects automatically and records every hop. */
vi.stubGlobal("fetch", async (input: string) => {
  let url = input;
  for (let hop = 0; hop < 5; hop += 1) {
    net.requested.push(url);
    const route = net.routes[url] ?? { status: 404, body: "missing" };
    if (route.location) { url = new URL(route.location, url).href; continue; }
    const response = new Response(route.body ?? "", { status: route.status, headers: { "content-type": route.type ?? "text/html" } });
    Object.defineProperty(response, "url", { value: url });
    return response;
  }
  throw new Error("too many redirects");
});

import { runAuditSnapshot } from "@/lib/audit/checks";

beforeEach(() => {
  net.requested.length = 0; net.lookups.length = 0;
  net.dns = { "public.example": "93.184.216.34", "metadata.internal": "169.254.169.254" };
  net.routes = { "https://public.example/": { status: 200, body: "<html><head><title>Public</title></head><body>Hello</body></html>" } };
  delete process.env.GOOGLE_PAGESPEED_API_KEY; delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
});

describe("audit redirect boundary", () => {
  it("refuses a homepage redirect into an internal address before requesting it", async () => {
    net.routes["https://public.example/"] = { status: 302, location: "http://metadata.internal/latest/meta-data/" };
    net.routes["http://public.example/"] = { status: 302, location: "http://metadata.internal/latest/meta-data/" };
    net.routes["http://metadata.internal/latest/meta-data/"] = { status: 200, body: "<html>secret</html>" };
    await expect(runAuditSnapshot("https://public.example/")).rejects.toThrow(/Blocked: resolved to private IP/);
    expect(net.requested.some(url => url.includes("metadata.internal"))).toBe(false);
  });

  it("does not follow a well-known file redirect into an internal address", async () => {
    net.routes["https://public.example/robots.txt"] = { status: 302, location: "http://metadata.internal/robots.txt" };
    net.routes["http://metadata.internal/robots.txt"] = { status: 200, body: "internal-secret", type: "text/plain" };
    const snapshot = await runAuditSnapshot("https://public.example/");
    expect(snapshot.fetchOk).toBe(true);
    expect(net.requested.some(url => url.includes("metadata.internal"))).toBe(false);
    expect(JSON.stringify(snapshot.categories)).not.toContain("internal-secret");
  });

  it("still follows a validated public redirect and pins every hop, including all:true lookups", async () => {
    net.dns["www.public.example"] = "93.184.216.35";
    net.routes["https://public.example/"] = { status: 301, location: "https://www.public.example/" };
    net.routes["https://www.public.example/"] = { status: 200, body: "<html><head><title>Moved</title></head><body>Hi</body></html>" };
    const snapshot = await runAuditSnapshot("https://public.example/");
    expect(snapshot.fetchedUrl).toBe("https://www.public.example/");
    expect(net.lookups.length).toBeGreaterThan(0);
    const all = vi.fn(); (net.lookups[1] as (host: string, opts: unknown, cb: (...args: unknown[]) => void) => void)("www.public.example", { all: true }, all);
    expect(all).toHaveBeenCalledWith(null, [{ address: "93.184.216.35", family: 4 }]);
  });
});
