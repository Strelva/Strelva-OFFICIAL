#!/usr/bin/env npx tsx
/**
 * Add `metadata.workspaceId` to the Stripe subscriptions and customers of
 * tenants that were converted into businesses (money-and-data spec, step 6.4).
 *
 *   npx tsx scripts/stripe-workspace-metadata.ts                 # dry run (default): lists every change
 *   npx tsx scripts/stripe-workspace-metadata.ts --json
 *   npx tsx scripts/stripe-workspace-metadata.ts --apply --i-have-jacobs-yes           # test-mode key only
 *   npx tsx scripts/stripe-workspace-metadata.ts --apply --i-have-jacobs-yes --live    # Jacob's call
 *
 * The dry run makes NO Stripe call. It reads tenants (Postgres), the business
 * each converted tenant belongs to (`resolve_billing_workspace`) and the
 * multi-site account grouping (Redis), and prints exactly which object would
 * gain which workspaceId. Additive: tenantId and every other key stay; amount,
 * price, cycle and card are never touched. An object reachable from two
 * businesses is listed as a conflict and never written.
 */
import "../src/register-workspace-ports"; // workspace ports src/lib declares (Strelva Reborn section 7)
import { getSupabase } from "../src/platform/infra/db/client";
import { getAccountForTenant } from "../src/lib/accounts";
import { getStripe } from "../src/lib/billing";
import { workspaceIdForTenant } from "../src/platform/business-billing";
import {
  applyStripeWorkspaceMetadata,
  parseStripeMetadataArgs,
  planStripeWorkspaceMetadata,
  stripeModeOf,
  type MetadataSourceTenant,
} from "./stripe-workspace-metadata-plan";

async function main() {
  const options = parseStripeMetadataArgs(process.argv.slice(2));
  const db = getSupabase();
  if (!db) throw new Error("Supabase is not configured.");
  const { data, error } = await db.from("tenants").select("id, stripe_subscription_id, stripe_customer_id").order("id");
  if (error) throw new Error(`Tenant read failed: ${error.message}`);
  const tenants: MetadataSourceTenant[] = [];
  const workspaceOf = new Map<string, string>();
  for (const row of data ?? []) {
    const account = await getAccountForTenant(row.id).catch(() => null);
    tenants.push({
      tenantId: row.id,
      stripeSubscriptionId: row.stripe_subscription_id ?? null,
      stripeCustomerId: row.stripe_customer_id ?? null,
      accountSubscriptionId: account?.subscription?.stripeSubscriptionId ?? null,
      accountCustomerId: account?.stripeCustomerId ?? account?.subscription?.stripeCustomerId ?? null,
    });
    const workspaceId = await workspaceIdForTenant(row.id);
    if (workspaceId) workspaceOf.set(row.id, workspaceId);
  }
  const plan = planStripeWorkspaceMetadata(tenants, workspaceOf);
  const stripeMode = stripeModeOf(process.env.STRIPE_SECRET_KEY);
  const writer = options.apply ? (() => {
    const stripe = getStripe();
    return {
      updateSubscription: async (id: string, metadata: Record<string, string>) => { await stripe.subscriptions.update(id, { metadata }); },
      updateCustomer: async (id: string, metadata: Record<string, string>) => { await stripe.customers.update(id, { metadata }); },
    };
  })() : null;
  const receipt = await applyStripeWorkspaceMetadata(plan, { ...options, stripeMode }, writer);
  const outcome = { apply: options.apply, stripeMode, receipt, notConverted: plan.notConverted, noStripeObject: plan.noStripeObject, conflicts: plan.conflicts };
  if (options.json) { console.log(JSON.stringify(outcome, null, 2)); return; }
  console.log(`${options.apply ? "Applied" : "Dry run (no Stripe call)"}; Stripe key mode: ${stripeMode}`);
  for (const line of receipt) console.log(`  ${line.result} ${line.kind} ${line.stripeId} workspaceId=${line.workspaceId} (${line.tenantIds.join(", ")})${line.error ? ` ${line.error}` : ""}`);
  for (const c of plan.conflicts) console.log(`  CONFLICT ${c.kind} ${c.stripeId}: ${c.workspaceIds.join(", ")} (not written)`);
  console.log(`Not converted: ${plan.notConverted.length}. Converted without a Stripe object: ${plan.noStripeObject.join(", ") || "none"}.`);
  if (receipt.some((l) => l.result === "failed")) process.exitCode = 2;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
