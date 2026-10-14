"use client";

import { useEffect, useRef, useState } from "react";
import type { BusinessBilling } from "@/platform/business-billing";
import { StEmpty, StHead, StMono, StNotice, StPill, StRow, StRows, StSection, StSplit, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

/** Owner billing projection. Card digits, next charge and receipts are absent from this read. */
type Transport = (input: string, init?: RequestInit) => Promise<Response>;
type Props = { billing: BusinessBilling | null; businessName?: string; backHref: string; workspaceId?: string; canManage?: boolean; transport?: Transport; navigate?: (url: string) => void };

export function BusinessBillingView({ billing, businessName, backHref, workspaceId = billing?.workspaceId, canManage = false, transport, navigate }: Props) {
  const payer = billing?.payerParty?.kind === "agency" ? billing.payerParty.name ?? "Your agency" : billing?.payer?.name ?? billing?.payer?.email ?? "This business";
  return <>
    <StHead crumb={{ label: "Business details", href: backHref }} title="Plan and billing" meta={billing ? `One plan for the whole business · paid by ${payer}` : "One plan for the whole business"} />
    {billing ? <>
      {billing.paymentStatus === "past_due" ? <StNotice tone="need"><StState kind="need">Your payment needs attention</StState><p>{billing.payerParty?.kind === "agency" ? "Your agency’s payment needs attention. A business owner can choose direct payment for future work below." : "Open payment management below to update your payment method."} Your sites and inquiry capture keep working.</p></StNotice> : null}
      <StSplit aside={<StSection title="Receipts"><StEmpty>Open payment management below to review receipts from Stripe.</StEmpty></StSection>}><StRows label="Business billing details">
        <StRow value="Plan" title={billing.state === "grandfathered" ? "Your existing terms are kept" : billing.state === "comped" ? "Comped" : billing.state === "none" ? "Price shown before you pay" : billing.state === "custom" ? "Custom agreement" : "Strelva"} end={billing.state === "none" ? undefined : <StMono tone="text">{money(billing.monthlyCents)} / month</StMono>} />
        <StRow value="Covers" title={businessName ?? "This business"} detail={billing.sites.length ? billing.sites.map(site => site.siteName).join(" · ") : "No covered sites are recorded."} />
        <StRow value="Paid by" title={payer} />
        <StRow value="Payment" title={<StState kind={billing.paymentStatus === "past_due" ? "need" : billing.paymentStatus === "active" ? "live" : "draft"}>{billing.paymentStatus.replaceAll("_", " ")}</StState>} detail={billing.paidThrough ? <>Paid through <StMono>{billing.paidThrough.slice(0, 10)}</StMono></> : "The next charge date is not available in this record."} />
      </StRows></StSplit>
      {billing.grandfatheredTerms ? <StNotice>{billing.grandfatheredTerms}</StNotice> : null}
      {billing.state === "none" ? <StNotice>Billing terms still need to be recorded. No monthly price or plan is recorded.</StNotice> : <StNotice>Moving into the business workspace does not change your amount, plan, card or payment cycle. {billing.payerParty?.kind === "agency" ? <p>This amount records the existing business agreement. Agency wholesale pricing and any separate retail invoice are shown in the agency’s billing records.</p> : null}</StNotice>}
    </> : <StEmpty>No billing record is attached to this business yet. The existing agreement and chosen payer need to be recorded.</StEmpty>}
    {billing?.payerParty?.kind === "agency" ? <StNotice>Your agency manages its payment method and receipts. The business owner can choose a different payer in the settings below.</StNotice> : canManage && workspaceId ? <WorkspaceBillingControls key={workspaceId} workspaceId={workspaceId} transport={transport} navigate={navigate} /> : <StNotice>A business owner can manage payments and review cancellation here.</StNotice>}
  </>;
}

/** Session creation opens Stripe; the owner confirms any billing change there. */
function WorkspaceBillingControls({ workspaceId, transport = fetch, navigate = (url: string) => window.location.assign(url) }: { workspaceId: string; transport?: Transport; navigate?: (url: string) => void }) {
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState<"manage" | "cancel" | null>(null);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);

  async function open(action: "manage" | "cancel") {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(action); setError("");
    try {
      const response = await transport("/api/workspace/billing-portal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId, action }), signal: controller.signal });
      const body = await response.json() as { portalUrl?: string; error?: string };
      if (controller.signal.aborted) return;
      if (!response.ok || !body?.portalUrl) throw new Error(body?.error || "Payment management could not be opened. No billing change was made.");
      const url = new URL(body.portalUrl);
      if (url.protocol !== "https:" || url.hostname !== "billing.stripe.com" || url.username || url.password) throw new Error("Payment management returned an invalid link. No billing change was made.");
      navigate(body.portalUrl);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "Payment management could not be opened. No billing change was made.");
    } finally {
      if (pending.current === controller) { pending.current = null; setBusy(null); }
    }
  }

  return <StSection title="Manage your plan" meta="Stripe holds your payment method and receipts. Any change needs your confirmation there.">
    <div className="flex flex-wrap gap-4"><StPill busy={busy === "manage"} disabled={Boolean(busy)} onClick={() => void open("manage")}>Manage payments and receipts</StPill><StTextButton disabled={Boolean(busy)} onClick={() => { setReviewing(true); setError(""); }}>Review cancellation</StTextButton></div>
    {reviewing ? <StSurface label="Review plan cancellation"><p>Continue to Stripe to review when your subscription ends and confirm cancellation. Leaving the workspace does not stop billing. Billing continues until cancellation is confirmed in Stripe.</p><div className="flex flex-wrap gap-4"><StPill variant="soft" busy={busy === "cancel"} disabled={Boolean(busy)} onClick={() => void open("cancel")}>Continue to cancellation</StPill><StTextButton disabled={Boolean(busy)} onClick={() => setReviewing(false)}>Keep my plan</StTextButton></div></StSurface> : null}
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
  </StSection>;
}
