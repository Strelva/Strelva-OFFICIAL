/**
 * The real legacy reads the move uses (backfill, compare, repair): the tenant
 * `bookings` table or dev store, the Redis config and overrides, the site's
 * services, and the public API receipts in `public_website_bookings`.
 */
import { getSupabase } from "@/lib/db/client";
import { getLeadById } from "@/lib/leads";
import { getContent } from "@/lib/storage/content-store";
import { getLegacyBookingById, getLegacyBookingSettings, legacyGetBookings } from "@/lib/storage/booking-store";
import type { LegacyBookingPorts } from "./move";
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
