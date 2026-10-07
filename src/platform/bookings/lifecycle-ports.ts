import { bookingScopeFor, workspaceBookingScope } from "./booking-scope";
import { resolveOwnerRecipient } from "@/platform/business-record";
import { emailSendingEnabled } from "@/platform/infra/email/enabled";
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
import { nativeSlots } from "./native";
import { bookingManagePageEnabled, bookingMessagesEnabled } from "./flags";
import type { BookingLifecyclePorts } from "./lifecycle";
import {
  claimBookingMessages,
  expireBookingHolds,
  finishBookingMessage,
  lapseBookingRequests,
  bookingStoreDb,
  type StoreBooking,
} from "./store";

export function bookingAppOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://app.strelva.com").replace(/\/$/, "");
}

/** Up to three currently offered times for the same active service. Removed
 * services, pause and unavailable storage produce no proposals. Calendar busy
 * times and current service length use exactly the public slot engine. */
export async function nextOpenTimes(booking: StoreBooking, now: Date, count = 3): Promise<string[]> {
  if (!bookingScopeFor(booking) || !booking.serviceRef || count <= 0) return [];
  try {
    const offered = await nativeSlots(bookingScopeFor(booking)!, booking.serviceRef, now.toISOString(), new Date(now.getTime() + 14 * 86400000).toISOString());
    const day = new Intl.DateTimeFormat("en-US", { timeZone: offered.timeZone, weekday: "short", month: "short", day: "numeric" });
    const time = new Intl.DateTimeFormat("en-US", { timeZone: offered.timeZone, hour: "numeric", minute: "2-digit" });
    return offered.slots.slice(0, count).map(slot => `${day.format(new Date(slot.start))} at ${time.format(new Date(slot.start))} (${offered.timeZone})`);
  } catch { return []; }
}

/** The customer's manage link for an API reservation (its token is stored encrypted for receipts). */
export async function manageUrl(booking: StoreBooking): Promise<string | null> {
  if (!bookingManagePageEnabled()) return null;
  if (!booking.publicReservationId) {
    if (!bookingMessagesEnabled()) return null;
    const { issueNativeAccess } = await import("./native");
    const scope = bookingScopeFor(booking);
    const access = scope ? await issueNativeAccess(scope, booking.id) : null;
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
    if (!booking.tenantId) {
      if (!booking.workspaceId) return null;
      const db = bookingStoreDb();
      if (!db) throw new Error("booking_business_facts_unavailable");
      const details = await db.rpc("read_booking_business_details", { p_tenant_id: workspaceBookingScope(booking.workspaceId) });
      if (details.error || !details.data) throw new Error("booking_business_facts_unavailable");
      const facts = details.data as { name?: string; address?: string };
      const recipient = await resolveOwnerRecipient(booking.workspaceId);
      return { name: facts.name ?? "", address: facts.address ?? "", tenantId: null,
        ownerEmail: recipient?.email ?? null, siteUrl: null };
    }
    const config = await getTenantConfig(booking.tenantId);
    if (!config) return null;
    const details = await bookingStoreDb()?.rpc("read_booking_business_details", { p_tenant_id: booking.tenantId });
    if (details?.error) throw new Error("booking_business_facts_unavailable");
    const facts = details?.data as { name?: string; address?: string } | null;
    return {
      name: facts?.name ?? config.siteName ?? "",
      address: facts?.address ?? "",
      tenantId: booking.tenantId,
      ownerEmail: await ownerNoticeEmail(config).catch(() => null),
      siteUrl: getTenantPublicUrl(config),
    };
  },
  alternatives: (booking, now) => nextOpenTimes(booking, now),
  manageUrl,
  async send(input) {
    if (!emailSendingEnabled()) return { status: "suppressed", reason: "email_gates" };
    const { bookingCustomerEmailAllowed } = await import("./updates");
    if (!await bookingCustomerEmailAllowed(input.tenantId ?? null, input.tags?.bookingWorkspaceId)) return { status: "suppressed", reason: "email_gates" };
    return sendEmailWithReceipt(input);
  },
  appOrigin: bookingAppOrigin(),
};
