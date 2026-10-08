import { bookingReadSource } from "@/platform/bookings/flags";
import { readBookingContext } from "@/platform/bookings/store";
import { readBusinessRecord } from "@/platform/business-record";
import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { PostgresOfferingStore } from "@/platform/offerings/store";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { getInquiryRepository } from "@/products/inquiries/server";
import { listWorkspaceCalendarConnections } from "./calendar/repository";
import { readWorkspaceSchedule } from "./server";
import { listPublicWebsiteBookingGrants } from "./public-booking-admin";
import { askServiceSetupSelectionSchema, compiledAskServiceSetup, setupHash, askServiceSetupIds, type AskNewService, type AskServiceSetupSelection } from "./ask-service-setup-contracts";

const emptyInquiry = (state: Record<string, unknown>) => ["requests", "capabilities", "changes", "actionReceipts", "rehearsalScenarios", "rehearsalRuns", "inquiries", "timeline", "responsibilities", "responsibilityReceipts"].every(key => Array.isArray(state[key]) && state[key].length === 0);
/** Secret-free reads only. Never refreshes OAuth or claims calendar/provider success. */
export async function inspectAskServiceSetup(actor: WorkspaceActor, workspaceId: string, service: AskNewService) {
  if (await bookingReadSource() !== "postgres") throw new WorkspaceStoreError("New native service setup requires the qualified business booking store.");
  const inspection = await new PostgresOfferingStore().inspect(actor, workspaceId);
  if (inspection.access.role !== "owner") throw new WorkspaceStoreError("A business owner must prepare this service setup.");
  const context = await readBookingContext(service.tenantId);
  if (!context?.tenantStableId || !inspection.websiteBindings.some(row => row.status === "active" && row.tenantActive && row.actorHasTenantAccess && row.tenantId === service.tenantId)) throw new WorkspaceStoreError("Choose this business's active explicitly bound website.");
  const calendars = (await listWorkspaceCalendarConnections(actor, workspaceId)).filter(row => row.status === "connected" && row.provider === service.provider && row.timeZone === service.timeZone);
  if (calendars.length !== 1) throw new WorkspaceStoreError("Connect one calendar with the service's provider and time zone first.");
  const snapshot = await getInquiryRepository().getSnapshot(service.tenantId, workspaceId);
  if (snapshot && (snapshot.tenantStableId !== context.tenantStableId || !emptyInquiry(snapshot.state as unknown as Record<string, unknown>))) throw new WorkspaceStoreError("This website already has an Inquiry configuration. Prepare an existing-System alternative instead.");
  const record = await readBusinessRecord(actor, workspaceId);
  if (context?.workspaceId !== workspaceId || context.settings || record.services.length || context.services.length) throw new WorkspaceStoreError("New setup requires this tenant's converted business with no existing service or booking configuration.");
  if (context.hours && context.hours.timezone !== service.timeZone) throw new WorkspaceStoreError("Use the business's confirmed time zone.");
  return { businessRecordRevision: record.revision, recordHours: context.hours, tenantStableId: context.tenantStableId, calendar: calendars[0]!, snapshot };
}
export async function askServiceSetupStillCurrent(actor: WorkspaceActor, raw: unknown) {
  const selection = askServiceSetupSelectionSchema.parse(raw);
  const current = await inspectAskServiceSetup(actor, selection.workspaceId, selection.service);
  return current.businessRecordRevision === selection.businessRecordRevision && setupHash(current.recordHours) === setupHash(selection.recordHours) && current.tenantStableId === selection.tenantStableId && current.calendar.id === selection.calendarConnectionId
    && Date.parse(current.calendar.updatedAt) === Date.parse(selection.calendarUpdatedAt)
    && (current.snapshot?.revision ?? null) === selection.inquiryRevision
    && (current.snapshot ? setupHash(current.snapshot.state) : null) === selection.inquiryStateHash
    && selection.service.availability.every(slot => Date.parse(slot.start) > Date.now()+4*3600000 && Date.parse(slot.end)<=Date.now()+60*86400000);
}
function rpcClient() {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Native service setup storage is unavailable.");
  return client as unknown as { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
}
async function one(name: string, args: Record<string, unknown>) {
  const { data, error } = await rpcClient().rpc(name, args);
  if (error) throw new WorkspaceStoreError(error.message ?? "Native service setup failed.");
  const rows = z.array(z.record(z.string(), z.unknown())).parse(data);
  if (rows.length !== 1) throw new WorkspaceStoreError("Native setup returned an unexpected receipt.");
  return rows[0]!;
}
/** Only called by an approved live effect. SQL rechecks the approving owner atomically. */
export async function publishAskServiceSetup(actor: WorkspaceActor, raw: unknown) {
  const selection = askServiceSetupSelectionSchema.parse(raw);
  if (await bookingReadSource() !== "postgres") throw new WorkspaceStoreError("The business booking store is no longer qualified for native service setup.");
  // Exact replay is resolved in SQL before mutable config/calendar checks.
  const snapshot = await getInquiryRepository().getSnapshot(selection.service.tenantId, selection.workspaceId);
  const expectedInquiryState = snapshot && snapshot.revision === selection.inquiryRevision && setupHash(snapshot.state) === selection.inquiryStateHash ? snapshot.state : null;
  const setup = await compiledAskServiceSetup(selection, actor.userId);
  return one("publish_ask_native_service_setup", { p_business_id: selection.workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_setup: { ...setup, expectedInquiryState } });
}
export async function revokeAskServiceSetup(actor: WorkspaceActor, input: { businessId: string; grantId: string; reason: string }) {
  return one("revoke_ask_native_service_setup", { p_business_id: z.string().uuid().parse(input.businessId), p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
    p_grant_id: z.string().uuid().parse(input.grantId), p_reason: z.string().trim().min(1).max(500).parse(input.reason) });
}
/** Read back the saved schedule and native inquiry, separately from acceptance. */
export async function verifyAskServiceSetup(actor: WorkspaceActor, selection: AskServiceSetupSelection, grantId: string) {
  if (await bookingReadSource() !== "postgres") return {ok:false,detail:"The business booking store is no longer serving this service."};
  const ids = askServiceSetupIds(selection);
  const listed = await listPublicWebsiteBookingGrants(actor, selection.workspaceId);
  const grant = (Array.isArray(listed) ? listed : [listed]).find(row => row.id === grantId);
  const record = await readWorkspaceSchedule(actor, ids.workId);
  const snapshot = await getInquiryRepository().getSnapshot(selection.service.tenantId, selection.workspaceId);
  const compiled = await compiledAskServiceSetup(selection, actor.userId);
  const capability = snapshot?.state.capabilities.find(row => row.id === ids.inquiryId);
  const expected = compiled.inquiryState.capabilities[0];
  const context = await readBookingContext(selection.service.tenantId);
  const service = context?.services.find(row=>row.externalRef===ids.capabilityId);
  const policy=context?.servicePolicies?.find(row=>row.businessServiceId===service?.id);
  const date = (value:string) => new Intl.DateTimeFormat("en-CA",{timeZone:selection.service.timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value));
  const time = (value:string) => new Intl.DateTimeFormat("en-GB",{timeZone:selection.service.timeZone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(value));
  const overrides=selection.service.availability.map(slot=>({date:date(slot.start),closed:false,opens:time(slot.start),closes:time(slot.end)}));
  const ok = service?.active && service.name===selection.service.serviceName && service.durationMinutes===selection.service.durationMinutes
    && setupHash(context?.hours??null)===setupHash(selection.recordHours)
    && context?.workspaceId===selection.workspaceId && context.settings?.mode==="request" && context.settings.bufferMinutes===0
    && context.settings.minNoticeMinutes===240 && context.settings.maxAdvanceDays===60 && context.settings.timezone===selection.service.timeZone
    && setupHash(context.settings.bookableHours)===setupHash([]) && setupHash(context.settings.bookableOverrides)===setupHash(overrides)
    && (!context.servicePolicies || policy?.mode==="request" && policy.bufferMinutes===0 && policy.bookable && policy.intake.length===0)
    && grant?.status === "published" && grant.tenant_stable_id === selection.tenantStableId && grant.work_id === ids.workId
    && !record.payload.pause && record.workspaceId === selection.workspaceId && setupHash(record.payload.availability) === setupHash(selection.service.availability)
    && capability?.status === "live_unverified" && setupHash(capability.live) === setupHash(expected?.live);
  return { ok: Boolean(ok), detail: ok ? "The reviewed duration, configured times and native inquiry are saved. Visitor delivery and calendar acceptance remain separate checks." : "The saved setup differs from the approved alternative." };
}

export async function readBackAskServiceSetup(actor: WorkspaceActor, businessId: string, grantId: string) {
  await listPublicWebsiteBookingGrants(actor, businessId); // Current member read before receipt access.
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Native setup read-back is unavailable.");
  const query = client as unknown as { from(table:string): { select(columns:string): { eq(key:string,value:string): { eq(key:string,value:string): { maybeSingle():PromiseLike<{data:{selection:unknown}|null;error:unknown}> } } } } };
  const {data,error} = await query.from("ask_native_service_setups").select("selection").eq("business_workspace_id",z.string().uuid().parse(businessId)).eq("grant_id",z.string().uuid().parse(grantId)).maybeSingle();
  if (error || !data) return {ok:false,detail:"The setup's native acceptance receipt is unavailable."};
  return verifyAskServiceSetup(actor,askServiceSetupSelectionSchema.parse(data.selection),grantId);
}
