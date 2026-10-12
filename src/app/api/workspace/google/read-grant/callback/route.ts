import { NextResponse, type NextRequest } from "next/server";
import { workspaceHttpActor } from "@/platform/workspaces/http";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { finishReadGrant, READ_GRANT_COOKIE, stateWorkspaceHint } from "@/products/google-listing/server";

export const dynamic = "force-dynamic";
/** Search Console and Analytics read grant returns here. Its own row; the listing grant is untouched. */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin, params = request.nextUrl.searchParams, hint = stateWorkspaceHint(params.get("state"));
  const back = (workspaceId: string | null, result: string) => {
    const response = NextResponse.redirect(workspaceId ? `${origin}/workspace/google?${new URLSearchParams({ workspaceId, search: result })}` : `${origin}/workspace`, 303);
    response.cookies.set(READ_GRANT_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/api/workspace/google/read-grant", maxAge: 0 });
    response.headers.set("Cache-Control", "no-store"); response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  if (!workspaceReleaseEnabled()) return back(null, "failed");
  try {
    const actor = await workspaceHttpActor();
    if (!actor) return NextResponse.redirect(`${origin}/sign-in`, 303);
    if (params.has("error")) return back(hint, "cancelled");
    const result = await finishReadGrant(actor, params.get("state") ?? "", request.cookies.get(READ_GRANT_COOKIE)?.value ?? "", params.get("code") ?? "", origin);
    return back(result.workspaceId, result.status);
  } catch { return back(hint, "failed"); }
}
