import type { BusinessBilling } from "@/platform/business-billing";
import { StEmpty, StHead, StMono, StNotice, StPillLink, StRow, StRows, StSection, StSplit, StState } from "@/components/ui/strelva/Kit";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** Owner billing projection. Card digits, next charge and receipts are absent from this read. */
export function BusinessBillingView({ billing, businessName, backHref }: { billing: BusinessBilling | null; businessName?: string; backHref: string }) {
  const payer = billing?.payerParty?.kind === "agency" ? billing.payerParty.name ?? "Your agency" : billing?.payer?.name ?? billing?.payer?.email ?? "This business";
  return <>
    <StHead crumb={{ label: "Business details", href: backHref }} title="Plan and billing" meta={billing ? `One plan for the whole business · paid by ${payer}` : "One plan for the whole business"} />
    {billing ? <>
      {billing.paymentStatus === "past_due" ? <StNotice tone="need"><StState kind="need">Your payment needs attention</StState><p>{billing.payerParty?.kind === "agency" ? "Your agency’s payment needs attention. A business owner can choose direct payment for future work below." : "Update your payment method in your existing billing settings."} Your sites and inquiry capture keep working.</p><StPillLink href="/dashboard/settings#plan">Open billing settings</StPillLink></StNotice> : null}
      <StSplit aside={<StSection title="Receipts"><StEmpty>Payment receipts are available in your existing billing settings.</StEmpty></StSection>}><StRows label="Business billing details">
        <StRow value="Plan" title={billing.state === "grandfathered" ? "Your existing terms are kept" : billing.state === "comped" ? "Comped" : billing.state === "none" ? "Price not recorded" : billing.state === "custom" ? "Custom agreement" : "Strelva"} end={billing.state === "none" ? undefined : <StMono tone="text">{money(billing.monthlyCents)} / month</StMono>} />
        <StRow value="Covers" title={businessName ?? "This business"} detail={billing.sites.length ? billing.sites.map(site => site.siteName).join(" · ") : "No covered sites are recorded."} />
        <StRow value="Paid by" title={payer} />
        <StRow value="Payment" title={<StState kind={billing.paymentStatus === "past_due" ? "need" : billing.paymentStatus === "active" ? "live" : "draft"}>{billing.paymentStatus.replaceAll("_", " ")}</StState>} detail={billing.paidThrough ? <>Paid through <StMono>{billing.paidThrough.slice(0, 10)}</StMono></> : "The next charge date is not available in this record."} />
      </StRows></StSplit>
      {billing.grandfatheredTerms ? <StNotice>{billing.grandfatheredTerms}</StNotice> : null}
      {billing.state === "none" ? <StNotice>Billing terms still need to be recorded. No monthly price or plan is recorded.</StNotice> : <StNotice>Moving into the business workspace does not change your amount, plan, card or payment cycle. {billing.paymentStatus !== "past_due" ? <StPillLink href="/dashboard/settings#plan" variant="soft">Open billing settings</StPillLink> : null}{billing.payerParty?.kind === "agency" ? <p>This amount records the existing business agreement. Agency wholesale pricing and any separate retail invoice are shown in the agency’s billing records.</p> : null}</StNotice>}
    </> : <StEmpty>No billing record is attached to this business yet. The existing agreement and chosen payer need to be recorded.</StEmpty>}
  </>;
}
