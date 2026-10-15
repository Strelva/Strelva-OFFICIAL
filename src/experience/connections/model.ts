import { z } from "zod";
import { connectionProviderSchema, providerEligibilitySchema, workspaceConnectionSchema, type ConnectionProvider, type UnavailableReason, type CredentialHolder, type WorkspaceConnection } from "@/platform/connections/contracts";
import { providerDefinition } from "@/platform/connections/providers";

export const connectionsResponseSchema = z.object({
  connections: z.array(workspaceConnectionSchema),
  sourceErrors: z.array(connectionProviderSchema),
  providerEligibility: z.partialRecord(connectionProviderSchema, providerEligibilitySchema).optional(),
});
export type ConnectionsResponse = z.infer<typeof connectionsResponseSchema>;

export function accountHolderLabel(holder: CredentialHolder, workspaceId: string, workspaceKind: "customer" | "agency", names: ReadonlyMap<string, string>): string {
  if (holder.kind === "unknown") return "Unknown";
  if (holder.kind === "platform") return "Strelva";
  if (holder.kind === "business") return holder.workspaceId === workspaceId ? "Your business" : names.get(holder.workspaceId) || "Business name unavailable";
  const name = names.get(holder.workspaceId) || "Agency name unavailable";
  return workspaceKind === "customer" ? `${name} (your agency)` : name;
}

/** The short state shown on a row that cannot be used yet; "Coming soon" only when nothing more honest is known. */
export function unavailableStateLabel(reason: UnavailableReason | null, provider: ConnectionProvider): string {
  switch (reason) {
    case "not_set_up": return "Not set up yet";
    case "approval_pending": return `Waiting on ${providerDefinition(provider).approver}`;
    case "area_not_granted": return "Needs access";
    case "not_your_agency": return "Not available";
    default: return "Coming soon";
  }
}

export function connectionNextStep(connection: WorkspaceConnection): string | null {
  const label = providerDefinition(connection.provider).label;
  switch (connection.unavailableReason) {
    case "area_not_granted": return "Give your agency this business area in People & access.";
    case "not_your_agency": return "Your agency needs to act with its own account.";
    case "coming_soon": return `${label} for businesses on Strelva is coming soon.`;
    case "not_set_up": return `Strelva hasn’t set up ${label} yet. It will work once Strelva adds it; nothing to do on your side.`;
    case "approval_pending": {
      const approver = providerDefinition(connection.provider).approver;
      return `${label} is waiting on ${approver}’s approval. Ready changes stay ready and go out once ${approver} approves.`;
    }
    case "not_configured": return `${label} is coming soon.`;
  }
  if (connection.state === "unavailable") return `${label} is unavailable. Check again later.`;
  if (connection.accountHolder.kind === "unknown" || connection.accessThrough.kind === "unknown") return "Reconnect to record whose account this is";
  return null;
}

/** These open existing permission-checked setup screens. They never start OAuth or write. */
export function connectionSetupHref(connection: Pick<WorkspaceConnection, "provider">, workspaceId: string): string {
  const params = new URLSearchParams({ workspaceId });
  switch (connection.provider) {
    case "google_business_profile": return `/workspace/google?${params}`;
    case "google_calendar": case "calendly": return `/workspace?${params}&view=scheduling`;
    case "connected_site": return `/workspace/site?${params}`;
    case "stripe": return `/workspace/payments?${params}`;
    case "highlevel": return `/workspace?${params}&agencyView=clients`;
    // Tenant-scoped setup is deliberately left with its existing controls.
    case "resend": case "instagram": return `/workspace?${params}&view=settings`;
  }
}


export function accountSetupChoices(kind: "customer" | "agency"): ConnectionProvider[] {
  return kind === "agency" ? ["highlevel", "google_business_profile", "stripe"]
    : ["google_business_profile", "google_calendar", "calendly", "connected_site", "stripe", "instagram"];
}
