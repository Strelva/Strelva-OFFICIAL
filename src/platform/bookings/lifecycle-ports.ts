/**
 * The real ports of the booking lifecycle run (lifecycle.ts): the one store's
 * functions, the tenant config and owner-recipient rule for the business, the
 * store-served slot engine for new times, and the one email path.
 */
import { decryptSecret } from "@/platform/infra/crypto/secrets";
import { getSupabase } from "@/platform/infra/db/client";
import { sendEmailWithReceipt } from "@/platform/infra/email/send";
import { ownerNoticeEmail } from "@/lib/owner-recipient";
import { getTenantConfig } from "@/lib/tenants";
import { getTenantPublicUrl } from "@/lib/tenant-urls";
import { storeSlotsForDate } from "./availability";
import { bookingWhen } from "./emails";
import { bookingManagePageEnabled, bookingMessagesEnabled } from "./flags";
import type { BookingLifecyclePorts } from "./lifecycle";
import {
  claimBookingMessages,
  expireBookingHolds,
  finishBookingMessage,
  lapseBookingRequests,
  readBookingContext,
  readTenantBookings,
  type StoreBooking,
} from "./store";

export function bookingAppOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://app.strelva.com").replace(/\/$/, "");
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The next open times for the same length on the same calendar, up to three, over the next two weeks. */
export async function nextOpenTimes(booking: StoreBooking, now: Date, count = 3): Promise<string[]> {
  if (!booking.tenantId) return [];
  const context = await readBookingContext(booking.tenantId);
  if (!context || context.paused) return [];
  const minutes = Math.max(5, Math.round((Date.parse(booking.end) - Date.parse(booking.start)) / 60_000));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: booking.timeZone }).format(now);
  const to = addDays(today, 14);
  const bookings = await readTenantBookings(booking.tenantId, { from: today, to });
  const labels: string[] = [];
  for (let i = 0; i <= 14 && labels.length < count; i++) {
    const date = addDays(today, i);
    for (const start of storeSlotsForDate(context, date, minutes, bookings)) {
      const when = bookingWhen({ localDate: date, localStart: start });
      labels.push(`${when.day} at ${when.time}`);
      if (labels.length >= count) break;
    }
  }
  return labels;
}

/** The customer's manage link for an API reservation (its token is stored encrypted for receipts). */
export async function manageUrl(booking: StoreBooking): Promise<string | null> {
  if (!bookingManagePageEnabled()) return null;
  if (!booking.publicReservationId) {
    if (!bookingMessagesEnabled()) return null;
    const { issueNativeAccess } = await import("./native");
    const access = booking.tenantId ? await issueNativeAccess(booking.tenantId, booking.id) : null;
    const token = access && typeof access.manage_ciphertext === "string" ? decryptSecret(access.manage_ciphertext) : null;
    return token ? `${bookingAppOrigin()}/b/${encodeURIComponent(token)}` : null;
  }
  type Query = {
    select(columns: string): Query;
    eq(column: string, value: unknown): Query;
    maybeSingle(): PromiseLike<{ data: unknown; error: unknown }>;
  };
  const db = getSupabase() as unknown as { from(table: string): Query } | null;
  if (!db) return null;
  const { data, error } = await db.from("public_website_bookings")
    .select("management_token_ciphertext,end_at")
    .eq("id", booking.publicReservationId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { management_token_ciphertext?: unknown; end_at?: unknown };
  if (typeof row.management_token_ciphertext !== "string") return null;
  const token = decryptSecret(row.management_token_ciphertext);
  return token ? `${bookingAppOrigin()}/b/${encodeURIComponent(token)}` : null;
}

export const bookingLifecyclePorts: BookingLifecyclePorts = {
  expireHolds: (now) => expireBookingHolds(now),
  lapseRequests: (now, limit) => lapseBookingRequests(now, limit),
  claim: (now, limit) => claimBookingMessages(now, limit),
  finish: (messageId, status, providerMessageId, detail) => finishBookingMessage(messageId, status, providerMessageId, detail),
  async business(booking) {
    if (!booking.tenantId) return null;
    const config = await getTenantConfig(booking.tenantId);
    if (!config) return null;
    return {
      name: config.siteName ?? "",
      tenantId: booking.tenantId,
      ownerEmail: await ownerNoticeEmail(config).catch(() => null),
      siteUrl: getTenantPublicUrl(config),
    };
  },
  alternatives: (booking, now) => nextOpenTimes(booking, now),
  manageUrl,
  async send(input) {
    if (input.audience === "customer") {
      const { bookingCustomerEmailAllowed } = await import("./updates");
      if (!await bookingCustomerEmailAllowed(input.tenantId ?? null)) return { status: "suppressed", reason: "email_gates" };
    }
    return sendEmailWithReceipt(input);
  },
  appOrigin: bookingAppOrigin(),
};
