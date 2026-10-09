import { execFileSync } from "node:child_process";
import { writeFileSync, realpathSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SystemRevisionRef } from "@/platform/system-versions";
import type { VersionsDb } from "@/platform/system-versions/supabase-store";
import { installPrivateApplicationVersion } from "@/experience/workspace/agency/private-definition-server";
import { localEnvironment } from "./local-auth";

/** Reads actual actor/source/qualification state through the real adapter.
 * Stops before the sole native creation RPC; never fabricates a successful write. */
export async function privateSourceNativeReceipt(admin: SupabaseClient, input: {
 source: SystemRevisionRef; sourceUserId: string; sourceEmail: string;
 businessId: string; makerUserId: string; makerEmail: string; grantId: string;
 commandId: string; name: string; mode: "withdrawal" | "expiry";
}) {
 if(process.env.STRELVA_LOCAL_AUTH_PROOF!=="1")throw new Error("Owned Auth proof required.");
 localEnvironment();
 const root=realpathSync(process.env.STRELVA_PRIVATE_SOURCE_PROOF_DIR||"");
 if(statSync(root).uid!==process.getuid?.())throw new Error("Owned proof directory required.");
 const stopped=new Error("Captured native command before execution");
 let installArguments:Record<string,unknown>|undefined;
 const db:VersionsDb={async rpc(name,args){
  if(name==="create_private_version_system_command"){
   if(installArguments)throw new Error("Multiple native writes requested.");
   installArguments=structuredClone(args);throw stopped;
  }
  // The adapter's setup path is read-only. Reject any unexpected producer.
  if(!new Set(["require_private_application_source_share","require_system_package_install_scope","read_version_actor","read_system_version_source","read_system_version_source_revisions","read_system_version_for_system"]).has(name))throw new Error(`Unexpected setup RPC: ${name}`);
  return admin.rpc(name,args);
 }};
 try{
  await installPrivateApplicationVersion({userId:input.makerUserId,verifiedEmail:input.makerEmail},
   {workspaceId:input.businessId,source:input.source,name:input.name,commandId:input.commandId,
    context:{kind:"agency_client",label:input.name}},db);
  throw new Error("Adapter did not reach the native command.");
 }catch(error){if(error!==stopped)throw error;}
 if(!installArguments)throw new Error("No native arguments captured.");
 const path=join(root,`private-source-${input.mode}-${input.commandId}.json`);
 writeFileSync(path,JSON.stringify({sourceWorkspaceId:input.source.businessId,sourceSystemId:input.source.systemId,
  sourceUserId:input.sourceUserId,sourceEmail:input.sourceEmail,businessId:input.businessId,
  makerUserId:input.makerUserId,makerEmail:input.makerEmail,grantId:input.grantId,installArguments,
  provenance:{actualAdapter:true,nativeWriteExecuted:false,localFictionalPolicy:true,productionQualification:false}},null,2),{mode:0o600,flag:"wx"});
 return path;
}
export function runPrivateSourceNativeProof(path:string,mode:"withdrawal"|"expiry"){
 return execFileSync("python3",[resolve("scripts/check-private-source-install-race.py"),path],
  {encoding:"utf8",timeout:60_000,env:{...process.env,STRELVA_PRIVATE_SOURCE_RACE:mode}});
}
export function runPrivateSourceInverseDriftProof(){
 return execFileSync("python3",[resolve("scripts/check-private-source-inverse-drift.py"),resolve("supabase/migrations/rollback-20261022123000_private_definition_versions.sql")],
  {encoding:"utf8",timeout:60_000});
}
