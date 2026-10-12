/** Database responses for the real tenant resolver and AI budget guard.
 * The fictional business has no cap; this is not a qualified capped provider.
 */
export const modelAdmissionWorkspaceId = "a0000000-0000-4000-8000-000000000001";
export const modelAdmissionBudget = {
  spentUsd: "0", reservedUsd: "0", since: "2026-10-01T00:00:00Z",
  resetsAt: "2026-11-01T00:00:00Z", capCents: null, subscribed: true,
  unknownCostCalls: 0,
};

export async function modelAdmissionRpc(name: string, args: Record<string, unknown>) {
  if (name === "resolve_billing_workspace") {
    const knownTenant = ["gldf", "t1", "good1", "good2", "hasEmail"].includes(String(args.p_tenant_id));
    return { data: knownTenant && args.p_workspace_id === null ? { workspaceId: modelAdmissionWorkspaceId } : null, error: null };
  }
  if (name === "business_ai_budget") {
    return { data: args.p_workspace_id === modelAdmissionWorkspaceId ? modelAdmissionBudget : null, error: null };
  }
  if (name === "record_model_calls") return { data: null, error: null };
  throw new Error(`Unexpected model admission fixture RPC: ${name}`);
}
