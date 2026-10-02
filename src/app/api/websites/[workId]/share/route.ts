import { websiteRebuildReleaseEnabled } from "@/products/websites/index";
import { workspaceHttpActor,workspaceHttpFailure,workspaceJson,workspaceWriteGuard,readWorkspaceBody } from "@/platform/workspaces/http";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
import { readWebsiteRebuild } from "@/products/websites/index";
import { assertAgencyWebsite,signWebsiteShare,websiteShareInputSchema } from "@/products/websites/index";
export async function POST(request:Request,context:{params:Promise<{workId:string}>}) {
 if(!websiteRebuildReleaseEnabled())return workspaceJson({error:"Website rebuilds are unavailable."},404);
 const denied=workspaceWriteGuard(request);if(denied)return denied;
 try{const actor=await workspaceHttpActor();if(!actor)return workspaceJson({error:"Sign in to share this website."},401);const {workId}=await context.params;await assertAgencyWebsite(actor,workId);const input=websiteShareInputSchema.parse(await readWorkspaceBody(request));const record=await readWebsiteRebuild(actor,workId);const candidate=record.rebuild.candidate;if(!candidate)throw new WorkspaceConflictError("Create a website preview before sharing.");const expiresAt=Date.now()+input.expiresInHours*3600000;const token=signWebsiteShare({version:1,workspaceId:record.workspaceId,workId,revision:candidate.revision,contentHash:candidate.contentHash,createdBy:actor.userId,creatorEmail:actor.verifiedEmail,recipientEmail:input.recipientEmail.trim().toLowerCase(),expiresAt},process.env.SCAFFOLD_PREVIEW_SIGNING_SECRET??process.env.CRON_SECRET??"");return workspaceJson({previewHref:`/api/websites/shared/${token}`,expiresAt:new Date(expiresAt).toISOString(),recipientEmail:input.recipientEmail});}catch(error){return workspaceHttpFailure(error);}
}
