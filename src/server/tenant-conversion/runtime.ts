import "server-only";
import { getAuthenticatedOperatorContext } from "../../platform/infra/auth";
import { getSupabase } from "../../platform/infra/db/client";
import { convertTenantToBusiness, previewTenantUnlink, readTenantWorkspaceLink, unlinkTenantFromBusiness } from "../../platform/business-record";
import { conversionReleaseEnabled, conversionProductionApproved, type ConversionAdmission } from "./review";
import type { ConversionDeps, RollbackDeps } from "./engine";

export const conversionAdmission: ConversionAdmission = {
  identity: async () => {
    const operator = await getAuthenticatedOperatorContext();
    return operator ? { userId: operator.actor.userId, email: operator.email } : null;
  },
  enabled: conversionReleaseEnabled,
  databaseUrl: () => process.env.SUPABASE_URL,
  productionApproved: conversionProductionApproved,
};
export function conversionDependencies(read: ConversionDeps["read"]): ConversionDeps {
  if (!getSupabase()) throw new Error("The conversion database is unavailable. No plan can be reviewed.");
  return { read, readLink: readTenantWorkspaceLink, convert: convertTenantToBusiness, log: () => undefined };
}
export function rollbackDependencies(): RollbackDeps {
  if (!getSupabase()) throw new Error("The conversion database is unavailable. Undo eligibility cannot be read.");
  return { preview: previewTenantUnlink, unlink: unlinkTenantFromBusiness, log: () => undefined };
}

/** Support reads never confer agency membership or delivery authority. */
export async function readConversionAgency(agencyWorkspaceId: string): Promise<{ name: string; id: string }> {
  const db = getSupabase();
  if (!db) throw new Error("The agency source is unavailable.");
  const { data, error } = await db.from("workspaces").select("id,name,kind").eq("id", agencyWorkspaceId).maybeSingle();
  if (error || !data || data.kind !== "agency") throw new Error("Choose an existing ordinary agency workspace.");
  return { id: data.id, name: data.name };
}
