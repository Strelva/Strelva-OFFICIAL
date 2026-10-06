/**
 * The real legacy reads the move uses (backfill, compare, repair): the tenant
 * `bookings` table or dev store, the Redis config and overrides, the site's
 * services, and the public API receipts in `public_website_bookings`.
 */
import { getSupabase } from "@/platform/infra/db/client";
import { getLeadById } from "@/lib/leads";
import { getContent } from "@/lib/storage/content-store";
import { getLegacyBookingById, getLegacyBookingSettings, legacyGetBookings } from "@/lib/storage/booking-store";
import { scheduleSchema } from "@/products/scheduling/contracts";
import type { LegacyBookingPorts, ScheduleReservationPorts, WorkspaceSchedule } from "./move";
import type { StoreBookingInput } from "./store";

type ReceiptRow = {
  id: string;
  inquiry_id: string;
  request_fingerprint: string;
  title: string;
  start_at: string;
  end_at: string;
  time_zone: string;
  status: "pending" | "confirmed" | "cancelled";
  created_at: string;
};

type Query = PromiseLike<{ data: unknown; error: { message?: string } | null }> & {
  select(columns: string): Query;
  eq(column: string, value: unknown): Query;
  maybeSingle(): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};
type Db = { from(table: string): Query };

const STATUS = { pending: "requested", confirmed: "confirmed", cancelled: "cancelled" } as const;

async function stableId(db: Db, tenant: string): Promise<string | null> {
  const { data, error } = await db.from("tenants").select("stable_id").eq("id", tenant).maybeSingle();
  if (error) throw new Error(`tenant read failed: ${error.message ?? "error"}`);
  return data && typeof data === "object" ? String((data as { stable_id?: unknown }).stable_id ?? "") || null : null;
}

async function receiptInput(tenant: string, row: ReceiptRow): Promise<StoreBookingInput> {
  const lead = await getLeadById(tenant, row.inquiry_id).catch(() => null);
  return {
    publicReservationId: row.id,
    status: STATUS[row.status],
    origin: "site",
    serviceName: row.title.slice(0, 160),
    start: new Date(row.start_at).toISOString(),
    end: new Date(row.end_at).toISOString(),
    bufferMinutes: 0,
    timeZone: row.time_zone,
    customer: { name: (lead?.name || "Customer").slice(0, 160), ...(lead?.email ? { email: lead.email } : {}) },
    inquiryId: row.inquiry_id,
    requestFingerprint: row.request_fingerprint,
    createdAt: new Date(row.created_at).toISOString(),
    reason: "Copied from the public booking receipt",
  };
}

const COLUMNS = "id,inquiry_id,request_fingerprint,title,start_at,end_at,time_zone,status,created_at";

type Rows = { data: unknown; error: { message?: string } | null };

/**
 * Every workspace schedule (saved work `scheduling/schedule`) with its
 * reservations, the time zone to show them in, and the request ids already
 * covered by a public receipt (copied with the tenant's receipts instead).
 */
export const scheduleReservationPorts: ScheduleReservationPorts = {
  async schedules() {
    const db = getSupabase() as unknown as Db | null;
    if (!db) return [];
    const works = await db.from("saved_product_work").select("id,workspace_id,payload").eq("product_id", "scheduling").eq("resource_kind", "schedule") as Rows;
    if (works.error) throw new Error(`schedule read failed: ${works.error.message ?? "error"}`);
    const out: WorkspaceSchedule[] = [];
    for (const row of (works.data ?? []) as Array<{ id: string; workspace_id: string; payload: unknown }>) {
      const parsed = scheduleSchema.safeParse(row.payload);
      if (!parsed.success || parsed.data.reservations.length === 0) continue;
      const [grants, receipts, hours] = await Promise.all([
        db.from("public_website_booking_grants").select("time_zone").eq("work_id", row.id).eq("business_workspace_id", row.workspace_id) as unknown as Promise<Rows>,
        db.from("public_website_bookings").select("calendar_request_id").eq("work_id", row.id).eq("business_workspace_id", row.workspace_id) as unknown as Promise<Rows>,
        db.from("business_record_facts").select("value").eq("workspace_id", row.workspace_id).eq("fact_key", "hours") as unknown as Promise<Rows>,
      ]);
      if (grants.error || receipts.error) throw new Error("schedule receipt read failed");
      const grantZone = (grants.data as Array<{ time_zone?: unknown }> | null)?.[0]?.time_zone;
      const recordZone = ((hours.data as Array<{ value?: { timezone?: unknown } }> | null)?.[0]?.value)?.timezone;
      out.push({
        workspaceId: row.workspace_id,
        workId: row.id,
        timeZone: typeof grantZone === "string" ? grantZone : typeof recordZone === "string" ? recordZone : "UTC",
        reservations: parsed.data.reservations.map((r) => ({ requestId: r.requestId, title: r.title, start: r.start, end: r.end, status: r.status })),
        receiptRequestIds: new Set(((receipts.data ?? []) as Array<{ calendar_request_id: string }>).map((r) => r.calendar_request_id)),
      });
    }
    return out;
  },
};

export const legacyBookingPorts: LegacyBookingPorts = {
  bookings: (tenant) => legacyGetBookings(tenant),
  booking: (tenant, id) => getLegacyBookingById(tenant, id),
  settings: (tenant) => getLegacyBookingSettings(tenant),
  async services(tenant) {
    const content = await getContent("services", tenant);
    const list = Array.isArray(content.services) ? content.services : [];
    return list.map((s) => ({ id: s.id, name: s.name, duration: s.duration, comingSoon: s.comingSoon }));
  },
  async reservations(tenant) {
    const db = getSupabase() as unknown as Db | null;
    if (!db) return [];
    const stable = await stableId(db, tenant);
    if (!stable) return [];
    const { data, error } = await db.from("public_website_bookings").select(COLUMNS).eq("tenant_stable_id", stable);
    if (error) throw new Error(`receipt read failed: ${error.message ?? "error"}`);
    return Promise.all(((data ?? []) as ReceiptRow[]).map((row) => receiptInput(tenant, row)));
  },
  async reservation(tenant, reservationId) {
    const db = getSupabase() as unknown as Db | null;
    if (!db) return null;
    const stable = await stableId(db, tenant);
    if (!stable) return null;
    const { data, error } = await db.from("public_website_bookings").select(COLUMNS).eq("tenant_stable_id", stable).eq("id", reservationId).maybeSingle();
    if (error) throw new Error(`receipt read failed: ${error.message ?? "error"}`);
    return data ? receiptInput(tenant, data as ReceiptRow) : null;
  },
};
