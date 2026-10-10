/**
 * Core of scripts/stripe-workspace-metadata.ts, free of I/O so it is tested
 * without Stripe. Builds the exact list of Stripe subscriptions and customers
 * that would gain `metadata.workspaceId`, and applies it only when allowed.
 *
 * Additive only: Stripe merges metadata keys, so `tenantId` and every other
 * key stay. Amount, price, cycle and card are never touched.
 */
export interface MetadataSourceTenant {
  tenantId: string;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  /** The multi-site account's bundled subscription, when the site has one. */
  accountSubscriptionId?: string | null;
  accountCustomerId?: string | null;
}

export interface PlannedMetadataChange {
  kind: "subscription" | "customer";
  stripeId: string;
  workspaceId: string;
  tenantIds: string[];
}

export interface MetadataPlan {
  changes: PlannedMetadataChange[];
  notConverted: string[];
  noStripeObject: string[];
  /** One Stripe object reachable from two different businesses: never written. */
  conflicts: { kind: "subscription" | "customer"; stripeId: string; workspaceIds: string[] }[];
}

const SUB = /^sub_[A-Za-z0-9]+$/;
const CUS = /^cus_[A-Za-z0-9]+$/;

export function planStripeWorkspaceMetadata(tenants: MetadataSourceTenant[], workspaceOf: Map<string, string>): MetadataPlan {
  const plan: MetadataPlan = { changes: [], notConverted: [], noStripeObject: [], conflicts: [] };
  const byObject = new Map<string, { kind: "subscription" | "customer"; stripeId: string; workspaces: Set<string>; tenantIds: Set<string> }>();
  for (const tenant of tenants) {
    const workspaceId = workspaceOf.get(tenant.tenantId);
    if (!workspaceId) { plan.notConverted.push(tenant.tenantId); continue; }
    const objects: [("subscription" | "customer"), string | null | undefined][] = [
      ["subscription", tenant.stripeSubscriptionId], ["subscription", tenant.accountSubscriptionId],
      ["customer", tenant.stripeCustomerId], ["customer", tenant.accountCustomerId],
    ];
    let any = false;
    for (const [kind, id] of objects) {
      if (!id || !(kind === "subscription" ? SUB : CUS).test(id)) continue;
      any = true;
      const key = `${kind}:${id}`;
      const entry = byObject.get(key) ?? { kind, stripeId: id, workspaces: new Set<string>(), tenantIds: new Set<string>() };
      entry.workspaces.add(workspaceId);
      entry.tenantIds.add(tenant.tenantId);
      byObject.set(key, entry);
    }
    if (!any) plan.noStripeObject.push(tenant.tenantId);
  }
  for (const entry of byObject.values()) {
    if (entry.workspaces.size > 1) {
      plan.conflicts.push({ kind: entry.kind, stripeId: entry.stripeId, workspaceIds: [...entry.workspaces].sort() });
      continue;
    }
    plan.changes.push({ kind: entry.kind, stripeId: entry.stripeId, workspaceId: [...entry.workspaces][0]!, tenantIds: [...entry.tenantIds].sort() });
  }
  plan.changes.sort((a, b) => `${a.kind}${a.stripeId}`.localeCompare(`${b.kind}${b.stripeId}`));
  return plan;
}

export interface MetadataApplyOptions {
  apply: boolean;
  jacobsYes: boolean;
  /** The Stripe secret key's mode, from its prefix; never the key itself. */
  stripeMode: "test" | "live" | "unconfigured";
  live: boolean;
}

export function parseStripeMetadataArgs(argv: string[]): Omit<MetadataApplyOptions, "stripeMode"> & { json: boolean } {
  const unknown = argv.filter((arg) => arg.startsWith("--") && !/^--(?:apply|json|live|i-have-jacobs-yes)$/.test(arg));
  if (unknown.length) throw new Error(`Unknown option: ${unknown.join(", ")}`);
  return { apply: argv.includes("--apply"), jacobsYes: argv.includes("--i-have-jacobs-yes"), live: argv.includes("--live"), json: argv.includes("--json") };
}

export function stripeModeOf(secretKey: string | undefined): MetadataApplyOptions["stripeMode"] {
  if (!secretKey) return "unconfigured";
  return secretKey.startsWith("sk_live_") || secretKey.startsWith("rk_live_") ? "live" : "test";
}

/** Throws unless applying is allowed. A dry run is always allowed. */
export function assertMetadataApplyAllowed(options: MetadataApplyOptions): void {
  if (!options.apply) return;
  if (!options.jacobsYes) throw new Error("Refusing --apply: changing Stripe metadata needs Jacob's yes (--i-have-jacobs-yes).");
  if (options.stripeMode === "unconfigured") throw new Error("Refusing --apply: STRIPE_SECRET_KEY is not set.");
  if (options.stripeMode === "live" && !options.live) {
    throw new Error("Refusing --apply on a live Stripe key without --live. Run it in Stripe test mode against a copy first.");
  }
}

export interface MetadataWriter {
  updateSubscription(id: string, metadata: Record<string, string>): Promise<void>;
  updateCustomer(id: string, metadata: Record<string, string>): Promise<void>;
}

export interface MetadataReceiptLine extends PlannedMetadataChange {
  result: "would_add" | "added" | "failed";
  error?: string;
}

/** Dry run: every change as would_add, no calls. Apply: one call per object,
 *  each recorded as added or failed; a failure never stops the rest. */
export async function applyStripeWorkspaceMetadata(plan: MetadataPlan, options: MetadataApplyOptions, writer: MetadataWriter | null): Promise<MetadataReceiptLine[]> {
  assertMetadataApplyAllowed(options);
  if (!options.apply) return plan.changes.map((change) => ({ ...change, result: "would_add" as const }));
  if (!writer) throw new Error("Refusing --apply: no Stripe client.");
  const receipt: MetadataReceiptLine[] = [];
  for (const change of plan.changes) {
    try {
      const metadata = { workspaceId: change.workspaceId };
      if (change.kind === "subscription") await writer.updateSubscription(change.stripeId, metadata);
      else await writer.updateCustomer(change.stripeId, metadata);
      receipt.push({ ...change, result: "added" });
    } catch (error) {
      receipt.push({ ...change, result: "failed", error: error instanceof Error ? error.message.slice(0, 200) : "error" });
    }
  }
  return receipt;
}
