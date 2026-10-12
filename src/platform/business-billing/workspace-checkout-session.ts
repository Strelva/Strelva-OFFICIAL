import type Stripe from "stripe";
import { z } from "zod";
import { getStripe } from "@/platform/infra/stripe";
import { getSupabase } from "@/platform/infra/db/client";
import { listWorkspaces } from "@/platform/workspaces";
import { WorkspaceAccessError, WorkspaceConflictError, WorkspaceStoreError, type WorkspaceActor } from "@/platform/workspaces/types";
import { workspaceCheckoutMetadata, type SelfServeBillingConfig } from "./workspace-checkout";

const attemptSchema = z.object({
  id: z.string().uuid(), workspaceId: z.string().uuid(), payerUserId: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }), state: z.enum(["pending", "open", "complete", "closed"]),
  sessionId: z.string().regex(/^cs_[A-Za-z0-9_]+$/).nullable(),
  checkout: z.object({ priceId: z.string().regex(/^price_[A-Za-z0-9]+$/), payerEmail: z.string().email(), allowanceConfigKey: z.string(), returnUrl: z.string().url(), customerId: z.string().regex(/^cus_[A-Za-z0-9]+$/).nullable() }),
});
const targetSchema = z.object({ attempt: attemptSchema, customerIds: z.array(z.string().regex(/^cus_[A-Za-z0-9]+$/)), subscriptionIds: z.array(z.string().regex(/^sub_[A-Za-z0-9]+$/)) });
export type WorkspaceCheckoutTarget = z.infer<typeof targetSchema>;
type RpcDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
export type WorkspaceCheckoutStore = {
  prepare(actor: WorkspaceActor, workspaceId: string, checkout: WorkspaceCheckoutTarget["attempt"]["checkout"], attemptId?: string): Promise<WorkspaceCheckoutTarget>;
  observe(attemptId: string, session: Stripe.Checkout.Session, close: boolean): Promise<void>;
};
const uncertain = () => new WorkspaceStoreError("Checkout status is uncertain. Try again to check the same checkout before starting another.");
const existing = () => new WorkspaceConflictError("A plan or checkout is already recorded. Check billing before starting another subscription.");

/** Both commands are service-only. Preparation rechecks ordinary owner and payer authority in Postgres. */
export function workspaceCheckoutStore(client: RpcDb | null = getSupabase() as unknown as RpcDb | null): WorkspaceCheckoutStore {
  const invoke = async (name: string, args: Record<string, unknown>) => {
    if (!client) throw uncertain();
    const result = await client.rpc(name, args);
    if (result.error) {
      if (result.error.message?.includes("workspace_checkout_denied")) throw new WorkspaceAccessError();
      if (result.error.message?.includes("workspace_checkout_conflict")) throw existing();
      throw uncertain();
    }
    return result.data;
  };
  return {
    async prepare(actor, workspaceId, checkout, attemptId) {
      const data = await invoke("prepare_workspace_subscription_checkout", { p_workspace_id: workspaceId, p_user_id: actor.userId, p_verified_email: actor.verifiedEmail, p_checkout: checkout, p_attempt_id: attemptId ?? null });
      const parsed = targetSchema.safeParse(data);
      if (!parsed.success || parsed.data.attempt.workspaceId !== workspaceId || parsed.data.attempt.payerUserId !== actor.userId || (attemptId && parsed.data.attempt.id !== attemptId)) throw uncertain();
      return parsed.data;
    },
    async observe(attemptId, session, close) {
      const data = await invoke("observe_workspace_subscription_checkout", {
        p_attempt_id: attemptId, p_session_id: session.id, p_status: session.status,
        p_customer_id: typeof session.customer === "string" ? session.customer : session.customer?.id ?? null,
        p_subscription_id: typeof session.subscription === "string" ? session.subscription : session.subscription?.id ?? null,
        p_close: close,
      });
      if (!data || typeof data !== "object" || (data as { recorded?: unknown }).recorded !== true || (data as { attemptId?: unknown }).attemptId !== attemptId) throw uncertain();
    },
  };
}

type CheckoutStripe = Pick<Stripe, "checkout" | "subscriptions" | "customers">;
type Dependencies = { store?: WorkspaceCheckoutStore; stripe?: CheckoutStripe; workspaces?: typeof listWorkspaces; now?: () => number };
const terminal = (status: string) => status === "canceled" || status === "incomplete_expired";

/** Durable attempt identity outlives both hourly retries and delayed webhooks. Never rotate an uncertain key. */
export async function openWorkspaceSubscriptionCheckout(actor: WorkspaceActor, workspaceId: string, config: SelfServeBillingConfig, returnUrl: string, dependencies: Dependencies = {}): Promise<string> {
  z.string().uuid().parse(workspaceId);
  if (!config.enabled || !config.priceId) throw uncertain();
  const owner = (await (dependencies.workspaces ?? listWorkspaces)(actor)).find(item => item.id === workspaceId);
  if (owner?.kind !== "customer" || owner.access !== "member" || owner.role !== "owner") throw new WorkspaceAccessError();
  const store = dependencies.store ?? workspaceCheckoutStore();
  const stripe = dependencies.stripe ?? getStripe();
  const requested = { priceId: config.priceId, payerEmail: actor.verifiedEmail, allowanceConfigKey: config.allowanceConfigKey, returnUrl, customerId: null };
  const target = await store.prepare(actor, workspaceId, requested);
  const attempt = target.attempt;
  // Recorded cancellation is insufficient: check current provider state too.
  try {
    for (const id of target.subscriptionIds) {
      const subscription = await stripe.subscriptions.retrieve(id);
      if (subscription.id !== id || !terminal(subscription.status)) throw existing();
      const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
      if (!target.customerIds.includes(customerId) || (subscription.metadata.workspaceId && subscription.metadata.workspaceId !== workspaceId)) throw uncertain();
    }
    for (const customerId of target.customerIds) {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted || customer.id !== customerId || (customer.metadata.workspaceId && customer.metadata.workspaceId !== workspaceId)) throw uncertain();
      const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
      if (subscriptions.has_more || subscriptions.data.some(item => !terminal(item.status))) throw existing();
      if (subscriptions.data.some(item => (typeof item.customer === "string" ? item.customer : item.customer.id) !== customerId || (item.metadata.workspaceId && item.metadata.workspaceId !== workspaceId))) throw uncertain();
    }
  } catch (error) {
    if (error instanceof WorkspaceConflictError || error instanceof WorkspaceStoreError) throw error;
    throw uncertain();
  }
  // Recheck authority and durable billing after the provider reads, immediately before creating or returning a URL.
  await store.prepare(actor, workspaceId, requested, attempt.id);
  const metadata = { ...workspaceCheckoutMetadata({ workspaceId, payerUserId: attempt.payerUserId, allowanceConfigKey: attempt.checkout.allowanceConfigKey }), checkoutAttemptId: attempt.id };
  let session: Stripe.Checkout.Session;
  try {
    if (attempt.sessionId) {
      session = await stripe.checkout.sessions.retrieve(attempt.sessionId);
    } else {
      // Stripe may prune keys after 24 hours. Leave an unbound attempt stopped before that boundary.
      const age = (dependencies.now ?? Date.now)() - Date.parse(attempt.createdAt);
      if (age < 0 || age >= 23 * 60 * 60 * 1000) throw uncertain();
      session = await stripe.checkout.sessions.create({
        mode: "subscription", line_items: [{ price: attempt.checkout.priceId, quantity: 1 }],
        ...(attempt.checkout.customerId ? { customer: attempt.checkout.customerId } : { customer_email: attempt.checkout.payerEmail }), client_reference_id: workspaceId,
        metadata, subscription_data: { metadata },
        success_url: `${attempt.checkout.returnUrl}&checkout=success`, cancel_url: `${attempt.checkout.returnUrl}&checkout=cancelled`,
      }, { idempotencyKey: `workspace-checkout:${attempt.id}` });
    }
  } catch { throw uncertain(); }
  if (!/^cs_[A-Za-z0-9_]+$/.test(session.id) || (attempt.sessionId && session.id !== attempt.sessionId) || session.mode !== "subscription" || session.client_reference_id !== workspaceId || Object.entries(metadata).some(([key, value]) => session.metadata?.[key] !== value) || !["open", "complete", "expired"].includes(session.status ?? "")) throw uncertain();
  const sessionCustomerId = typeof session.customer === "string" ? session.customer : session.customer?.id ?? null;
  if (attempt.checkout.customerId && sessionCustomerId !== attempt.checkout.customerId) throw uncertain();
  // Persist accepted provider evidence before returning, including a completed session with no webhook yet.
  await store.observe(attempt.id, session, session.status === "expired");
  if (session.status !== "open") throw existing();
  if (!session.url || !/^https:\/\/checkout\.stripe\.com\//.test(session.url)) throw uncertain();
  await store.prepare(actor, workspaceId, requested, attempt.id);
  return session.url;
}
