import { googleMakeRealDraftDigest } from "./make-real-draft";
export { googleMakeRealDraftDigest } from "./make-real-draft";
import { readPublishingSnapshot } from "@/products/publishing/server";
import { publishingWorkspaceId } from "@/platform/infra/publishing-scope";
import { getSupabase } from "@/platform/infra/db/client";
import { readBusinessRecord } from "@/platform/business-record/service";
import { tenantPublishingPorts } from "@/platform/infra/tenant-publishing";
import type { GoogleMakeRealPorts } from "@/platform/make-real/google-adapter";
import { readGoogleMakeRealReceipt } from "./make-real-receipts";
import type { ListingReceipt } from "./contracts";
import { googleTargetAllowed, undoWorkspaceGoogleChange, tenantListingContext } from "./workspace";
import { checkGoogleMakeRealService, googleServiceActor } from "./make-real-service-authority";
import type { LiveMakeRealServiceContext } from "@/platform/make-real/live";
import { undoListingChange } from "./service";
import { readListingControl } from "./controls";
function createGoogleMakeRealPorts(service?:LiveMakeRealServiceContext):GoogleMakeRealPorts {
 const ports:GoogleMakeRealPorts={
 forService:context=>createGoogleMakeRealPorts(context),
 async inspect(actor,businessId,request){
  if (service) {
   const checked=await checkGoogleMakeRealService({workspaceId:businessId,actorId:googleServiceActor(service),request,context:service});
   if(checked.userId!==actor.userId || checked.verifiedEmail.toLowerCase()!==actor.verifiedEmail.toLowerCase())throw new Error("Google service identity changed.");
  } else if((await readBusinessRecord(actor,businessId)).access!=="owner" || !(await googleTargetAllowed(actor,businessId,request.tenantId)))throw new Error("Current Google owner authority is required.");
  const snapshot=await readPublishingSnapshot(actor,businessId);
  const binding=snapshot.bindings.find(binding=>binding.status==="connected" && (binding.originTenantId===request.tenantId || (!binding.originTenantId && publishingWorkspaceId(request.tenantId)===businessId)) && binding.locations.some(location=>location.locationId===request.locationId));
  if(!binding)throw new Error("The selected Google grant was revoked or the location moved.");
  const event=await (await tenantPublishingPorts()).getEventRaw(request.eventId);
  if(!event || event.tenantId!==request.tenantId || event.metadata?.kind!=="workspace_google_listing_draft" || event.metadata.workspaceId!==businessId || event.metadata.locationId!==request.locationId || googleMakeRealDraftDigest(event.metadata)!==request.draftDigest)throw new Error("The exact approved Google draft changed or is unavailable.");
  const db=getSupabase();if(!db)throw new Error("Google receipt storage is unavailable.");
  const receipt=await readGoogleMakeRealReceipt(`google-draft:${request.eventId}`,async key=>{
   const {data,error}=await (db as unknown as {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}).rpc("read_google_listing_receipt_by_key",{p_workspace_id:businessId,p_idempotency_key:key});
   if(error)throw new Error("Google receipt could not be read.");
   return data as ListingReceipt|null;
  });
  if(receipt && (receipt.workspaceId!==businessId || receipt.bindingId!==binding.id || receipt.locationId!==request.locationId))throw new Error("Google receipt target changed.");
  const control=await readListingControl(businessId,request.locationId);
  const ready=!control.paused&&!control.accessPending&&event.status==="pending";
  return {ready,resolved:event.status==="approved",reason:control.paused?"The Google listing is paused.":control.accessPending?"Google project approval or business access is pending.":event.status!=="pending"?"The Google draft is already resolved.":undefined,receipt:receipt?{id:receipt.id,status:receipt.status,readback:receipt.readback,undo:Boolean(receipt.undo)}:null};
 },
 async approve(actor,businessId,request){
  await ports.inspect(actor,businessId,request);
  // The existing claimed approval executor owns governance, current authority,
  // provider pacing, record/Version pins, receipts and unknown-effect recovery.
  return (await tenantPublishingPorts()).resolveEventAction(request.tenantId,request.eventId,"approved",service?googleServiceActor(service):actor.userId);
 },
 async verify(actor,businessId,request,receiptId){
  await ports.inspect(actor,businessId,request);
  const event=await (await tenantPublishingPorts()).getEventRaw(request.eventId);
  const draft=event?.metadata?.draft as {action:string;post?:{summary:string};hours?:unknown;record?:unknown;reviewId?:string;text?:string}|undefined;
  if(!draft)throw new Error("The Google draft is unavailable.");
  const ctx=await tenantListingContext(request.tenantId,businessId,request.locationId);
  const receipt=receiptId?await ctx.receipts.get(receiptId,businessId):null;
  let matched=false;
  const {hoursMatch,hoursToGoogle,infoMatches,infoToGoogle}=await import("./record");
  if(draft.action==="hours" || draft.action==="info"){
   const desired=draft.action==="hours"?draft.hours?hoursToGoogle(draft.hours as Parameters<typeof hoursToGoogle>[0]):{regularHours:null,specialHours:null}:infoToGoogle(draft.record as Parameters<typeof infoToGoogle>[0]);
   const mask=draft.action==="hours"?["regularHours","specialHours"]:(desired as ReturnType<typeof infoToGoogle>).updateMask;
   const live=await ctx.client.getLocation(ctx.location,[...mask,"metadata"]);
   matched=live.ok && (draft.action==="hours"?hoursMatch(live.data,desired as Parameters<typeof hoursMatch>[1]):infoMatches((desired as ReturnType<typeof infoToGoogle>).body,live.data,mask));
  } else if(receipt && draft.action==="post" && receipt.providerRef){
   const live=await ctx.client.getPost(receipt.providerRef);
   matched=live.ok&&live.data.state==="LIVE"&&live.data.summary?.replace(/\s+/g," ").trim()===draft.post?.summary.replace(/\s+/g," ").trim();
  } else if(receipt && draft.action==="reply" && draft.reviewId){
   const live=await ctx.client.getReview(ctx.location,draft.reviewId);
   matched=live.ok&&live.data.reviewReply?.comment?.replace(/\s+/g," ").trim()===draft.text?.replace(/\s+/g," ").trim();
  }
  return {ok:matched,detail:matched?"Google currently matches the approved draft.":"Google current readback does not confirm the approved draft."};
 },
 async undo(actor,businessId,request,receiptId){
  if(!service)return undoWorkspaceGoogleChange(actor,{workspaceId:businessId,tenantId:request.tenantId,locationId:request.locationId,receiptId});
  const state=await ports.inspect(actor,businessId,request);
  if(state.receipt?.id!==receiptId)throw new Error("Google undo receipt changed.");
  const actorId=googleServiceActor(service);
  const recheck=async()=>{await checkGoogleMakeRealService({workspaceId:businessId,actorId,request,context:service,mode:"undo"});};
  await recheck();
  const ctx=await tenantListingContext(request.tenantId,businessId,request.locationId);
  const original=await ctx.receipts.get(receiptId,businessId);
  if(!original || original.authority.kind!=="owner_approval" || original.authority.approvalRef!==request.eventId)throw new Error("Google undo instruction changed.");
  ctx.authorizeService=recheck;
  return undoListingChange(ctx,{receiptId,authority:{kind:"owner_undo",actor:actorId},retryFailed:true});
 },
 };
 return ports;
}
export const googleMakeRealPorts=createGoogleMakeRealPorts();
