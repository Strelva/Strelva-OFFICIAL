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
const render = (value: BusinessBilling | null) => renderToStaticMarkup(<BusinessBillingView billing={value} businessName="Harbor Dental" backHref="/workspace/business-details" />);

// October 16 money decision: no price figure anywhere, and plain words only.
describe("owner billing presentation", () => {
  it("says who pays and what it covers, with no price figure", () => {
    const html = render(billing);
    expect(html).toContain("Harbor Dental’s plan is paid up.");
    expect(html).toContain("Example business");
    expect(html).toContain("Only the business owner can reach the card and receipts.");
    expect(html).not.toContain("$");
    for (const builder of ["Said by", "card ending", "Every System", "job", "ledger"]) expect(html).not.toContain(builder);
  });
  it("does not turn an unrecorded agreement into a zero-price plan", () => {
    const html = render({ ...billing, state: "none", monthlyCents: 0 });
    expect(html).toContain("billing isn’t set up here yet");
    expect(html).not.toContain("$");
  });
  it("preserves continuity and names the agency for a past-due payment", () => {
    const html = render({ ...billing, paymentStatus: "past_due", payerParty: { kind: "agency", workspaceId: "7e000000-0000-4000-8000-000000000020", name: "Recorded agency" } });
    expect(html).toContain("Recorded agency’s last payment for Harbor Dental didn’t go through.");
    expect(html).toContain("Your website and inquiries keep running.");
    expect(html).toContain("Recorded agency manages the card and receipts");
    expect(html).toContain("Needs a new card");
    expect(html).not.toContain("was declined on");
  });
  it("renders the absent-record next step", () => {
    const html = render(null);
    expect(html).toContain("Strelva is moving your existing agreement here.");
    expect(html).toContain("/workspace/business-details");
  });
});
describe("the paid-through day", () => {
  it("leads with the day the plan is paid through", () => {
    const html = render({ ...billing, paidThrough: "2026-11-01", paymentUpdatedAt: "2026-10-01T12:00:00Z" });
    expect(html).toContain("Harbor Dental is paid through November 1, 2026.");
    expect(html).toContain("Strelva plan");
    expect(html).not.toContain("Moving into the business workspace");
  });
});
