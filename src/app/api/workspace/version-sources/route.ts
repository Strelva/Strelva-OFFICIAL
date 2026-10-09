import { z } from "zod";
import { workspaceReleaseEnabled } from "@/platform/workspace-release";
import { systemsReleaseMayBeOn, systemsReleasedFor } from "@/platform/systems-release";
import { VersionAccessError, VersionValidationError, VersionStaleError } from "@/platform/system-versions";
import { readWorkspaceBody, workspaceHttpActor, workspaceHttpFailure, workspaceJson, workspaceWriteGuard } from "@/platform/workspaces/http";
import { isRateLimitedWindowedAsync } from "@/platform/infra/rate-limit";
import { createPrivateApplicationSource, publishPrivateApplicationSource, sharePrivateApplicationSource, grantPrivateApplicationInstall, installPrivateApplicationVersion } from "@/experience/workspace/agency/private-definition-server";
export const dynamic="force-dynamic";
const uuid=z.string().uuid();
const source=z.object({businessId:uuid,systemId:uuid,revisionId:uuid,number:z.number().int().positive()}).strict();
const body=z.discriminatedUnion("action",[
 z.object({action:z.literal("create"),workspaceId:uuid,name:z.string().trim().min(1).max(160),commandId:uuid}).strict(),
 z.object({action:z.literal("publish"),workspaceId:uuid,systemId:uuid,commandId:uuid,expectedRevision:z.number().int().min(0),definition:z.unknown(),summary:z.string().trim().min(1).max(500)}).strict(),
 z.object({action:z.literal("share"),workspaceId:uuid,systemId:uuid,businessId:uuid,shared:z.boolean()}).strict(),
 z.object({action:z.literal("grant_install"),workspaceId:uuid,agencyWorkspaceId:uuid,revisionId:uuid,commandId:uuid,expiresAt:z.string().datetime()}).strict(),
 z.object({action:z.literal("install"),workspaceId:uuid,source,name:z.string().trim().min(1).max(160),commandId:uuid}).strict(),
]);
export async function POST(request:Request){
 if(!workspaceReleaseEnabled()||!systemsReleaseMayBeOn())return workspaceJson({error:"Versions are not enabled. Nothing changed."},503);
 const guarded=workspaceWriteGuard(request);if(guarded)return guarded;
 try{
  const actor=await workspaceHttpActor();if(!actor)return workspaceJson({error:"Sign in to continue."},401);
  const input=body.parse(await readWorkspaceBody(request,64_000));
  if(!(await systemsReleasedFor(actor,input.workspaceId)))return workspaceJson({error:"Versions are not enabled for this business. Nothing changed."},503);
  if(await isRateLimitedWindowedAsync(`workspace:private-version-sources:${actor.userId}`,30,60_000))return workspaceJson({error:"Please wait before trying again."},429);
  if(input.action==="create")return workspaceJson(await createPrivateApplicationSource(actor,input),201);
  if(input.action==="publish")return workspaceJson(await publishPrivateApplicationSource(actor,input),201);
  if(input.action==="share")return workspaceJson(await sharePrivateApplicationSource(actor,input));
  if(input.action==="grant_install")return workspaceJson(await grantPrivateApplicationInstall(actor,input));
  return workspaceJson(await installPrivateApplicationVersion(actor,{...input,context:{kind:"agency_client",label:input.name}}),201);
 }catch(error){
  if(error instanceof VersionAccessError)return workspaceJson({error:error.message},403);
  if(error instanceof VersionStaleError)return workspaceJson({error:error.message},409);
  if(error instanceof VersionValidationError)return workspaceJson({error:error.message},400);
  return workspaceHttpFailure(error);
 }
}
