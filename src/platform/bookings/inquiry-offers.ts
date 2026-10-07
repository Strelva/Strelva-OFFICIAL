/** Inquiry → three open times → a requested booking in the one store.
 * Off by default. A choice is a short-lived bearer link; GET never reserves. */
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/platform/infra/crypto/secrets";
import type { EmailOptions } from "@/platform/infra/email/layout";
import { PublicBookingError } from "@/products/scheduling/public-booking";
import { settingsOrDefault, timeZoneOf } from "./availability";
import { bookingReadSource, bookingStoreWriteEnabled } from "./flags";
import { nativeRpc, nativeSlots, newBookingAccess, tokenHash } from "./native";
import { parseStoreBooking, readBookingContext, type StoreBooking } from "./store";

export function bookingInquiryOffersEnabled(env: Partial<Record<string, string | undefined>> = process.env) {
  return env.STRELVA_BOOKING_INQUIRY_OFFERS?.trim() === "1" && bookingStoreWriteEnabled(env);
}
export async function requireInquiryBookingOffers() {
  if (!bookingInquiryOffersEnabled() || await bookingReadSource() !== "postgres") throw new PublicBookingError("unavailable", "Booking suggestions are not enabled.");
}
const slotSchema = z.object({ start: z.string().datetime({ offset: true }), end: z.string().datetime({ offset: true }) });
const rawOfferSchema = z.object({
  id: z.string().uuid(), tenantId: z.string(), inquiry_id: z.string(), token_ciphertext: z.string(), service_ref: z.string(),
  service_name: z.string(), timezone: z.string(), slots: z.array(slotSchema).min(1).max(3), expires_at: z.string(),
  booking_id: z.string().uuid().nullable(), customer: z.object({ name: z.string(), email: z.string().email() }),
});
export interface InquiryBookingOffer {
  id: string; serviceId: string; serviceName: string; timeZone: string;
  slots: Array<{ start: string; end: string }>; expiresAt: string; url: string; token: string; booked: boolean;
}
function project(raw: unknown): InquiryBookingOffer | null {
  const row = rawOfferSchema.safeParse(raw);
  if (!row.success) return null;
  const r = row.data, token = decryptSecret(r.token_ciphertext);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new PublicBookingError("unavailable", "Booking suggestions are unavailable.");
  const origin = (process.env.NEXT_PUBLIC_APP_URL || "https://app.strelva.com").replace(/\/$/, "");
  return { id: r.id, serviceId: r.service_ref, serviceName: r.service_name, timeZone: r.timezone,
    slots: r.slots, expiresAt: r.expires_at, url: `${origin}/book-inquiry/${token}`, token, booked: !!r.booking_id };
}
export const inquiryBookingOfferInput = z.object({
  tenantId: z.string().regex(/^[a-z0-9-]+$/), inquiryId: z.string().min(1).max(200),
  customer: z.object({ name: z.string().trim().min(1).max(160), email: z.string().trim().email().max(320), phone: z.string().max(80).optional() }).strict(),
  serviceId: z.string().min(1).max(200).optional(), starts: z.array(z.string().datetime({ offset: true })).min(1).max(3).optional(),
  source: z.enum(["receipt", "owner"]).default("receipt"),
});
export type InquiryBookingOfferInput = z.input<typeof inquiryBookingOfferInput>;
/** Caller must supply a captured inquiry (never arbitrary visitor identity).
 * Owner starts are checked against the same slot engine as public bookings. */
export async function prepareInquiryBookingOffer(raw: InquiryBookingOfferInput, now = new Date()): Promise<InquiryBookingOffer | null> {
  await requireInquiryBookingOffers();
  const input = inquiryBookingOfferInput.parse(raw);
  if (!process.env.SECRETS_ENC_KEY) throw new PublicBookingError("unavailable", "Booking token encryption is not configured.");
  const ctx = await readBookingContext(input.tenantId);
  if (!ctx?.workspaceId || ctx.paused || settingsOrDefault(ctx).mode !== "request") return null;
  const service = ctx.services.find(s => s.active && (!input.serviceId || s.id === input.serviceId || s.externalRef === input.serviceId));
  if (!service) return null;
  const serviceId = service.externalRef ?? service.id;
  const max = Math.min(settingsOrDefault(ctx).maxAdvanceDays, 60);
  const offered = await nativeSlots(input.tenantId, serviceId, now.toISOString(), new Date(now.getTime() + max * 86400000).toISOString());
  const starts = input.starts ? [...new Set(input.starts.map(s => new Date(s).toISOString()))] : null;
  const slots = starts ? starts.map(start => offered.slots.find(s => s.start === start)) : offered.slots.slice(0, 3);
  if (slots.some(s => !s)) throw new PublicBookingError("conflict", "One of these times has just been taken. Choose open times.");
  if (!slots.length) return null;
  const token = randomBytes(32).toString("base64url");
  const key = input.source === "receipt" ? "receipt" : `owner-${createHash("sha256").update(JSON.stringify([serviceId, starts])).digest("hex")}`;
  return project(await nativeRpc("issue_inquiry_booking_offer", { p_tenant_id: input.tenantId, p_offer: {
    inquiryId: input.inquiryId, key, customer: input.customer, serviceId, serviceName: service.name,
    timeZone: timeZoneOf(ctx), bufferMinutes: settingsOrDefault(ctx).bufferMinutes,
    slots: slots.map(s => ({ start: s!.start, end: s!.end })),
    tokenHash: tokenHash(token), tokenCiphertext: encryptSecret(token), expiresAt: new Date(now.getTime() + 72 * 3600000).toISOString(),
  } }));
}
/** Capture succeeded already. Suggestions must never fail an inquiry receipt. */
export async function captureInquiryBookingOffer(input: InquiryBookingOfferInput): Promise<InquiryBookingOffer | null> {
  if (!bookingInquiryOffersEnabled()) return null;
  try { return await prepareInquiryBookingOffer(input); } catch { return null; }
}
export async function readInquiryBookingOfferForReceipt(tenantId: string, inquiryId: string): Promise<InquiryBookingOffer | null> {
  if (!bookingInquiryOffersEnabled()) return null;
  try {
    await requireInquiryBookingOffers();
    return project(await nativeRpc("read_inquiry_booking_receipt", { p_tenant_id: tenantId, p_inquiry_id: inquiryId }));
  } catch { return null; }
}
export async function readInquiryBookingOffer(token: string): Promise<InquiryBookingOffer | null> {
  await requireInquiryBookingOffers();
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return project(await nativeRpc("read_inquiry_booking_offer", { p_hash: tokenHash(token) }));
}
export async function chooseInquiryBookingOffer(token: string, start: string): Promise<StoreBooking> {
  const offer = await readInquiryBookingOffer(token);
  if (!offer) throw new PublicBookingError("not_found", "This booking suggestion has expired.");
  const chosen = offer.slots.find(s => Date.parse(s.start) === Date.parse(start));
  if (!chosen) throw new PublicBookingError("invalid", "Choose one of the suggested times.");
  // A retry of the same choice bypasses availability: its own booking occupies
  // the time. The locked RPC refuses any different choice after consumption.
  if (!offer.booked) {
    const raw = rawOfferSchema.parse(await nativeRpc("read_inquiry_booking_offer", { p_hash: tokenHash(token) }));
    const current = await nativeSlots(raw.tenantId, offer.serviceId, chosen.start, new Date(Date.parse(chosen.end) + 1).toISOString());
    if (!current.slots.some(s => s.start === chosen.start)) throw new PublicBookingError("conflict", "That time has just been taken. Ask the business for new times.");
  }
  const result = await nativeRpc("choose_inquiry_booking_offer", { p_hash: tokenHash(token), p_start: chosen.start, p_access: newBookingAccess() }) as { booking?: unknown };
  const booking = parseStoreBooking(result.booking);
  if (!booking) throw new PublicBookingError("unavailable", "The booking request receipt is unavailable.");
  return booking;
}
export function bookingOfferEmailOptions(offer: InquiryBookingOffer): Pick<EmailOptions, "rows" | "button"> {
  const format = new Intl.DateTimeFormat("en-US", { timeZone: offer.timeZone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  return { rows: offer.slots.map(s => ({ label: offer.serviceName, value: `${format.format(new Date(s.start))} (${offer.timeZone})` })),
    button: { label: "Choose a time to request", url: offer.url } };
}
