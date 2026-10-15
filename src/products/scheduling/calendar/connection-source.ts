import { getSupabase } from "@/platform/infra/db/client";
import type { ConnectionSource, WorkspaceConnection } from "@/platform/connections/contracts";

/** Calendar selection is local metadata; listing connections never refreshes a token. */
function calendarConnectionSource(kind: "google" | "outlook"): ConnectionSource {
  const provider = kind === "google" ? "google_calendar" : "outlook_calendar";
  return { provider, async list({ workspaceId }) {
    const db = getSupabase();
    if (!db) throw new Error("Calendar connections are unavailable.");
    const { data, error } = await db.from("workspace_calendar_connections").select("id,calendar_name,status,created_at").eq("workspace_id", workspaceId).eq("provider", kind);
    if (error) throw new Error("Calendar connections are unavailable.");
    return (data ?? []).map((row): WorkspaceConnection => ({
      ref: `${provider}:${row.id}`, provider, workspaceId, accountLabel: row.calendar_name,
      accountHolder: { kind: "unknown" }, accessThrough: { kind: "unknown" },
      state: row.status === "connected" ? "connected" : row.status === "revoked" ? "disconnected" : "stale",
      unavailableReason: null, connectedAt: row.created_at, systemIds: [],
    }));
  } };
}

export function googleCalendarConnectionSource(): ConnectionSource { return calendarConnectionSource("google"); }
export function outlookCalendarConnectionSource(): ConnectionSource { return calendarConnectionSource("outlook"); }
