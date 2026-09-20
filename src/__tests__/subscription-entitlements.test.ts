import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  subscriptionAllowanceEntitlementSchema,
  subscriptionAllowanceFromStripeEvent,
} from "@/platform/work-economics/subscription-entitlements";

const ORIGINAL_CONFIG = process.env.STRELVA_SUBSCRIPTION_ALLOWANCE_CONFIG;

beforeEach(() => {
  process.env.STRELVA_SUBSCRIPTION_ALLOWANCE_CONFIG = JSON.stringify({
    "included-standard": {
      grants: [{ unitKind: "completed_application_change", units: 12 }],
      spendingCapCents: 2500,
    },
  });
});

afterEach(() => {
  if (ORIGINAL_CONFIG === undefined) delete process.env.STRELVA_SUBSCRIPTION_ALLOWANCE_CONFIG;
  else process.env.STRELVA_SUBSCRIPTION_ALLOWANCE_CONFIG = ORIGINAL_CONFIG;
});

describe("subscription allowance entitlement resolution", () => {
  it("binds a Basil invoice to the parent subscription, metadata snapshot and invoice period", () => {
    const entitlement = subscriptionAllowanceFromStripeEvent({
      id: "evt_invoice_paid_1",
      created: 1_800_000_000,
      type: "invoice.paid",
      data: {
        object: {
          id: "in_this_is_not_a_subscription",
          customer: "cus_123",
          period_start: 1_800_000_000,
          period_end: 1_802_592_000,
          metadata: {},
          parent: {
            subscription_details: {
              subscription: "sub_basil_123",
              metadata: {
                workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                payerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                allowanceConfigKey: "included-standard",
              },
            },
          },
        },
      },
    });

    expect(entitlement).toMatchObject({
      subscriptionId: "sub_basil_123",
      customerId: "cus_123",
      workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      payerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      configKey: "included-standard",
      status: "active",
      grants: [{ unitKind: "completed_application_change", units: 12 }],
      spendingCapCents: 2500,
    });
    expect(entitlement?.periodStart).toBe(new Date(1_800_000_000 * 1000).toISOString());
    expect(entitlement?.periodEnd).toBe(new Date(1_802_592_000 * 1000).toISOString());
  });

  it("keeps a zero-dollar subscription-create invoice in trial for allowance projection", () => {
    const entitlement = subscriptionAllowanceFromStripeEvent({
      id: "evt_trial_invoice_paid",
      created: 1_800_000_004,
      type: "invoice.paid",
      data: {
        object: {
          id: "in_trial_create",
          customer: "cus_trial",
          billing_reason: "subscription_create",
          amount_paid: 0,
          period_start: 1_800_000_000,
          period_end: 1_802_592_000,
          parent: {
            subscription_details: {
              subscription: "sub_trial",
              metadata: {
                workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                payerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                allowanceConfigKey: "included-standard",
              },
            },
          },
        },
      },
    });

    expect(entitlement).toMatchObject({ subscriptionId: "sub_trial", status: "trialing" });
  });

  it("uses the expanded subscription object for checkout events when Stripe includes it", () => {
    const entitlement = subscriptionAllowanceFromStripeEvent({
      id: "evt_checkout_expanded",
      created: 1_800_000_000,
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_123",
          subscription: {
            id: "sub_expanded",
            customer: "cus_expanded",
            status: "trialing",
            current_period_start: 1_800_000_000,
            current_period_end: 1_802_592_000,
            metadata: {
              workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              payerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              allowanceConfigKey: "included-standard",
            },
          },
        },
      },
    });

    expect(entitlement).toMatchObject({ subscriptionId: "sub_expanded", customerId: "cus_expanded", status: "trialing" });
  });

  it("reads the Basil item period for an expanded checkout subscription", () => {
    const entitlement = subscriptionAllowanceFromStripeEvent({
      id: "evt_checkout_basil_item_period",
      created: 1_800_000_000,
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_basil_item_period",
          subscription: {
            id: "sub_basil_item_period",
            customer: "cus_basil_item_period",
            status: "trialing",
            items: {
              data: [{
                id: "si_basil_item_period",
                current_period_start: 1_800_000_000,
                current_period_end: 1_802_592_000,
              }],
            },
            metadata: {
              workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
              payerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
              allowanceConfigKey: "included-standard",
            },
          },
        },
      },
    });

    expect(entitlement).toMatchObject({
      subscriptionId: "sub_basil_item_period",
      customerId: "cus_basil_item_period",
      status: "trialing",
      periodStart: new Date(1_800_000_000 * 1000).toISOString(),
      periodEnd: new Date(1_802_592_000 * 1000).toISOString(),
    });
  });

  it("reads the Basil item period for subscription updates and cancellations", () => {
    const baseObject = {
      id: "sub_basil_lifecycle",
      customer: "cus_basil_lifecycle",
      items: {
        data: [{
          id: "si_basil_lifecycle",
          current_period_start: 1_800_000_000,
          current_period_end: 1_802_592_000,
        }],
      },
      metadata: {
        workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        payerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        allowanceConfigKey: "included-standard",
      },
    };

    const updated = subscriptionAllowanceFromStripeEvent({
      id: "evt_subscription_basil_updated",
      created: 1_800_000_001,
      type: "customer.subscription.updated",
      data: { object: { ...baseObject, status: "active" } },
    });
    const deleted = subscriptionAllowanceFromStripeEvent({
      id: "evt_subscription_basil_deleted",
      created: 1_800_000_002,
      type: "customer.subscription.deleted",
      data: { object: { ...baseObject, status: "canceled" } },
    });

    expect(updated).toMatchObject({
      subscriptionId: "sub_basil_lifecycle",
      status: "active",
      periodStart: new Date(1_800_000_000 * 1000).toISOString(),
      periodEnd: new Date(1_802_592_000 * 1000).toISOString(),
    });
    expect(deleted).toMatchObject({
      subscriptionId: "sub_basil_lifecycle",
      status: "cancelled",
      periodStart: new Date(1_800_000_000 * 1000).toISOString(),
      periodEnd: new Date(1_802_592_000 * 1000).toISOString(),
    });
  });

  it("does not select an arbitrary period when subscription items have different intervals", () => {
    const entitlement = subscriptionAllowanceFromStripeEvent({
      id: "evt_subscription_ambiguous_items",
      created: 1_800_000_003,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_ambiguous_items",
          customer: "cus_ambiguous_items",
          status: "active",
          items: {
            data: [
              { id: "si_monthly", current_period_start: 1_800_000_000, current_period_end: 1_802_592_000 },
              { id: "si_yearly", current_period_start: 1_800_000_000, current_period_end: 1_831_536_000 },
            ],
          },
          metadata: {
            workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            payerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            allowanceConfigKey: "included-standard",
          },
        },
      },
    });

    expect(entitlement).toBeNull();
  });

  it("keeps missing configured terms unavailable instead of inferring units or price", () => {
    process.env.STRELVA_SUBSCRIPTION_ALLOWANCE_CONFIG = "{}";
    const entitlement = subscriptionAllowanceFromStripeEvent({
      id: "evt_unconfigured",
      created: 1_800_000_000,
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_unconfigured",
          customer: "cus_123",
          status: "active",
          current_period_start: 1_800_000_000,
          current_period_end: 1_802_592_000,
          metadata: {
            workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            payerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            allowanceConfigKey: "not-configured",
          },
        },
      },
    });

    expect(entitlement?.status).toBe("unavailable");
    expect(entitlement && "grants" in entitlement).toBe(false);
    expect(entitlement && "spendingCapCents" in entitlement).toBe(false);
    expect(subscriptionAllowanceEntitlementSchema.safeParse(entitlement).success).toBe(true);
  });

  it("does not accept a fractional or incomplete active entitlement as configured terms", () => {
    const result = subscriptionAllowanceEntitlementSchema.safeParse({
      version: 1,
      eventId: "evt_invalid_terms",
      eventCreated: 1_800_000_000,
      subscriptionId: "sub_invalid_terms",
      customerId: null,
      workspaceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      payerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      configKey: "included-standard",
      status: "active",
      periodStart: "2027-01-15T00:00:00.000Z",
      periodEnd: "2027-02-15T00:00:00.000Z",
      grants: [{ unitKind: "completed_application_change", units: 12 }],
    });

    expect(result.success).toBe(false);
  });
});
