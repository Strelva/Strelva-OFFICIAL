/**
 * Live reads of a connected site's public page. Server only.
 *
 * Every read goes through the pinned public fetch: public addresses only,
 * bounded bytes and redirects, never throwing. A page Strelva cannot open is
 * reported as unreachable, never guessed to be a builder.
 */
import { fetchPinnedPublicResponse } from "@/lib/pinned-public-text";
import { detectSitePlatform, type PlatformDetection } from "./platform-detect";

export interface SiteFingerprint { reachable: boolean; finalUrl: string | null; html: string | null; detection: PlatformDetection }

const FINGERPRINT_HEADERS = ["server", "x-powered-by", "x-wix-request-id", "x-shopid", "x-shopify-stage", "x-served-by"] as const;
const UNREACHABLE: PlatformDetection = { platform: "unknown", evidence: [], confident: false };

export async function fetchSiteFingerprint(url: string, fetchResponse: typeof fetchPinnedPublicResponse = fetchPinnedPublicResponse): Promise<SiteFingerprint> {
  const unreachable: SiteFingerprint = { reachable: false, finalUrl: null, html: null, detection: UNREACHABLE };
  try {
    const response = await fetchResponse(url, { timeoutMs: 8000, maxBytes: 2_000_000, maxRedirects: 5 });
    if (!response || response.status < 200 || response.status >= 300) return unreachable;
    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!/^(text\/|application\/xhtml\+xml\b)/.test(contentType)) return unreachable;
    const html = response.body.toString("utf8");
    const headers: Record<string, string | null> = {};
    for (const name of FINGERPRINT_HEADERS) headers[name] = response.headers.get(name);
    return { reachable: true, finalUrl: response.url, html, detection: detectSitePlatform({ html, headers }) };
  } catch {
    return unreachable;
  }
}
