/** Authorized fictional local policy fixture, not production qualification.
 * Creates a real disposable Auth identity; all source approvals still go
 * through review_system_revision_qualification via actual signed HTTP. */
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, realpathSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

async function main(){
const directory=realpathSync(process.argv[2]||"");
if(!statSync(directory).isDirectory()||!basename(directory).startsWith("strelva-full-journeys."))throw new Error("An existing owned full-native proof directory is required.");
if(process.env.STRELVA_LOCAL_AUTH_PROOF!=="1"||process.env.STRELVA_WORKSPACE_RELEASE!=="1"||process.env.STRELVA_SYSTEMS_RELEASE!=="1"||process.env.EMAIL_SENDING_ENABLED!=="false")throw new Error("Only the closed native loopback proof profile permits reviewer fixtures.");
const db=process.env.STRELVA_LOCAL_DB_URL||"", authUrl=process.env.NEXT_PUBLIC_SUPABASE_URL||"", app=process.env.PLAYWRIGHT_BASE_URL||"";
for(const value of [db,authUrl,app])if(!["localhost","127.0.0.1"].includes(new URL(value).hostname))throw new Error("Only owned loopback endpoints are allowed.");
if(authUrl!==process.env.SUPABASE_URL)throw new Error("Auth endpoint binding mismatch.");
const stackLine=readFileSync(join(directory,"env"),"utf8").split("\n").find(line=>line.startsWith("STRELVA_AUTH_STACK_DIR="));
if(!stackLine)throw new Error("Owned stack path receipt is required.");
const stack=realpathSync(stackLine.slice(stackLine.indexOf("=")+1).replace(/^'|'$/g,""));
if(!basename(stack).startsWith("strelva-auth."))throw new Error("Unknown stack owner.");
const baseline=JSON.parse(readFileSync(join(stack,"full-model-bootstrap-baseline.json"),"utf8"));
const sha=(value:string)=>createHash("sha256").update(value).digest("hex");
if(realpathSync(baseline.binding.stack)!==stack||baseline.binding.databaseUrlSha256!==sha(db)||baseline.binding.authUrlSha256!==sha(authUrl))throw new Error("Owned bootstrap endpoint binding mismatch.");
const cleanEnv:NodeJS.ProcessEnv={LC_ALL:"C",NODE_ENV:"test"};
for(const key of ["PATH","HOME","TMPDIR"])if(process.env[key])cleanEnv[key]=process.env[key];
function sql(query:string,values:string[]=[]){
 const args=[db,"-X","-A","-t","-q","-v","ON_ERROR_STOP=1"];
 for(const [i,value] of values.entries())args.push("-v",`v${i+1}=${value}`);
 try{return JSON.parse(execFileSync("psql",args,{input:query,encoding:"utf8",env:cleanEnv,stdio:["pipe","pipe","pipe"]}).trim());}
 catch{throw new Error("Owned local reviewer fixture SQL failed; no qualification is claimed.");}
}
const databaseIdentity=sql("select jsonb_build_object('systemIdentifier',(select system_identifier::text from pg_control_system()),'databaseOid',(select oid::text from pg_database where datname=current_database()),'database',current_database());");
if(JSON.stringify(databaseIdentity)!==JSON.stringify(baseline.databaseIdentity)){
 for(const key of ["systemIdentifier","databaseOid","database"])if(databaseIdentity[key]!==baseline.databaseIdentity[key])throw new Error("Owned bootstrap database identity mismatch.");
}
const service=process.env.SUPABASE_SERVICE_ROLE_KEY||"", anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY||"";
if(!service||!anon)throw new Error("Owned local Auth keys are required.");
const admin=createClient(authUrl,service,{auth:{persistSession:false,autoRefreshToken:false}});
const email=`local-package-reviewer-${randomUUID()}@example.test`,password=`${randomUUID()}Aa1!`;
const created=await admin.auth.admin.createUser({email,password,email_confirm:true});
if(created.error||!created.data.user)throw new Error("Actual local Auth reviewer creation failed.");
const userId=created.data.user.id,cookies:Array<{name:string;value:string}>=[];
const signed=createServerClient(authUrl,anon,{cookies:{getAll:()=>[],setAll:values=>{for(const cookie of values)cookies.push({name:cookie.name,value:cookie.value});}}});
const session=await signed.auth.signInWithPassword({email,password});
if(session.error||session.data.user?.id!==userId)throw new Error("Actual local Auth reviewer sign-in failed.");
// Actual app identity synchronization; do not insert/verify a fictional public user.
const response=await fetch(new URL("/api/workspace",app),{signal:AbortSignal.timeout(45_000),headers:{cookie:cookies.map(c=>`${c.name}=${c.value}`).join("; ")}});
if(response.status!==200)throw new Error("Actual workspace reviewer identity synchronization failed.");
const policyVersion="fictional-local-package-review-policy-2026-10-08";
const policy=sql(`insert into public.system_revision_reviewers(user_id,policy_version,active)
 select id,:'v3',true from public.users where id=:'v1'::uuid and lower(email)=lower(:'v2') and verified_at is not null;
 select jsonb_build_object('userId',u.id,'email',u.email,'verified',u.verified_at is not null,'policyVersion',r.policy_version,'active',r.active)
 from public.users u join public.system_revision_reviewers r on r.user_id=u.id where u.id=:'v1'::uuid;`,[userId,email,policyVersion]);
if(policy.userId!==userId||policy.email!==email||policy.verified!==true||policy.active!==true||policy.policyVersion!==policyVersion)throw new Error("Real local Auth and fictional policy fixture did not bind.");
// Mode600 credentials are sourced only by the Playwright process. Never add
// them to runtime.env, server env, source receipts, logs or test attachments.
const shell=(value:string)=>"'"+value.replace(/'/g,"'\\''")+"'";
writeFileSync(join(directory,"package-reviewer-test.env"),`export STRELVA_LOCAL_PACKAGE_REVIEWER_EMAIL=${shell(email)}\nexport STRELVA_LOCAL_PACKAGE_REVIEWER_PASSWORD=${shell(password)}\nexport STRELVA_LOCAL_PACKAGE_REVIEWER_RECEIPT=${shell(join(directory,"package-reviewer-fixture.json"))}\n`,{mode:0o600,flag:"wx"});
writeFileSync(join(directory,"package-reviewer-fixture.json"),JSON.stringify({kind:"fictional-owned-local-reviewer-policy",realAuth:true,localFictionalPolicy:true,productionQualification:false,
 policy,databaseIdentity,authEndpointSha256:sha(authUrl),createdAt:new Date().toISOString(),sourceApprovals:"Actual signed /api/workspace/packages review producer only; no qualification/approval inserted by setup."},null,2)+"\n",{mode:0o600,flag:"wx"});
process.stdout.write("Real local Auth reviewer and explicit fictional policy fixture prepared; no source approval or production qualification created.\n");
}
void main().catch(error=>{process.stderr.write((error instanceof Error?error.message:"Owned local reviewer fixture failed.")+"\n");process.exitCode=1;});
