import { createHash } from "node:crypto";
import { postgresPublicBookingTokenStore } from "./public-booking-store";
import { readPublicRecord } from "@/platform/bookings/public-record";
import { publicBookingReceiptSchema, type PublicBookingReservationRef, type PublicBookingTokenStore } from "./public-booking";
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { bookingReadSource } from "@/platform/bookings/flags";
import { workspaceReleaseFlagEnabled } from "@/platform/release-flags/store";
import { inquiryReleaseEnabledForWorkspace } from "@/products/inquiries/server";
import { askServiceSetupSelectionSchema, askServiceSetupIds } from "@/platform/ask/new-service";
import { PublicBookingError } from "./public-booking";
import { resolvePublishedPublicBooking, createPublicWebsiteBookingService } from "./public-booking-server";
import { readWorkspaceExitCompleted } from "./calendar/service";

const receiptSchema=z.object({selection:askServiceSetupSelectionSchema,grant_id:z.string().uuid(),business_service_id:z.string().uuid(),work_id:z.string().uuid(),business_workspace_id:z.string().uuid(),tenant_stable_id:z.string().uuid()}).refine(row=>row.selection.workspaceId===row.business_workspace_id && row.selection.tenantStableId===row.tenant_stable_id && askServiceSetupIds(row.selection).workId===row.work_id,"The accepted setup identity changed.");
type Receipt=z.infer<typeof receiptSchema>;
interface Query extends PromiseLike<{data:unknown;error:{code?:string}|null}> {select(columns:string):Query;eq(key:string,value:string):Query;limit(count:number):Query;maybeSingle():PromiseLike<{data:unknown;error:{code?:string}|null}>}
function client() {const db=getSupabase();if(!db)throw new PublicBookingError("unavailable","Booking records are unavailable.");return db as unknown as {from(table:string):Query};}
/** Receipt identity, never a caller-supplied business/provider authority. */
export async function readPublicAskServiceSetup(tenantId:string,serviceRef:string):Promise<Receipt|null> {
  const db=client(); const tenant=await db.from("tenants").select("stable_id").eq("id",tenantId).maybeSingle();
  const identity=z.object({stable_id:z.string().uuid()}).safeParse(tenant.data);
  if(tenant.error)throw new PublicBookingError("unavailable","Booking records are unavailable.");
  if(!identity.success)return null;
  const result=await db.from("ask_native_service_setups").select("selection,grant_id,business_service_id,work_id,business_workspace_id,tenant_stable_id").eq("tenant_stable_id",identity.data.stable_id).limit(101);
  // A PostgREST cache miss does not prove the successor is unapplied. Its
  // atomic, retained grant in the existing catalog distinguishes an ordinary
  // tenant from one whose accepted setup must fail closed until readable.
  if(["42P01","PGRST205"].includes(result.error?.code??"")) {
    if(/^ask-(service|inquiry)-[a-f0-9]{32}$/.test(serviceRef))throw new PublicBookingError("unavailable","Booking setup records are unavailable.");
    const grants=await db.from("public_website_booking_grants").select("capability_id").eq("tenant_stable_id",identity.data.stable_id).limit(101);
    const parsed=z.array(z.object({capability_id:z.string()})).safeParse(grants.data);
    if(grants.error || !parsed.success || parsed.data.length>100 || parsed.data.some(row=>/^ask-service-[a-f0-9]{32}$/.test(row.capability_id)))throw new PublicBookingError("unavailable","Booking setup records are unavailable.");
    return null;
  }
  if(result.error)throw new PublicBookingError("unavailable","Booking setup records are unavailable.");
  const rows=z.array(receiptSchema).safeParse(result.data);
  if(!rows.success || rows.data.length>100)throw new PublicBookingError("unavailable","Booking setup records are unavailable.");
  const matches=rows.data.filter(row=>row.business_service_id===serviceRef || askServiceSetupIds(row.selection).capabilityId===serviceRef || askServiceSetupIds(row.selection).inquiryId===serviceRef);
  if(matches.length>1)throw new PublicBookingError("unavailable","This booking setup is ambiguous.");
  return matches[0]??null;
}
/** The new Inquiry is bound by its accepted setup, not a guessed installation. */
export async function resolveAskServiceInquiryWorkspace(tenantId:string,inquiryId:string) {
  if(!/^ask-inquiry-[a-f0-9]{32}$/.test(inquiryId))return null;
  const setup=await readPublicAskServiceSetup(tenantId,inquiryId);
  if(!setup)return null;
  await requireAskServicePublicSource(setup);
  const ids=askServiceSetupIds(setup.selection);
  const grant=await client().from("public_website_booking_grants").select("id").eq("id",setup.grant_id)
    .eq("business_workspace_id",setup.business_workspace_id).eq("tenant_stable_id",setup.tenant_stable_id).eq("work_id",setup.work_id)
    .eq("capability_id",ids.capabilityId).eq("inquiry_capability_id",inquiryId).eq("status","published").maybeSingle();
  if(grant.error || !grant.data)throw new PublicBookingError("unavailable","This service is no longer receiving inquiry requests.");
  return {businessId:setup.business_workspace_id,exitCompleted:await readWorkspaceExitCompleted(setup.business_workspace_id)};
}
/** PostgreSQL's timestamp wire spelling cannot change a new setup's replay hash. */
export function askServiceTokenStore(tokens:PublicBookingTokenStore):PublicBookingTokenStore {
  const normalize=async(ref:PublicBookingReservationRef|null)=>{
    if(!ref || !/^ask-service-[a-f0-9]{32}$/.test(ref.capabilityId) || !await readPublicAskServiceSetup(ref.tenantId,ref.capabilityId))return ref;
    return {...ref,slotStart:new Date(ref.slotStart).toISOString(),slotEnd:new Date(ref.slotEnd).toISOString()};
  };
  return {findByRequest:async input=>normalize(await tokens.findByRequest(input)),findByToken:input=>tokens.findByToken(input),save:input=>tokens.save(input)};
}
export async function requireAskServicePublicSource(receipt:Receipt) {
  const businessId=receipt.business_workspace_id;
  if(await bookingReadSource()!=="postgres" || !await workspaceReleaseFlagEnabled("systems",businessId)
    || !await workspaceReleaseFlagEnabled("make_real_live:booking_page",businessId)
    || !await inquiryReleaseEnabledForWorkspace(businessId))throw new PublicBookingError("unavailable","This service is not accepting booking requests right now. Contact the business.");
}
/** New setup only: all ordinary capabilities retain their existing resolver. */
export async function resolvePublicBookingWithAskSetup(input:Parameters<typeof resolvePublishedPublicBooking>[0]) {
  if(!/^ask-service-[a-f0-9]{32}$/.test(input.capabilityId))return resolvePublishedPublicBooking(input);
  const receipt=await readPublicAskServiceSetup(input.tenantId,input.capabilityId);
  if(!receipt)throw new PublicBookingError("unavailable","This new service has no accepted setup receipt.");
  await requireAskServicePublicSource(receipt);
  const ids=askServiceSetupIds(receipt.selection);
  const binding=await resolvePublishedPublicBooking(input);
  if(!binding)return null;
  if(binding.grantId!==receipt.grant_id || binding.workspaceId!==receipt.business_workspace_id || binding.workId!==receipt.work_id
    || binding.tenantStableId!==receipt.tenant_stable_id || binding.capabilityId!==ids.capabilityId || binding.inquiryCapabilityId!==ids.inquiryId
    || binding.version!==1 || binding.inquiryVersion!==1 || !binding.recordBooking || binding.recordBooking.mode!=="request"
    || !input.includeRevoked && binding.recordBooking.serviceRef!==ids.capabilityId)throw new PublicBookingError("unavailable","This service's native booking setup changed.");
  return binding;
}
/** Legacy tenant URLs cannot place this new service through copied calendar rules. */
export async function assertAskServiceTenantSource(tenantId:string,serviceRef:string,nativeServiceRef?:string|null) {
  if (!/^ask-service-[a-f0-9]{32}$/.test(serviceRef) && !nativeServiceRef) return;
  const receipt=await readPublicAskServiceSetup(tenantId,nativeServiceRef??serviceRef);
  if(receipt) {
    await requireAskServicePublicSource(receipt);
    throw new PublicBookingError("unavailable","Use this service's booking request page to ask the business to confirm a time.");
  }
}
export function createAskServicePublicBookingService() {
  return createPublicWebsiteBookingService({resolve:async input=>{
    const receipt=await readPublicAskServiceSetup(input.tenantId,input.capabilityId);
    if(!receipt)throw new PublicBookingError("not_found","This new service is unavailable.");
    return resolvePublicBookingWithAskSetup(input);
  }});
}

/** The existing email token is inspected before its one-time consume mutates it. */
export async function guardAskServiceConfirmation(token:string) {
  if(!/^[A-Za-z0-9_-]{43}$/.test(token))return;
  const db=getSupabase(); if(!db)throw new PublicBookingError("unavailable","Booking records are unavailable.");
  const rpc=db as unknown as {rpc(name:string,args:Record<string,unknown>):PromiseLike<{data:unknown;error:{code?:string}|null}>};
  const {data,error}=await rpc.rpc("inspect_ask_service_confirmation",{p_token_hash:createHash("sha256").update(token).digest("hex")});
  if(error && ["42883","PGRST202"].includes(error.code??"")) {
    // A stale RPC cache must not let a new setup's one-time token be consumed.
    const request=await client().from("public_booking_requests").select("tenant_stable_id,request_id").eq("token_hash",createHash("sha256").update(token).digest("hex")).maybeSingle();
    if(request.error)throw new PublicBookingError("unavailable","Booking confirmation is unavailable.");
    if(request.data===null)return;
    const parsed=z.object({tenant_stable_id:z.string().uuid(),request_id:z.string().min(1)}).safeParse(request.data);
    if(!parsed.success)throw new PublicBookingError("unavailable","Booking confirmation is unavailable.");
    const bookings=await client().from("public_website_bookings").select("capability_id").eq("tenant_stable_id",parsed.data.tenant_stable_id).eq("calendar_request_id",parsed.data.request_id).limit(101);
    const refs=z.array(z.object({capability_id:z.string()})).safeParse(bookings.data);
    if(bookings.error || !refs.success || refs.data.length>100 || refs.data.some(row=>/^ask-service-[a-f0-9]{32}$/.test(row.capability_id)))throw new PublicBookingError("unavailable","Booking confirmation is unavailable.");
    return;
  }
  if(error)throw new PublicBookingError("unavailable","Booking confirmation is unavailable.");
  if(data!==null)await requireAskServicePublicSource(receiptSchema.parse(data));
}

export function guardAskServicePublicOperations(service:ReturnType<typeof import("./public-booking").createPublicBookingService>) {
  const preflight=async(tenantId:string,capabilityId:string)=>{
    if(!/^ask-service-[a-f0-9]{32}$/.test(capabilityId))return;
    const receipt=await readPublicAskServiceSetup(tenantId,capabilityId); if(!receipt)throw new PublicBookingError("unavailable","This new service has no accepted setup receipt.");await requireAskServicePublicSource(receipt);
  };
  const management=async(tenantId:string,managementToken:string)=>{
    const ref=await postgresPublicBookingTokenStore.findByToken({tenantId,managementToken});
    if(ref)await preflight(tenantId,ref.capabilityId);
  };
  return {...service,
    read:async(input:Parameters<typeof service.read>[0])=>{await preflight(input.tenantId,input.capabilityId);return service.read(input);},
    reserve:async(input:Parameters<typeof service.reserve>[0])=>{await preflight(input.tenantId,input.capabilityId);return service.reserve(input);},
    confirm:async(token:string)=>{await guardAskServiceConfirmation(token);return service.confirm(token);},
    change:async(input:Parameters<typeof service.change>[0])=>{await preflight(input.tenantId,input.capabilityId);return service.change(input);},
    cancel:async(input:Parameters<typeof service.cancel>[0])=>{await management(input.tenantId,input.managementToken);return service.cancel(input);},
  };
}
/** Native record receipts never recover by rereading obsolete interval reservations. */
export async function recoverAskServiceRecord(ref:PublicBookingReservationRef,tokens:Pick<PublicBookingTokenStore,"save">) {
  const binding=await resolvePublicBookingWithAskSetup({tenantId:ref.tenantId,capabilityId:ref.capabilityId,includeRevoked:true});
  if(!binding || !binding.recordBooking || binding.grantId!==ref.grantId || binding.workId!==ref.workId || binding.workspaceId!==ref.workspaceId)throw new PublicBookingError("unavailable","This booking receipt cannot be reconciled right now.");
  const row=await readPublicRecord(binding,ref.reservationId);
  const status=row.status==="confirmed"?"confirmed":row.status==="cancelled"||row.status==="declined"?"cancelled":"pending";
  const saved=await tokens.save({...ref,status,start:row.start,end:row.end});
  return publicBookingReceiptSchema.parse({schemaVersion:1,reservationId:saved.reservationId,managementToken:saved.managementToken,capabilityId:saved.capabilityId,
    version:saved.version,provider:saved.provider,status:saved.status,title:saved.title,start:saved.start,end:saved.end,timeZone:saved.timeZone});
}
export async function requireAskServiceManagement(tenantId:string,reservationId:string,managementToken:string) {
  const ref=await postgresPublicBookingTokenStore.findByToken({tenantId,managementToken});
  if(!ref || ref.reservationId!==reservationId)throw new PublicBookingError("not_found","This reservation is unavailable.");
  const setup=await readPublicAskServiceSetup(tenantId,ref.capabilityId);
  if(!setup)throw new PublicBookingError("not_found","This new service is unavailable.");
  await requireAskServicePublicSource(setup);
}
