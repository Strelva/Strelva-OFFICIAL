"use client";

import { useState } from "react";
import { useDashboardOptional } from "./DashboardContext";

interface BillingBannerProps {
  subscriptionStatus: string;
}

export function BillingBanner({ subscriptionStatus }: BillingBannerProps) {
  const dashboard = useDashboardOptional();
  const dashboardHref = dashboard?.dashboardHref ?? ((path: string) => path);
  const [dismissed, setDismissed] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [error, setError] = useState("");

  if (dismissed) return null;
  if (subscriptionStatus !== "cancelled" && subscriptionStatus !== "past_due") return null;

  const isCancelled = subscriptionStatus === "cancelled";

  async function openBillingPortal() {
    setError("");
    setOpeningPortal(true);
    try {
      const res = await fetch(dashboardHref("/api/billing/portal"), {
        method: "POST",
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          res.status === 404
            ? "Billing is not connected yet. Ask Scaffold Web to turn on the billing portal."
            : body?.error || "Couldn't open billing. Try again.",
        );
        return;
      }

      if (body?.portalUrl) {
        window.location.href = body.portalUrl;
      } else {
        setError("Couldn't open billing. Try again.");
      }
    } catch {
      setError("Couldn't open billing. Check your connection and try again.");
    } finally {
      setOpeningPortal(false);
    }
  }

  return (
    <div
      className={`flex items-center justify-between px-4 py-3 text-sm ${
        isCancelled
          ? "bg-red-50 text-red-800 border-b border-red-200"
          : "bg-amber-50 text-amber-800 border-b border-amber-200"
      }`}
    >
      <div>
        <p>
          {isCancelled
            ? "Your subscription has ended. Restart it to keep managing your site."
            : "Your payment is past due. Please update your billing info."}
          {" "}
          <button
            type="button"
            onClick={openBillingPortal}
            disabled={openingPortal}
            className={`underline font-medium disabled:opacity-60 ${
              isCancelled ? "text-red-900" : "text-amber-900"
            }`}
          >
            {openingPortal ? "Opening..." : "Manage billing"}
          </button>
        </p>
        {error && <p className="mt-1 text-xs opacity-80">{error}</p>}
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="ml-4 shrink-0 text-lg leading-none opacity-60 hover:opacity-100"
        aria-label="Dismiss"
      >
        x
      </button>
    </div>
  );
}
