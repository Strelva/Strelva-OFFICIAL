import type { ConnectionProvider, ProviderEligibility, RequiredConnection, WorkspaceConnection } from "@/platform/connections/contracts";
import { providerDefinition } from "@/platform/connections/providers";
import type { WorkspaceActor } from "@/platform/workspaces/types";

export interface RequiredConnectionsPort {
  listWorkspaceConnections(actor: WorkspaceActor, workspaceId: string): Promise<{ connections: WorkspaceConnection[]; sourceErrors: ConnectionProvider[] }>;
  connectionEligibilityFor(actor: WorkspaceActor, input: { provider: ConnectionProvider; businessWorkspaceId: string }): Promise<ProviderEligibility>;
}

export class RequiredConnectionsError extends Error {
  constructor(readonly provider: ConnectionProvider, message: string) {
    super(message);
    this.name = "RequiredConnectionsError";
  }
}

/** The live command re-reads both provider access and account state. Install and
 * draft preparation deliberately do not call this: missing accounts must not
 * prevent a business from saving and reviewing its own System. */
export async function assertRequiredConnections(input: {
  actor: WorkspaceActor;
  workspaceId: string;
  requiredConnections: readonly RequiredConnection[];
  /** If the System chose an account, another account must not satisfy it. */
  connectionRefs?: readonly string[];
}, supplied?: RequiredConnectionsPort): Promise<void> {
  const required = input.requiredConnections.filter(item => !item.optional);
  if (!required.length) return;
  let port: RequiredConnectionsPort;
  let listing: Awaited<ReturnType<RequiredConnectionsPort["listWorkspaceConnections"]>>;
  try {
    port = supplied ?? await import("@/platform/connections/server");
    listing = await port.listWorkspaceConnections(input.actor, input.workspaceId);
  }
  catch { throw new RequiredConnectionsError(required[0]!.provider, "Open Connections and retry checking this business's accounts before making it live."); }
  for (const requirement of required) {
    const definition = providerDefinition(requirement.provider);
    const label = definition.label;
    if (requirement.access === "act" && !definition.acts) throw new RequiredConnectionsError(requirement.provider, `${label} cannot make this change. Open Connections to review this System's needs.`);
    let eligibility: ProviderEligibility;
    try { eligibility = await port.connectionEligibilityFor(input.actor, { provider: requirement.provider, businessWorkspaceId: input.workspaceId }); }
    catch { throw new RequiredConnectionsError(requirement.provider, `Open Connections and retry checking ${label} before making it live.`); }
    if (!eligibility.eligible) throw new RequiredConnectionsError(requirement.provider, eligibility.message);
    if (listing.sourceErrors.includes(requirement.provider)) throw new RequiredConnectionsError(requirement.provider, `Open Connections and retry checking ${label} before making it live.`);
    const candidates = listing.connections.filter(row => row.provider === requirement.provider && row.workspaceId === input.workspaceId);
    const selected = input.connectionRefs?.filter(ref => ref.startsWith(`${requirement.provider}:`)) ?? [];
    const usable = (selected.length ? candidates.filter(row => selected.includes(row.ref)) : candidates).some(row => {
      if (row.state !== "connected" || row.unavailableReason || row.accountHolder.kind === "unknown" || row.accessThrough.kind === "unknown") return false;
      if (!definition.accountHolders.includes(row.accountHolder.kind)) return false;
      if (row.accountHolder.kind === "business" && row.accountHolder.workspaceId !== input.workspaceId) return false;
      // The core listing normalizes account-holder authority against the acting
      // agency and area grant. Its unavailable state/reason above is binding;
      // eligible agency logins can also use approved platform provider access.
      if (row.accessThrough.kind !== eligibility.through.kind) return false;
      return row.accessThrough.kind === "platform" || (row.accessThrough.kind === "agency" && eligibility.through.kind === "agency" && row.accessThrough.workspaceId === eligibility.through.workspaceId);
    });
    if (!usable) throw new RequiredConnectionsError(requirement.provider, `Open Connections and connect or reconnect ${label} before making it live.`);
  }
}
