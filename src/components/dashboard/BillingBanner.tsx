"use client";

import { useState } from "react";

interface BillingBannerProps {
  subscriptionStatus: string;
}

export function BillingBanner({ subscriptionStatus }: BillingBannerProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;
  if (subscriptionStatus !== "cancelled" && subscriptionStatus !== "past_due") return null;

  const isCancelled = subscriptionStatus === "cancelled";

  return (
    <div
      className={`flex items-center justify-between px-4 py-3 text-sm ${
        isCancelled
          ? "bg-red-50 text-red-800 border-b border-red-200"
          : "bg-amber-50 text-amber-800 border-b border-amber-200"
      }`}
    >
      <p>
        {isCancelled
          ? "Your subscription has ended. Restart it to keep managing your site."
          : "Your payment is past due. Please update your billing info."}
        {" "}
        <a
          href="/api/billing/portal"
          className={`underline font-medium ${
            isCancelled ? "text-red-900" : "text-amber-900"
          }`}
        >
          Manage billing
        </a>
      </p>
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
