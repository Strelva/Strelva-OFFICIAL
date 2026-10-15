import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { CONNECTION_PROVIDERS, type ConnectionProvider, type ProviderEligibility, type ProviderEligibilityMap } from "./contracts";
import { providerDefinition } from "./providers";
import type { ConnectionHolders } from "./holders";
import { connectionActorArgs, connectionRpc, type ConnectionsDb } from "./db";
import { readProviderAccess } from "./access";
import { agencyHoldsArea } from "./area";
import { providerEligibility } from "./eligibility";
import { readConnectionHolders } from "./holders";
import { composeWorkspaceConnections } from "./read-model";
import { listConnectionSources } from "./sources";

async function connectionScope(actor: WorkspaceActor, workspaceId: string, db?: ConnectionsDb) {
  return connectionRpc("read_connection_actor_scope", { ...connectionActorArgs(actor), p_workspace_id: z.string().uuid().parse(workspaceId) },
    z.object({ actingAgencyWorkspaceId: z.string().uuid().nullable(), actingAgencyWorkspaceIds: z.array(z.string().uuid()).optional() }).strict(), db);
}
export async function connectionEligibilityFor(actor: WorkspaceActor, input: { provider: ConnectionProvider; businessWorkspaceId: string }, db?: ConnectionsDb) {
  const scope = await connectionScope(actor, input.businessWorkspaceId, db);
  const access = readProviderAccess(input.provider);
  return providerEligibility({ access, businessWorkspaceId: input.businessWorkspaceId,
    actingAgencyWorkspaceId: actingAgencyFor(scope, access.through.kind === "agency" ? access.through.workspaceId : null), agencyHoldsArea: (a, b, area) => agencyHoldsArea(a, b, area, db) });
}
export async function listWorkspaceConnections(actor: WorkspaceActor, workspaceId: string) {
  const scope = await connectionScope(actor, workspaceId);
  const eligibility: ProviderEligibilityMap = Object.fromEntries(await Promise.all(CONNECTION_PROVIDERS.map(async provider => {
    const access = readProviderAccess(provider);
    return [provider, await providerEligibility({ access, businessWorkspaceId: workspaceId,
      actingAgencyWorkspaceId: actingAgencyFor(scope, access.through.kind === "agency" ? access.through.workspaceId : null), agencyHoldsArea })];
  })));
  const holders = await readConnectionHolders(workspaceId);
  const result = await composeWorkspaceConnections({ workspaceId, holders, sources: listConnectionSources(), accessFor: readProviderAccess,
    eligibilityFor: async (provider, holders) => {
      const access = readProviderAccess(provider);
      const desiredAgency = access.through.kind === "agency" ? access.through.workspaceId : holders.accountHolder.kind === "agency" ? holders.accountHolder.workspaceId : null;
      const actingAgency = actingAgencyFor(scope, desiredAgency);
      const eligibility = await providerEligibility({ access, businessWorkspaceId: workspaceId,
        actingAgencyWorkspaceId: actingAgency, agencyHoldsArea });
      if (!eligibility.eligible) return eligibility;
      return (await accountHolderEligibility(holders, provider, workspaceId, actingAgency)) ?? eligibility;
    },
  });
  return { ...result, providerEligibility: eligibility };
}

async function accountHolderEligibility(holders: ConnectionHolders, provider: ConnectionProvider, workspaceId: string, actingAgency: string | null): Promise<ProviderEligibility | null> {
  const holder = holders.accountHolder;
  if (holder.kind === "business" && holder.workspaceId !== workspaceId) return { eligible: false, reason: "not_configured", message: "Reconnect this business's account." };
  if (holder.kind !== "agency" || holder.workspaceId === workspaceId) return null;
  if (holder.workspaceId !== actingAgency) return { eligible: false, reason: "not_your_agency", message: "Your agency needs to act with its own account." };
  const area = providerDefinition(provider).area;
  if (area && !(await agencyHoldsArea(holder.workspaceId, workspaceId, area))) return { eligible: false, reason: "area_not_granted", message: `This business hasn't given your agency its ${area} area.` };
  return null;
}

/** Select the provider/account's agency only from verified current seats, never UUID order. */
function actingAgencyFor(scope: { actingAgencyWorkspaceId: string | null; actingAgencyWorkspaceIds?: string[] }, desired: string | null): string | null {
  const agencies = scope.actingAgencyWorkspaceIds ?? (scope.actingAgencyWorkspaceId ? [scope.actingAgencyWorkspaceId] : []);
  return desired ? agencies.includes(desired) ? desired : null : agencies.length === 1 ? agencies[0] ?? null : null;
}
