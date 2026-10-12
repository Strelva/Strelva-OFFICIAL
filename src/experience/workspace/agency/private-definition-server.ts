import { z } from "zod";
import { privateApplicationDefinition } from "./private-definition-contracts";
import { jsonEqual } from "@/platform/system-versions/compare";
import { createSystemVersions, isRevisionQualified, VersionAccessError, VersionValidationError, VersionStaleError, type SourceRevision, type SystemRevisionRef, type SystemRef } from "@/platform/system-versions";
import { createSourceSystem, createSupabaseConnectionOwnership, createSupabaseVersionStore, readVersionActor, mapVersionsError, versionsDb, type VersionsDb } from "@/platform/system-versions/supabase-store";
import { rehearseApplicationPackage } from "@/products/applications/server";
import { installBusinessPackage } from "./version-server";
import type { WorkspaceActor } from "@/platform/workspaces/types";


async function call(db: VersionsDb, name: string, args: Record<string, unknown>) {
  const result = await db.rpc(name, args);
  if (result.error) mapVersionsError(result.error, "This private definition command could not be confirmed.");
  return result.data;
}
/** Current direct management and the existing exit stop, independent of party
 * kind. Native write RPCs still lock and recheck source-manager authority. */
async function requirePrivateSourceAuthoring(actor: WorkspaceActor, workspaceId: string, db: VersionsDb) {
  const identity = await readVersionActor(actor, db);
  if (!identity.memberships.some(m => m.businessId === workspaceId && m.via !== "provider_seat" && ["owner", "admin"].includes(m.role))) throw new VersionAccessError();
  const exited = await call(db, "workspace_exit_completed", { p_workspace_id: workspaceId });
  if (exited !== false) throw new VersionValidationError("New source work is stopped for this business.");
  return identity;
}
export async function createPrivateApplicationSource(actor: WorkspaceActor, input: { workspaceId: string; name: string; commandId: string }, db: VersionsDb = versionsDb()) {
  return createSourceSystem(await requirePrivateSourceAuthoring(actor,input.workspaceId,db), { businessId: input.workspaceId,name: input.name,kind: "internal_app",hidden: true,commandId: input.commandId },db);
}
export async function publishPrivateApplicationSource(actor: WorkspaceActor,input: { workspaceId: string; systemId: string; commandId: string; expectedRevision: number; definition: unknown; summary: string },db: VersionsDb = versionsDb()) {
  const versionActor=await requirePrivateSourceAuthoring(actor,input.workspaceId,db), source: SystemRef={businessId:input.workspaceId,systemId:input.systemId};
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
  await requirePrivateSourceAuthoring(actor,input.workspaceId,db);
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

/** Only reusable source summaries and exact revisions; no installed records. */
export async function readPrivateApplicationSources(actor: WorkspaceActor, workspaceId: string, incoming?: SystemRevisionRef, db: VersionsDb = versionsDb()) {
 const identity = await readVersionActor(actor, db);
 const member = identity.memberships.find(m => m.businessId === workspaceId && m.via !== "provider_seat");
 if (!member) throw new VersionAccessError();
 const raw = await call(db, "read_workspace_version_sources", { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail });
 const summaries = z.object({ workspaceId: z.literal(workspaceId), sources: z.array(z.object({ systemId: z.string().uuid(), workspaceId: z.literal(workspaceId), name: z.string() }).passthrough()) }).parse(raw);
 const store = createSupabaseVersionStore(db);
 const sources: Array<{ systemId: string; name: string; revision: SystemRevisionRef | null; qualified: boolean }> = [];
 for (const summary of summaries.sources) {
  const latest = (await store.listRevisions(identity, { businessId: workspaceId, systemId: summary.systemId })).at(-1);
  if (latest && (latest.source.businessId !== workspaceId || latest.source.systemId !== summary.systemId)) throw new VersionAccessError("Source identity could not be confirmed.");
  if (!latest || latest.definition.kind === "internal_app") sources.push({ systemId: summary.systemId, name: summary.name, revision: latest?.source ?? null, qualified: latest ? isRevisionQualified(latest) : false });
 }
 let shared: { source: SystemRevisionRef; name: string; qualified: boolean } | null = null;
 if (incoming) {
  const source = await store.getSource(identity, incoming);
  const revision = await store.getRevision(identity, incoming, incoming.number);
  if (!source?.sharedWith.includes(workspaceId) || source.source.businessId !== incoming.businessId || source.source.systemId !== incoming.systemId || !revision || revision.source.businessId !== incoming.businessId || revision.source.systemId !== incoming.systemId || revision.source.number !== incoming.number || revision.source.revisionId !== incoming.revisionId || revision.definition.kind !== "internal_app") throw new VersionAccessError("This exact private source is not shared with this business.");
  shared = { source: revision.source, name: String(revision.definition.title), qualified: isRevisionQualified(revision) };
 }
 const exited = await call(db, "workspace_exit_completed", { p_workspace_id: workspaceId });
 if (typeof exited !== "boolean") throw new VersionAccessError("Source authority could not be confirmed.");
 return { workspaceId, canAuthor: !exited && ["owner", "admin"].includes(member.role), sources, shared };
}
