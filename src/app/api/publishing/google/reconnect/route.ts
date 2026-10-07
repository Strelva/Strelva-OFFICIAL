import { NextResponse } from "next/server";
import { reconnectPage } from "@/products/publishing/server";
import { GOOGLE_RECONNECT_COOKIE, newReconnectNonce, reconnectAppOrigin, reconnectHash, reconnectReleaseEnabled, reconnectStore, signReconnectToken, verifyReconnectToken } from "@/products/publishing/server";


async function readTarget(token: string) {
  const claims = verifyReconnectToken(token, "link");
  if (!claims || !(await reconnectReleaseEnabled(claims.workspaceId))) return null;
  const target = await reconnectStore().target("read", claims.id);
  return target && target.workspaceId === claims.workspaceId && target.recipient === claims.recipient ? target : null;
}

/** GET is a read-only confirmation so email security scanners cannot consume
 * the link or silently start a Google connection on the owner's behalf. */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const token = new URL(request.url).searchParams.get("token") ?? "";
    if (!(await readTarget(token))) return reconnectPage("This link is unavailable or expired. Request a new reconnect link.", 410);
    return reconnectPage("Your drafts stay in Strelva. Continue to Google to restore publishing access. This does not approve any draft or post anything.", 200, token);
  } catch { return reconnectPage("Google reconnect is temporarily unavailable. Try again later.", 503); }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const origin = reconnectAppOrigin();
    if (request.headers.get("origin") !== origin) return reconnectPage("Open the reconnect link from your email to continue.", 403);
    const token = String((await request.formData()).get("token") ?? "");
    const target = await readTarget(token);
    if (!target) return reconnectPage("This link is unavailable or expired. Request a new reconnect link.", 410);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) return reconnectPage("Google reconnect is not configured yet.", 503);
    const nonce = newReconnectNonce();
    const state = signReconnectToken(target, "state", nonce);
    const begun = await reconnectStore().target("begin", target.id, { browserHash: reconnectHash(nonce), stateHash: reconnectHash(state) });
    if (!begun) return reconnectPage("This link has already been used. Request a new reconnect link.", 410);
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: `${origin}/api/publishing/google/reconnect/callback`,
      response_type: "code", scope: "https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/analytics.readonly",
      access_type: "offline", prompt: "consent", state });
    const response = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, 303);
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set(GOOGLE_RECONNECT_COOKIE, nonce, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), path: "/api/publishing/google/reconnect", maxAge: 600 });
    return response;
  } catch { return reconnectPage("Google reconnect is temporarily unavailable. Try again later.", 503); }
}
