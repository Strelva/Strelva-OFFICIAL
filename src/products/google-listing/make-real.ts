import { assertCurrentNativeGoogleGrant } from "./native/contracts";
import { googleMakeRealDraftDigest } from "./make-real-draft";
export { googleMakeRealDraftDigest } from "./make-real-draft";
import { readPublishingSnapshot } from "@/products/publishing/server";
import { publishingWorkspaceId } from "@/platform/infra/publishing-scope";
import { getSupabase } from "@/platform/infra/db/client";
import { readBusinessRecord } from "@/platform/business-record/service";
import { tenantPublishingPorts } from "@/platform/infra/tenant-publishing";
import type { GoogleMakeRealPorts } from "@/platform/make-real/google-adapter";
import { readGoogleMakeRealReceipt } from "./make-real-receipts";
import { googleReceiptIntentDigest } from "./receipts";
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
  if(request.nativeGrant) await assertCurrentNativeGoogleGrant(businessId,request.locationId,request.nativeGrant);
  if (service) {
   const checked=await checkGoogleMakeRealService({workspaceId:businessId,actorId:googleServiceActor(service),request,context:service});
   if(checked.userId!==actor.userId || checked.verifiedEmail.toLowerCase()!==actor.verifiedEmail.toLowerCase())throw new Error("Google service identity changed.");
  } else if((await readBusinessRecord(actor,businessId)).access!=="owner" || !(await googleTargetAllowed(actor,businessId,request.tenantId)))throw new Error("Current Google owner authority is required.");
  const snapshot=await readPublishingSnapshot(actor,businessId);
  const binding=snapshot.bindings.find(binding=>binding.status==="connected" && (binding.originTenantId===request.tenantId || (!binding.originTenantId && publishingWorkspaceId(request.tenantId)===businessId)) && binding.locations.some(location=>location.locationId===request.locationId));
  if(!binding)throw new Error("The selected Google grant was revoked or the location moved.");
  const event=await (await tenantPublishingPorts()).getEventRaw(request.eventId);
  if(!event || event.tenantId!==request.tenantId || event.metadata?.kind!=="workspace_google_listing_draft" || event.metadata.workspaceId!==businessId || event.metadata.locationId!==request.locationId || googleMakeRealDraftDigest(event.metadata)!==request.draftDigest || (request.nativeGrant && JSON.stringify(event.metadata.nativeGrant)!==JSON.stringify(request.nativeGrant)))throw new Error("The exact approved Google draft changed or is unavailable.");
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
  const ctx=await tenantListingContext(request.tenantId,businessId,request.locationId,request.nativeGrant);
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
 async verifyUndo(actor,businessId,request,receiptId){
  await ports.inspect(actor,businessId,request);
  const ctx=await tenantListingContext(request.tenantId,businessId,request.locationId,request.nativeGrant);
  const original=await ctx.receipts.get(receiptId,businessId);
  const db=getSupabase();
  const inverse=original?.undoneByReceiptId?await ctx.receipts.get(original.undoneByReceiptId,businessId):original&&db?await readGoogleMakeRealReceipt(`undo:${original.id}`,async key=>{
   const {data,error}=await (db as unknown as {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}).rpc("read_google_listing_receipt_by_key",{p_workspace_id:businessId,p_idempotency_key:key});
   if(error)throw new Error("Google inverse receipt could not be read.");return data as ListingReceipt|null;
  }):null;
  if(!original || original.bindingId!==ctx.bindingId || original.locationId!==request.locationId || !original.undo || original.providerPayloadExpired || !inverse || inverse.undoesReceiptId!==original.id || inverse.bindingId!==ctx.bindingId || inverse.locationId!==request.locationId || !["posting","posted","posted_unverified","held_by_google"].includes(inverse.status) || inverse.providerPayloadExpired)return {ok:false,detail:"Exact retained matched Google compensating receipt unavailable."};
  if(original.authority.kind!=="owner_approval" || original.authority.approvalRef!==request.eventId || inverse.authority.kind!=="owner_undo" || inverse.authority.actor!==actor.userId || inverse.targetRef!==original.targetRef || !original.intentDigest || !inverse.intentDigest)return {ok:false,detail:"Exact approved native Google undo authority unavailable."};
  const inverseAction=original.undo.kind==="delete_post"?"post_delete":original.undo.kind==="delete_reply"?"reply_delete":original.undo.kind==="restore_reply"?"reply_update":original.action;
  const inverseAfter=original.undo.kind==="delete_post"?null:original.undo.kind==="delete_reply"?{reply:null}:original.undo.kind==="restore_reply"?{reply:original.undo.previous}:original.undo.snapshot;
  const expectedIntent=googleReceiptIntentDigest({workspaceId:businessId,bindingId:ctx.bindingId,locationId:request.locationId,action:inverseAction,targetRef:original.targetRef,authority:inverse.authority,before:original.after,after:inverseAfter,undoesReceiptId:original.id,idempotencyKey:`undo:${original.id}`});
  if(inverse.action!==inverseAction || inverse.intentDigest!==expectedIntent)return {ok:false,detail:"Exact retained native Google inverse intent changed."};
  let ok=false;
  const normalize=(value:string|undefined)=>value?.replace(/\s+/g," ").trim();
  if(original.undo.kind==="delete_post") {const live=await ctx.client.getPost(original.undo.postName);ok=!live.ok&&live.kind==="not_found";}
  else if(original.undo.kind==="delete_reply" || original.undo.kind==="restore_reply") {const live=await ctx.client.getReview(ctx.location,original.undo.reviewId);ok=live.ok&&(original.undo.kind==="delete_reply"?!live.data.reviewReply?.comment:normalize(live.data.reviewReply?.comment)===normalize(original.undo.previous));}
  else {const undo=original.undo;const live=await ctx.client.getLocation(ctx.location,[...undo.updateMask,"metadata"]);const {hoursMatch,infoMatches}=await import("./record");ok=live.ok&&(undo.updateMask.includes("regularHours")||undo.updateMask.includes("specialHours")?hoursMatch(undo.snapshot as Parameters<typeof hoursMatch>[0],live.data):infoMatches(undo.snapshot as Parameters<typeof infoMatches>[0],live.data,undo.updateMask));}
  if(ok && inverse) {const settled=await ctx.receipts.settle(inverse.id,businessId,{status:"posted",readback:"matched"});const linked=await ctx.receipts.get(original.id,businessId);ok=settled.status==="posted"&&settled.readback==="matched"&&linked?.status==="undone"&&linked.undoneByReceiptId===inverse.id;}
  return {ok,detail:ok?"Google currently confirms the exact compensating change.":"Google current inverse readback is unconfirmed."};
 },
 async undo(actor,businessId,request,receiptId){
  await ports.inspect(actor,businessId,request);
  if(!service)return undoWorkspaceGoogleChange(actor,{workspaceId:businessId,tenantId:request.tenantId,locationId:request.locationId,receiptId,...(request.nativeGrant?{nativeGrant:request.nativeGrant}:{})});
  const state=await ports.inspect(actor,businessId,request);
  if(state.receipt?.id!==receiptId)throw new Error("Google undo receipt changed.");
  const actorId=googleServiceActor(service);
  await checkGoogleMakeRealService({workspaceId:businessId,actorId,request,context:service,mode:"undo"});
  const ctx=await tenantListingContext(request.tenantId,businessId,request.locationId,request.nativeGrant);
  const recheck=async()=>{
   const current=await checkGoogleMakeRealService({workspaceId:businessId,actorId,request,context:service,mode:"undo"});
   if(current.bindingId!==ctx.bindingId)throw new Error("Google undo binding changed.");
  };
  await recheck();
  const original=await ctx.receipts.get(receiptId,businessId);
  if(!original || original.authority.kind!=="owner_approval" || original.authority.approvalRef!==request.eventId)throw new Error("Google undo instruction changed.");
  ctx.authorizeService=recheck;
  return undoListingChange(ctx,{receiptId,authority:{kind:"owner_undo",actor:actorId},retryFailed:true});
 },
 };
 return ports;
}
export const googleMakeRealPorts=createGoogleMakeRealPorts();
