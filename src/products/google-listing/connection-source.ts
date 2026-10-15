import { getSupabase } from "@/platform/infra/db/client";
import type { ConnectionSource, WorkspaceConnection } from "@/platform/connections/contracts";

/** Local metadata only. The platform overlays recorded holders and eligibility.
 * Never select tokens, subject, cached listing content or review text. */
export function googleBusinessProfileConnectionSource(): ConnectionSource {
  return { provider: "google_business_profile", async list({ workspaceId }) {
    const db = getSupabase();
    if (!db) throw new Error("Google connections are unavailable.");
    const { data, error } = await db.from("workspace_account_bindings").select("id,status,created_at").eq("workspace_id", workspaceId).eq("provider", "google");
    if (error) throw new Error("Google connections are unavailable.");
    const bindings = data ?? [];
    if (!bindings.length) return [];
    const locations = await db.from("workspace_google_locations").select("binding_id,title").in("binding_id", bindings.map(row => row.id));
    if (locations.error) throw new Error("Google locations are unavailable.");
    return bindings.map((row): WorkspaceConnection => ({
      ref: `google_business_profile:${row.id}`, provider: "google_business_profile", workspaceId,
      accountLabel: locations.data?.find(location => location.binding_id === row.id)?.title ?? "Google Business Profile",
      accountHolder: { kind: "unknown" }, accessThrough: { kind: "unknown" },
      state: row.status === "connected" ? "connected" : row.status === "revoked" ? "disconnected" : "stale",
      unavailableReason: null, connectedAt: row.created_at, systemIds: [],
    }));
  } };
}
