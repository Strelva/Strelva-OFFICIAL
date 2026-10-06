/**
 * Shared HTTP plumbing for the public connect routes
 * (`/api/v1/connect/{siteKey}/context|events|inquiries`).
 *
 * Every connected site lives on its own domain, so reads answer CORS with a
 * wildcard. Writes are accepted only from a site whose owner proved control
 * of the host, and only with that host's Origin header; a request without an
 * Origin is refused (SQL rechecks all three). Responses never carry internals.
 */
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { WorkspaceStoreError } from "@/platform/workspaces/types";
import { ConnectedSiteInputError, ConnectedSiteRefusedError, connectedSitesReleaseEnabled, resolvePublicSite } from "@/products/connected-sites/server";
import { normalizeOrigin, type ResolvedConnectedSite } from "@/products/connected-sites/contracts";

export const CONNECT_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** Beacons and inquiries are small. Anything bigger is not from connect.js. */
export const CONNECT_MAX_BODY_BYTES = 16 * 1024;

export function connectJson(body: unknown, status: number, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...CONNECT_CORS_HEADERS, "Cache-Control": "no-store", ...headers } });
}

export function connectPreflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CONNECT_CORS_HEADERS });
}

type SiteResolution = { ok: true; site: ResolvedConnectedSite; origin: string | null } | { ok: false; response: NextResponse };

/** Release gate, key, then (writes) proven host and Origin, in that order. Unknown and revoked keys look the same. */
export async function resolveConnectSite(req: Request, siteKey: string, options: { write: boolean }): Promise<SiteResolution> {
  if (!connectedSitesReleaseEnabled()) return { ok: false, response: connectJson({ error: "Connected sites are not enabled." }, 503) };
  let site: ResolvedConnectedSite | null;
  try { site = await resolvePublicSite(siteKey); } catch (error) { return { ok: false, response: connectErrorResponse(error, "resolve") }; }
  if (!site) return { ok: false, response: connectJson({ error: "Site not found." }, 404) };
  const origin = normalizeOrigin(req.headers.get("origin") ?? "");
  if (options.write) {
    if (!site.verified) return { ok: false, response: connectJson({ error: "This site has not been verified yet." }, 403) };
    if (!origin || !site.allowedOrigins.includes(origin)) return { ok: false, response: connectJson({ error: "This site does not accept requests from that origin." }, 403) };
  }
  return { ok: true, site, origin };
}

export class ConnectBodyError extends Error {
  constructor(readonly status: 400 | 413, message: string) { super(message); }
}

/** A JSON body sent as application/json or text/plain (sendBeacon), bounded before parsing. */
export async function readConnectBody(req: Request, maxBytes = CONNECT_MAX_BODY_BYTES): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) throw new ConnectBodyError(413, "Request body is too large.");
  let raw: string;
  try { raw = await req.text(); } catch { throw new ConnectBodyError(400, "Invalid request body."); }
  if (new TextEncoder().encode(raw).byteLength > maxBytes) throw new ConnectBodyError(413, "Request body is too large.");
  if (!raw.trim()) throw new ConnectBodyError(400, "Invalid request body.");
  try { return JSON.parse(raw) as unknown; } catch { throw new ConnectBodyError(400, "Invalid request body."); }
}

/** A failure as a safe public response. Only our own input errors carry their message. */
export function connectErrorResponse(error: unknown, scope: string): NextResponse {
  if (error instanceof ConnectBodyError) return connectJson({ error: error.message }, error.status);
  if (error instanceof ZodError) return connectJson({ error: "Invalid request." }, 400);
  if (error instanceof ConnectedSiteInputError) return connectJson({ error: error.message }, 400);
  if (error instanceof ConnectedSiteRefusedError) return error.reason === "unknown" ? connectJson({ error: "Site not found." }, 404) : connectJson({ error: "This site does not accept that request." }, 403);
  if (error instanceof WorkspaceStoreError) return connectJson({ error: "Connected sites are temporarily unavailable." }, 503);
  console.error(`[v1 connect ${scope}]`, error instanceof Error ? error.message : error);
  return connectJson({ error: "Failed." }, 500);
}
