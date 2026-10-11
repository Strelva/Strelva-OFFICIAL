import { z } from "zod";
import { bookingAgentName } from "@/platform/bookings/agent-source";
import { bookingStoreDb, BookingStoreError, parseStoreBooking } from "@/platform/bookings/store";
import { WorkspaceAccessError, type WorkspaceActor } from "@/platform/workspaces/types";
import { bookingRange, type BookingView, type WorkspaceBookings } from "./server";

const responseSchema = z.object({ today: z.string(), truncated: z.boolean(), bookings: z.array(z.unknown()).max(500) });

export async function readProviderBookings(actor: WorkspaceActor, workspaceId: string, options: { view: BookingView; date?: string | null; source?: "all" | "agent" }): Promise<WorkspaceBookings> {
  const db = bookingStoreDb();
  if (!db) throw new BookingStoreError("unconfigured");
  const date = options.date && /^\d{4}-\d{2}-\d{2}$/.test(options.date) ? options.date : null;
  const call = db.rpc("read_provider_booking_evidence", { p_workspace_id: workspaceId, p_user_id: actor.userId,
    p_verified_email: actor.verifiedEmail.trim().toLowerCase(), p_date: date, p_view: options.view });
  const response = await (call.abortSignal ? call.abortSignal(AbortSignal.timeout(2000)) : call);
  if (response.error?.message?.includes("business_record_access_denied") || response.error?.message?.includes("workspace_access_denied")) throw new WorkspaceAccessError();
  if (response.error) throw new BookingStoreError("failed");
  const data = responseSchema.parse(response.data);
  const range = bookingRange(options.view, date ?? data.today);
  const rows = data.bookings.map(raw => {
    const booking = parseStoreBooking(raw);
    if (!booking || booking.workspaceId !== workspaceId) throw new BookingStoreError("failed");
    const agentName = bookingAgentName(booking);
    return { id: booking.id, date: booking.localDate, startTime: booking.localStart, endTime: booking.localEnd,
      clientName: booking.customer.name, clientEmail: booking.customer.email ?? "", clientPhone: booking.customer.phone ?? "",
      serviceName: booking.serviceName, status: booking.status, ...(agentName ? { agentName } : {}),
      ...(booking.intakeAnswers.notes ? { notes: booking.intakeAnswers.notes } : {}) };
  });
  return { view: options.view, ...range, readOnly: true, agentVisibility: true, source: options.source === "agent" ? "agent" : "all",
    sites: [{ tenantId: `workspace:${workspaceId}`, siteName: "Shared bookings", timezone: "UTC", today: data.today,
      bookings: rows, unavailable: false, ...(data.truncated ? { evidence: { truncated: true, paused: false, calendarHealth: "not_connected" as const } } : {}) }] };
}
