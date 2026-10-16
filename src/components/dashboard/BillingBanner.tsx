"use client";

import { useState } from "react";
import { XaSays, XaTextLink } from "@/components/ui/strelva/Xa";
import { useDashboardOptional } from "./DashboardContext";

interface BillingBannerProps {
  /** Defaults to the dashboard's own subscription status. */
  subscriptionStatus?: string;
}

/**
 * The payment decision, said by Pebble in frame where it matters: on Today and
 * on Settings > Plan beside "Manage billing". Never a shell banner. Renders
 * nothing while the plan is in good standing.
 */
export function BillingBanner({ subscriptionStatus: given }: BillingBannerProps) {
  const dashboard = useDashboardOptional();
  const subscriptionStatus = given ?? dashboard?.subscriptionStatus ?? "active";
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
      <div role="status"><XaSays links={[
        <XaTextLink key="start" onClick={startSubscription}>{starting ? "Opening" : "Start your plan"}</XaTextLink>,
        <XaTextLink key="later" onClick={() => setDismissed(true)}>Later</XaTextLink>,
      ]}>
        Your site is built and ready. Start your plan to make changes live.{error ? ` ${error}` : ""}
      </XaSays></div>
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

  // No "Later" here: a billing problem (past due / ended) must not be hideable.
  return (
    <div role="alert"><XaSays links={[<XaTextLink key="billing" onClick={openBillingPortal}>{openingPortal ? "Opening" : isCancelled ? "Restart your plan" : "Update your card"}</XaTextLink>]}>
      {isCancelled
        ? "Your plan has ended. Your site stays up, and changes wait until you restart it."
        : "Your last payment didn't go through. Your site is still up; update your card to keep it that way."}
      {error ? ` ${error}` : ""}
    </XaSays></div>
  );
}
