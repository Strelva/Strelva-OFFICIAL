/** #297: explicit agency preparation, never an approval or a Google write.
 * The general standing runner remains read-only. No background project use is
 * enabled here; qualification of Google's agency/project rules remains open. */
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { tenantPublishingPorts, type TenantPublishingPorts } from "@/platform/infra/tenant-publishing";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { readBusinessRecord } from "@/platform/business-record/service";
import { factValueSchemas } from "@/platform/business-record/contracts";
import { hoursMatch,hoursToGoogle } from "./record";
import { listAllReviews, STAR_RATING } from "./client";
import type { ListingContext } from "./service";
import type { UnifiedEvent } from "@/platform/infra/event-contract";

export const maintenanceTargetSchema = z.object({ attachmentId: z.string().uuid(), bundleId: z.string().uuid(), businessId: z.string().uuid(),
 providerWorkspaceId: z.string().uuid(), bindingId: z.string().uuid(), locationId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/), tenantId: z.string().min(1), replyPolicy: z.literal("approve") });
export const maintenanceDraftSchema = z.discriminatedUnion("action", [
 z.object({ action: z.literal("hours"), hours: factValueSchemas.hours }).strict(),
 z.object({ action: z.literal("reply"), reviewId: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/), text: z.string().trim().min(1).refine(value => Buffer.byteLength(value, "utf8") <= 4096) }).strict(),
]);
export type MaintenanceDraft = z.infer<typeof maintenanceDraftSchema>;
export const maintenancePinSchema = z.object({ preparationId: z.string().uuid(),bindingId:z.string().uuid() }).strict();
export type MaintenanceRpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
export function maintenanceRpc(): MaintenanceRpc {
 const db = getSupabase(); if (!db) throw new Error("Maintenance storage is unavailable.");
 return (name, args) => db.rpc(name as never, args as never);
}
async function call(rpc: MaintenanceRpc, name: string, args: Record<string, unknown>) {
 const result = await rpc(name,args); if (result.error) throw new Error("The exact maintenance authority or source is unavailable. Nothing was approved."); return result.data;
}
function enabled() { if (process.env.STRELVA_BUNDLE_MAINTENANCE_RELEASE !== "1") throw new Error("Bundle maintenance is not enabled."); }
export interface MaintenanceDeps {
 rpc: MaintenanceRpc; context(tenantId: string,workspaceId: string,locationId: string): Promise<ListingContext>;
 record: typeof readBusinessRecord; events(): Promise<TenantPublishingPorts>; mode(tenantId:string): Promise<string>;
 draft: NonNullable<TenantPublishingPorts["reviewPreparation"]>["draft"]; declined: NonNullable<TenantPublishingPorts["reviewPreparation"]>["declined"];
}
async function reviewPreparation() { const ports=await tenantPublishingPorts();if(!ports.reviewPreparation)throw new Error("Review preparation is unavailable.");return ports.reviewPreparation; }
export function defaultMaintenanceDeps(): MaintenanceDeps { return { rpc:maintenanceRpc(),context:async (...args) => (await import("./workspace")).tenantListingContext(...args),record:readBusinessRecord,events:tenantPublishingPorts,
 mode:async id => (await reviewPreparation()).mode(id), draft:async(...args)=>(await reviewPreparation()).draft(...args),declined:async(...args)=>(await reviewPreparation()).declined(...args) }; }
/** Uses the existing event queue. A lost link is reconciliation, never a second draft. */
export async function queueBundleMaintenanceDraft(actor: WorkspaceActor, attachmentId: string, cycleKey: string, recordRevision: number,
 rawDraft: unknown, deps: Pick<MaintenanceDeps,"rpc"|"events">): Promise<UnifiedEvent> {
 enabled(); const draft=maintenanceDraftSchema.parse(rawDraft);
 const reserved=z.object({id:z.string().uuid(),replayed:z.boolean(),eventId:z.string().nullable(),target:maintenanceTargetSchema}).parse(await call(deps.rpc,"reserve_bundle_maintenance_preparation",{
 p_attachment_id:z.string().uuid().parse(attachmentId),p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_cycle_key:cycleKey,p_record_revision:recordRevision,p_draft:draft }));
 const ports=await deps.events();
 if (reserved.replayed) {
  const event=reserved.eventId?await ports.getEventRaw(reserved.eventId):null;
  if (!event) throw new Error("This preparation needs reconciliation. It was not queued again."); return event;
 }
 const target=reserved.target;
 const event=await ports.addEvent({tenantId:target.tenantId,source:"google",type:"content_update",title:draft.action==="hours"?"Review your Google hours":"Review your Google reply",
 body:JSON.stringify(draft,null,2),status:"pending",metadata:{kind:"workspace_google_listing_draft",workspaceId:target.businessId,locationId:target.locationId,draft,
 reviewAudience:"owner",recordRevision,maintenance:{preparationId:reserved.id,bindingId:target.bindingId}}},{requirePersistence:true});
 await call(deps.rpc,"link_bundle_maintenance_event",{p_preparation_id:reserved.id,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail,p_event_id:event.id}); return event;
}
/** Explicit current staff invocation, bounded to hours and five replies. Does
 * not change reply mode, send, approve, install grants or add a cron. */
export async function prepareBundleMaintenance(actor:WorkspaceActor,raw:unknown,override?:MaintenanceDeps) {
 enabled(); const input=z.object({attachmentId:z.string().uuid(),cycleKey:z.string().regex(/^[A-Za-z0-9_.:-]{1,128}$/)}).strict().parse(raw);
 const deps=override??defaultMaintenanceDeps();
 const target=maintenanceTargetSchema.parse(await call(deps.rpc,"check_bundle_maintenance_attachment",{p_attachment_id:input.attachmentId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail}));
 const record=await deps.record(actor,target.businessId);
 const events:UnifiedEvent[]=[]; const unavailable:string[]=[];
 let context:ListingContext|undefined;
 const currentContext=async()=>{
  if(context)return context;
  await call(deps.rpc,"check_bundle_maintenance_attachment",{p_attachment_id:input.attachmentId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail});
  context=await deps.context(target.tenantId,target.businessId,target.locationId);
  if(context.bindingId!==target.bindingId||context.workspaceId!==target.businessId||context.location.locationId!==target.locationId||context.lifecycle!=="live")throw new Error("This maintenance target changed or paused.");
  return context;
 };
 if (record.facts.hours?.value!==undefined) {
  const hours=factValueSchemas.hours.parse(record.facts.hours.value),ctx=await currentContext();
  const live=await ctx.client.getLocation(ctx.location,["regularHours","specialHours"]);
  if(!live.ok)unavailable.push("hours_unavailable");
  else if(!hoursMatch(hoursToGoogle(hours),live.data))events.push(await queueBundleMaintenanceDraft(actor,input.attachmentId,input.cycleKey,record.revision,{action:"hours",hours},deps));
 } else unavailable.push("hours_source_missing");
 const mode=await deps.mode(target.tenantId);
 if (mode==="off") return {events,unavailable:[...unavailable,"reply_mode_off"],approved:false as const};
 if (mode!=="approve"&&mode!=="auto") throw new Error("The existing reply policy is unavailable.");
 // Native recheck before reading this target; caller may have lost access during hours preparation.
 await call(deps.rpc,"check_bundle_maintenance_attachment",{p_attachment_id:input.attachmentId,p_user_id:actor.userId,p_verified_email:actor.verifiedEmail});
 const ctx=await currentContext();
 const reviews=await listAllReviews(ctx.client,ctx.location,2);
 if (!reviews.ok) return {events,unavailable:[...unavailable,"reviews_unavailable"],approved:false as const};
 const existing=await (await deps.events()).getEventsRaw(target.tenantId,{limit:1000});
 for (const review of reviews.data.filter(r=>!r.reviewReply?.comment).slice(0,5)) {
  if(await deps.declined(target.tenantId,review.reviewId)||existing.some(e=>e.metadata?.reviewId===review.reviewId||e.metadata?.kind==="workspace_google_listing_draft"&&(e.metadata?.draft as {reviewId?:string}|undefined)?.reviewId===review.reviewId)) continue;
  const text=await deps.draft({reviewId:review.reviewId,reviewerName:review.reviewer?.displayName??"Reviewer",rating:STAR_RATING[review.starRating??""]??0,comment:review.comment},{id:target.tenantId,siteName:typeof record.facts.display_name?.value==="string"?record.facts.display_name.value:target.tenantId});
  events.push(await queueBundleMaintenanceDraft(actor,input.attachmentId,input.cycleKey,record.revision,{action:"reply",reviewId:review.reviewId,text},deps));
 }
 return {events,unavailable,approved:false as const};
}
/** Called after the existing event authorizer and before dispatch, again at
 * the exact provider call. A pin never substitutes for a human decision. */
export async function checkBundleMaintenanceEvent(input:{preparationId:string;eventId:string;workspaceId:string;bindingId:string|null;locationId:string;draft:unknown},rpc:MaintenanceRpc=maintenanceRpc()) {
 enabled(); await call(rpc,"check_bundle_maintenance_event",{p_preparation_id:input.preparationId,p_event_id:input.eventId,p_business_id:input.workspaceId,
 p_binding_id:input.bindingId,p_location_id:input.locationId,p_draft:maintenanceDraftSchema.parse(input.draft)});
}
