import type { ConnectionArea, ProviderAccess, ProviderEligibility } from "./contracts";
import { providerDefinition } from "./providers";

export interface EligibilityInput {
  access: ProviderAccess;
  /** The business the connection would serve. */
  businessWorkspaceId: string;
  /** The agency acting for that business, or null when the business acts for itself. */
  actingAgencyWorkspaceId: string | null;
  /** Reads the business's current area grant to an agency. Fails closed on error. */
  agencyHoldsArea(agencyWorkspaceId: string, businessWorkspaceId: string, area: ConnectionArea): Promise<boolean>;
}

/**
 * May this business use this provider through this deployment's provider app?
 *
 * Platform access serves every business equally. Agency access (an agency's
 * own approved app or project) serves only businesses that agency itself
 * serves with the provider's area, and only when that agency is the one
 * acting. Strelva Agency gets no special path: it is checked like any agency.
 */
export async function providerEligibility(input: EligibilityInput): Promise<ProviderEligibility> {
  const { access } = input;
  const definition = providerDefinition(access.provider);
  if (access.approval === "pending") return unavailable("approval_pending", `${definition.label} is waiting on the provider's approval.`);
  if (access.approval === "none" || access.through.kind === "unknown" || access.through.kind === "business") {
    return unavailable("not_configured", `${definition.label} is coming soon.`);
  }
  if (access.through.kind === "platform") {
    if (!definition.accessThrough.includes("platform")) return unavailable("not_configured", `${definition.label} is coming soon.`);
    return { eligible: true, through: access.through };
  }
  if (!definition.accessThrough.includes("agency")) return unavailable("not_configured", `${definition.label} is coming soon.`);
  const holder = access.through.workspaceId;
  if (input.businessWorkspaceId === holder) return { eligible: true, through: access.through };
  if (input.actingAgencyWorkspaceId !== holder) {
    return unavailable("coming_soon", `${definition.label} for businesses on Strelva is coming soon.`);
  }
  if (definition.area) {
    let granted = false;
    try { granted = await input.agencyHoldsArea(holder, input.businessWorkspaceId, definition.area); } catch { granted = false; }
    if (!granted) return unavailable("area_not_granted", `This business hasn't given your agency its ${definition.area} area.`);
  }
  return { eligible: true, through: access.through };
}

function unavailable(reason: Exclude<ProviderEligibility, { eligible: true }>["reason"], message: string): ProviderEligibility {
  return { eligible: false, reason, message };
}
