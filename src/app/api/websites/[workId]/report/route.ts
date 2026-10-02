import { websiteRebuildReleaseEnabled } from "@/products/websites/index";
import { workspaceHttpActor,workspaceHttpFailure,workspaceJson } from "@/platform/workspaces/http";
import { readWebsiteMonthlyReport } from "@/products/websites/index";
export async function GET(request:Request,context:{params:Promise<{workId:string}>}){if(!websiteRebuildReleaseEnabled())return workspaceJson({error:"Website rebuilds are unavailable."},404);try{const actor=await workspaceHttpActor();if(!actor)return workspaceJson({error:"Sign in to view this website report."},401);const{workId}=await context.params;return workspaceJson(await readWebsiteMonthlyReport(actor,workId,{month:new URL(request.url).searchParams.get("month")??new Date().toISOString().slice(0,7)}));}catch(error){return workspaceHttpFailure(error);}}
export async function POST(request:Request,context:{params:Promise<{workId:string}>}){
 if(!websiteRebuildReleaseEnabled())return workspaceJson({error:"Website rebuilds are unavailable."},404);
 const {workspaceWriteGuard,readWorkspaceBody}=await import("@/platform/workspaces/http");const denied=workspaceWriteGuard(request);if(denied)return denied;
 try{const actor=await workspaceHttpActor();if(!actor)return workspaceJson({error:"Sign in to send your website report."},401);const {workId}=await context.params;const {sendOwnerWebsiteMonthlyReport}=await import("@/products/websites/index");return workspaceJson(await sendOwnerWebsiteMonthlyReport(actor,workId,await readWorkspaceBody(request)));}catch(error){return workspaceHttpFailure(error);}
}
