/** Actual local PG authority/preparations/receipts; fictional Google and session transport.
 * Run only from check-bundle-maintenance.sh's owned disposable cluster. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { prepareBundleMaintenance, checkBundleMaintenanceEvent, executeGoogleListingEvent, undoListingChange, createSupabaseReceiptStore, type MaintenanceDeps, type MaintenanceRpc } from "../src/products/google-listing/server";
import { authorizePublishingEvent } from "../src/products/publishing/server";
import { listingControlSchema } from "../src/products/google-listing/contracts";
import { businessRecordSchema } from "../src/platform/business-record/contracts";
import type { UnifiedEvent } from "../src/platform/infra/event-contract";
import type { TenantPublishingPorts } from "../src/platform/infra/tenant-publishing";
import type { GoogleListingClient } from "../src/products/google-listing/client";
import type { WorkspaceActor } from "../src/platform/workspaces/types";
const url=process.env.STRELVA_MAINTENANCE_TEST_DATABASE_URL;
if(!url||!url.includes("host=")) throw new Error("Only an explicit disposable socket database is allowed.");
async function main(){
const owner={userId:"99100000-0000-4000-8000-000000000001",verifiedEmail:"rr-owner@example.test"};
const agency={userId:"99100000-0000-4000-8000-000000000002",verifiedEmail:"rr-agency@example.test"};
const business="99100000-0000-4000-8000-000000000011",binding="99100000-0000-4000-8000-000000000201";
const sql=(statement:string)=>execFileSync("psql",[url!,"--no-psqlrc","-At","-v","ON_ERROR_STOP=1","-c",statement],{encoding:"utf8"}).trim();
const quote=(value:unknown)=>value===null?"null":typeof value==="number"||typeof value==="boolean"?String(value):"'"+(typeof value==="object"?JSON.stringify(value):String(value)).replaceAll("'","''")+"'";
const rpc:MaintenanceRpc=async(name,args)=>{assert.match(name,/^[a-z_]+$/);try{return{data:JSON.parse(sql(`select to_jsonb(public.${name}(${Object.entries(args).map(([key,value])=>`${key}=>${quote(value)}`).join(",")}));`)||"null"),error:null};}catch(error){return{data:null,error};}};
async function record(actor:WorkspaceActor,id:string){const result=await rpc("read_business_record",{p_workspace_id:id,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail});if(result.error)throw result.error;return businessRecordSchema.parse(result.data);}
const attachment=sql("select id from public.bundle_maintenance_attachments limit 1");
process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE="1"; // local fixture only
let writes=0, hours:Record<string,unknown>={},reply:string|undefined;
const ok=<T>(data:T)=>({ok:true as const,data});
const google:GoogleListingClient={
 listReviews:async()=>ok({reviews:[{reviewId:"fresh-review",reviewer:{displayName:"Fictional reviewer"},starRating:"FIVE",comment:"Our fixture appointment was on time."}]}),
 getReview:async()=>ok({reviewId:"fresh-review",reviewReply:reply?{comment:reply}:undefined}),
 updateReply:async(_location,_id,text)=>{writes++;reply=text;return ok({comment:text});},deleteReply:async()=>{writes++;reply=undefined;return ok(null);},
 getLocation:async()=>ok(hours),patchLocation:async(_location,_mask,body)=>{writes++;hours=body;return ok(body);},
 createPost:async()=>{throw new Error("No post in this fixture");},getPost:async()=>{throw new Error("No post");},deletePost:async()=>{throw new Error("No post");},
};
const receipts=createSupabaseReceiptStore({rpc:async(name,args)=>{const result=await rpc(name,args);return {data:result.data,error:result.error?{message:String(result.error)}:null};}});
const ctx={workspaceId:business,bindingId:binding,lifecycle:"live" as const,location:{accountId:"accounts/fictional",locationId:"location"},client:google,receipts};
const events=new Map<string,UnifiedEvent>();
const ports:TenantPublishingPorts={addEvent:async event=>{const row={...event,id:randomUUID(),createdAt:new Date().toISOString()};events.set(row.id,row);return row;},getEventRaw:async id=>events.get(id)??null,getEventsRaw:async()=>[...events.values()],getEvents:async()=>[...events.values()],markExecutionExternalAccepted:async()=>{},markExecutionExternalUnconfirmed:async()=>{},getEntry:async()=>null,listEntriesForType:async()=>[],resolveEventAction:async()=>({changed:false}),mirrorPublishedReviewReply:async()=>{},recordGoogleConnection:async()=>{throw new Error("No grants");}};
let drafted=0;
const deps:MaintenanceDeps={rpc,record,context:async()=>ctx,events:async()=>ports,mode:async()=>"approve",declined:async()=>false,draft:async(review)=>{drafted++;assert.equal(review.reviewId,"fresh-review");return "Your fixture appointment stayed on schedule. Thank you for sharing that detail.";}};
const prepared=await prepareBundleMaintenance(agency,{attachmentId:attachment,cycleKey:"native:execution"},deps);
assert.equal(prepared.events.length,2);assert.equal(prepared.approved,false);assert.equal(writes,0);assert.equal(drafted,1);
// Real authorizer, actual native owner/record authorization, fictional verified
// session and release transport. This is not actual Supabase Auth proof.
const authorityDeps={target:async()=>null,owner:async()=>null,session:async()=>({id:owner.userId,email:owner.verifiedEmail,email_confirmed_at:new Date().toISOString(),app_metadata:{},user_metadata:{},aud:"authenticated",created_at:new Date().toISOString()}),permission:async()=>false,linked:async()=>null,record,released:async()=>true,viewer:async()=>({operator:false,tester:false}),workspaceReleased:async()=>true};
const executionDeps={events:async()=>ports,noteAccess:async(workspaceId:string,locationId:string,pending:boolean)=>{const result=await rpc("note_google_listing_access",{p_workspace_id:workspaceId,p_location_id:locationId,p_pending:pending});return listingControlSchema.parse(result.data);},context:async()=>ctx,maintenance:async(input:Parameters<typeof checkBundleMaintenanceEvent>[0])=>checkBundleMaintenanceEvent(input,rpc),authorize:async(input:Parameters<typeof authorizePublishingEvent>[0])=>authorizePublishingEvent(input,authorityDeps)};
const agencyResult=await executeGoogleListingEvent({tenantId:prepared.events[0]!.tenantId,event:prepared.events[0]!,actorId:agency.userId,attemptId:"agency-cannot-approve"},{...executionDeps,authorize:input=>authorizePublishingEvent(input,{...authorityDeps,session:async()=>({...await authorityDeps.session(),id:agency.userId,email:agency.verifiedEmail})})});
assert.equal(agencyResult?.accepted,false);assert.equal(agencyResult?.reason,"publishing_owner_instruction_required");assert.equal(writes,0);
for(const event of prepared.events){assert.equal(event.status,"pending");const result=await executeGoogleListingEvent({tenantId:event.tenantId,event,actorId:owner.userId,attemptId:"fictional-human-approval"},executionDeps);assert.equal(result?.accepted,true);assert.equal(result?.verified,true);assert.ok(result?.receiptId);const receipt=await receipts.get(result!.receiptId!,business);assert.equal(receipt?.authority.kind,"owner_approval");assert.equal(receipt?.readback,"matched");const before:number=writes;await executeGoogleListingEvent({tenantId:event.tenantId,event,actorId:owner.userId,attemptId:"same-approval-replay"},executionDeps);assert.equal(writes,before);const undo=await undoListingChange(ctx,{receiptId:result!.receiptId!,authority:{kind:"owner_undo",actor:owner.userId}});assert.equal(undo.status,"posted");}
const linked=await rpc("read_bundle_maintenance_receipts",{p_business_id:business,p_user_id:owner.userId,p_verified_email:owner.verifiedEmail,p_from:new Date(Date.now()-60_000).toISOString(),p_to:new Date(Date.now()+60_000).toISOString()});assert.equal(linked.error,null);assert.equal((linked.data as unknown[]).length,2);
assert.equal(sql(`begin read only; select jsonb_array_length(public.read_bundle_maintenance_receipts(${quote(business)},${quote(owner.userId)},${quote(owner.verifiedEmail)},clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 minute')); rollback;`).split("\n").includes("2"),true);
const prior=writes;
sql("update public.service_requests set provider_acceptance='pending',accepted_by=null,accepted_at=null where id='99100000-0000-4000-8000-000000000021'");
await assert.rejects(()=>executeGoogleListingEvent({tenantId:prepared.events[0]!.tenantId,event:prepared.events[0]!,actorId:owner.userId,attemptId:"revoked-replay"},executionDeps));assert.equal(writes,prior);
console.log("PASS: actual native agency identity and owner record check; frozen owner events; two fictional Google writes, matched native receipts, exact replay, undo, linked proof, revoked mandate refused. Event/session transports remain fictional.");

}
void main().catch(error=>{console.error(error);process.exitCode=1;});
