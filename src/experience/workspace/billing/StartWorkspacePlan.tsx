"use client";

import { useState } from "react";
import { StNotice, StPill, StRow, StRows, StSection } from "@/components/ui/strelva/Kit";

import type { BusinessAiBudget } from "@/platform/infra/business-ai-budget";

const dollars = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

/** Server-authorized budget projection; never infer a cap or a reset from the browser. */
export function BusinessAiBudgetSummary({ budget, capUsd, enforced }: { budget: BusinessAiBudget | null; capUsd: number | null; enforced?: boolean }) {
  const known = budget && Number.isFinite(Number(budget.spentUsd)) && Number.isFinite(Number(budget.reservedUsd)) && Number.isFinite(Date.parse(budget.resetsAt));
  const spent = known ? Number(budget.spentUsd) : null;
  const reserved = known ? Number(budget.reservedUsd) : null;
  const remaining = spent !== null && reserved !== null && capUsd !== null && Number.isFinite(capUsd) ? Math.max(0, capUsd - spent - reserved) : null;
  return <StSection title="Monthly usage">
    <StRows label="Business AI budget">
      <StRow value="Recorded spend" title={spent === null ? "Unavailable" : dollars(spent)} />
      <StRow value="Reserved for work" title={reserved === null ? "Unavailable" : dollars(reserved)} />
      <StRow value="Remaining budget" title={!known || budget.unknownCostCalls > 0 ? "Unavailable" : capUsd === null ? "No spending limit recorded" : remaining === null ? "Unavailable" : dollars(remaining)} />
      <StRow value="Resets" title={known ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(budget.resetsAt)) + " (UTC)" : "Unavailable"} />
    </StRows>
    {enforced ? <StNotice tone={!known || budget.unknownCostCalls > 0 ? "critical" : undefined}>{!known || budget.unknownCostCalls > 0 ? "Usage could not be confirmed. Budgeted building stays paused until the budget can be checked." : "Budgeted calls reserve their maximum cost before running. Reserved amounts stay committed until the reset date, including calls whose outcome is not confirmed."}</StNotice> : <StNotice>{enforced === false ? "Usage limits are not enabled here." : "Your current usage limit has not been confirmed."} Your plan’s price and included usage are shown before you pay.</StNotice>}
  </StSection>;
}

type Transport = (input: string, init?: RequestInit) => Promise<Response>;

/** The owner starts the business's own plan (ADR 0015). Checkout happens on Stripe; nothing is charged here. */
export function StartWorkspacePlan({ workspaceId, budget = null, capUsd = null, budgetEnforced, transport = fetch, navigate = (url: string) => window.location.assign(url) }: { workspaceId: string; budget?: BusinessAiBudget | null; capUsd?: number | null; budgetEnforced?: boolean; transport?: Transport; navigate?: (url: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function start() {
    setBusy(true); setError("");
    try {
      const response = await transport("/api/workspace/billing-checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ workspaceId }) });
      const body = await response.json() as { checkoutUrl?: string; error?: string };
      if (!response.ok || !body.checkoutUrl) throw new Error(body.error || "Checkout couldn't be opened. Nothing was charged.");
      navigate(body.checkoutUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Checkout couldn't be opened. Nothing was charged.");
      setBusy(false);
    }
  }
  return <><StSection title="Run your business on Strelva" meta="Your plan’s price and included usage are shown before you pay. You can bring in an agency anytime.">
    <StPill busy={busy} disabled={busy} onClick={() => void start()}>Start your plan</StPill>
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
  </StSection><BusinessAiBudgetSummary budget={budget} capUsd={capUsd} enforced={budgetEnforced} /></>;
}
