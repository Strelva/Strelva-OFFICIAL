import { z } from "zod";
import { randomUUID } from "node:crypto";
import { getSupabase } from "@/platform/infra/db/client";
import { readProviderAccess } from "@/platform/connections/access";
import { recordConnectionHolder } from "@/platform/connections/holders";
import type { CredentialHolder, ProviderAccess } from "@/platform/connections/contracts";
import { providerEligibility } from "@/platform/connections/eligibility";
import { WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { stripeConnectionRef } from "./connection-ref";

interface StripeHolderDependencies {
  access?: () => ProviderAccess;
  workspaceKind?: (workspaceId: string) => Promise<"agency" | "customer">;
  record?: typeof recordConnectionHolder;
}

async function readAccountWorkspaceKind(workspaceId: string): Promise<"agency" | "customer"> {
  const db = getSupabase();
  if (!db) throw new WorkspaceStoreError("Stripe account ownership could not be confirmed.");
  const result = await db.from("workspaces").select("id, kind").eq("id", workspaceId).maybeSingle();
  const parsed = z.object({ id: z.literal(workspaceId), kind: z.enum(["agency", "customer"]) }).safeParse(result.data);
  if (result.error || !parsed.success) throw new WorkspaceStoreError("Stripe account ownership could not be confirmed.");
  return parsed.data.kind;
}

/**
 * Prepare after Connect's manager check, before provider calls. Account ownership
 * comes from the stored workspace, never from a caller-supplied role. Recording
 * rechecks actor authority in the shared holder command. No legacy backfill.
 */
export async function prepareStripeConnectionHolder(actor: WorkspaceActor, workspaceId: string, deps: StripeHolderDependencies = {}) {
  z.string().uuid().parse(workspaceId);
  const access = (deps.access ?? (() => readProviderAccess("stripe")))();
  const eligibility = await providerEligibility({ access, businessWorkspaceId: workspaceId,
    actingAgencyWorkspaceId: null, agencyHoldsArea: async () => false });
  if (!eligibility.eligible) throw new WorkspaceStoreError(eligibility.message);
  const kind = await (deps.workspaceKind ?? readAccountWorkspaceKind)(workspaceId);
  const accountHolder: CredentialHolder = { kind: kind === "agency" ? "agency" : "business", workspaceId };
  return async (generation: number): Promise<void> => {
    z.number().int().nonnegative().parse(generation);
    await (deps.record ?? recordConnectionHolder)({
      ref: stripeConnectionRef(workspaceId, generation), provider: "stripe", workspaceId,
      accountHolder, accessThrough: eligibility.through, actor,
      commandId: randomUUID(),
    });
  };
}
