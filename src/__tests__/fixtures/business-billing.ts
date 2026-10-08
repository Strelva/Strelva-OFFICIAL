import type { BusinessBilling } from "@/platform/business-billing";

export const BILLING_WORKSPACE_ID = "11111111-1111-4111-8111-111111111111";
export const BILLING_AGENCY_ID = "22222222-2222-4222-8222-222222222222";

/** Fictional records only; the payer party is deliberately not the recipient. */
export function billingFixture(overrides: Partial<BusinessBilling> = {}): BusinessBilling {
  return {
    workspaceId: BILLING_WORKSPACE_ID,
    accountId: "33333333-3333-4333-8333-333333333333",
    state: "subscription", openItem: false, paymentStatus: "active", monthlyCents: 18500,
    planKey: "existing", grandfatheredTerms: null, paidThrough: "2026-11-06T00:00:00Z",
    payer: { email: "billing-recipient@example.test", name: "Billing contact" },
    payerParty: { kind: "business", workspaceId: BILLING_WORKSPACE_ID, name: "Maple Street Workshop" },
    sites: [{ tenantId: "maple-workshop", siteName: "Maple Street Workshop", amountCents: 18500 }],
    sources: [], paymentUpdatedAt: "2026-10-08T00:00:00Z",
    ...overrides,
  };
}
