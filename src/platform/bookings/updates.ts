import { agentConfirmationEmailAllowed, isolatedAgentConfirmation } from "@/platform/agent-channel/policy";
import { bookingScopeFor } from "./booking-scope";
import { businessBookingEmailEnabled } from "./email-enablement";
import { bookingAgentLabel } from "./agent-source";
import { bookingAgentVisibilityEnabled } from "./flags";
/** One send path, existing audience gates, no retry after a provider attempt. */
import { z } from "zod";
import { decryptSecret } from "@/platform/infra/crypto/secrets";
import { sendEmailWithReceipt, type SendEmailInput } from "@/platform/infra/email/send";
import { emailSendingEnabled, customerEmailEnabled } from "@/platform/infra/email/enabled";
import { getClientEmailOverride } from "@/platform/infra/email/client-override";
import { bookingAgentsEnabled, bookingManagePageEnabled, bookingMessagesEnabled, bookingOwnerNoticeEnabled } from "./flags";
import { bookingLifecyclePorts, bookingAppOrigin } from "./lifecycle-ports";
import { bookingWhen } from "./emails";
import { nativeRpc } from "./native";
import { parseStoreBooking, type StoreBooking } from "./store";

export async function bookingCustomerEmailAllowed(tenantId: string | null, workspaceId?: string | null): Promise<boolean> {
  if (!emailSendingEnabled() || !customerEmailEnabled()) return false;
  if (tenantId?.startsWith("workspace:")) {
    workspaceId = tenantId.slice("workspace:".length);
    tenantId = null;
  }
  if (tenantId) return await getClientEmailOverride(tenantId) !== "off";
  if (!z.string().uuid().safeParse(workspaceId).success) return false;
  // Native businesses have no tenant override to inherit. Explicit operator
  // arming is required in addition to both global email gates.
  return !!workspaceId && await businessBookingEmailEnabled(workspaceId);
}

function calendarFile(booking: StoreBooking, businessName: string, address: string) {
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/[\r\n]+/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  const stamp = (s: string) => new Date(s).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Strelva//Bookings//EN", "METHOD:PUBLISH", "BEGIN:VEVENT",
    `UID:${booking.id}@strelva.com`, `DTSTAMP:${stamp(booking.createdAt)}`, `DTSTART:${stamp(booking.start)}`, `DTEND:${stamp(booking.end)}`,
    `SUMMARY:${escape(`${booking.serviceName} — ${businessName}`)}`, ...(address ? [`LOCATION:${escape(address)}`] : []), "END:VEVENT", "END:VCALENDAR"];
  // Fold UTF-8 safely at <=75 octets (RFC 5545). Avoid header/line injection.
  return lines.flatMap(line => {
    const out: string[] = []; let part = "";
    for (const char of line) {
      if (Buffer.byteLength(part + char) > 74) { out.push(part); part = " " + char; } else part += char;
    }
    out.push(part); return out;
  }).join("\r\n") + "\r\n";
}

export interface BookingUpdatePorts {
  claim(bookingId: string | null, owner: boolean, agent: boolean): Promise<unknown>;
  finish(id: string, status: string, provider: string | null, detail: string | null): Promise<unknown>;
  business(booking: StoreBooking): ReturnType<typeof bookingLifecyclePorts.business>;
  manageUrl?(booking: StoreBooking): Promise<string | null>;
  customerAllowed(tenant: string | null, workspaceId?: string | null): Promise<boolean>;
  send(input: SendEmailInput): ReturnType<typeof sendEmailWithReceipt>;
}
const ports: BookingUpdatePorts = {
  claim: (id, owner, agent) => nativeRpc("claim_booking_updates", { p_booking_id: id, p_owner: owner, p_agent: agent, p_limit: 200 }),
  finish: (id, status, provider, detail) => nativeRpc("finish_booking_update", { p_id: id, p_status: status, p_provider: provider, p_detail: detail }),
  business: (b) => bookingLifecyclePorts.business(b), manageUrl: (b) => bookingLifecyclePorts.manageUrl(b), customerAllowed: bookingCustomerEmailAllowed, send: sendEmailWithReceipt,
};

export async function deliverBookingUpdates(bookingId: string | null = null, deps: BookingUpdatePorts = ports) {
  const summary = { sent: 0, customerSent: 0, suppressed: 0, failed: 0 };
  if (!bookingMessagesEnabled()) return summary;
  const rows = await deps.claim(bookingId, bookingOwnerNoticeEnabled(), bookingAgentsEnabled());
  if (!Array.isArray(rows)) throw new Error("booking_updates_malformed");
  for (const raw of rows) {
    const row = raw as { messageId: string; audience: "customer" | "client"; reason?: string; fromStatus?: string; booking: unknown; access?: Record<string, unknown> };
    const booking = parseStoreBooking(row.booking);
    const finish = (status: string, provider: string | null = null, detail: string | null = null) => deps.finish(row.messageId, status, provider, detail).catch(() => undefined);
    try {
      if (!booking) { await finish("skipped", null, "booking_unknown"); continue; }
      const business = await deps.business(booking);
      const to = row.audience === "client" ? business?.ownerEmail : booking.customer.email;
      if (!business || !to) { await finish("skipped", null, "no_recipient"); continue; }
      const confirmation = row.audience === "customer" && booking.origin === "agent" && booking.status === "held" && isolatedAgentConfirmation();
      const allowed = confirmation ? await agentConfirmationEmailAllowed(bookingScopeFor(booking) ?? "") : await (booking.tenantId ? deps.customerAllowed(booking.tenantId) : deps.customerAllowed(null, booking.workspaceId));
      if (!allowed) { summary.suppressed++; await finish("suppressed", null, "email_gates"); continue; }
      const agentSource = bookingAgentVisibilityEnabled() ? bookingAgentLabel(booking) : null;
      const when = bookingWhen(booking);
      const state = booking.status;
      const rescheduled = row.reason === "Customer rescheduled";
      const title = row.audience === "client" && state === "confirmed" && !rescheduled ? "New booking" : state === "held" ? "Confirm your booking request" : state === "cancelled" ? "Booking cancelled" : state === "declined" ? "Your time wasn't confirmed"
        : state === "requested" ? "Request received" : rescheduled ? "Booking rescheduled" : "Booking confirmed";
      const tokenCipher = state === "held" ? row.access?.confirm_ciphertext : row.access?.manage_ciphertext;
      const token = typeof tokenCipher === "string" ? decryptSecret(tokenCipher) : null;
      const url = row.audience === "client" ? `${bookingAppOrigin()}/workspace/bookings?${new URLSearchParams({ workspaceId: booking.workspaceId ?? "", date: booking.localDate })}` : bookingManagePageEnabled() ? token ? `${bookingAppOrigin()}/b/${encodeURIComponent(token)}` : await deps.manageUrl?.(booking).catch(() => null) : null;
      const result = await deps.send({ audience: row.audience, tenantId: booking.tenantId ?? undefined, to,
        fromName: business.name || "Strelva", fromAddress: "bookings@mail.strelva.com",
        subject: `${title}: ${booking.serviceName}, ${when.day} ${when.time}`,
        idempotencyKey: `booking-update:${row.messageId}`,
        options: { heading: title, paragraphs: [state === "held"
          ? "You requested this time. Confirm below within 15 minutes. Nothing is booked until you confirm."
          : state === "requested" ? "The business will confirm this request. This time is not confirmed yet."
          : state === "cancelled" ? "This booking is cancelled."
          : state === "declined" ? "This time was not confirmed. Reply to ask about another time."
          : "Your time is confirmed.",
          ...(business.address ? [`Where: ${business.address}`] : [])],
          rows: [{ label: "Service", value: booking.serviceName }, { label: "When", value: `${when.day}, ${when.time} (${booking.timeZone})` }, ...(agentSource ? [{ label: "Source", value: agentSource }] : [])],
          ...(url ? { button: { label: row.audience === "client" ? "Open bookings" : state === "held" ? "Review and confirm" : "Change or cancel", url } } : {}) },
        ...(state === "confirmed" && row.audience === "customer" ? { attachments: [{ filename: "booking.ics", content: Buffer.from(calendarFile(booking, business.name, business.address ?? "")).toString("base64") }] } : {}),
      });
      if (result.status === "accepted") { summary.sent++; if (row.audience === "customer") summary.customerSent++; await finish("sent", result.providerMessageId); }
      else { summary.suppressed++; await finish("suppressed", null, result.reason); }
    } catch {
      summary.failed++; await finish("failed", null, "send_or_business_read_failed");
    }
  }
  return summary;
}

/** The booking is already durable. Owner delivery cannot fail its receipt. */
export async function notifyBookingRequestNow(booking: StoreBooking) {
  if (booking.status !== "requested" || !bookingOwnerNoticeEnabled()) return;
  try {
    const { notifyBookingRequestNow: notify } = await import("@/platform/needs-you/server");
    await notify(booking);
  } catch { /* The durable request will be reconciled by the cron. */ }
}
