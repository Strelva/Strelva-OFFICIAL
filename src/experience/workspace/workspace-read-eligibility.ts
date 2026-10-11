import type { WorkspaceSummary } from "./contracts";

/** Presentation eligibility only. Every read rechecks the actor's current grant in SQL. */
export function workspaceReadEligibility(workspace: WorkspaceSummary | undefined, needsYouReleased: boolean) {
  const customer = workspace?.kind === "customer";
  const agency = workspace?.access === "provider_seat";
  const delegated = workspace?.access === "delegated_read";
  return {
    agency,
    decisions: Boolean(customer && needsYouReleased && !delegated),
    deliveries: Boolean(customer && (agency || !delegated && ["owner", "admin"].includes(workspace?.role || ""))),
    siteSummary: Boolean(customer && !agency && !delegated),
    canDecide: Boolean(customer && !agency && !delegated),
  };
}
