import { NextResponse } from "next/server";
import { finishGoogleDiscovery, GOOGLE_DISCOVER_COOKIE, AGENCY_GOOGLE_CHOICES_COOKIE, admitAgencyGoogleConnect, AGENCY_DISCOVER_CALLBACK } from "@/products/google-listing/server";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspace release is not enabled." }, 503);
  const url = new URL(request.url);
  const browser = (request.headers.get("accept") ?? "").includes("text/html");
  function page(params: Record<string, string>) {
    const result = NextResponse.redirect(new URL(`/workspace/google/agency?${new URLSearchParams(params)}`, url.origin), 303);
    result.headers.set("Cache-Control", "private, no-store");
    result.headers.set("Referrer-Policy", "no-referrer");
    result.cookies.set(GOOGLE_DISCOVER_COOKIE, "", { path: "/api/oauth/google/agency", maxAge: 0 });
    result.cookies.set(AGENCY_GOOGLE_CHOICES_COOKIE, "", { path: "/", maxAge: 0 });
    return result;
  }
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return browser ? page({ result: "expired" }) : workspaceJson({ error: "Confirmed sign-in required." }, 401);
    const jar = await cookies();
    const outcome = await finishGoogleDiscovery(actor, url.searchParams.get("state") ?? "", jar.get(GOOGLE_DISCOVER_COOKIE)?.value ?? "", url.searchParams.get("code") ?? "", url.origin, { admit: async (who, id) => { await admitAgencyGoogleConnect(who, id); }, callbackPath: AGENCY_DISCOVER_CALLBACK });
    const workspaceId = outcome.status === "chosen" ? outcome.choices.workspaceId : outcome.workspaceId;
    const result = browser ? page({ workspaceId, ...(outcome.status === "chosen" ? {} : { result: outcome.status }) }) : workspaceJson(outcome.status === "chosen" ? { status: outcome.status, choices: outcome.choices, next: "POST /api/oauth/google/agency with workspaceId, accountId and locationId to connect the selected listing." } : outcome);
    result.cookies.set(GOOGLE_DISCOVER_COOKIE, "", { path: "/api/oauth/google/agency", maxAge: 0 });
    if (outcome.status === "chosen") result.cookies.set(AGENCY_GOOGLE_CHOICES_COOKIE, outcome.cookie, { httpOnly: true, sameSite: "lax", secure: url.protocol === "https:", path: "/", maxAge: 600 });
    return result;
  } catch (error) {
    // No workspace is trusted until discovery validates its signed state.
    return browser ? page({ result: "expired" }) : workspaceHttpFailure(error);
  }
}
