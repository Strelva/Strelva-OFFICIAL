import { beginNativeGoogleOAuth, NATIVE_GOOGLE_OAUTH_COOKIE } from "@/products/google-listing/native/oauth";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
 if (!workspaceReleaseEnabled()) return workspaceJson({ error: "Workspace release is not enabled." },503);
 const guard=workspaceWriteGuard(request); if(guard)return guard;
 try { const actor=await workspaceHttpActor(); if(!actor)return workspaceJson({error:"Confirmed sign-in required."},401);
 const origin=new URL(request.url).origin; const started=await beginNativeGoogleOAuth(actor,await readWorkspaceBody(request,4096),origin);
 const result=workspaceJson({url:started.url}); result.cookies.set(NATIVE_GOOGLE_OAUTH_COOKIE,started.nonce,{httpOnly:true,sameSite:"lax",secure:origin.startsWith("https:"),path:"/api/workspace/publishing/google/oauth",maxAge:600}); return result;
 } catch(error){return workspaceHttpFailure(error);}
}
