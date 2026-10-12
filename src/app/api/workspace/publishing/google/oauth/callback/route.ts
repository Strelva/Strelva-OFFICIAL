import { NextResponse, type NextRequest } from "next/server";
import { finishNativeGoogleOAuth, NATIVE_GOOGLE_OAUTH_COOKIE } from "@/products/google-listing/server";
import { GOOGLE_RETURN_COOKIE, googleOwnerConnectEnabled, importGoogleFoundFacts, safeReturnTo, stateWorkspaceHint, withGoogleOutcome } from "@/products/google-listing/connect";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
export const dynamic="force-dynamic";

/** A person's browser comes back from Google expecting a page; scripted proofs keep JSON. */
function browserNavigation(request: NextRequest) { return googleOwnerConnectEnabled() && (request.headers.get("accept") ?? "").includes("text/html"); }
function backToGoogle(request: NextRequest, workspaceId: string | null, params: Record<string, string>) {
 const response=NextResponse.redirect(workspaceId?`${request.nextUrl.origin}/workspace/google?${new URLSearchParams({workspaceId,...params})}`:`${request.nextUrl.origin}/workspace`,303);
 response.cookies.delete(NATIVE_GOOGLE_OAUTH_COOKIE);response.headers.set("Cache-Control","no-store");response.headers.set("Referrer-Policy","no-referrer");return response;
}

export async function GET(request:NextRequest){
 if(!workspaceReleaseEnabled())return workspaceJson({error:"Workspace release is not enabled."},503);
 const browser=browserNavigation(request), params=request.nextUrl.searchParams, hint=stateWorkspaceHint(params.get("state"));
 try{const actor=await workspaceHttpActor();if(!actor)return workspaceJson({error:"Confirmed sign-in required."},401);
 if(browser&&params.has("error"))return backToGoogle(request,hint,{connect:"cancelled"});
 const connected=await finishNativeGoogleOAuth(actor,params.get("state")??"",request.cookies.get(NATIVE_GOOGLE_OAUTH_COOKIE)?.value??"",params.get("code")??"",request.nextUrl.origin);
 if(browser){
  // Found facts are read once now. The grant stays even if Google refuses this read (quota 0 before API approval, for example).
  const read=await importGoogleFoundFacts(actor,connected.workspaceId).catch(()=>({status:"unavailable" as const,count:0}));
  const returnTo=safeReturnTo(request.cookies.get(GOOGLE_RETURN_COOKIE)?.value);
  if(returnTo){const response=NextResponse.redirect(new URL(withGoogleOutcome(returnTo,{google:"connected",read:read.status}),request.nextUrl.origin),303);response.cookies.delete(NATIVE_GOOGLE_OAUTH_COOKIE);response.cookies.delete(GOOGLE_RETURN_COOKIE);response.headers.set("Cache-Control","no-store");response.headers.set("Referrer-Policy","no-referrer");return response;}
  return backToGoogle(request,connected.workspaceId,{connect:"connected",read:read.status});
 }
 const result=workspaceJson(connected);
 result.cookies.delete(NATIVE_GOOGLE_OAUTH_COOKIE);return result;
 }catch(error){
  if(browser)return backToGoogle(request,hint,{connect:"failed"});
  return workspaceHttpFailure(error);
 }
}
