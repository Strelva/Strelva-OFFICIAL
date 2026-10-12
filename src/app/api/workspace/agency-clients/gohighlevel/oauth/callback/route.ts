import { NextResponse } from "next/server";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { agencyClientsRedirect } from "../../shared";
import { connectGhlAgency, consumeGhlOAuthState, ghlImportReleaseEnabled, ghlRedirectUri, GhlImportError, GHL_STATE_COOKIE } from "@/products/agency-clients/gohighlevel";

export const dynamic = "force-dynamic";

function finish(appUrl: string, workspaceId: string | undefined, outcome: { connected: true } | { error: string }): NextResponse {
  const response = NextResponse.redirect(agencyClientsRedirect(appUrl, workspaceId, outcome));
  response.cookies.set(GHL_STATE_COOKIE, "", { path: "/api/workspace/agency-clients/gohighlevel/oauth", maxAge: 0 });
  return response;
}

/**
 * HighLevel sends the agency admin back here with `code`. The state comes from
 * the query or, if HighLevel dropped it, the cookie set when the connection
 * started. Either must be ours, unexpired, unused and for this person.
 */
export async function GET(request: Request) {
  if (!ghlImportReleaseEnabled()) return new NextResponse("Importing from HighLevel isn't available yet.", { status: 503 });
  const url = new URL(request.url);
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const code = url.searchParams.get("code");
  const cookieState = request.headers.get("cookie")?.split(/;\s*/).find((part) => part.startsWith(`${GHL_STATE_COOKIE}=`))?.slice(GHL_STATE_COOKIE.length + 1);
  const stateToken = url.searchParams.get("state") || (cookieState ? decodeURIComponent(cookieState) : null);
  if (url.searchParams.get("error") || !code) return finish(appUrl, undefined, { error: "HighLevel didn't finish connecting. Nothing changed." });
  if (!stateToken) return finish(appUrl, undefined, { error: "Start the HighLevel connection from Strelva's client list." });
  let workspaceId: string | undefined;
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return finish(appUrl, undefined, { error: "Your session expired. Connect HighLevel again." });
    const state = await consumeGhlOAuthState(stateToken);
    if (!state || state.userId !== actor.userId) return finish(appUrl, undefined, { error: "The HighLevel connection couldn't be verified. Connect again." });
    workspaceId = state.workspaceId;
    await connectGhlAgency(actor, state.workspaceId, code, ghlRedirectUri(appUrl));
    return finish(appUrl, workspaceId, { connected: true });
  } catch (error) {
    return finish(appUrl, workspaceId, { error: error instanceof GhlImportError && error.status < 500 ? error.message : "HighLevel couldn't be connected. Nothing changed." });
  }
}
