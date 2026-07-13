"use client";

import { useState } from "react";
import { useDashboardOptional } from "@/components/dashboard/DashboardContext";
import { SCAFFOLD_PLAN_MONTHLY_PRICE_LABEL } from "@/lib/pricing";
import { useDashboardApiPath } from "./useDashboardApiPath";

type SubscriptionStatus = "active" | "trialing" | "past_due" | "cancelled" | "none";

const STATUS_COPY: Record<SubscriptionStatus, { label: string; className: string; note: string }> = {
  active: { label: "Active", className: "bg-emerald-400/10 text-emerald-400", note: "Everything included. Cancel anytime." },
  trialing: { label: "Trialing", className: "bg-sky-400/10 text-sky-400", note: "Trial access is active." },
  past_due: { label: "Past due", className: "bg-amber-400/10 text-amber-400", note: "Payment needs attention to keep the dashboard fully available." },
  cancelled: { label: "Canceled", className: "bg-red-400/10 text-red-400", note: "This subscription is canceled." },
  none: { label: "Not set up", className: "bg-gray-border text-gray-muted", note: "No subscription is connected yet." },
};

const FOUNDER_COMP_COPY = {
  label: "Founder comp",
  className: "bg-amber-300/12 text-amber-200",
  note: "Full access is comped for this founder account. No customer billing is due.",
};

export function BillingSection() {
  const dashboard = useDashboardOptional();
  const apiPath = useDashboardApiPath();
  const [billingError, setBillingError] = useState("");
  const [openingPortal, setOpeningPortal] = useState(false);
  const status = dashboard?.subscriptionStatus ?? "none";
  const isFounderComp = dashboard?.planOverride === "founder_comp";
  const copy = isFounderComp ? FOUNDER_COMP_COPY : STATUS_COPY[status];

  async function openBillingPortal() {
    setBillingError("");
    setOpeningPortal(true);
    try {
      const res = await fetch(apiPath("/api/billing/portal"), {
        method: "POST",
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBillingError(
          res.status === 404 || !dashboard?.hasStripeCustomer
            ? "You're on a managed plan — there's no billing portal to open. Message Strelva anytime about your plan."
            : body?.error || "Couldn't open the billing portal. Try again."
        );
        return;
      }
      if (body.portalUrl) window.open(body.portalUrl, "_blank");
    } catch {
      setBillingError("Couldn't open the billing portal. Check your connection and try again.");
    } finally {
      setOpeningPortal(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-glass-border">
      <div className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">Current plan</div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[20px] font-medium text-warm-white">
              {isFounderComp ? "Founder comp" : SCAFFOLD_PLAN_MONTHLY_PRICE_LABEL}
            </span>
            <span className={`rounded px-2 py-0.5 text-[11px] font-medium ${copy.className}`}>{copy.label}</span>
          </div>
          <p className="text-[12px] text-gray-faint">{copy.note}</p>
          {!isFounderComp && dashboard?.hasStripeCustomer && (
            <p className="mt-1 text-[12px] text-gray-faint">
              Manage billing opens your secure Stripe portal to update payment, change plan, or cancel.
            </p>
          )}
          {billingError && <p className="mt-3 text-[12px] text-amber-300">{billingError}</p>}
        </div>
        <button
          type="button"
          onClick={openBillingPortal}
          disabled={openingPortal || isFounderComp}
          className="min-h-[38px] w-full rounded-lg border border-glass-border px-4 py-2 text-[12px] text-gray-muted transition-colors hover:bg-glass disabled:opacity-60 sm:w-auto"
        >
          {isFounderComp ? "No billing action" : openingPortal ? "Opening..." : "Manage billing"}
        </button>
      </div>
    </div>
  );
}
