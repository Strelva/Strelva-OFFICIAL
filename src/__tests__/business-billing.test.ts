import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ getSupabase: () => null }));
import {
  businessBillingCheckoutMetadata,
  deriveBusinessBillingState,
  mirrorStripeEventToBusinessBilling,
  stripeBillingContext,
} from "@/platform/business-billing";
import {
  applyStripeWorkspaceMetadata,
  parseStripeMetadataArgs,
  planStripeWorkspaceMetadata,
  stripeModeOf,
} from "../../scripts/stripe-workspace-metadata-plan";

afterEach(() => vi.unstubAllEnvs());

describe("tenant billing shape -> business billing state", () => {
  it.each([
    ["tier", { billingType: "tier" as const, subscriptionPlan: "growth" as const }, {}, "subscription"],
    ["legacy active Stripe sub", { subscriptionStatus: "active" }, {}, "subscription"],
    ["custom", { billingType: "custom" as const, planMonthlyCents: 25000 }, {}, "custom"],
    ["legacy amount only", { planMonthlyCents: 15000 }, {}, "custom"],
    ["case study", { billingType: "case_study" as const }, {}, "comped"],
    ["founder comp", { planOverride: "founder_comp" as const }, {}, "comped"],
    ["gldf (protected, tier)", { billingType: "tier" as const }, { protectedTenant: true }, "grandfathered"],
    ["rohlax (protected, nothing set)", {}, { protectedTenant: true }, "grandfathered"],
    ["grandfather env list", { billingType: "custom" as const }, { grandfatherEnv: true }, "grandfathered"],
    ["nothing", {}, {}, "none"],
  ])("%s", (_label, tenant, grandfathered, state) => {
    const result = deriveBusinessBillingState(tenant, grandfathered);
    expect(result.state).toBe(state);
    expect(result.sources.length).toBeGreaterThan(0);
  });
});

function rpcDb(responses: Record<string, { data: unknown; error: { message: string } | null }>) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  return {
    calls,
    db: { rpc: (name: string, args: Record<string, unknown>) => { calls.push({ name, args }); return Promise.resolve(responses[name] ?? { data: null, error: { message: "no" } }); } },
  };
}

describe("Stripe metadata and webhook mirror (no Stripe calls)", () => {
  it("adds workspaceId to a converted tenant's checkout only when the flag is on, and never throws", async () => {
    const { db, calls } = rpcDb({ resolve_billing_workspace: { data: { workspaceId: "w-1", via: "tenant_link" }, error: null } });
    expect(await businessBillingCheckoutMetadata("gldf", db)).toEqual({});
    expect(calls).toEqual([]);
    vi.stubEnv("STRELVA_BUSINESS_BILLING", "1");
    expect(await businessBillingCheckoutMetadata("gldf", db)).toEqual({ workspaceId: "w-1" });
    const failing = { rpc: () => Promise.reject(new Error("db down")) };
    expect(await businessBillingCheckoutMetadata("gldf", failing)).toEqual({});
    const unconverted = rpcDb({ resolve_billing_workspace: { data: null, error: null } });
    expect(await businessBillingCheckoutMetadata("gldf", unconverted.db)).toEqual({});
  });

  it("mirrors payment status by workspaceId first, then tenant; failures are reported, not thrown", async () => {
    expect(await mirrorStripeEventToBusinessBilling({ tenantId: "gldf", status: "past_due" })).toEqual({ status: "skipped", reason: "disabled" });
    vi.stubEnv("STRELVA_BUSINESS_BILLING", "1");
    const ok = rpcDb({
      resolve_billing_workspace: { data: { workspaceId: "w-1", via: "workspace_metadata" }, error: null },
      record_business_billing_payment: { data: { paymentStatus: "past_due" }, error: null },
    });
    const result = await mirrorStripeEventToBusinessBilling({ workspaceId: "w-1", tenantId: "gldf", status: "past_due", stripeSubscriptionId: "sub_123", currentPeriodEnd: null }, ok.db);
    expect(result).toEqual({ status: "mirrored", workspaceId: "w-1", via: "workspace_metadata", paymentStatus: "past_due" });
    expect(ok.calls[0]).toEqual({ name: "resolve_billing_workspace", args: { p_workspace_id: "w-1", p_tenant_id: "gldf" } });
    expect(ok.calls[1]!.args).toMatchObject({ p_workspace_id: "w-1", p_status: "past_due", p_stripe_subscription_id: "sub_123" });

    const unresolved = rpcDb({ resolve_billing_workspace: { data: null, error: null } });
    expect(await mirrorStripeEventToBusinessBilling({ tenantId: "gldf", status: "active" }, unresolved.db)).toEqual({ status: "skipped", reason: "unresolved" });
    const broken = rpcDb({ resolve_billing_workspace: { data: { workspaceId: "w-1" }, error: null }, record_business_billing_payment: { data: null, error: { message: "business_billing_not_found" } } });
    expect(await mirrorStripeEventToBusinessBilling({ tenantId: "gldf", status: "active" }, broken.db)).toEqual({ status: "failed", reason: "business_billing_not_found" });
    expect(await mirrorStripeEventToBusinessBilling({ tenantId: "gldf", status: "active" }, { rpc: () => Promise.reject(new Error("boom")) })).toEqual({ status: "failed", reason: "boom" });
  });

  it("reads workspaceId, subscription and period end from subscriptions and invoices", () => {
    expect(stripeBillingContext({ object: "subscription", id: "sub_A", metadata: { tenantId: "t", workspaceId: "w" }, items: { data: [{ current_period_end: 1793923200 }] } }))
      .toEqual({ workspaceId: "w", stripeSubscriptionId: "sub_A", currentPeriodEnd: "2026-11-06T00:00:00.000Z" });
    expect(stripeBillingContext({ object: "invoice", parent: { subscription_details: { subscription: "sub_B", metadata: { workspaceId: "w2" } } } }))
      .toEqual({ workspaceId: "w2", stripeSubscriptionId: "sub_B", currentPeriodEnd: null });
    expect(stripeBillingContext({ object: "invoice" })).toEqual({ workspaceId: null, stripeSubscriptionId: null, currentPeriodEnd: null });
  });
});

describe("Stripe workspaceId metadata backfill plan (dry run, no Stripe calls)", () => {
  const tenants = [
    { tenantId: "twin-a", stripeSubscriptionId: null, stripeCustomerId: null, accountSubscriptionId: "sub_Twin", accountCustomerId: "cus_Twin" },
    { tenantId: "twin-b", stripeSubscriptionId: null, stripeCustomerId: null, accountSubscriptionId: "sub_Twin", accountCustomerId: "cus_Twin" },
    { tenantId: "tier", stripeSubscriptionId: "sub_Tier", stripeCustomerId: "cus_Tier" },
    { tenantId: "comped", stripeSubscriptionId: null, stripeCustomerId: null },
    { tenantId: "unconverted", stripeSubscriptionId: "sub_Other", stripeCustomerId: "cus_Other" },
    { tenantId: "split-a", stripeSubscriptionId: "sub_Shared", stripeCustomerId: null },
    { tenantId: "split-b", stripeSubscriptionId: "sub_Shared", stripeCustomerId: null },
  ];
  const workspaceOf = new Map([["twin-a", "w-twin"], ["twin-b", "w-twin"], ["tier", "w-tier"], ["comped", "w-comped"], ["split-a", "w-1"], ["split-b", "w-2"]]);

  it("lists each Stripe object once, skips unconverted tenants and refuses conflicts", () => {
    const plan = planStripeWorkspaceMetadata(tenants, workspaceOf);
    expect(plan.changes).toEqual([
      { kind: "customer", stripeId: "cus_Tier", workspaceId: "w-tier", tenantIds: ["tier"] },
      { kind: "customer", stripeId: "cus_Twin", workspaceId: "w-twin", tenantIds: ["twin-a", "twin-b"] },
      { kind: "subscription", stripeId: "sub_Tier", workspaceId: "w-tier", tenantIds: ["tier"] },
      { kind: "subscription", stripeId: "sub_Twin", workspaceId: "w-twin", tenantIds: ["twin-a", "twin-b"] },
    ]);
    expect(plan.notConverted).toEqual(["unconverted"]);
    expect(plan.noStripeObject).toEqual(["comped"]);
    expect(plan.conflicts).toEqual([{ kind: "subscription", stripeId: "sub_Shared", workspaceIds: ["w-1", "w-2"] }]);
  });

  it("a dry run calls nothing; apply needs Jacob's yes, a key, and --live for a live key; one failure never stops the rest", async () => {
    const plan = planStripeWorkspaceMetadata(tenants, workspaceOf);
    const writer = { updateSubscription: vi.fn(async () => {}), updateCustomer: vi.fn(async (id: string) => { if (id === "cus_Tier") throw new Error("rate limited"); }) };
    const dry = await applyStripeWorkspaceMetadata(plan, { apply: false, jacobsYes: false, live: false, stripeMode: "live" }, writer);
    expect(dry.every((l) => l.result === "would_add")).toBe(true);
    expect(writer.updateSubscription).not.toHaveBeenCalled();
    expect(writer.updateCustomer).not.toHaveBeenCalled();

    await expect(applyStripeWorkspaceMetadata(plan, { apply: true, jacobsYes: false, live: false, stripeMode: "test" }, writer)).rejects.toThrow(/Jacob's yes/);
    await expect(applyStripeWorkspaceMetadata(plan, { apply: true, jacobsYes: true, live: false, stripeMode: "live" }, writer)).rejects.toThrow(/--live/);
    await expect(applyStripeWorkspaceMetadata(plan, { apply: true, jacobsYes: true, live: false, stripeMode: "unconfigured" }, writer)).rejects.toThrow(/STRIPE_SECRET_KEY/);
    expect(writer.updateSubscription).not.toHaveBeenCalled();

    const applied = await applyStripeWorkspaceMetadata(plan, { apply: true, jacobsYes: true, live: false, stripeMode: "test" }, writer);
    expect(applied.map((l) => l.result)).toEqual(["failed", "added", "added", "added"]);
    expect(writer.updateSubscription).toHaveBeenCalledWith("sub_Twin", { workspaceId: "w-twin" });
  });

  it("parses options and key modes without reading the key", () => {
    expect(parseStripeMetadataArgs([])).toEqual({ apply: false, jacobsYes: false, live: false, json: false });
    expect(() => parseStripeMetadataArgs(["--force"])).toThrow(/Unknown option/);
    expect(stripeModeOf("sk_live_x")).toBe("live");
    expect(stripeModeOf("sk_test_x")).toBe("test");
    expect(stripeModeOf(undefined)).toBe("unconfigured");
  });
});

describe("a billing lapse never stops a site, the v1 API or lead capture", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  }
  const gate = /requireActiveSubscription|getEffectiveSubscriptionStatus|isBillingEnabled/;

  it("no /api/v1 route reads the billing gate", () => {
    const v1 = files(join(process.cwd(), "src/app/api/v1"));
    expect(v1.length).toBeGreaterThan(5);
    expect(v1.filter((f) => gate.test(readFileSync(f, "utf8")))).toEqual([]);
  });

  it("hosted public pages, the proxy and the public booking and lead paths are ungated", () => {
    const publicPages = files(join(process.cwd(), "src/app/(public)"));
    expect(publicPages.filter((f) => gate.test(readFileSync(f, "utf8")))).toEqual([]);
    for (const file of ["src/proxy.ts", "src/app/api/booking/route.ts", "src/app/api/booking/availability/route.ts", "src/lib/leads.ts", "src/lib/spam-pit.ts"]) {
      expect(gate.test(readFileSync(join(process.cwd(), file), "utf8")), file).toBe(false);
    }
  });
});
