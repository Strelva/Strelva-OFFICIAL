/**
 * Booking requests as Needs you items (bookings spec, "Approvals"). A request
 * promises a time, so it is `customer.commitment`: always the owner's call,
 * urgent (emailed at once by the hourly chase), owner only at 1.0.0 (spec open
 * decision 4). Approve runs the booking's own confirm in the one store; Not
 * yet declines it and releases the time. Needs you records the decision and
 * makes no second write path. Silence never confirms a booking: a lapse
 * declines it like Not yet.
 *
 * Reads by workspace through a service-role function that returns only that
 * business's requests, so the hourly chase can propose items without a member.
 */
import { createHash } from "node:crypto";
import type { ProposedItem } from "@/platform/needs-you/contracts";
import type { SourceAdapter } from "@/platform/needs-you/adapters";
import type { StoreBooking } from "./store";

export const BOOKING_REQUEST_LIFECYCLE = "booking_request" as const;

export interface BookingRequestPorts {
  requests(workspaceId: string): Promise<StoreBooking[]>;
  decide(workspaceId: string, bookingId: string, decision: "approve" | "not_yet", actor: "owner" | "member"): Promise<{ status: "decided" | "already_decided"; booking: StoreBooking }>;
  /** Keeps the legacy booking row in step (rollback needs both stores). Best effort. */
  afterDecision?(booking: StoreBooking): Promise<void>;
}

export function bookingRequestRevision(booking: StoreBooking): string {
  return createHash("sha256").update(JSON.stringify([booking.id, booking.status, booking.start, booking.end, booking.serviceName])).digest("hex");
}

function when(booking: StoreBooking): string {
  const date = new Date(`${booking.localDate}T12:00:00Z`);
  const day = Number.isNaN(date.getTime()) ? booking.localDate
    : new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(date);
  const [h, m] = booking.localStart.split(":").map(Number);
  const hour = ((h ?? 0) % 12) || 12;
  return `${day} ${hour}:${String(m ?? 0).padStart(2, "0")} ${(h ?? 0) < 12 ? "AM" : "PM"}`;
}

export function bookingRequestItem(booking: StoreBooking, workspaceId: string): ProposedItem | null {
  if (booking.status !== "requested" || booking.workspaceId !== workspaceId) return null;
  const who = booking.customer.name.replace(/\s+/g, " ").trim() || "A customer";
  return {
    kind: "customer.commitment",
    route: "owner_decides",
    systemId: booking.systemId,
    title: `Booking request: ${who}, ${when(booking)}`.slice(0, 200),
    detail: [booking.serviceName, booking.customer.email, booking.intakeAnswers.notes ?? booking.intakeAnswers.message].filter(Boolean).join(" · ").slice(0, 600) || null,
    approveEffect: "The booking is confirmed for this time.",
    notYetEffect: "The time is released and the booking is not confirmed.",
    sourceLifecycle: BOOKING_REQUEST_LIFECYCLE,
    sourceId: booking.id,
    revisionHash: bookingRequestRevision(booking),
    urgent: true,
    adminMayDecide: false,
    openHref: `/workspace/bookings?${new URLSearchParams({ workspaceId, view: "week", date: booking.localDate })}`,
  };
}

export function bookingRequestAdapter(ports: BookingRequestPorts): SourceAdapter {
  return {
    lifecycle: BOOKING_REQUEST_LIFECYCLE,
    needsMemberActor: false,
    async propose(ctx) {
      try {
        const rows = await ports.requests(ctx.workspaceId);
        return { items: rows.flatMap((row) => bookingRequestItem(row, ctx.workspaceId) ?? []), complete: true };
      } catch {
        return { items: [], complete: false };
      }
    },
    async currentRevision(ctx, sourceId) {
      const row = (await ports.requests(ctx.workspaceId)).find((b) => b.id === sourceId);
      return row ? bookingRequestRevision(row) : null;
    },
    async resolve(ctx, item, decision, by) {
      const effective = by.kind === "expiry" ? "not_yet" : decision;
      try {
        // Owner only at 1.0.0: the item is not decidable by admins (adminMayDecide false).
        const result = await ports.decide(ctx.workspaceId, item.sourceId, effective, "owner");
        if (result.status === "already_decided") return { outcome: "done", reason: "already_resolved", receiptRef: `booking:${item.sourceId}` };
        await ports.afterDecision?.(result.booking).catch(() => undefined);
        return {
          outcome: "done",
          ...(by.kind === "expiry" ? { reason: "Expired, nothing confirmed" } : {}),
          receiptRef: `booking:${result.booking.id}:${result.booking.status}`,
        };
      } catch {
        return { outcome: "failed", reason: "resolver_failed" };
      }
    },
  };
}
