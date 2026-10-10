import { type NextRequest } from "next/server";
import { finishNativeGoogleOAuth, NATIVE_GOOGLE_OAUTH_COOKIE } from "@/products/google-listing/server";
import { workspaceHttpActor, workspaceHttpFailure, workspaceJson } from "@/platform/workspaces/http";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 if(!workspaceReleaseEnabled())return workspaceJson({error:"Workspace release is not enabled."},503);
 try{const actor=await workspaceHttpActor();if(!actor)return workspaceJson({error:"Confirmed sign-in required."},401);
 const params=request.nextUrl.searchParams;
 const result=workspaceJson(await finishNativeGoogleOAuth(actor,params.get("state")??"",request.cookies.get(NATIVE_GOOGLE_OAUTH_COOKIE)?.value??"",params.get("code")??"",request.nextUrl.origin));
 result.cookies.delete(NATIVE_GOOGLE_OAUTH_COOKIE);return result;
 }catch(error){return workspaceHttpFailure(error);}
}
