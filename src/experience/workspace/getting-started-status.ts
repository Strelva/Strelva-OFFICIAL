import type { BusinessRecord } from "@/platform/business-record/contracts";
import type { WorkspaceSnapshot } from "./contracts";

/** Names and a saved URL alone are not confirmed business details. No second completion store. */
export function gettingStartedStatus(record: BusinessRecord, waiting: number | null): "complete" | "incomplete" | "unavailable" {
  if (waiting === null) return "unavailable";
  const confirmedFact = Object.entries(record.facts).some(([key, fact]) =>
    !["display_name", "legal_name", "links", "owner_recipient"].includes(key) && fact?.verified === true);
  const confirmedService = record.services.some(service => service.active && service.verified);
  return waiting === 0 && (confirmedFact || confirmedService) ? "complete" : "incomplete";
}

/** Direct owners keep the route while setup is incomplete or its read is uncertain. */
export function ownerGettingStartedHref(snapshot: WorkspaceSnapshot, appBase = ""): string | null {
  if (snapshot.releases?.businessSignup !== true) return null;
  const current = snapshot.workspaces.find(workspace => workspace.id === snapshot.workspaceId);
  if (current?.kind !== "customer" || current.role !== "owner" || current.access === "provider_seat" || current.access === "delegated_read" || snapshot.gettingStarted === "complete") return null;
  return `${appBase.replace(/\/$/, "")}/workspace/getting-started?${new URLSearchParams({ workspaceId: snapshot.workspaceId })}`;
}
