import { formatVisitorTime } from "./public-admission-time";
import { CONTROL_PLANE_URL } from "@/platform/infra/brand";
/** Inquiry → three open times → a requested booking in the one store.
 * Off by default. A choice is a short-lived bearer link; GET never reserves. */
import { requirePublicBookingEmail } from "./public-confirmation";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "@/platform/infra/crypto/secrets";
import type { EmailOptions } from "@/platform/infra/email/layout";
import { PublicBookingError } from "./errors";
import { openRanges, settingsOrDefault, timeZoneOf } from "./availability";
import { bookingReadSource, bookingStoreWriteEnabled } from "./flags";
import { nativeRpc, nativeSlots, newBookingAccess, tokenHash } from "./native";
import { parseStoreBooking, readBookingContext, type BookingContext, type StoreBooking } from "./store";

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
  businessName?: string;
  id: string; serviceId: string; serviceName: string; timeZone: string;
  slots: Array<{ start: string; end: string }>; expiresAt: string; url: string; token: string; booked: boolean;
  /** Local dates between the first and last offered day when the business is closed, with its reason when given. Read-only presentation. */
  closedDays?: Array<{ date: string; label?: string }>;
  /** Whose offer this is, so the page can wear the business's own look. Read-only presentation, never rendered. */
  tenantId?: string;
}
function project(raw: unknown): InquiryBookingOffer | null {
  const row = rawOfferSchema.safeParse(raw);
  if (!row.success) return null;
  const r = row.data, token = decryptSecret(r.token_ciphertext);
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new PublicBookingError("unavailable", "Booking suggestions are unavailable.");
  const origin = (process.env.NEXT_PUBLIC_APP_URL || CONTROL_PLANE_URL).replace(/\/$/, "");
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
  const raw = await nativeRpc("read_inquiry_booking_offer", { p_hash: tokenHash(token) });
  const offer = project(raw);
  if (!offer) return null;
  const row = rawOfferSchema.parse(raw);
  const business = await nativeRpc("read_booking_business_details", { p_tenant_id: row.tenantId }) as { name?: string } | null;
  if (!business?.name?.trim()) throw new PublicBookingError("unavailable", "The business identity could not be verified.");
  // Closures are presentation only ("Closed" in place of "No times"); a failed read leaves them out.
  const context = offer.booked ? null : await readBookingContext(row.tenantId).catch(() => null);
  const closedDays = context ? offerClosedDays(context, offer) : [];
  return { ...offer, businessName: business.name, tenantId: row.tenantId, ...(closedDays.length ? { closedDays } : {}) };
}

/** Days between the first and last offered day with no open hours, and the reason the business gave, if any. Pure. */
export function offerClosedDays(context: BookingContext, offer: Pick<InquiryBookingOffer, "slots" | "timeZone">): Array<{ date: string; label?: string }> {
  let zone = offer.timeZone;
  try { new Intl.DateTimeFormat("en-CA", { timeZone: zone }).format(); } catch { zone = "UTC"; }
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
  const dates = offer.slots.map(slot => local.format(new Date(slot.start))).sort();
  if (!dates.length) return [];
  const labels = new Map<string, string>();
  for (const o of [...(context.hours?.overrides ?? []), ...(settingsOrDefault(context).bookableOverrides ?? [])]) if (o.closed && o.label?.trim() && !labels.has(o.date)) labels.set(o.date, o.label.trim().slice(0, 120));
  const out: Array<{ date: string; label?: string }> = [];
  for (let at = Date.parse(`${dates[0]}T12:00:00Z`), last = Date.parse(`${dates[dates.length - 1]}T12:00:00Z`); at <= last && out.length < 14; at += 86_400_000) {
    const date = new Date(at).toISOString().slice(0, 10);
    if (dates.includes(date) || openRanges(context, date).length) continue;
    out.push(labels.has(date) ? { date, label: labels.get(date)! } : { date });
  }
  return out;
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
    await requirePublicBookingEmail(raw.tenantId);
    const current = await nativeSlots(raw.tenantId, offer.serviceId, chosen.start, new Date(Date.parse(chosen.end) + 1).toISOString());
    if (!current.slots.some(s => s.start === chosen.start)) throw new PublicBookingError("conflict", "That time has just been taken. Ask the business for new times.");
  }
  const result = await nativeRpc("choose_inquiry_booking_offer", { p_hash: tokenHash(token), p_start: chosen.start, p_access: newBookingAccess("Website booking request") }) as { booking?: unknown };
  const booking = parseStoreBooking(result.booking);
  if (!booking) throw new PublicBookingError("unavailable", "The booking request receipt is unavailable.");
  return booking;
}
export function bookingOfferEmailOptions(offer: InquiryBookingOffer): Pick<EmailOptions, "rows" | "button"> {
  return { rows: offer.slots.map(s => ({ label: offer.serviceName, value: formatVisitorTime(s.start, offer.timeZone) })),
    button: { label: "Choose a time to request", url: offer.url } };
}
