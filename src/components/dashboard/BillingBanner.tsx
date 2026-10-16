"use client";

import { useState } from "react";
import { XaTextLink } from "@/components/ui/strelva/Xa";
import { DashNote } from "./xa/DashboardXa";
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
      <DashNote tone="waits" role="status" links={[
        <XaTextLink key="start" onClick={startSubscription}>{starting ? "Opening" : "Start your plan"}</XaTextLink>,
        <XaTextLink key="later" onClick={() => setDismissed(true)}>Later</XaTextLink>,
      ]}>
        Your site is built and ready. Start your plan to make changes live.{error ? ` ${error}` : ""}
      </DashNote>
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
    <DashNote tone="down" role="alert" links={[<XaTextLink key="billing" onClick={openBillingPortal}>{openingPortal ? "Opening" : isCancelled ? "Restart your plan" : "Update your card"}</XaTextLink>]}>
      {isCancelled
        ? "Your plan has ended. Restart it to keep changing your site."
        : "Your last payment didn't go through. Update your card to keep your site running."}
      {error ? ` ${error}` : ""}
    </DashNote>
  );
}
