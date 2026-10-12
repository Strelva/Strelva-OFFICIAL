import type Stripe from "stripe";
import { z } from "zod";
import { getStripe } from "@/lib/billing";
import { getSupabase, type Db } from "@/platform/infra/db/client";
import { listWorkspaces } from "@/platform/workspaces";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";

export type WorkspacePortalAction = "manage" | "cancel";
export interface WorkspacePortalTarget {
  workspaceId: string;
  customerId: string;
  subscriptions: { id: string; legacy: boolean; status: string | null }[];
}
const unavailable = () => new WorkspaceStoreError("Workspace billing is unavailable.");
const denied = () => new WorkspaceAccessError();

/** Server-only recorded bindings; no customer or subscription identifier comes from the browser. */
export async function readWorkspacePortalTarget(workspaceId: string, client: Db | null = getSupabase()): Promise<WorkspacePortalTarget> {
  if (!client) throw unavailable();
  const [account, entitlements, transition] = await Promise.all([
    client.from("accounts").select("id, stripe_customer_id, payer_kind, payer_workspace_id").eq("workspace_id", workspaceId).maybeSingle(),
    client.from("work_allowance_subscription_entitlements").select("stripe_customer_id, stripe_subscription_id, payer_kind, payer_workspace_id, status").eq("workspace_id", workspaceId),
    client.from("workspace_payer_transitions").select("successor_kind").eq("workspace_id", workspaceId).eq("status", "accepted").order("accepted_at", { ascending: false }).order("id", { ascending: false }).limit(1),
  ]);
  if (account.error || entitlements.error || transition.error) throw unavailable();
  if (transition.data?.[0]?.successor_kind === "agency" || (account.data && (account.data.payer_kind !== "business" || account.data.payer_workspace_id))) throw denied();
  const subscriptions = account.data ? await client.from("subscriptions").select("stripe_customer_id, stripe_subscription_id, status").eq("account_id", account.data.id) : { data: [], error: null };
  if (subscriptions.error) throw unavailable();
  const rows = [
    ...(subscriptions.data ?? []).filter(row => row.stripe_subscription_id).map(row => ({ customerId: row.stripe_customer_id ?? account.data?.stripe_customer_id, id: row.stripe_subscription_id!, legacy: true, status: row.status })),
    ...(entitlements.data ?? []).map(row => {
      if (row.payer_kind !== "business" || row.payer_workspace_id) throw denied();
      return { customerId: row.stripe_customer_id, id: row.stripe_subscription_id, legacy: false, status: row.status };
    }),
  ];
  const customers = new Set(rows.map(row => row.customerId));
  if (account.data?.stripe_customer_id) customers.add(account.data.stripe_customer_id);
  if (customers.size !== 1 || ![...customers].every(id => typeof id === "string" && /^cus_[A-Za-z0-9]+$/.test(id)) || !rows.every(row => /^sub_[A-Za-z0-9]+$/.test(row.id))) throw unavailable();
  const customerId = [...customers][0]!;
  if (!customerId) throw unavailable();
  // A customer portal exposes customer-wide receipts. Refuse a binding shared with another workspace.
  const [otherAccounts, otherEntitlements, otherSubscriptions] = await Promise.all([
    client.from("accounts").select("workspace_id").eq("stripe_customer_id", customerId),
    client.from("work_allowance_subscription_entitlements").select("workspace_id").eq("stripe_customer_id", customerId),
    client.from("subscriptions").select("account_id").eq("stripe_customer_id", customerId),
  ]);
  if (otherAccounts.error || otherEntitlements.error || otherSubscriptions.error) throw unavailable();
  if (otherAccounts.data?.some(row => row.workspace_id !== workspaceId) || otherEntitlements.data?.some(row => row.workspace_id !== workspaceId) || otherSubscriptions.data?.some(row => row.account_id !== account.data?.id)) throw denied();
  const unique = new Map<string, WorkspacePortalTarget["subscriptions"][number]>();
  for (const row of rows) {
    const existing = unique.get(row.id);
    unique.set(row.id, { id: row.id, legacy: Boolean(existing?.legacy || row.legacy), status: row.status });
  }
  return { workspaceId, customerId, subscriptions: [...unique.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}

type PortalStripe = Pick<Stripe, "customers" | "subscriptions" | "billingPortal">;
type Dependencies = {
  workspaces?: typeof listWorkspaces;
  target?: typeof readWorkspacePortalTarget;
  stripe?: PortalStripe;
};

/** Opens Stripe's existing portal. Cancellation is confirmed there, for the exact recorded subscription. */
export async function openWorkspaceBillingPortal(actor: WorkspaceActor, workspaceId: string, action: WorkspacePortalAction, returnUrl: string, dependencies: Dependencies = {}): Promise<string> {
  z.string().uuid().parse(workspaceId);
  const workspaces = dependencies.workspaces ?? listWorkspaces;
  const target = dependencies.target ?? readWorkspacePortalTarget;
  const assertOwner = async () => {
    const workspace = (await workspaces(actor)).find(item => item.id === workspaceId);
    if (workspace?.kind !== "customer" || workspace.access !== "member" || workspace.role !== "owner") throw denied();
  };
  await assertOwner();
  const binding = await target(workspaceId);
  const stripe = dependencies.stripe ?? getStripe();
  const [customer, subscriptions] = await Promise.all([
    stripe.customers.retrieve(binding.customerId),
    stripe.subscriptions.list({ customer: binding.customerId, status: "all", limit: 100 }),
  ]);
  if (customer.deleted || customer.id !== binding.customerId || (customer.metadata.workspaceId && customer.metadata.workspaceId !== workspaceId) || subscriptions.has_more) throw denied();
  for (const subscription of subscriptions.data) {
    const recorded = binding.subscriptions.find(item => item.id === subscription.id);
    const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
    if (!recorded || customerId !== binding.customerId || (subscription.metadata.workspaceId ? subscription.metadata.workspaceId !== workspaceId : !recorded.legacy) || (subscription.metadata.payerKind && subscription.metadata.payerKind !== "business")) throw denied();
  }
  // Every recorded binding must be observed. Missing or foreign provider state never grants a portal.
  if (!binding.subscriptions.every(item => subscriptions.data.some(subscription => subscription.id === item.id))) throw unavailable();
  const cancellable = subscriptions.data.filter(item => !["canceled", "incomplete_expired"].includes(item.status));
  if (action === "cancel" && cancellable.length !== 1) throw new WorkspaceConflictError(cancellable.length ? "More than one subscription is recorded. Open payment management to review each plan." : "No active subscription is available to cancel. Open payment management to review receipts.");
  // Recheck current ownership and payer bindings after provider reads.
  await assertOwner();
  if (JSON.stringify(await target(workspaceId)) !== JSON.stringify(binding)) throw new WorkspaceConflictError("Your billing record changed. Reload before opening billing.");
  const session = await stripe.billingPortal.sessions.create({
    customer: binding.customerId,
    return_url: returnUrl,
    ...(action === "cancel" ? { flow_data: { type: "subscription_cancel" as const, subscription_cancel: { subscription: cancellable[0]!.id }, after_completion: { type: "redirect" as const, redirect: { return_url: returnUrl } } } } : {}),
  });
  const url = new URL(session.url);
  if (url.protocol !== "https:" || url.hostname !== "billing.stripe.com" || url.username || url.password) throw unavailable();
  return session.url;
}
