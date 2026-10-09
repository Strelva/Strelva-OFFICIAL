import { listWorkspaceCalendarConnections } from "@/products/scheduling/calendar/repository";
import type { CalendarConnection } from "@/products/scheduling/calendar/contracts";
import type { BusinessSystems } from "@/platform/systems/from-existing";
import type { ConnectionState } from "@/platform/systems/contracts";
import type { Observation } from "@/platform/system-health";
import type { WorkspaceActor } from "@/platform/workspaces/types";

const MAX_AGE_SECONDS = 7 * 24 * 3600;

/** Only the calendar bindings already selected by a booking System. */
function bookingCalendars(listing: BusinessSystems) {
  const bookings = new Set(listing.systems.filter(item => item.system.kind === "booking").map(item => item.system.id));
  return listing.connections.flatMap(({ connection }) => connection.kind === "read" && bookings.has(connection.source.systemId) && connection.target.type === "account_binding"
    ? [{ connection, bindingId: connection.target.bindingId }] : []);
}

/** Stored verification only: a workspace read never refreshes tokens or calls a provider. */
export async function readBookingCalendarEvidence(
  listing: BusinessSystems, actor: WorkspaceActor, now: number,
  read: typeof listWorkspaceCalendarConnections = listWorkspaceCalendarConnections,
): Promise<Observation[]> {
  const bindings = [...new Set(bookingCalendars(listing).map(item => item.bindingId))];
  if (!bindings.length) return [];
  let calendars: CalendarConnection[] | null;
  try { calendars = await read(actor, listing.businessId); } catch { calendars = null; }
  return bindings.map<Observation>(subjectId => {
    const base = { subjectId, signal: "calendar.connection", source: "calendar-connection" as const, maxAgeSeconds: MAX_AGE_SECONDS };
    if (calendars === null) return { ...base, outcome: "unknown", observedAt: null, message: "The selected calendar connection could not be checked." };
    const calendar = calendars.find(item => item.id === subjectId && item.workspaceId === listing.businessId);
    const readAt = new Date(now).toISOString();
    if (!calendar || calendar.status === "revoked") return { ...base, outcome: "fail", impact: "blocking", observedAt: readAt, message: "The selected calendar is disconnected." };
    if (calendar.status === "authorized") return { ...base, outcome: "fail", impact: "blocking", observedAt: readAt, message: "Calendar authorization has not been verified for bookings." };
    if (calendar.status === "error") return { ...base, outcome: "fail", impact: "degrading", observedAt: readAt, message: "The selected calendar reported an error. Check its connection." };
    const at = calendar.lastCheckedAt ? Date.parse(calendar.lastCheckedAt) : Number.NaN;
    if (!Number.isFinite(at) || at > now) return { ...base, outcome: "unknown", observedAt: null, message: "The selected calendar has no valid dated verification." };
    return { ...base, outcome: "pass", observedAt: calendar.lastCheckedAt, message: "The selected calendar passed its last connection check." };
  });
}

/** A stored Connected state needs fresh evidence; a structural restriction stays. */
export function bookingCalendarConnectionStates(listing: BusinessSystems, observations: readonly Observation[], now: number): Map<string, ConnectionState> {
  return new Map(bookingCalendars(listing).map<[string, ConnectionState]>(({ connection, bindingId }) => {
    if (connection.state !== "connected") return [connection.id, connection.state];
    const evidence = observations.filter(item => item.subjectId === bindingId && item.source === "calendar-connection");
    const fresh = (item: Observation) => {
      const at = item.observedAt ? Date.parse(item.observedAt) : Number.NaN;
      return Number.isFinite(at) && at <= now && now - at <= item.maxAgeSeconds * 1000;
    };
    const disconnected = evidence.some(item => item.outcome === "fail" && item.impact === "blocking" && fresh(item));
    const connected = evidence.length > 0 && evidence.every(item => item.outcome === "pass" && fresh(item));
    return [connection.id, disconnected ? "disconnected" : connected ? "connected" : "stale"];
  }));
}
