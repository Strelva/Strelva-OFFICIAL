import type { AgencySummary } from "@/platform/workspaces/agency-onboarding";

/** A platform role is not agency membership. Never select another agency or
 * guess a workspace ID when the ordinary member read fails or is ambiguous. */
export function strelvaAgencySeat(agencies: readonly AgencySummary[]): AgencySummary | null {
  const matches = agencies.filter(agency => agency.name.trim() === "Strelva Agency");
  return matches.length === 1 ? matches[0]! : null;
}

export function agencyEntryHref(base: string, agencyId: string, destination: "queue" | "onboard", addClientEnabled: boolean): string {
  const path = base.split("?")[0]!;
  if (destination === "onboard" && addClientEnabled) return `${path}/agency/clients/new?workspaceId=${encodeURIComponent(agencyId)}`;
  return `${path}?workspace=${encodeURIComponent(agencyId)}&view=home&agencyView=${destination === "queue" ? "queue" : "clients"}`;
}
