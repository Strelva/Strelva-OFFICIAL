import {z} from "zod";
import {bundleTargetsSchema} from "@/platform/system-versions/bundle-contracts";
import {versionsDb} from "@/platform/system-versions/supabase-store";
import {readBundleTargetChoices,grantBundleTargets} from "@/experience/workspace/agency/bundle-server";
import {workspaceReleaseEnabled} from "@/platform/workspace-release";
import {systemsReleaseMayBeOn,systemsReleasedFor} from "@/platform/systems-release";
import {VersionAccessError,VersionValidationError,VersionStaleError} from "@/platform/system-versions";
import {readWorkspaceBody,workspaceHttpActor,workspaceHttpFailure,workspaceJson,workspaceWriteGuard} from "@/platform/workspaces/http";
export const dynamic="force-dynamic";
const uuid=z.string().uuid();
function failure(error:unknown){if(error instanceof VersionAccessError)return workspaceJson({error:error.message},403);if(error instanceof VersionValidationError||error instanceof z.ZodError)return workspaceJson({error:"These bundle targets are unavailable."},400);if(error instanceof VersionStaleError)return workspaceJson({error:error.message},409);return workspaceHttpFailure(error);}
async function access(workspaceId:string){const actor=await workspaceHttpActor();if(!actor)throw new VersionAccessError("Sign in to continue.");if(!workspaceReleaseEnabled()||!systemsReleaseMayBeOn()||!await systemsReleasedFor(actor,workspaceId))throw new VersionAccessError("Packages are not enabled.");return actor;}
export async function GET(request:Request){try{const p=new URL(request.url).searchParams,workspaceId=uuid.parse(p.get("workspaceId")),actor=await access(workspaceId);return workspaceJson(await readBundleTargetChoices(actor,workspaceId,uuid.parse(p.get("revisionId")),uuid.parse(p.get("commandId")),versionsDb()));}catch(error){return failure(error);}}
export async function POST(request:Request){const guarded=workspaceWriteGuard(request);if(guarded)return guarded;try{const input=z.object({workspaceId:uuid,grantId:uuid,targets:bundleTargetsSchema}).strict().parse(await readWorkspaceBody(request,8_000));return workspaceJson(await grantBundleTargets(await access(input.workspaceId),input,versionsDb()));}catch(error){return failure(error);}}
