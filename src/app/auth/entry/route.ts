import { NextResponse, type NextRequest } from "next/server";
import { getClientFallbackRoot, withClientFallbackRoot } from "@/lib/client-fallback";
import { ownerEntryForTenant } from "@/platform/owner-entry/server";
import { entryDestination } from "@/platform/owner-entry/decision";

export const dynamic = "force-dynamic";

/**
 * Owner entry (owner-entry spec §3.1, §3.3). Sign-in, sign-up and the admin
 * root send a person here on a client's admin host. Once they are signed in,
 * this decides: the client's workspace when the tenant is linked, owner entry
 * is on for this workspace and person, and they are a member there; else
 * `/dashboard` as before. Every answer is a 307 so a rollback takes effect on
 * the next request.
 *
 * The tenant comes only from the proxy's trusted `x-tenant` header (admin
 * host, custom admin domain or `/client/<tenant>` path), never from the query.
 */
export async function GET(request: NextRequest) {
  const tenant = request.headers.get("x-tenant");
  const root = getClientFallbackRoot(request.headers);
  if (!tenant || !/^[a-z0-9-]+$/.test(tenant)) return redirectTo(request, "/account");
  const decision = await ownerEntryForTenant(tenant);
  if (decision.kind === "dashboard" && decision.reason === "signed_out") {
    return redirectTo(request, withClientFallbackRoot(root, "/sign-in"));
  }
  return redirectTo(request, entryDestination(decision, withClientFallbackRoot(root, "/dashboard")));
}

/**
 * Same host the browser asked for. Behind `next dev`/`next start --hostname`,
 * request.url names the bound hostname (localhost), not the client's admin
 * host, and the owner would land signed out on another origin. Host is only
 * ever this request's own host, so nothing new is trusted.
 */
function redirectTo(request: NextRequest, path: string) {
  const host = request.headers.get("host");
  const origin = host && /^[a-z0-9.-]+(?::\d+)?$/i.test(host) ? `${request.nextUrl.protocol}//${host}` : request.url;
  const response = NextResponse.redirect(new URL(path, origin), 307);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
