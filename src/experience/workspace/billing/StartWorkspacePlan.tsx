"use client";

import { useState } from "react";
import { XaAnswers, XaButton, XaLabel, XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import styles from "@/experience/workspace/money/money.module.css";

import type { AiControlsState, BusinessAiBudget } from "@/platform/infra/business-ai-budget";

const dollars = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

const monthDay = (iso: string) => new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso)) + " (UTC)";

/** What the agency or Strelva set for this business, named. Nothing renders without a controls row. */
function AgencyUsageControlLines({ controls, resetsAt }: { controls: AiControlsState; resetsAt: string | null }) {
  const agency = controls.setBy?.kind === "agency" && controls.setBy.agencyName ? controls.setBy.agencyName : null;
  const lines: string[] = [];
  if (controls.paused) lines.push(`${agency ?? "A Strelva operator"} paused Strelva work for this business${controls.changedAt && Number.isFinite(Date.parse(controls.changedAt)) ? ` on ${monthDay(controls.changedAt)}` : ""}.`);
  if (controls.monthlyCapCents !== null) lines.push(`Usage limit ${dollars(controls.monthlyCapCents / 100)} set by ${agency ?? "Strelva"}.${resetsAt && Number.isFinite(Date.parse(resetsAt)) ? ` Resets ${monthDay(resetsAt)}.` : ""}`);
  return lines.length ? <div className={styles.section}>{lines.map(line => <p key={line} className={controls.paused ? styles.critical : styles.body}>{line}</p>)}</div> : null;
}

/** Server-authorized budget projection; never infer a cap or a reset from the browser. */
export function BusinessAiBudgetSummary({ budget, capUsd, enforced, controls = null }: { budget: BusinessAiBudget | null; capUsd: number | null; enforced?: boolean; controls?: AiControlsState | null }) {
  const known = budget && Number.isFinite(Number(budget.spentUsd)) && Number.isFinite(Number(budget.reservedUsd)) && Number.isFinite(Date.parse(budget.resetsAt));
  const spent = known ? Number(budget.spentUsd) : null;
  const reserved = known ? Number(budget.reservedUsd) : null;
  const remaining = spent !== null && reserved !== null && capUsd !== null && Number.isFinite(capUsd) ? Math.max(0, capUsd - spent - reserved) : null;
  const reading = !known ? "Usage could not be confirmed. Budgeted building stays paused until the budget can be checked." : budget.unknownCostCalls > 0 ? capUsd === null ? "Some past calls have no confirmed cost. Recorded spend is incomplete. No spending limit is recorded for this business." : "Usage could not be confirmed. Budgeted building stays paused until the budget can be checked." : "Budgeted calls reserve their maximum cost before running. Reserved amounts stay committed until the reset date, including calls whose outcome is not confirmed.";
  return <section className={styles.section} aria-label="Monthly usage">
    <XaLabel as="h2">Monthly usage</XaLabel>
    <XaAnswers labelWidth={160} rows={[
      ["Recorded spend", spent === null ? "Unavailable" : dollars(spent)],
      ["Reserved for work", reserved === null ? "Unavailable" : dollars(reserved)],
      ["Remaining budget", !known || budget.unknownCostCalls > 0 ? "Unavailable" : capUsd === null ? "No spending limit recorded" : remaining === null ? "Unavailable" : dollars(remaining)],
      ["Resets", known ? new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(budget.resetsAt)) + " (UTC)" : "Unavailable"],
    ]} />
    {controls ? <AgencyUsageControlLines controls={controls} resetsAt={budget?.resetsAt ?? null} /> : null}
    {enforced ? (!known || budget.unknownCostCalls > 0 ? <XaSays>{reading}</XaSays> : <p className={styles.note}>{reading}</p>) : <p className={styles.note}>{enforced === false ? "Usage limits are not enabled here." : "Your current usage limit has not been confirmed."} No plan price is published yet. Nothing is charged until you see one and agree to it.</p>}
  </section>;
}

type Transport = (input: string, init?: RequestInit) => Promise<Response>;

/** The owner starts the business's own plan (ADR 0015). Checkout happens on Stripe; nothing is charged here. */
export function StartWorkspacePlan({ workspaceId, budget = null, capUsd = null, budgetEnforced, controls = null, transport = fetch, navigate = (url: string) => window.location.assign(url) }: { workspaceId: string; budget?: BusinessAiBudget | null; capUsd?: number | null; budgetEnforced?: boolean; controls?: AiControlsState | null; transport?: Transport; navigate?: (url: string) => void }) {
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
  return <><section className={styles.section} aria-label="Run your business on Strelva">
    <p className={styles.body}>Run your business on Strelva. Your plan’s price and included usage are shown before you pay. You can bring in an agency anytime.</p>
    <div className={styles.actions}><XaButton variant="primary" busy={busy} disabled={busy} onClick={() => void start()}>Start your plan</XaButton></div>
    {error ? <p className={styles.critical} role="alert">{error}</p> : null}
  </section><BusinessAiBudgetSummary budget={budget} capUsd={capUsd} enforced={budgetEnforced} controls={controls} /></>;
}

/** An unconfigured sale never renders a checkout control or an invented price. */
export function WorkspacePlanUnavailable({ workspaceId }: { workspaceId: string }) {
  return <section className={styles.section} aria-label="Your plan">
    <p className={styles.body}>No plan price is published yet. Self-serve plans are not available yet. <XaTextLink href={`/workspace?view=help&workspaceId=${encodeURIComponent(workspaceId)}`}>Bring in an agency</XaTextLink></p>
  </section>;
}
