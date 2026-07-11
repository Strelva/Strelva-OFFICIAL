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
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  if (dismissed) return null;
  if (
    subscriptionStatus !== "cancelled" &&
    subscriptionStatus !== "past_due" &&
    subscriptionStatus !== "none"
  )
    return null;

  const isNone = subscriptionStatus === "none";
  const isCancelled = subscriptionStatus === "cancelled";

  async function startSubscription() {
    setError("");
    setStarting(true);
    try {
      const res = await fetch(dashboardHref("/api/billing/start-subscription"), {
        method: "POST",
        credentials: "same-origin",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || "Couldn't start your subscription. Try again, or message Strelva.");
        return;
      }
      if (body?.checkoutUrl) window.location.href = body.checkoutUrl;
      else setError("Couldn't start your subscription. Try again.");
    } catch {
      setError("Couldn't start your subscription. Check your connection and try again.");
    } finally {
      setStarting(false);
    }
  }

  if (isNone) {
    return (
      <div className="flex items-center justify-between gap-4 border-b border-positive bg-positive px-4 py-3 text-sm text-positive">
        <div>
          <p>
            Your site is built and ready. Start your subscription to publish
            changes and go live.{" "}
            <button
              type="button"
              onClick={startSubscription}
              disabled={starting}
              className="font-medium underline text-positive disabled:opacity-60"
            >
              {starting ? "Opening…" : "Start your subscription"}
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
            ? "You're on a managed plan. There's no billing portal to open. Message Strelva anytime about your plan."
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
          ? "bg-critical text-critical border-b border-critical"
          : "bg-warning text-warning border-b border-warning"
      }`}
    >
      <div>
        <p>
          {isCancelled
            ? "Your subscription has ended. Restart it to keep managing your site."
            : "Your payment didn't go through. Update your card to keep your site running."}
          {" "}
          <button
            type="button"
            onClick={openBillingPortal}
            disabled={openingPortal}
            className={`underline font-medium disabled:opacity-60 ${
              isCancelled ? "text-critical" : "text-warning"
            }`}
          >
            {openingPortal ? "Opening..." : "Manage billing"}
          </button>
        </p>
        {error && <p className="mt-1 text-xs opacity-80">{error}</p>}
      </div>
      {/* No dismiss button: a billing problem (past due / cancelled) must not be hideable. */}
    </div>
  );
}
