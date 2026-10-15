/**
 * Live reads of a connected site's public page. Server only.
 *
 * Every read goes through the pinned public fetch: public addresses only,
 * bounded bytes and redirects, never throwing. A page Strelva cannot open is
 * reported as unreachable, never guessed to be a builder.
 */
import { fetchPinnedPublicResponse, fetchPinnedPublicText } from "@/platform/infra/pinned-public-text";
import { WorkspaceConflictError, type WorkspaceActor } from "@/platform/workspaces/types";
import { verificationProofs, type ConnectedSite } from "./contracts";
import { detectSitePlatform, type PlatformDetection } from "./platform-detect";
import { connectedSitesStore, type ConnectedSitesStore } from "./store";

/** A connected site's live page, read the one way Strelva reads them: pinned, public addresses only, bounded. */
export function fetchLiveSitePage(url: string): Promise<string | null> {
  return fetchPinnedPublicText(url, { timeoutMs: 8000, maxBytes: 2_000_000 });
}

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

/**
 * Re-read the live page: are the Strelva lines still on it, and what is it
 * built with. The result is stored as evidence on the site.
 */
export async function checkConnectedSite(
  actor: WorkspaceActor, businessId: string, siteId: string,
  deps: { store?: ConnectedSitesStore; fingerprint?: typeof fetchSiteFingerprint } = {},
): Promise<ConnectedSite> {
  const store = deps.store ?? connectedSitesStore();
  const site = (await store.list(actor, businessId)).find(item => item.id === siteId && item.status === "active");
  if (!site) throw new WorkspaceConflictError("This connected site is no longer active here. Reload and try again.");
  const { reachable, html, detection } = await (deps.fingerprint ?? fetchSiteFingerprint)(site.siteUrl);
  const result = !reachable || html === null ? "unreachable" : verificationProofs(html).includes(site.publicKey) ? "present" : "missing";
  return store.recordCheck(actor, businessId, siteId, {
    result,
    platform: detection.platform === "unknown" ? null : detection.platform,
    evidence: detection.evidence,
  });
}
