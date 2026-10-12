import type { WorkspaceActor } from "@/platform/workspaces/types";
import { getWork } from "@/platform/workspaces/repository";
import { websiteRebuildReleaseMayBeOn, websiteRebuildReleasedFor } from "./rebuild-release";
import { readWebsiteRebuild } from "./rebuild-service";
import { listPublishedWebsiteCapabilityOptions } from "./published-capabilities";
/** Keep the v1 connection path untouched when the prepared v2 rollout is off. */
export async function isWebsiteRebuildWork(actor:WorkspaceActor,workId:string){
 if(!websiteRebuildReleaseMayBeOn())return false;
 const work=await getWork(actor,workId);
 const v2=work?.productId==="websites"&&work.resourceKind==="website"&&!!work.payload&&typeof work.payload==="object"&&(work.payload as {version?:unknown}).version===2;
 return v2&&!!work&&await websiteRebuildReleasedFor(actor,work.workspaceId);
}
export async function listWebsiteRebuildCapabilityOptions(actor:WorkspaceActor,workId:string){
 const record=await readWebsiteRebuild(actor,workId);
 return listPublishedWebsiteCapabilityOptions(actor,record.workspaceId,workId);
}
export async function connectWebsiteRebuildCapabilitySelection(actor:WorkspaceActor,workId:string,raw:unknown){
 const {connectWebsiteRebuildCapabilities}=await import("./rebuild-service");
 return connectWebsiteRebuildCapabilities(actor,workId,raw);
}
