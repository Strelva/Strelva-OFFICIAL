import { websiteRebuildReleaseMayBeOn, websiteRebuildReleasedFor } from "@/products/websites/index";
import { workspaceHttpActor,workspaceHttpFailure,workspaceJson } from "@/platform/workspaces/http";
import { getWork } from "@/platform/workspaces/repository";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { readWebsiteMonthlyReport } from "@/products/websites/index";
const unavailable=()=>workspaceJson({error:"Website rebuilds are unavailable."},404);
/** Per workspace under `workspace`: the report's business must have the rebuild on. Unreadable work falls through to the report's own access check. */
async function released(actor:WorkspaceActor,workId:string){const work=await getWork(actor,workId);return !work||websiteRebuildReleasedFor(actor,work.workspaceId);}
export async function GET(request:Request,context:{params:Promise<{workId:string}>}){if(!websiteRebuildReleaseMayBeOn())return unavailable();try{const actor=await workspaceHttpActor();if(!actor)return workspaceJson({error:"Sign in to view this website report."},401);const{workId}=await context.params;if(!(await released(actor,workId)))return unavailable();return workspaceJson(await readWebsiteMonthlyReport(actor,workId,{month:new URL(request.url).searchParams.get("month")??new Date().toISOString().slice(0,7)}));}catch(error){return workspaceHttpFailure(error);}}
export async function POST(request:Request,context:{params:Promise<{workId:string}>}){
 if(!websiteRebuildReleaseMayBeOn())return unavailable();
 const {workspaceWriteGuard,readWorkspaceBody}=await import("@/platform/workspaces/http");const denied=workspaceWriteGuard(request);if(denied)return denied;
 try{const actor=await workspaceHttpActor();if(!actor)return workspaceJson({error:"Sign in to send your website report."},401);const {workId}=await context.params;if(!(await released(actor,workId)))return unavailable();const {sendOwnerWebsiteMonthlyReport}=await import("@/products/websites/index");return workspaceJson(await sendOwnerWebsiteMonthlyReport(actor,workId,await readWorkspaceBody(request)));}catch(error){return workspaceHttpFailure(error);}
}
