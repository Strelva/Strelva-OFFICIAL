import { websiteRebuildReleaseEnabled } from "@/products/websites/index";
import { z } from "zod";
import { workspaceHttpActor,workspaceHttpFailure,workspaceJson,workspaceWriteGuard,readWorkspaceBody } from "@/platform/workspaces/http";
import { createWebsiteHandoff } from "@/products/websites/index";
import { readWebsiteRebuild } from "@/products/websites/index";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
const inputSchema=z.object({recipientEmail:z.string().email().max(254)}).strict();
export async function POST(request:Request,context:{params:Promise<{workId:string}>}) {
 if(!websiteRebuildReleaseEnabled())return workspaceJson({error:"Website rebuilds are unavailable."},404);
 const denied=workspaceWriteGuard(request);if(denied)return denied;
 try{const actor=await workspaceHttpActor();if(!actor)return workspaceJson({error:"Sign in to propose a website handoff."},401);const {workId}=await context.params;const record=await readWebsiteRebuild(actor,workId);if(record.rebuild.tenantId||record.rebuild.status==="published")throw new WorkspaceConflictError("Live websites require an approved ownership transfer. Preview handoffs are available here.");const input=inputSchema.parse(await readWorkspaceBody(request));const result=await createWebsiteHandoff(actor,workId,input.recipientEmail);return workspaceJson({...result,acceptanceRequired:true});}catch(error){return workspaceHttpFailure(error);}
}
