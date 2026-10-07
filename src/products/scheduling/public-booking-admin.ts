import { z } from "zod";
import { getSupabase } from "@/platform/infra/db/client";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { assertWorkspaceMember } from "@/platform/workspaces/repository";
import { publicBookingProviderSchema } from "./public-booking";
import { askBookingPublicationPinSchema } from "./ask-service-contracts";

const grantInputSchema = z.object({
  businessId: z.string().uuid(),
  tenantId: z.string().trim().min(1).max(80),
  workId: z.string().uuid(),
  capabilityId: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  capabilityVersion: z.number().int().positive(),
  inquiryCapabilityId: z.string().trim().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  inquiryVersion: z.number().int().positive(),
  provider: publicBookingProviderSchema,
  displayName: z.string().trim().min(1).max(160),
  timeZone: z.string().trim().min(1).max(128),
  askService: askBookingPublicationPinSchema.optional(),
}).strict();
export type PublicBookingGrantInput = z.infer<typeof grantInputSchema>;

type DbResult = { data: unknown; error: { code?: unknown; message?: unknown } | null };

function rpc() {
  const client = getSupabase();
  if (!client) throw new WorkspaceStoreError("Public booking storage is unavailable.");
  return client as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<DbResult> };
}

function resultData(result: DbResult): Record<string, unknown> | Record<string, unknown>[] {
  if (result.error) throw new WorkspaceStoreError(String(result.error.message ?? "Public booking grant operation failed."));
  if (Array.isArray(result.data)) return result.data as Record<string, unknown>[];
  if (result.data && typeof result.data === "object") return result.data as Record<string, unknown>;
  throw new WorkspaceStoreError("Public booking grant operation returned no record.");
}

function oneResultData(result: DbResult): Record<string, unknown> {
  const data = resultData(result);
  if (!Array.isArray(data)) return data;
  if (data.length !== 1 || !data[0]) {
    throw new WorkspaceStoreError("Public booking grant operation returned an unexpected number of records.");
  }
  return data[0];
}

export async function publishPublicWebsiteBookingGrant(actor: WorkspaceActor, raw: PublicBookingGrantInput) {
  const input = grantInputSchema.parse(raw);
  const result = await rpc().rpc(input.askService ? "publish_ask_booking_service_grant" : "publish_public_website_booking_grant", {
    p_business_id: input.businessId,
    p_user_id: actor.userId,
    p_verified_email: actor.verifiedEmail,
    p_tenant_id: input.tenantId,
    p_work_id: input.workId,
    p_capability_id: input.capabilityId,
    p_capability_version: input.capabilityVersion,
    p_inquiry_capability_id: input.inquiryCapabilityId,
    p_inquiry_version: input.inquiryVersion,
    p_provider: input.provider,
    p_display_name: input.displayName,
    p_time_zone: input.timeZone,
    ...(input.askService ? { p_expected_schedule: input.askService.expectedSchedule, p_proposal: input.askService.proposal, p_calendar_connection_id: input.askService.calendarConnectionId, p_calendar_updated_at: input.askService.calendarUpdatedAt } : {}),
  });
  return oneResultData(result);
}

export async function listPublicWebsiteBookingGrants(actor: WorkspaceActor, businessId: string) {
  const result = await rpc().rpc("read_public_website_booking_grants", {
    p_business_id: z.string().uuid().parse(businessId),
    p_user_id: actor.userId,
    p_verified_email: actor.verifiedEmail,
  });
  return resultData(result);
}

export async function revokePublicWebsiteBookingGrant(actor: WorkspaceActor, input: { businessId: string; grantId: string; reason: string }) {
  const businessId = z.string().uuid().parse(input.businessId);
  const grantId = z.string().uuid().parse(input.grantId);
  const reason = z.string().trim().min(1).max(500).parse(input.reason);
  const result = await rpc().rpc("revoke_public_website_booking_grant", {
    p_business_id: businessId,
    p_user_id: actor.userId,
    p_verified_email: actor.verifiedEmail,
    p_grant_id: grantId,
    p_reason: reason,
  });
  return resultData(result);
}

const receiptSchema = z.object({ id: z.string().uuid(), business_workspace_id: z.string().uuid(), work_id: z.string().uuid(), calendar_request_id: z.string().min(1), tenant_id_at_reservation: z.string().min(1), title: z.string(), start_at: z.string().datetime({ offset: true }), status: z.enum(["pending", "confirmed", "cancelled"]), updated_at: z.string() });
/** Secret-free member read. Never decrypts management tokens or contacts providers. */
export async function readWorkspacePublicBookingReceipts(actor: WorkspaceActor, workspaceId: string, range: { from: string; to: string }) {
  await assertWorkspaceMember(actor, workspaceId);
  const bounds = z.object({ from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) }).parse(range);
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Public booking storage is unavailable.");
  const { data, error } = await db.from("public_website_bookings")
    .select("id,business_workspace_id,work_id,calendar_request_id,tenant_id_at_reservation,title,start_at,status,updated_at")
    .eq("business_workspace_id", z.string().uuid().parse(workspaceId)).gte("start_at", bounds.from).lt("start_at", bounds.to).order("updated_at", { ascending: true }).limit(1001);
  if (error) throw new WorkspaceStoreError("Public booking receipts could not be read.");
  const rows = z.array(receiptSchema).parse(data);
  if (rows.some(row => row.business_workspace_id !== workspaceId)) throw new WorkspaceStoreError("Public booking receipt scope changed.");
  return { truncated: rows.length > 1000, rows: rows.slice(0, 1000).map(row => ({ id: row.id, workId: row.work_id, requestId: row.calendar_request_id, tenantId: row.tenant_id_at_reservation, title: row.title, start: row.start_at, status: row.status })) };
}
