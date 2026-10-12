import { NextResponse, type NextRequest } from "next/server";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { admitOwnerConnect, finishGoogleDiscovery, GOOGLE_DISCOVER_CHOICES_COOKIE, GOOGLE_DISCOVER_COOKIE, stateWorkspaceHint } from "@/products/google-listing/server";

export const dynamic = "force-dynamic";
/** Connect Google, step one returns here. The short-lived token is used to
 * list the account's listings and dropped; the signed list goes to the page. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const back = (workspaceId: string | null, connect: string) => {
    const response = NextResponse.redirect(workspaceId ? `${origin}/workspace/google?${new URLSearchParams({ workspaceId, connect })}` : `${origin}/workspace`, 303);
    response.cookies.set(GOOGLE_DISCOVER_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/api/workspace/publishing/google/discover", maxAge: 0 });
    response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  const workspaceHint = stateWorkspaceHint(request.nextUrl.searchParams.get("state"));
  if (!workspaceReleaseEnabled()) return back(null, "failed");
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return NextResponse.redirect(`${origin}/sign-in`, 303);
    if (request.nextUrl.searchParams.has("error")) return back(workspaceHint, "cancelled");
    const result = await finishGoogleDiscovery(actor, request.nextUrl.searchParams.get("state") ?? "", request.cookies.get(GOOGLE_DISCOVER_COOKIE)?.value ?? "", request.nextUrl.searchParams.get("code") ?? "", origin, { admit: admitOwnerConnect });
    if (result.status !== "chosen") return back(result.workspaceId, result.status === "access_pending" ? "access_pending" : result.status === "no_listings" ? "no_listings" : "failed");
    const response = back(result.choices.workspaceId, "choose");
    response.cookies.set(GOOGLE_DISCOVER_CHOICES_COOKIE, result.cookie, { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), path: "/workspace/google", maxAge: 600 });
    return response;
  } catch { return back(workspaceHint, "failed"); }
}
