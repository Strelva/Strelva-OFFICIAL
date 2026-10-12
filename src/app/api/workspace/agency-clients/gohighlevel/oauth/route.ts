import { NextResponse } from "next/server";
import { z } from "zod";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import {
  assertGhlAgencyManagerForRoute,
} from "../shared";
import { createGhlOAuthState, ghlAuthorizationUrl, ghlImportReleaseEnabled, ghlRedirectUri, GhlImportError, GHL_STATE_COOKIE, GHL_STATE_COOKIE_MAX_AGE_SECONDS } from "@/products/agency-clients/gohighlevel";

export const dynamic = "force-dynamic";

/** Start the agency-level HighLevel connection. Off unless STRELVA_GHL_IMPORT_RELEASE=1. */
export async function GET(request: Request) {
  if (!ghlImportReleaseEnabled()) return workspaceJson({ error: "Importing from HighLevel isn't available yet." }, 503);
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return workspaceJson({ error: "Sign in to connect HighLevel." }, 401);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    await assertGhlAgencyManagerForRoute(actor, workspaceId);
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) return workspaceJson({ error: "Importing from HighLevel isn't available yet." }, 503);
    const state = createGhlOAuthState({ workspaceId, userId: actor.userId });
    const target = ghlAuthorizationUrl(ghlRedirectUri(appUrl), state);
    if (!target) return workspaceJson({ error: "Importing from HighLevel isn't available yet." }, 503);
    const response = NextResponse.redirect(target);
    // Fallback if HighLevel does not echo `state` (see gohighlevel/oauth.ts).
    response.cookies.set(GHL_STATE_COOKIE, state, {
      httpOnly: true, secure: appUrl.startsWith("https://"), sameSite: "lax",
      path: "/api/workspace/agency-clients/gohighlevel/oauth", maxAge: GHL_STATE_COOKIE_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    if (error instanceof GhlImportError) return workspaceJson({ error: error.message, code: error.code }, error.status);
    if (error instanceof z.ZodError) return workspaceJson({ error: "The HighLevel connection request is invalid." }, 400);
    return workspaceHttpFailure(error);
  }
}
