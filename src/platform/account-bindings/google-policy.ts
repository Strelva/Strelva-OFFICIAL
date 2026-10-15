import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceConflictError } from "@/platform/workspaces/types";
import { readProviderAccess } from "@/platform/connections/access";
import { connectionEligibilityFor } from "@/platform/connections/server";
import { providerEligibility } from "@/platform/connections/eligibility";

/** Agency access is usable only while a named agency actor is acting. A cron,
 * owner approval or service prefix must never manufacture an agency identity. */
export async function googleConnectionEligibility(actor: WorkspaceActor | null, businessWorkspaceId: string) {
  const access = readProviderAccess("google_business_profile");
  return actor
    ? connectionEligibilityFor(actor, { provider: "google_business_profile", businessWorkspaceId })
    : providerEligibility({ access, businessWorkspaceId, actingAgencyWorkspaceId: null, agencyHoldsArea: async () => false });
}
export async function assertGoogleConnectionEligible(actor: WorkspaceActor | null, workspaceId: string): Promise<void> {
  const result = await googleConnectionEligibility(actor, workspaceId);
  if (!result.eligible) throw new WorkspaceConflictError(result.message);
}

export async function assertTenantGoogleConnectionEligible(actor: WorkspaceActor, tenantId: string): Promise<void> {
  const { readBindingTarget } = await import("@/platform/account-bindings/store");
  const target = await readBindingTarget(tenantId);
  if (!target) throw new WorkspaceConflictError("Google Business Profile is coming soon. Connect it from the business workspace.");
  await assertGoogleConnectionEligible(actor, target.workspaceId);
  if (readProviderAccess("google_business_profile").through.kind === "agency") throw new WorkspaceConflictError("Connect your agency account from the business workspace.");
}

/** A token minted through an old project cannot silently move to another
 * project when deployment access changes. Legacy grants need a reconnect. */
export async function assertGoogleBindingEligible(actor: WorkspaceActor | null, workspaceId: string, bindingId: string): Promise<void> {
  await assertGoogleConnectionEligible(actor, workspaceId);
  const { readConnectionHolders } = await import("@/platform/connections/holders");
  const holders = (await readConnectionHolders(workspaceId)).get(`google_business_profile:${bindingId}`);
  const access = readProviderAccess("google_business_profile");
  const account = holders?.accountHolder, through = holders?.accessThrough;
  const matches = through?.kind === access.through.kind && (through?.kind !== "agency" || (access.through.kind === "agency" && through.workspaceId === access.through.workspaceId));
  if (!account || account.kind === "unknown" || !matches || through?.kind === "unknown" ||
    (account.kind === "business" && account.workspaceId !== workspaceId) ||
    (account.kind === "agency" && (through?.kind !== "agency" || account.workspaceId !== through.workspaceId))) {
    throw new WorkspaceConflictError("Reconnect to record whose account this is and whose Google access it uses.");
  }
}

/** The legacy Google token port is shared with all GBP readers/writers. It
 * cannot infer an agency from a cron or an old token row. */
export async function assertGoogleGrantEligible(grant: {workspaceId:string|null;bindingId:string|null}, actor: WorkspaceActor | null = null): Promise<void> {
  await assertGoogleConnectionEligible(actor, grant.workspaceId ?? "");
  if (!grant.workspaceId || !grant.bindingId) throw new WorkspaceConflictError("Reconnect to record whose account this is.");
  await assertGoogleBindingEligible(actor, grant.workspaceId, grant.bindingId);
}
