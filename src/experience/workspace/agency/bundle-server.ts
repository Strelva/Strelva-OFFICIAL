import { z } from "zod";
import { createApplicationDraft, rehearseApplicationPackage } from "@/products/applications/server";
import { prepareBundleInquiry, rehearseBundleInquiry } from "@/products/inquiries";
import { prepareBundleWebsiteSection, rehearseBundleWebsiteSection } from "@/products/websites";
import { bundleInstallReceiptSchema, bundleTargetChoicesSchema, bundleTargetsSchema, type BundleTargets } from "@/platform/system-versions/bundle-contracts";
import type { SystemRevisionRef, JsonObject } from "@/platform/system-versions";
import { VersionAccessError, VersionValidationError } from "@/platform/system-versions";
import { mapVersionsError, type VersionsDb } from "@/platform/system-versions/supabase-store";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import type { InquiryEngineState } from "@/products/inquiries/contracts";
export async function installSystemBundle(actor:WorkspaceActor,input:{workspaceId:string;source:SystemRevisionRef;commandId:string;name:string;targets?:BundleTargets},definition:JsonObject,db:VersionsDb) {
 const targets=bundleTargetsSchema.parse(input.targets??{});
 const existing=await db.rpc("read_system_bundle_install_receipt",{p_workspace_id:input.workspaceId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_revision_id:input.source.revisionId,p_command_id:input.commandId,p_name:input.name,p_targets:targets});
 if(existing.error)mapVersionsError(existing.error,"The bundle installation receipt could not be confirmed.");
 if(existing.data!==null){const receipt=bundleInstallReceiptSchema.parse(existing.data);if(receipt.workspaceId!==input.workspaceId||receipt.sourceRevisionId!==input.source.revisionId)throw new VersionValidationError("Bundle receipt returned for another business or source revision.");return receipt;}

 const result=await db.rpc("read_system_bundle_targets",{p_workspace_id:input.workspaceId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_revision_id:input.source.revisionId,p_command_id:input.commandId,p_targets:targets});
 if(result.error)mapVersionsError(result.error,"The bundle's own target resources could not be read.");
 const snapshot=z.object({inquiry:z.object({tenantId:z.string(),revision:z.number().int().positive().nullable(),state:z.unknown().nullable()}).nullable(),website:z.object({workId:z.string().uuid(),workRevision:z.number().int().nonnegative(),documentRevision:z.number().int().positive(),payload:z.unknown()}).nullable()}).strict().parse(result.data);
 if(!Array.isArray(definition.systems))throw new VersionValidationError("The bundle definition is unavailable.");
 const now=new Date().toISOString(),parts:Array<Record<string,unknown>>=[];let state=snapshot.inquiry?.state as InquiryEngineState|null;
 for(const raw of definition.systems){
  const item=raw as JsonObject,shape=item.definition as JsonObject,key=String(item.key),name=String(item.name),workId=crypto.randomUUID();
  if(shape.kind==="internal_app"){
   const {kind:_kind,...spec}=shape;parts.push({key,workId,payload:createApplicationDraft({...spec,maintenanceOwner:actor.userId},actor,true)});
  }else if(shape.kind==="inquiry_pattern"){
   if(!snapshot.inquiry)throw new VersionAccessError("Select an inquiry Connection owned by this business before installing the whole bundle.");
   const prepared=prepareBundleInquiry(shape,{sourceBusinessId:input.source.businessId,sourceId:`${input.source.revisionId}:${key}`,businessId:input.workspaceId,actorId:actor.userId,state,now});state=prepared.state;
   parts.push({key,capabilityId:prepared.work.capabilityId,requestId:prepared.work.id});
  }else if(shape.kind==="website_section"){
   if(!snapshot.website)throw new VersionAccessError("Select a native website owned by this business before installing the whole bundle.");
   parts.push({key,workId,...prepareBundleWebsiteSection(shape,snapshot.website.payload,{actorId:actor.userId,name,pagePath:targets.websitePagePath??"/",now,workId})});
  }else throw new VersionValidationError("This component has no native bundle draft adapter.");
 }
 const committed=await db.rpc("install_system_bundle",{p_workspace_id:input.workspaceId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_source_revision_id:input.source.revisionId,p_source_system_id:input.source.systemId,p_source_workspace_id:input.source.businessId,p_source_number:input.source.number,p_command_id:input.commandId,p_name:input.name,p_targets:targets,p_expected_inquiry_revision:snapshot.inquiry?.revision??null,p_expected_website_work_revision:snapshot.website?.workRevision??null,p_expected_website_document_revision:snapshot.website?.documentRevision??null,p_parts:parts,p_inquiry_state:state??null});
 if(committed.error)mapVersionsError(committed.error,"No bundle drafts were committed. Reload the source and this business's target resources.");
 const receipt=bundleInstallReceiptSchema.parse(committed.data);
 if(receipt.workspaceId!==input.workspaceId||receipt.sourceRevisionId!==input.source.revisionId)throw new VersionValidationError("Bundle returned for another business or source revision.");
 return receipt;
}

/** Actual pure native adapters: isolated synthetic data, no stores/providers. */
export async function qualifyNativePackage(actor:WorkspaceActor,workspaceId:string,revisionId:string,db:VersionsDb) {
 const source=await db.rpc("read_system_bundle_qualification_source",{p_workspace_id:workspaceId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_revision_id:revisionId});
 if(source.error)mapVersionsError(source.error,"The exact qualification source could not be read.");
 const value=z.object({revisionId:z.literal(revisionId),definition:z.record(z.string(),z.unknown())}).parse(source.data);
 if(value.definition.kind!=="bundle")return null;
 if(!Array.isArray(value.definition.systems))throw new VersionValidationError("Bundle components are unavailable.");
 const artifacts=value.definition.systems.map(raw=>{
  const item=raw as JsonObject,definition=item.definition as JsonObject,key=String(item.key),kind=definition.kind;
  if(kind==="internal_app")return {key,kind,...rehearseApplicationPackage(revisionId,definition)};
  if(kind==="inquiry_pattern")return {key,kind,...rehearseBundleInquiry(definition)};
  if(kind==="website_section")return {key,kind,...rehearseBundleWebsiteSection(definition)};
  throw new VersionValidationError("No native rehearsal adapter exists for this bundle component.");
 });
 const result=await db.rpc("record_system_bundle_qualification",{p_workspace_id:workspaceId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_revision_id:revisionId,p_artifacts:artifacts});
 if(result.error)mapVersionsError(result.error,"Native bundle qualification could not be recorded.");
 return result.data;
}

export async function readBundleTargetChoices(actor:WorkspaceActor,workspaceId:string,revisionId:string,commandId:string,db:VersionsDb) {
 const result=await db.rpc("read_system_bundle_target_choices",{p_workspace_id:workspaceId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_revision_id:revisionId,p_command_id:commandId});
 if(result.error)mapVersionsError(result.error,"This business's bundle Connections could not be read.");
 const parsed=bundleTargetChoicesSchema.parse(result.data);
 if(parsed.workspaceId!==workspaceId||parsed.revisionId!==revisionId||parsed.commandId!==commandId)throw new VersionValidationError("Bundle Connections returned for another business or installation.");
 return parsed;
}
export async function grantBundleTargets(actor:WorkspaceActor,input:{workspaceId:string;grantId:string;targets:BundleTargets},db:VersionsDb) {
 const result=await db.rpc("grant_system_bundle_targets",{p_workspace_id:input.workspaceId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_grant_id:input.grantId,p_targets:bundleTargetsSchema.parse(input.targets)});
 if(result.error)mapVersionsError(result.error,"These exact bundle targets could not be authorized.");
 const receipt=z.object({grantId:z.literal(input.grantId),targets:bundleTargetsSchema}).parse(result.data);
 if(receipt.targets.inquiryTenantId!==input.targets.inquiryTenantId||receipt.targets.websiteWorkId!==input.targets.websiteWorkId||receipt.targets.websitePagePath!==input.targets.websitePagePath)throw new VersionValidationError("Permission returned for different bundle targets.");
 return receipt;
}
