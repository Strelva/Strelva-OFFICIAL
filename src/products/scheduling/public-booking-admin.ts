import { z } from "zod";
import { getSupabase } from "@/lib/db/client";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { publicBookingProviderSchema } from "./public-booking";

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
  const result = await rpc().rpc("publish_public_website_booking_grant", {
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
