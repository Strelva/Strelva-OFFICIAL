import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BusinessBillingView } from "@/experience/workspace/billing/BusinessBillingView";
import type { BusinessBilling } from "@/platform/business-billing";

const billing: BusinessBilling = {
  workspaceId: "7e000000-0000-4000-8000-000000000010", accountId: "7e000000-0000-4000-8000-000000000050",
  state: "subscription", openItem: false, paymentStatus: "active", monthlyCents: 15000,
  planKey: "workspace", grandfatheredTerms: null, paidThrough: null, payer: null,
  sites: [{ tenantId: "example", siteName: "Example business", amountCents: 15000 }],
  sources: null, paymentUpdatedAt: null,
};
const render = (value: BusinessBilling | null) => renderToStaticMarkup(<BusinessBillingView billing={value} backHref="/workspace/business-details" />);

describe("owner billing presentation", () => {
  it("keeps unavailable charge dates and receipts explicit", () => {
    const html = render(billing);
    expect(html).toContain("$150 / month");
    expect(html).toContain("The next charge date is not available in this record.");
    expect(html).toContain("Said by");
    expect(html).toContain("A business owner can manage payments and review cancellation here.");
    expect(html).not.toContain("card ending");
    expect(html).not.toContain("Every System");
  });
  it("does not turn an unrecorded agreement into a zero-price plan", () => {
    const html = render({ ...billing, state: "none", monthlyCents: 0 });
    expect(html).toContain("No plan price published yet");
    expect(html).toContain("No monthly price or plan is recorded.");
    expect(html).not.toContain("$0.00");
  });
  it("preserves continuity and named agency responsibility for past-due payment", () => {
    const html = render({ ...billing, paymentStatus: "past_due", payerParty: { kind: "agency", workspaceId: "7e000000-0000-4000-8000-000000000020", name: "Recorded agency" } });
    expect(html).toContain("paid by Recorded agency");
    expect(html).toContain("Recorded agency’s payment needs attention.");
    expect(html).toContain("Recorded agency manages its payment method and keeps the receipts");
    expect(html).toContain("Your sites and inquiry capture keep working.");
    expect(html).not.toContain("was declined on");
  });
  it("renders the absent-record next step", () => {
    expect(render(null)).toContain("The existing agreement and chosen payer need to be recorded.");
  });
});
describe("who said each answer", () => {
  it("names Strelva for the plan and Stripe, with its day, for the payment", () => {
    const html = render({ ...billing, paidThrough: "2026-11-01", paymentUpdatedAt: "2026-10-01T12:00:00Z" });
    expect(html).toContain("Strelva plan");
    expect(html).toMatch(/Stripe · Oct 1/);
    expect(html).not.toContain("Moving into the business workspace");
  });
});
