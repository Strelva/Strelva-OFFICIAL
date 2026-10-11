import {afterEach,describe,it,expect,vi} from "vitest";
import {queueBundleMaintenanceDraft,prepareBundleMaintenance,type MaintenanceDeps,type MaintenanceRpc} from "@/products/google-listing/maintenance";
import {businessRecordSchema} from "@/platform/business-record/contracts";
import type {TenantPublishingPorts} from "@/platform/infra/tenant-publishing";
const id="99100000-0000-4000-8000-000000000011",actor={userId:"99100000-0000-4000-8000-000000000002",verifiedEmail:"agency@example.test"};
const target={attachmentId:id,bundleId:id,businessId:id,providerWorkspaceId:id,bindingId:id,locationId:"location",tenantId:`workspace-${id}`,replyPolicy:"approve"};
const prior=process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE;
afterEach(()=>{if(prior===undefined)delete process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE;else process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE=prior;});
function ports(){return {addEvent:vi.fn(async()=>{throw new Error("storage lost");}),getEventRaw:vi.fn(async()=>null),getEvents:async()=>[],getEventsRaw:async()=>[],markExecutionExternalAccepted:async()=>{},markExecutionExternalUnconfirmed:async()=>{},getEntry:async()=>null,listEntriesForType:async()=>[],resolveEventAction:async()=>({changed:false}),mirrorPublishedReviewReply:async()=>{},recordGoogleConnection:async()=>({binding:id})} satisfies TenantPublishingPorts;}
describe("explicit bundle maintenance preparation",()=>{
 it("defaults OFF before storage, drafting or Google context",async()=>{
  delete process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE;const rpc=vi.fn<MaintenanceRpc>();const events=vi.fn();
  await expect(queueBundleMaintenanceDraft(actor,id,"cycle:1",0,{action:"reply",reviewId:"review",text:"Exact owner draft"},{rpc,events})).rejects.toThrow("not enabled");expect(rpc).not.toHaveBeenCalled();expect(events).not.toHaveBeenCalled();
 });
 it("a lost event write leaves reconciliation rather than another preparation",async()=>{
  process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE="1";const store=ports();let count=0;
  const rpc:MaintenanceRpc=async()=>({data:{id,replayed:count++>0,eventId:null,target},error:null});
  const input={action:"reply",reviewId:"review",text:"Exact owner draft"};
  await expect(queueBundleMaintenanceDraft(actor,id,"cycle:1",0,input,{rpc,events:async()=>store})).rejects.toThrow("storage lost");
  await expect(queueBundleMaintenanceDraft(actor,id,"cycle:1",0,input,{rpc,events:async()=>store})).rejects.toThrow("reconciliation");expect(store.addEvent).toHaveBeenCalledTimes(1);
 });
 it("refuses authority/source failure before adding an owner event",async()=>{
  process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE="1";const store=ports();
  await expect(queueBundleMaintenanceDraft(actor,id,"cycle:1",0,{action:"reply",reviewId:"review",text:"Exact owner draft"},{rpc:async()=>({data:null,error:{message:"revoked"}}),events:async()=>store})).rejects.toThrow("authority or source");expect(store.addEvent).not.toHaveBeenCalled();
 });
 it("preserves reply OFF and missing source without fabricating maintenance",async()=>{
  process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE="1";const context=vi.fn(),draft=vi.fn(),store=ports();
  const deps:MaintenanceDeps={rpc:async()=>({data:target,error:null}),events:async()=>store,context,mode:async()=>"off",draft,declined:async()=>false,
   record:async()=>businessRecordSchema.parse({workspaceId:id,access:"agency",revision:0,lastSequence:0,updatedAt:null,facts:{},services:[],people:[],contactCount:null})};
  expect(await prepareBundleMaintenance(actor,{attachmentId:id,cycleKey:"cycle:off"},deps)).toEqual({events:[],unavailable:["hours_source_missing","reply_mode_off"],approved:false});expect(draft).not.toHaveBeenCalled();expect(context).not.toHaveBeenCalled();expect(store.addEvent).not.toHaveBeenCalled();
 });
 it("rejects over-limit multibyte reply before native reservation",async()=>{
  process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE="1";const rpc=vi.fn<MaintenanceRpc>();const store=ports();
  await expect(queueBundleMaintenanceDraft(actor,id,"cycle:1",0,{action:"reply",reviewId:"review",text:"🙂".repeat(1025)},{rpc,events:async()=>store})).rejects.toThrow();expect(rpc).not.toHaveBeenCalled();
 });
});

import {executeGoogleListingEvent,type GoogleListingExecutionDeps} from "@/products/google-listing/workspace";
import type {UnifiedEvent} from "@/platform/infra/event-contract";
it("maintenance OFF refuses an approved event before token refresh/provider reads",async()=>{
 delete process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE;
 const context=vi.fn<GoogleListingExecutionDeps["context"]>(),maintenance=vi.fn<GoogleListingExecutionDeps["maintenance"]>();
 const event:UnifiedEvent={id:"owner-event",tenantId:`workspace-${id}`,source:"google",type:"content_update",title:"Exact draft",body:"Fixture",createdAt:new Date().toISOString(),status:"pending",metadata:{kind:"workspace_google_listing_draft",workspaceId:id,locationId:"location",draft:{action:"reply",reviewId:"review",text:"Exact approved draft"},maintenance:{preparationId:id,bindingId:id}}};
 const deps:GoogleListingExecutionDeps={authorize:async()=>({allowed:true,actor,viewer:{operator:false,tester:false}}),context,maintenance,events:async()=>ports(),noteAccess:async()=>({workspaceId:id,locationId:"location",paused:false,accessPending:false,updatedAt:null})};
 expect(await executeGoogleListingEvent({tenantId:event.tenantId,event,actorId:actor.userId,attemptId:"approved"},deps)).toEqual({accepted:false,reason:"maintenance_release_off"});expect(context).not.toHaveBeenCalled();expect(maintenance).not.toHaveBeenCalled();
 process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE="1";maintenance.mockRejectedValue(new Error("revoked native mandate"));
 await expect(executeGoogleListingEvent({tenantId:event.tenantId,event,actorId:actor.userId,attemptId:"approved"},deps)).rejects.toThrow("revoked native mandate");expect(context).not.toHaveBeenCalled();
});
