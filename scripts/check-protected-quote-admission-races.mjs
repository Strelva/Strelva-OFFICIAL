// Prepared native race proof. Run only against a parent-owned disposable clone.
// This creates fictional rows; the parent destroys the clone after retaining logs.
import { spawn } from "node:child_process";
import { randomUUID, randomBytes } from "node:crypto";
const db=process.env.STRELVA_LOCAL_DB_URL||"", url=new URL(db);
if(process.env.STRELVA_MONEY_RACE_PROOF!=="1"||!["127.0.0.1","localhost"].includes(url.hostname)||!url.pathname.slice(1).startsWith("money_admission_"))throw new Error("Requires explicit money race opt-in and a money_admission_ disposable loopback database clone.");
const args=[db,"-X","-qAt","-v","ON_ERROR_STOP=1"];
function run(sql){return new Promise((resolve,reject)=>{const child=spawn("psql",args,{stdio:["pipe","pipe","pipe"]});let out="",error="";child.stdout.on("data",chunk=>out+=chunk);child.stderr.on("data",chunk=>error+=chunk);child.on("error",reject);child.on("exit",code=>code===0?resolve(out.trim()):reject(new Error(error)));child.stdin.end(sql);});}
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const literal=value=>`'${value.replaceAll("'","''")}'`;
for(const kind of ["clock expiry","verified identity withdrawal"]){
 const user=randomUUID(),ws=randomUUID(),lead=randomUUID(),request=randomUUID(),hash=randomBytes(32).toString("hex"),email=`quote-${user}@example.test`,app=`quote-race-${user}`;
 await run(`insert into public.users(id,email,verified_at) values('${user}',${literal(email)},clock_timestamp());
 insert into public.workspaces(id,kind,name,created_by) values('${ws}','customer','Native quote race fixture','${user}');
 insert into public.workspace_memberships(workspace_id,user_id,role,created_by) values('${ws}','${user}','owner','${user}');
 insert into public.tenant_leads(id,workspace_id,agent_workspace_id,tenant_slug_at_capture,lead_id,submission_hash,name,email,captured_at,recorded_via,origin,inquiry_type,intake_state)
 values('${lead}','${ws}','${ws}','workspace:${ws}','lead_${lead.replaceAll("-","")}','abc123','Fixture customer','customer@example.test',clock_timestamp(),'agent','agent','quote','kept');
 insert into public.assistant_tokens(token_hash,client_id,resource,scopes,workspace_id,user_id,verified_email,expires_at)
 values('${hash}','https://fixture.example.test/client.json','https://app.strelva.com/api/mcp/public',array['quotes:approve'],'${ws}','${user}',${literal(email)},clock_timestamp()+interval '${kind==="clock expiry"?"2 seconds":"1 hour"}');`);
 const holder=spawn("psql",args,{stdio:["pipe","pipe","pipe"]});let output="",stderr="";
 const ready=new Promise((resolve,reject)=>{holder.stdout.on("data",chunk=>{output+=chunk;if(output.includes("quote-lock-ready"))resolve();});holder.stderr.on("data",chunk=>stderr+=chunk);holder.on("error",reject);holder.on("exit",code=>{if(code!==0)reject(new Error(stderr));});});
 holder.stdin.write(`begin;select pg_advisory_xact_lock(hashtextextended('agent-quote:${lead}',1611));select 'quote-lock-ready';\n`);
 await ready;
 let worker;
 try {
  worker=run(`set application_name=${literal(app)};select public.call_agent_protected_tool('${hash}','https://app.strelva.com/api/mcp/public','approve_quote','${ws}',jsonb_build_object('inquiryId','${lead}','requestId','${request}','amountCents',1000,'currency','USD','terms','Exact fixture terms'));`).then(()=>({ok:true}),error=>({ok:false,error}));
  const deadline=Date.now()+5000;let blocked=false;
  while(Date.now()<deadline){if(await run(`select exists(select 1 from pg_stat_activity where application_name=${literal(app)} and wait_event='advisory')`)==="t"){blocked=true;break;}await sleep(25);}
  if(!blocked)throw new Error("Quote never reached its serialization wait.");
  if(kind==="clock expiry")await sleep(2200);
  else await run(`update public.users set verified_at=null where id='${user}'`);
 } finally {holder.stdin.end("commit;\n");}
 const result=await worker;
 if(!result||result.ok||!result.error.message.includes("oauth_invalid_token"))throw new Error(`Expected current token refusal after ${kind}: ${result?.error?.message||"success"}`);
 if(await run(`select count(*) from public.agent_quote_receipts where workspace_id='${ws}'`)!=="0")throw new Error(`Quote receipt appended after ${kind}`);
 console.log(`Native quote serialization race PASS: ${kind}; zero receipts.`);
}
