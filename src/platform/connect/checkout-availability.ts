import { connectEnabled, connectedAccountSchema, connectDb, moneyRpc, type RpcDb } from "./index";

export type CheckoutAvailability = { status: "ready" | "coming_soon" | "setup_required" | "unavailable" };

/** Read only after authorizing the agency billing or exact invoice scope.
 * This is presentation readiness; fulfillment rechecks the current merchant.
 */
export async function readCheckoutAvailability(workspaceId: string, db?: RpcDb | null): Promise<CheckoutAvailability> {
  if (!connectEnabled()) return { status: "coming_soon" };
  if (!process.env.STRIPE_SECRET_KEY) return { status: "unavailable" };
  try {
    const row = await moneyRpc("read_connected_account", { p_workspace_id: workspaceId }, db === undefined ? connectDb() : db);
    if (row === null) return { status: "setup_required" };
    const account = connectedAccountSchema.parse(row);
    if (account.workspace_id !== workspaceId) return { status: "unavailable" };
    return { status: account.state === "ready" && account.stripe_account_id && account.configurations.includes("merchant") ? "ready" : "setup_required" };
  } catch {
    return { status: "unavailable" };
  }
}
