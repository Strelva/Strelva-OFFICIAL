import * as http from "node:http";
import * as https from "node:https";
import { pinnedRequestOptions } from "@/lib/pinned-lookup";

const REDIRECTS = new Set([301, 302, 303, 307, 308]);

export interface PinnedAuditResponse {
  /** The final URL after every validated redirect hop. */
  url: string;
  status: number;
  ok: boolean;
  headers: Headers;
  text: string;
}

export interface PinnedAuditFetchOptions {
  timeoutMs: number;
  maxBytes: number;
  headers: Record<string, string>;
  maxRedirects?: number;
  /** Resolves and checks one URL; returns the public IPv4 address to pin. */
  validate: (url: string) => Promise<{ address: string }>;
}

/**
 * The audit's only site transport. Each hop is validated before it is
 * requested, the socket is pinned to the validated address, and redirects are
 * followed by hand so an external redirect cannot reach an internal address
 * (audit 2026-10-05, finding 3). Bodies are bounded.
 */
export async function fetchPinnedAuditResponse(rawUrl: string, options: PinnedAuditFetchOptions): Promise<PinnedAuditResponse> {
  const deadline = Date.now() + options.timeoutMs;
  const maxRedirects = options.maxRedirects ?? 5;
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const url = new URL(current);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Blocked: unsafe audit URL");
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Audit request timed out");
    let timer: ReturnType<typeof setTimeout> | undefined;
    let address: string;
    try {
      ({ address } = await Promise.race([options.validate(url.href), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Audit DNS lookup timed out")), remaining); })]));
    } finally { if (timer) clearTimeout(timer); }
    const result = await new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
      const request = (url.protocol === "https:" ? https : http).request(url, { method: "GET", headers: { ...options.headers, "Accept-Encoding": "identity" }, ...pinnedRequestOptions(address) }, response => {
        const status = response.statusCode ?? 0;
        if (REDIRECTS.has(status)) { response.resume(); resolve({ status, headers: response.headers, body: Buffer.alloc(0) }); return; }
        const chunks: Buffer[] = []; let bytes = 0;
        response.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > options.maxBytes) { request.destroy(new Error("Audit response exceeds its byte limit")); return; } chunks.push(chunk); });
        response.on("error", reject);
        response.on("end", () => resolve({ status, headers: response.headers, body: Buffer.concat(chunks) }));
      });
      const requestTimer = setTimeout(() => request.destroy(new Error("Audit request timed out")), Math.max(1, deadline - Date.now()));
      request.on("error", reject); request.on("close", () => clearTimeout(requestTimer)); request.end();
    });
    const location = result.headers.location;
    if (REDIRECTS.has(result.status) && location) { current = new URL(Array.isArray(location) ? location[0]! : location, url).href; continue; }
    const headers = new Headers();
    for (const [name, value] of Object.entries(result.headers)) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) headers.append(name, String(item));
    }
    return { url: url.href, status: result.status, ok: result.status >= 200 && result.status < 300, headers, text: result.body.toString("utf8") };
  }
  throw new Error("Audit redirected too many times");
}
