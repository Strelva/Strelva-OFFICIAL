import { z } from "zod";
import type { ConnectionSource, WorkspaceConnection } from "@/platform/connections/contracts";
import { providerEligibility } from "@/platform/connections/eligibility";
import { connectedAccountSchema, connectDb, connectEnabled, moneyRpc, type RpcDb } from "./index";
import { stripeConnectionRef } from "./connection-ref";
export { stripeConnectionRef } from "./connection-ref";

export interface StripeConnectionSourceDependencies {
  enabled?: () => boolean;
  db?: RpcDb | null;
}

/**
 * Agency payment links/rebilling and business checkout share connected_accounts.
 * This source reads that account once, never payment records, provider APIs or
 * onboarding. Call only inside the authorized Connections read boundary.
 */
export function createStripeConnectionSource(deps: StripeConnectionSourceDependencies = {}): ConnectionSource {
  return {
    provider: "stripe",
    async list({ workspaceId, access }) {
      z.string().uuid().parse(workspaceId);
      if (!(deps.enabled ?? connectEnabled)()) return [];
      const db = deps.db === undefined ? connectDb() : deps.db;
      const raw = await moneyRpc<unknown>("read_connected_account", { p_workspace_id: workspaceId }, db);
      if (raw === null) return [];
      const account = connectedAccountSchema.parse(raw);
      if (account.workspace_id !== workspaceId) throw new Error("Stripe account scope could not be confirmed.");
      const eligibility = await providerEligibility({ access, businessWorkspaceId: workspaceId,
        actingAgencyWorkspaceId: null, agencyHoldsArea: async () => false });
      const state: WorkspaceConnection["state"] = !eligibility.eligible ? "unavailable"
        : account.state === "disconnected" ? "disconnected"
          : account.state === "ready" && account.stripe_account_id && account.configurations.length > 0 ? "connected" : "stale";
      return [{
        ref: stripeConnectionRef(workspaceId, account.generation), provider: "stripe", workspaceId,
        accountLabel: "Stripe account", accountHolder: { kind: "unknown" }, accessThrough: { kind: "unknown" },
        state, unavailableReason: eligibility.eligible ? null : eligibility.reason,
        // updated_at is a refresh time, not proof of the original connection date.
        connectedAt: null, systemIds: [],
      }];
    },
  };
}

export const stripeConnectionSource = createStripeConnectionSource();
