import { createHash } from "node:crypto";
import { readPublishingSnapshot } from "@/products/publishing/server";
import { publishingWorkspaceId } from "@/platform/infra/publishing-scope";
import { getSupabase } from "@/platform/infra/db/client";
import { canonicalJson } from "@/platform/business-record/tenant-import";
import { readBusinessRecord } from "@/platform/business-record/service";
import { tenantPublishingPorts } from "@/platform/infra/tenant-publishing";
import type { GoogleMakeRealPorts } from "@/platform/make-real/google-adapter";
import type { ListingReceipt } from "./contracts";
import { googleTargetAllowed, undoWorkspaceGoogleChange, tenantListingContext } from "./workspace";
import { readListingControl } from "./controls";
/** Hash content and source/authority pins; execution markers are mutable receipts. */
export function googleMakeRealDraftDigest(metadata: Record<string, unknown>): string {
 return createHash("sha256").update(canonicalJson({workspaceId:metadata.workspaceId,locationId:metadata.locationId,draft:metadata.draft,recordRevision:metadata.recordRevision??null,version:metadata.version??null,maintenance:metadata.maintenance??null})).digest("hex");
}
export const googleMakeRealPorts:GoogleMakeRealPorts={
 async inspect(actor,businessId,request){
  if((await readBusinessRecord(actor,businessId)).access!=="owner" || !(await googleTargetAllowed(actor,businessId,request.tenantId)))throw new Error("Current Google owner authority is required.");
  const snapshot=await readPublishingSnapshot(actor,businessId);
  const binding=snapshot.bindings.find(binding=>binding.status==="connected" && (binding.originTenantId===request.tenantId || (!binding.originTenantId && publishingWorkspaceId(request.tenantId)===businessId)) && binding.locations.some(location=>location.locationId===request.locationId));
  if(!binding)throw new Error("The selected Google grant was revoked or the location moved.");
  const event=await (await tenantPublishingPorts()).getEventRaw(request.eventId);
  if(!event || event.tenantId!==request.tenantId || event.metadata?.kind!=="workspace_google_listing_draft" || event.metadata.workspaceId!==businessId || event.metadata.locationId!==request.locationId || googleMakeRealDraftDigest(event.metadata)!==request.draftDigest)throw new Error("The exact approved Google draft changed or is unavailable.");
  const db=getSupabase();if(!db)throw new Error("Google receipt storage is unavailable.");
  const {data,error}=await (db as unknown as {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:unknown}>}).rpc("read_google_listing_receipt_by_key",{p_workspace_id:businessId,p_idempotency_key:`google-draft:${request.eventId}`});
  if(error)throw new Error("Google receipt could not be read.");
  const receipt=data as unknown as ListingReceipt|null;
  const control=await readListingControl(businessId,request.locationId);
  const ready=!control.paused&&!control.accessPending&&event.status==="pending";
  return {ready,resolved:event.status==="approved",reason:control.paused?"The Google listing is paused.":control.accessPending?"Google project approval or business access is pending.":event.status!=="pending"?"The Google draft is already resolved.":undefined,receipt:receipt?{id:receipt.id,status:receipt.status,readback:receipt.readback,undo:Boolean(receipt.undo)}:null};
 },
 async approve(actor,businessId,request){
  await googleMakeRealPorts.inspect(actor,businessId,request);
  // The existing claimed approval executor owns governance, current authority,
  // provider pacing, record/Version pins, receipts and unknown-effect recovery.
  return (await tenantPublishingPorts()).resolveEventAction(request.tenantId,request.eventId,"approved",`owner-link:${actor.verifiedEmail}`);
 },
 async verify(actor,businessId,request,receiptId){
  await googleMakeRealPorts.inspect(actor,businessId,request);
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
 undo:(actor,businessId,request,receiptId)=>undoWorkspaceGoogleChange(actor,{workspaceId:businessId,tenantId:request.tenantId,locationId:request.locationId,receiptId}),
};
