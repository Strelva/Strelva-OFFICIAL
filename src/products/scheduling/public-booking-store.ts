import { createHash } from "node:crypto";
import { decryptSecret, encryptSecret } from "@/lib/crypto/secrets";
import { getSupabase } from "@/lib/db/client";
import type {
  PublicBookingReservationRef,
  PublicBookingTokenStore,
} from "./public-booking";

type DbRow = Record<string, unknown>;
type DbResult = { data: unknown; error: { code?: unknown; message?: unknown } | null };
interface DbQuery extends PromiseLike<DbResult> {
  select(columns?: string, options?: unknown): DbQuery;
  eq(column: string, value: unknown): DbQuery;
  upsert(values: unknown, options?: unknown): DbQuery;
  maybeSingle(): Promise<DbResult>;
  single(): Promise<DbResult>;
}
type BookingDb = { from(table: string): DbQuery };

function db(): BookingDb {
  const client = getSupabase();
  if (!client) throw new Error("Public booking storage is not configured.");
  return client as unknown as BookingDb;
}

function text(row: DbRow, key: string): string {
  return typeof row[key] === "string" ? row[key] as string : "";
}

function requiredText(row: DbRow, key: string): string {
  const value = text(row, key);
  if (!value) throw new Error(`Public booking record is missing ${key}.`);
  return value;
}

function requiredHash(row: DbRow, key: string): string {
  const value = requiredText(row, key);
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`Public booking record is missing ${key}.`);
  return value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function rowToReference(row: DbRow, suppliedToken?: string, currentTenantId?: string): PublicBookingReservationRef {
  const managementToken = suppliedToken ?? decryptSecret(requiredText(row, "management_token_ciphertext"));
  if (!managementToken) throw new Error("Public booking management token is unavailable.");
  const tenantIdAtReservation = requiredText(row, "tenant_id_at_reservation");
  return {
    tenantId: currentTenantId ?? tenantIdAtReservation,
    tenantIdAtReservation,
    tenantStableId: requiredText(row, "tenant_stable_id"),
    grantId: requiredText(row, "grant_id"),
    capabilityId: requiredText(row, "capability_id"),
    version: Number(row.capability_version),
    provider: text(row, "provider") as "outlook" | "google",
    reservationId: requiredText(row, "id"),
    requestId: requiredText(row, "calendar_request_id"),
    requestFingerprint: requiredHash(row, "request_fingerprint"),
    slotId: requiredText(row, "slot_id"),
    slotStart: requiredText(row, "slot_start_at"),
    slotEnd: requiredText(row, "slot_end_at"),
    workspaceId: requiredText(row, "business_workspace_id"),
    workId: requiredText(row, "work_id"),
    inquiryId: requiredText(row, "inquiry_id"),
    managementToken,
    expectedRevision: Number(row.expected_revision),
    title: requiredText(row, "title"),
    start: requiredText(row, "start_at"),
    end: requiredText(row, "end_at"),
    timeZone: requiredText(row, "time_zone"),
    status: text(row, "status") as "pending" | "confirmed" | "cancelled",
  };
}

async function findRow(input: { tenantId: string; column: "request_id_hash" | "management_token_hash"; value: string }): Promise<DbRow | null> {
  const tenantResult = await db().from("tenants")
    .select("stable_id")
    .eq("id", input.tenantId)
    .maybeSingle();
  if (tenantResult.error) throw new Error(String(tenantResult.error.message ?? "Tenant lookup failed."));
  const tenantStableId = tenantResult.data && typeof tenantResult.data === "object" ? text(tenantResult.data as DbRow, "stable_id") : "";
  if (!tenantStableId) return null;
  const result = await db().from("public_website_bookings")
    .select("*")
    .eq("tenant_stable_id", tenantStableId)
    .eq(input.column, sha256(input.value))
    .maybeSingle();
  if (result.error) throw new Error(String(result.error.message ?? "Public booking lookup failed."));
  return result.data && typeof result.data === "object" ? result.data as DbRow : null;
}

/**
 * Postgres-backed receipt store. Public request identifiers are indexed by a
 * one-way digest; the native calendar request id is retained because the
 * governed calendar service needs it for readback and recovery. Management
 * tokens are hashed for lookup and envelope-encrypted for a replay receipt.
 */
export const postgresPublicBookingTokenStore: PublicBookingTokenStore = {
  async findByRequest(input) {
    const row = await findRow({ tenantId: input.tenantId, column: "request_id_hash", value: input.requestId });
    return row ? rowToReference(row, undefined, input.tenantId) : null;
  },

  async findByToken(input) {
    const row = await findRow({ tenantId: input.tenantId, column: "management_token_hash", value: input.managementToken });
    return row ? rowToReference(row, input.managementToken, input.tenantId) : null;
  },

  async save(value) {
    if (!value.grantId) throw new Error("Public booking grant is required for durable receipt storage.");
    const grantResult = await db().from("public_website_booking_grants")
      .select("tenant_stable_id")
      .eq("id", value.grantId)
      .maybeSingle();
    if (grantResult.error || !grantResult.data || typeof grantResult.data !== "object") {
      throw new Error("Public booking grant is unavailable.");
    }
    const tenantStableId = requiredText(grantResult.data as DbRow, "tenant_stable_id");
    const row = {
      id: value.reservationId,
      grant_id: value.grantId,
      tenant_stable_id: tenantStableId,
      tenant_id_at_reservation: value.tenantIdAtReservation ?? value.tenantId,
      business_workspace_id: value.workspaceId,
      work_id: value.workId,
      capability_id: value.capabilityId,
      capability_version: value.version,
      provider: value.provider,
      inquiry_id: value.inquiryId,
      request_id_hash: sha256(value.requestId),
      request_fingerprint: requiredHash({ request_fingerprint: value.requestFingerprint }, "request_fingerprint"),
      calendar_request_id: value.requestId,
      slot_id: value.slotId,
      slot_start_at: value.slotStart,
      slot_end_at: value.slotEnd,
      management_token_hash: sha256(value.managementToken),
      management_token_ciphertext: encryptSecret(value.managementToken),
      expected_revision: value.expectedRevision,
      title: value.title,
      start_at: value.start,
      end_at: value.end,
      time_zone: value.timeZone,
      status: value.status,
      updated_at: new Date().toISOString(),
    };
    const result = await db().from("public_website_bookings")
      .upsert(row, { onConflict: "id" })
      .select("*")
      .single();
    if (!result.error && result.data && typeof result.data === "object") return rowToReference(result.data as DbRow, undefined, value.tenantId);
    // A duplicate request can race the preflight lookup. Its unique digest is
    // the durable idempotency result; return that row instead of writing twice.
    if (result.error?.code === "23505") {
      const existing = await findRow({ tenantId: value.tenantId, column: "request_id_hash", value: value.requestId });
      if (existing) return rowToReference(existing, undefined, value.tenantId);
    }
    throw new Error(String(result.error?.message ?? "Public booking receipt could not be saved."));
  },
};
