#!/usr/bin/env npx tsx
/** Actual migrations and native setup contract on one owned, socket-only cluster. */
import { readdirSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createTempPostgres } from "./release-safety/temp-postgres";
import { command, sql, catalog, databaseUrl } from "./release-safety/postgres";
import { compiledAskServiceSetup } from "../src/products/scheduling/server";
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporary = createTempPostgres();
async function main() {
  const { cluster } = temporary;
  const socket = join(cluster, "socket"); mkdirSync(socket, { mode: 0o700 });
  const port = 62000 + process.pid % 2000;
  const url = `postgresql:///postgres?host=${encodeURIComponent(socket)}&port=${port}&application_name=ask456`;
  command("initdb", ["-D",join(cluster,"data"),"--locale=C","--encoding=UTF8","--auth=trust","--no-instructions"]);
  command("pg_ctl",["-D",join(cluster,"data"),"-l",join(cluster,"postgres.log"),"-o",`-F -k '${socket}' -c listen_addresses='' -p ${port}`,"-w","start"]);
  temporary.recordPostmaster();
  sql(url,{file:join(root,"scripts/sql/local-supabase-shim.sql")});
  const files = readdirSync(join(root,"supabase/migrations")).filter(file=>/^\d{14}_.*\.sql$/.test(file)).sort();
  for(const file of files) {
    if(process.argv.includes("--without-correction") && file === "20261020113000_ask_native_service_setup.sql") continue;
    sql(url,{file:join(root,"supabase/migrations",file)});
  }
  const forward=join(root,"supabase/migrations/20261020113000_ask_native_service_setup.sql");
  const rollback=join(root,"supabase/migrations/rollback-20261020113000_ask_native_service_setup.sql");
  if(!process.argv.includes("--without-correction")) {
    sql(url,{text:"create role ask456_catalog_owner"});
    // Refusal must precede all drops, including ACL and function config drift.
    for(const [change,restore] of [
      ["grant execute on function public.publish_ask_native_service_setup(uuid,uuid,text,jsonb) to authenticated","revoke execute on function public.publish_ask_native_service_setup(uuid,uuid,text,jsonb) from authenticated"],
      ["alter function public.inspect_ask_service_confirmation(text) set work_mem='8MB'","alter function public.inspect_ask_service_confirmation(text) reset work_mem"],
      ["alter function public.inspect_ask_service_confirmation(text) owner to ask456_catalog_owner","alter function public.inspect_ask_service_confirmation(text) owner to current_user"],
    ] as const) {sql(url,{text:change});const before=catalog(url,root);let refused=false;
      try {sql(url,{file:rollback});} catch {refused=true;}
      if(!refused || JSON.stringify(catalog(url,root))!==JSON.stringify(before))throw new Error("Setup rollback failed atomic catalog-drift refusal");
      sql(url,{text:restore});
    }
    sql(url,{file:rollback}); if(sql(url,{text:"select to_regprocedure('public.publish_ask_native_service_setup(uuid,uuid,text,jsonb)') is null"})!=="t")throw new Error("Empty setup rollback failed");
    sql(url,{file:forward});
    sql(url,{text:"drop role ask456_catalog_owner"});
  }
  const future = new Date(Date.now()+10*86400000); future.setUTCHours(14,0,0,0);
  const selection={kind:"ask-new-service-setup",workspaceId:"45600000-0000-4000-8000-000000000010",setupId:"45600000-0000-4000-8000-000000000099",
    tenantStableId:"45600000-0000-4000-8000-000000000020",calendarConnectionId:"45600000-0000-4000-8000-000000000030",calendarUpdatedAt:"2026-10-08T12:00:00.000Z",
    businessRecordRevision:0,recordHours:null,inquiryRevision:null,inquiryStateHash:null,at:"2026-10-08T12:00:00.000Z",service:{kind:"new-booking-service",tenantId:"ask456-fixture",serviceName:"Consultation",durationMinutes:30,provider:"google",timeZone:"America/New_York",availability:[{start:future.toISOString(),end:new Date(future.getTime()+30*60000).toISOString()}]}};
  const setup = {...await compiledAskServiceSetup(selection,"45600000-0000-4000-8000-000000000001"),expectedInquiryState:null};
  const fixture=readFileSync(join(root,"tests/ask-native-service-setup-schema.sql"),"utf8");
  const httpUrl=databaseUrl(url,"ask456_http");
  if(!process.argv.includes("--without-correction"))sql(url,{text:"create database ask456_http template postgres"});
  const proof=fixture;
  const proofFile=join(cluster,"setup-proof.sql");writeFileSync(proofFile,proof,{mode:0o600});
  process.chdir(root);
  const transcript=command("psql",["--dbname="+url,"-X","-qAt","-v","ON_ERROR_STOP=1","-v","setup_json="+JSON.stringify(setup),"-f",proofFile]);
  const receiptDir=join(root,"output/ask456");mkdirSync(receiptDir,{recursive:true});writeFileSync(join(receiptDir,"native-sql-proof.txt"),transcript);
  if(!process.argv.includes("--without-correction")) {
    const httpProof=fixture.split("-- VISITOR_HTTP_PROOF")[0]+`\\! pnpm exec vitest run src/__tests__/ask-native-service-http.test.ts --reporter=default --reporter=json --outputFile=output/ask456/http-results.json 2>&1\n\\quit`;
    writeFileSync(proofFile,httpProof,{mode:0o600});process.env.ASK456_DB_URL=httpUrl;
    const httpTranscript=command("psql",["--dbname="+httpUrl,"-X","-qAt","-v","ON_ERROR_STOP=1","-v","setup_json="+JSON.stringify(setup),"-f",proofFile]);
    delete process.env.ASK456_DB_URL;writeFileSync(join(receiptDir,"native-http-proof.txt"),httpTranscript);
    const result=JSON.parse(readFileSync(join(receiptDir,"http-results.json"),"utf8"));
    if(!result.success || result.numPassedTests!==4)throw new Error("Expected all four native HTTP cases to run and pass");
  }
  if(!process.argv.includes("--without-correction")) {
    const before=catalog(url,root);let refused=false;try {sql(url,{file:rollback});} catch {refused=true;}
    if(!refused || JSON.stringify(catalog(url,root))!==JSON.stringify(before))throw new Error("Accepted setup rollback must preserve data and catalog");
  }
  console.log(`Ask #456 native SQL passed on ${files.length} ordered migrations: ownership/isolation/drift/validation/replay/undo/ACL/receipt preservation.`);
}
void main().catch(error => { console.error(error instanceof Error ? error.message : "Ask service SQL failed."); process.exitCode=1; }).finally(() => temporary.cleanup());
