import { NextRequest, NextResponse } from "next/server";
import { GOOGLE_RECONNECT_COOKIE, finishGoogleReconnect, reconnectHash, reconnectReleaseEnabled, reconnectStore, verifyReconnectToken } from "@/products/publishing/reconnect";
import { reconnectPage } from "@/products/publishing/reconnect-page";

export async function GET(request: NextRequest): Promise<NextResponse> {
  const finish = (message: string, status: number) => {
    const response = reconnectPage(message, status);
    response.cookies.set(GOOGLE_RECONNECT_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/api/publishing/google/reconnect", maxAge: 0 });
    return response;
  };
  try {
    const state = request.nextUrl.searchParams.get("state") ?? "";
    const claims = verifyReconnectToken(state, "state");
    const browser = request.cookies.get(GOOGLE_RECONNECT_COOKIE)?.value;
    if (!claims || !browser || claims.nonce !== browser || !(await reconnectReleaseEnabled(claims.workspaceId))) {
      return finish("This reconnect session is unavailable or expired. Request a new link.", 410);
    }
    const store = reconnectStore();
    const target = await store.target("consume", claims.id, { browserHash: reconnectHash(browser), stateHash: reconnectHash(state) });
    if (!target || target.workspaceId !== claims.workspaceId || target.recipient !== claims.recipient) return finish("This reconnect link has already been used or the owner changed.", 410);
    const code = request.nextUrl.searchParams.get("code");
    if (request.nextUrl.searchParams.has("error") || !code) return finish("Google access was not granted. Your drafts remain saved. Request a new reconnect link to try again.", 400);
    await finishGoogleReconnect(target, code);
    await store.restored(target.id);
    return finish("Google access is restored. Your drafts remain saved. Reconnect does not approve them; drafts needing a fresh approval stay waiting in your workspace.", 200);
  } catch { return finish("Google reconnect could not be completed. Your drafts remain saved. Request a new link to try again.", 503); }
}
