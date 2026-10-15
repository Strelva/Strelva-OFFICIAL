import { finishGoogleDiscovery, GOOGLE_DISCOVER_COOKIE, GOOGLE_DISCOVER_CHOICES_COOKIE, admitAgencyGoogleConnect, AGENCY_DISCOVER_CALLBACK } from "@/products/google-listing/server";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { cookies } from "next/headers";
export async function GET(request: Request) {
  if (!workspaceReleaseEnabled()) return workspaceJson({error:"Workspace release is not enabled."},503);
  try {
    const actor = await workspaceHttpActor(); if (!actor) return workspaceJson({error:"Confirmed sign-in required."},401);
    const url = new URL(request.url), jar = await cookies();
    const outcome = await finishGoogleDiscovery(actor,url.searchParams.get("state") ?? "",jar.get(GOOGLE_DISCOVER_COOKIE)?.value ?? "",url.searchParams.get("code") ?? "",url.origin,{admit:async(who,id)=>{await admitAgencyGoogleConnect(who,id);},callbackPath:AGENCY_DISCOVER_CALLBACK});
    const result = workspaceJson(outcome.status === "chosen" ? {status:outcome.status,choices:outcome.choices,next:"POST /api/oauth/google/agency with workspaceId, accountId and locationId to connect the selected listing."} : outcome);
    result.cookies.set(GOOGLE_DISCOVER_COOKIE,"",{path:"/api/oauth/google/agency",maxAge:0});
    if (outcome.status === "chosen") result.cookies.set(GOOGLE_DISCOVER_CHOICES_COOKIE,outcome.cookie,{httpOnly:true,sameSite:"lax",secure:url.protocol === "https:",path:"/api/oauth/google/agency",maxAge:600});
    return result;
  } catch(error) {return workspaceHttpFailure(error);}
}
