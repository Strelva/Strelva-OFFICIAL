import { NextResponse } from "next/server";
import { beginGoogleDiscovery, readDiscoveryChoices, chosenTarget, GOOGLE_DISCOVER_COOKIE, AGENCY_GOOGLE_CHOICES_COOKIE, beginNativeGoogleOAuth, NATIVE_GOOGLE_OAUTH_COOKIE, admitAgencyGoogleConnect, AGENCY_DISCOVER_CALLBACK } from "@/products/google-listing/server";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard, readWorkspaceBody } from "@/platform/workspaces/http";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { cookies } from "next/headers";
import { z } from "zod";
const input = z.object({workspaceId:z.string().uuid(),accountId:z.string(),locationId:z.string()}).strict();
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({error:"Workspace release is not enabled."},503);
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({error:"Confirmed sign-in required."},401);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspaceId"));
    const started = await beginGoogleDiscovery(actor, workspaceId, new URL(request.url).origin, {admit:async (who,id) => {await admitAgencyGoogleConnect(who,id);},callbackPath:AGENCY_DISCOVER_CALLBACK});
    const response = new Response(null,{status:303,headers:{Location:started.url}});
    const result = new NextResponse(response.body,response);
    result.cookies.set(GOOGLE_DISCOVER_COOKIE,started.nonce,{httpOnly:true,sameSite:"lax",secure:request.url.startsWith("https:"),path:"/api/oauth/google/agency",maxAge:600});
    return result;
  } catch(error) {
    if ((request.headers.get("accept") ?? "").includes("text/html")) {
      const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("workspaceId"));
      const result = NextResponse.redirect(new URL(`/workspace/google/agency?${new URLSearchParams({ ...(id.success ? { workspaceId: id.data } : {}), result: workspaceHttpFailure(error).status === 403 ? "forbidden" : "unavailable" })}`, new URL(request.url).origin), 303);
      result.headers.set("Cache-Control", "private, no-store"); result.headers.set("Referrer-Policy", "no-referrer"); return result;
    }
    return workspaceHttpFailure(error);
  }
}
/** Select only a listing returned by this actor's signed discovery. */
export async function POST(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({error:"Workspace release is not enabled."},503);
  const guard = workspaceWriteGuard(request); if (guard) return guard;
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({error:"Confirmed sign-in required."},401);
    const body = input.parse(await readWorkspaceBody(request,4096));
    const agencyWorkspaceId = await admitAgencyGoogleConnect(actor,body.workspaceId);
    const choices = readDiscoveryChoices(actor,body.workspaceId,(await cookies()).get(AGENCY_GOOGLE_CHOICES_COOKIE)?.value);
    if (!choices) return workspaceJson({error:"Find your agency's Google listing again.",code:"discovery_expired"},409);
    const started = await beginNativeGoogleOAuth(actor,{...chosenTarget(choices,body.accountId,body.locationId),agencyWorkspaceId},new URL(request.url).origin);
    const result = workspaceJson({url:started.url});
    result.cookies.set(NATIVE_GOOGLE_OAUTH_COOKIE,started.nonce,{httpOnly:true,sameSite:"lax",secure:request.url.startsWith("https:"),path:"/api/workspace/publishing/google/oauth",maxAge:600});
    return result;
  } catch(error) {return workspaceHttpFailure(error);}
}
