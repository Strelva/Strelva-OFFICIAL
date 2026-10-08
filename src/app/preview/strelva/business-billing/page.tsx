import { notFound } from "next/navigation";
import { BusinessBillingView } from "@/experience/workspace/BusinessBillingView";
import { strelvaUiPreviewEnabled } from "@/experience/workspace/preview/enabled";
import type { BusinessBilling } from "@/platform/business-billing";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fictional billing fixture", robots: { index: false, follow: false } };

/** Exact billing presentation with fictional data; no Auth, billing or provider reads. */
export default async function BillingPreview({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  if (!strelvaUiPreviewEnabled()) notFound();
  const { state } = await searchParams;
  const workspaceId = "11111111-1111-4111-8111-111111111111";
  const billing: BusinessBilling = {
    workspaceId, accountId: "33333333-3333-4333-8333-333333333333",
    state: state === "grandfathered" ? "grandfathered" : "subscription",
    openItem: false, paymentStatus: state === "agency" ? "past_due" : "active", monthlyCents: 18500,
    planKey: "fictional", grandfatheredTerms: state === "grandfathered" ? "Existing signed terms remain in force." : null,
    paidThrough: "2026-11-06T00:00:00Z", paymentUpdatedAt: "2026-10-08T00:00:00Z",
    payer: { email: "recipient@example.test", name: "Fictional billing recipient" },
    payerParty: state === "unknown" ? null : { kind: state === "agency" ? "agency" : "business", workspaceId,
      name: state === "agency" ? "Fictional Neighborhood Agency with a long name for mobile reflow" : "Maple Street Workshop" },
    sites: [{ tenantId: "fictional-workshop", siteName: "Maple Street Workshop", amountCents: 18500 }], sources: [],
  };
  return <BusinessBillingView workspaceId={workspaceId} billing={state === "empty" ? null : billing} unavailable={state === "error" || state === "denied"} />;
}
