import { privateApplicationDefinition } from "./private-definition-contracts";
import { jsonEqual } from "@/platform/system-versions/compare";
import { createSystemVersions, VersionAccessError, VersionStaleError, type SourceRevision, type SystemRef } from "@/platform/system-versions";
import { createSourceSystem, createSupabaseConnectionOwnership, createSupabaseVersionStore, readVersionActor, mapVersionsError, versionsDb, type VersionsDb } from "@/platform/system-versions/supabase-store";
import { rehearseApplicationPackage } from "@/products/applications/package-rehearsal";
import { requireAgencyAuthoring } from "./authoring-server";
import { installBusinessPackage } from "./version-server";
import type { WorkspaceActor } from "@/platform/workspaces/types";


async function call(db: VersionsDb, name: string, args: Record<string, unknown>) {
  const result = await db.rpc(name, args);
  if (result.error) mapVersionsError(result.error, "This private definition command could not be confirmed.");
  return result.data;
}
export async function createPrivateApplicationSource(actor: WorkspaceActor, input: { workspaceId: string; name: string; commandId: string }, db: VersionsDb = versionsDb()) {
  await requireAgencyAuthoring(actor,input.workspaceId,input.workspaceId,db);
  return createSourceSystem(await readVersionActor(actor,db), { businessId: input.workspaceId,name: input.name,kind: "internal_app",hidden: true,commandId: input.commandId },db);
}
export async function publishPrivateApplicationSource(actor: WorkspaceActor,input: { workspaceId: string; systemId: string; commandId: string; expectedRevision: number; definition: unknown; summary: string },db: VersionsDb = versionsDb()) {
  await requireAgencyAuthoring(actor,input.workspaceId,input.workspaceId,db);
  const versionActor=await readVersionActor(actor,db), source: SystemRef={businessId:input.workspaceId,systemId:input.systemId};
  const definition=privateApplicationDefinition(input.definition), base=createSupabaseVersionStore(db);
  const replay=await base.getRevision(versionActor,source,input.expectedRevision+1);
  let revision: SourceRevision;
  if(replay){
    if(replay.source.revisionId!==input.commandId || replay.publishedBy!==actor.userId || replay.summary!==input.summary || !jsonEqual(replay.definition,definition)) throw new VersionStaleError();
    revision=replay;
  }else{
    const previous=(await base.listRevisions(versionActor,source)).at(-1);
    if((previous?.source.number??0)!==input.expectedRevision)throw new VersionStaleError();
    const store={...base,async insertRevision(_actor: typeof versionActor,value: SourceRevision){
      await call(db,"publish_private_application_source",{p_workspace_id:input.workspaceId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,
        p_system_id:input.systemId,p_command_id:input.commandId,p_expected_revision:input.expectedRevision,p_revision:value});
      return (await base.getRevision(versionActor,source,input.expectedRevision+1))!;
    }};
    revision=await createSystemVersions({store,connections:createSupabaseConnectionOwnership(db),id:()=>input.commandId,
      rehearsePackage:r=>rehearseApplicationPackage(r.source.revisionId,r.definition)}).publishSourceRevision(versionActor,{source,definition,summary:input.summary});
  }
  // This records checks, never human approval. Replays recover the check step.
  await call(db,"record_system_revision_qualification",{p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_revision_id:revision.source.revisionId});
  return (await base.getRevision(versionActor,source,revision.source.number))!;
}
export async function sharePrivateApplicationSource(actor:WorkspaceActor,input:{workspaceId:string;systemId:string;businessId:string;shared:boolean},db:VersionsDb=versionsDb()){
  await requireAgencyAuthoring(actor,input.workspaceId,input.workspaceId,db);
  return call(db,"set_private_application_source_share",{p_workspace_id:input.workspaceId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_system_id:input.systemId,p_business_id:input.businessId,p_shared:input.shared});
}
export async function grantPrivateApplicationInstall(actor:WorkspaceActor,input:{workspaceId:string;agencyWorkspaceId:string;revisionId:string;commandId:string;expiresAt:string},db:VersionsDb=versionsDb()){
  return call(db,"grant_private_application_install",{p_workspace_id:input.workspaceId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_agency_workspace_id:input.agencyWorkspaceId,p_revision_id:input.revisionId,p_command_id:input.commandId,p_expires_at:input.expiresAt});
}
export async function installPrivateApplicationVersion(actor:WorkspaceActor,input:Parameters<typeof installBusinessPackage>[1],db:VersionsDb=versionsDb()){
  const shared=await call(db,"require_private_application_source_share",{p_workspace_id:input.workspaceId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_source_system_id:input.source.systemId});
  if(shared!==true)throw new VersionAccessError("This exact source is no longer shared with this business.");
  const atomic:VersionsDb={rpc(name,args){return db.rpc(name==="create_version_system_command"?"create_private_version_system_command":name,args);}};
  return installBusinessPackage(actor,input,atomic);
}
