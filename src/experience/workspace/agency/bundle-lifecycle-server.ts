import {z} from "zod";
import {prepareBundleInquiryUpdate,durableState} from "@/products/inquiries";
import {prepareBundleWebsiteUpdate} from "@/products/websites";
import type {InquiryEngineState} from "@/products/inquiries/contracts";
import {applyOverrides,VersionValidationError,type VersionLineage} from "@/platform/system-versions";
import {nativeVersionPreparationReceiptSchema,nativeVersionConflictSchema,type NativeVersionResolution} from "@/platform/system-versions/native-preparation-contracts";
import {mapVersionsError,type VersionsDb} from "@/platform/system-versions/supabase-store";
import type {WorkspaceActor} from "@/platform/workspaces/types";
export async function prepareNativeBundleVersion(actor:WorkspaceActor,lineage:VersionLineage,db:VersionsDb,resolutions?:NativeVersionResolution[]){
 if(!lineage.sourceComponentKey||!["inquiry_pattern","website_section"].includes(String(lineage.baseline.definition.kind)))return null;
 const args={p_workspace_id:lineage.version.businessId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_version_id:lineage.id,p_row_revision:lineage.rowRevision};
 const read=await db.rpc("read_bundle_native_preparation",args);if(read.error)mapVersionsError(read.error,"The bound native draft could not be read. Nothing went live.");
 const data=z.record(z.string(),z.unknown()).parse(read.data);
 if(data.existing)return nativeVersionPreparationReceiptSchema.parse(data.existing);
 if(lineage.releases.at(-1)&&JSON.stringify(lineage.releases.at(-1)?.definition)===JSON.stringify(applyOverrides(lineage.baseline.definition,lineage.overrides)))return null;
 const working=applyOverrides(lineage.baseline.definition,lineage.overrides),now=new Date().toISOString();let artifact:unknown;
 if(data.kind==="inquiry_pattern"){
 const result=prepareBundleInquiryUpdate(working,{state:data.state as InquiryEngineState,businessId:lineage.version.businessId,capabilityId:z.string().parse(data.capabilityId),sourceBusinessId:lineage.source.businessId,sourceVersion:lineage.baseline.revision,actorId:actor.userId,now,resolutions});
 if(!result.work)return nativeVersionConflictSchema.parse({kind:"native_conflict",workspaceId:lineage.version.businessId,versionId:lineage.id,rowRevision:lineage.rowRevision,nativeKind:"inquiry_pattern",conflicts:result.conflicts.map(c=>({path:c.path,local:c.localValue,source:c.sourceAfter}))});
 const draft=result.work.draft;if(!draft)throw new VersionValidationError("The native inquiry draft is unavailable.");
 const effectiveDefinition={kind:"inquiry_pattern",name:draft.name,title:draft.form.title,intro:draft.form.intro,fields:draft.form.fields.map(({id,label,kind,required})=>({id,label,kind,required})),routingWithinMinutes:draft.routing?.withinMinutes};
 artifact={...result,state:durableState(result.state,lineage.version.businessId),effectiveDefinition};
 }else{
 const result=prepareBundleWebsiteUpdate(working,data.payload,{actorId:actor.userId,now,sectionId:z.string().parse(data.sectionId),pagePath:z.string().parse(data.pagePath),workId:z.string().uuid().parse(data.workId),...(data.previousDefinition?{expectedDefinition:data.previousDefinition}:{}),resolution:resolutions?.find(r=>r.path==="website_section")?.choice});
 if(result.conflict)return nativeVersionConflictSchema.parse({kind:"native_conflict",workspaceId:lineage.version.businessId,versionId:lineage.id,rowRevision:lineage.rowRevision,nativeKind:"website_section",conflicts:[result.conflict]});artifact={...result,effectiveDefinition:result.effectiveDefinition};
 }
 const saved=await db.rpc("commit_bundle_native_preparation",{...args,p_expected_revision:data.kind==="inquiry_pattern"?data.revision:data.documentRevision,p_expected_work_revision:data.workRevision??0,p_artifact:artifact});
 if(saved.error)mapVersionsError(saved.error,"The native preparation was refused. Reload this business's own draft; nothing went live.");
 const receipt=nativeVersionPreparationReceiptSchema.parse(saved.data);if(receipt.workspaceId!==lineage.version.businessId||receipt.versionId!==lineage.id||(receipt.rowRevision!==lineage.rowRevision&&receipt.rowRevision!==lineage.rowRevision+1))throw new VersionValidationError("Native preparation returned for another Version.");return receipt;
}
