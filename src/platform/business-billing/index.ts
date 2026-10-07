/**
 * The business's billing state (money-and-data spec, part a).
 *
 * One state per business workspace, in Postgres on the `accounts` billing
 * home (20261007180000_business_billing.sql), derived at conversion from the
 * tenant's billing fields. This module is the TypeScript side:
 *
 *  - deriveBusinessBillingState: the same mapping the SQL trigger applies,
 *    for previews and tests.
 *  - workspaceIdForTenant: the workspaceId a new checkout adds to Stripe
 *    metadata (flagged; tenantId is always kept).
 *  - mirrorStripeEventToBusinessBilling: the webhook's payment-status mirror.
 *    Flagged and best-effort: it never changes how the tenant is processed.
 *
 * STRELVA_BUSINESS_BILLING=1 turns the checkout metadata and webhook mirror
 * on. Off by default. Nothing here changes a price, amount, plan or card.
 */
import { z } from "zod";
import type { WorkspaceActor } from "@/platform/workspaces/types";
import { WorkspaceAccessError, WorkspaceStoreError } from "@/platform/workspaces/types";
import { getSupabase } from "@/platform/infra/db/client";
import { resolveBillingType, type BillingFields } from "@/lib/billing-type";

export const BUSINESS_BILLING_STATES = ["subscription", "custom", "comped", "grandfathered", "none"] as const;
export type BusinessBillingState = (typeof BUSINESS_BILLING_STATES)[number];

export function businessBillingEnabled(): boolean {
  return process.env.STRELVA_BUSINESS_BILLING === "1";
}

export interface BillingStateSource {
  field: "billingType" | "legacy" | "protected_tenant" | "grandfather_env" | "default";
  value: string;
}

/**
 * Tenant billing fields -> business billing state. `grandfathered` is true
 * when the tenant is in PROTECTED_TENANTS or STRIPE_BILLING_GRANDFATHER_TENANTS
 * (the conversion script computes it). Mirrors business_billing_state_from().
 */
export function deriveBusinessBillingState(
  tenant: BillingFields,
  grandfathered: { protectedTenant?: boolean; grandfatherEnv?: boolean } = {},
): { state: BusinessBillingState; sources: BillingStateSource[] } {
  const type = resolveBillingType(tenant);
  const sources: BillingStateSource[] = [
    { field: tenant.billingType ? "billingType" : type === "none" ? "default" : "legacy", value: type },
  ];
  if (grandfathered.protectedTenant) sources.push({ field: "protected_tenant", value: "true" });
  if (grandfathered.grandfatherEnv) sources.push({ field: "grandfather_env", value: "true" });
  if (grandfathered.protectedTenant || grandfathered.grandfatherEnv) return { state: "grandfathered", sources };
  const state: BusinessBillingState = type === "tier" ? "subscription" : type === "custom" ? "custom" : type === "case_study" ? "comped" : "none";
  return { state, sources };
}

type RpcDb = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message?: string } | null }> };
function db(): RpcDb | null {
  return getSupabase() as unknown as RpcDb | null;
}

/** The business workspace a tenant was converted into, or null. */
export async function workspaceIdForTenant(tenantId: string, client: RpcDb | null = db()): Promise<string | null> {
  if (!client) return null;
  const { data, error } = await client.rpc("resolve_billing_workspace", { p_workspace_id: null, p_tenant_id: tenantId });
  if (error || !data || typeof data !== "object") return null;
  const id = (data as { workspaceId?: unknown }).workspaceId;
  return typeof id === "string" ? id : null;
}

/** Checkout metadata additions: workspaceId when flagged and converted. Never throws. */
export async function businessBillingCheckoutMetadata(tenantId: string, client?: RpcDb | null): Promise<Record<string, string>> {
  if (!businessBillingEnabled()) return {};
  try {
    const workspaceId = await workspaceIdForTenant(tenantId, client === undefined ? db() : client);
    return workspaceId ? { workspaceId } : {};
  } catch {
    return {};
  }
}

export type BusinessBillingMirrorResult =
  | { status: "skipped"; reason: "disabled" | "unconfigured" | "unresolved" }
  | { status: "mirrored"; workspaceId: string; via: string; paymentStatus: string }
  | { status: "failed"; reason: string };

/**
 * Mirror one Stripe subscription status onto the business's billing home.
 * Workspace resolves by metadata.workspaceId first, then through the tenant
 * link. Payment status only. Never throws.
 */
export async function mirrorStripeEventToBusinessBilling(
  input: { workspaceId?: string | null; tenantId: string | null; status: string; stripeSubscriptionId?: string | null; currentPeriodEnd?: string | null },
  client: RpcDb | null = db(),
): Promise<BusinessBillingMirrorResult> {
  if (!businessBillingEnabled()) return { status: "skipped", reason: "disabled" };
  if (!client) return { status: "skipped", reason: "unconfigured" };
  try {
    const resolved = await client.rpc("resolve_billing_workspace", { p_workspace_id: input.workspaceId ?? null, p_tenant_id: input.tenantId });
    if (resolved.error) return { status: "failed", reason: resolved.error.message ?? "resolve_failed" };
    const target = resolved.data as { workspaceId?: string; via?: string } | null;
    if (!target?.workspaceId) return { status: "skipped", reason: "unresolved" };
    const subscriptionId = input.stripeSubscriptionId && /^sub_[A-Za-z0-9]+$/.test(input.stripeSubscriptionId) ? input.stripeSubscriptionId : null;
    const written = await client.rpc("record_business_billing_payment", {
      p_workspace_id: target.workspaceId, p_status: input.status, p_stripe_subscription_id: subscriptionId,
      p_current_period_end: input.currentPeriodEnd ?? null,
    });
    if (written.error) return { status: "failed", reason: written.error.message ?? "record_failed" };
    return { status: "mirrored", workspaceId: target.workspaceId, via: target.via ?? "unknown", paymentStatus: String((written.data as { paymentStatus?: unknown } | null)?.paymentStatus ?? input.status) };
  } catch (error) {
    return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Pulls the workspace id, subscription id and period end a Stripe object carries. */
export function stripeBillingContext(object: unknown): { workspaceId: string | null; stripeSubscriptionId: string | null; currentPeriodEnd: string | null } {
  const o = (object ?? {}) as {
    object?: string; id?: string; metadata?: Record<string, string>; subscription?: unknown; current_period_end?: number;
    items?: { data?: Array<{ current_period_end?: number }> };
    parent?: { subscription_details?: { metadata?: Record<string, string>; subscription?: unknown } };
    subscription_details?: { metadata?: Record<string, string> };
  };
  const workspaceId = o.metadata?.workspaceId ?? o.parent?.subscription_details?.metadata?.workspaceId ?? o.subscription_details?.metadata?.workspaceId ?? null;
  const sub = o.object === "subscription" ? o.id : (o.parent?.subscription_details?.subscription ?? o.subscription);
  const subId = typeof sub === "string" ? sub : (sub as { id?: string } | undefined)?.id ?? null;
  const end = o.current_period_end ?? o.items?.data?.[0]?.current_period_end;
  return { workspaceId: workspaceId ?? null, stripeSubscriptionId: subId ?? null, currentPeriodEnd: typeof end === "number" ? new Date(end * 1000).toISOString() : null };
}


export interface BusinessPortfolioBilling {
  workspaceId: string;
  monthlyCents: number;
  tenantIds: string[];
}

/** Internal operator/cron projection; one amount per business, not per site. */
export async function readBusinessPortfolioMrr(tenantIds: string[], client: RpcDb | null = db()): Promise<BusinessPortfolioBilling[] | null> {
  if (!businessBillingEnabled() || !client) return null;
  try {
    const result = await client.rpc("read_business_portfolio_billing", { p_tenant_ids: tenantIds });
    if (result.error || !Array.isArray(result.data)) return null;
    const rows: BusinessPortfolioBilling[] = [];
    for (const raw of result.data) {
      if (!raw || typeof raw !== "object") return null;
      const row = raw as BusinessPortfolioBilling;
      if (typeof row.workspaceId !== "string" || !Number.isSafeInteger(row.monthlyCents) || row.monthlyCents < 0
        || !Array.isArray(row.tenantIds) || !row.tenantIds.every(id => typeof id === "string")) return null;
      rows.push(row);
    }
    return rows;
  } catch { return null; }
}


export const businessBillingSchema = z.object({
  workspaceId: z.string().uuid(), accountId: z.string().uuid(), state: z.enum(BUSINESS_BILLING_STATES),
  openItem: z.boolean(), paymentStatus: z.string(), monthlyCents: z.number().int().nonnegative(),
  planKey: z.string().nullable(), grandfatheredTerms: z.string().nullable(), paidThrough: z.string().nullable(),
  payer: z.object({ email: z.string().email(), name: z.string().nullable().optional() }).passthrough().nullable(),
  sites: z.array(z.object({ tenantId: z.string(), siteName: z.string(), amountCents: z.number().int().nonnegative() })),
  sources: z.unknown(), paymentUpdatedAt: z.string().nullable(),
}).passthrough();
export type BusinessBilling = z.infer<typeof businessBillingSchema>;

/** Owner/operator read. A member cannot read the billing home. Sends nothing. */
export async function readBusinessBilling(actor: WorkspaceActor, workspaceId: string, client: RpcDb | null = db()): Promise<BusinessBilling | null> {
  if (!businessBillingEnabled()) return null;
  if (!client) throw new WorkspaceStoreError("Business billing is unavailable.");
  const result = await client.rpc("read_business_billing", {
    p_workspace_id: z.string().uuid().parse(workspaceId), p_user_id: actor.userId, p_verified_email: actor.verifiedEmail,
  });
  if (result.error) {
    if (result.error.message?.includes("business_billing_denied")) throw new WorkspaceAccessError();
    throw new WorkspaceStoreError("Business billing could not be loaded.");
  }
  if (result.data === null) return null;
  const parsed = businessBillingSchema.safeParse(result.data);
  if (!parsed.success) throw new WorkspaceStoreError("Business billing returned an invalid record.");
  return parsed.data;
}
