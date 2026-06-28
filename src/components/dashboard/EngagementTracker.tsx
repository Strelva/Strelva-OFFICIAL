"use client";

import { useEffect } from "react";
import { track } from "@vercel/analytics";
import { useDashboardOptional } from "./DashboardContext";

export type EngagementEvent =
  | "dashboard-open"
  | "ai-chat-open"
  | "report-view"
  | "health-view"
  | "gbp-view"
  | "brand-kit-view"
  | "store-view"
  | "referral-click";

export function EngagementTracker({ event }: { event: EngagementEvent }) {
  const dashboard = useDashboardOptional();
  const dashboardHref = dashboard?.dashboardHref;

  useEffect(() => {
    const endpoint = dashboardHref?.("/api/track") || "/api/track";
    const payload = JSON.stringify({ event });

    try {
      track(event);
    } catch {}

    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(
        endpoint,
        new Blob([payload], { type: "application/json" }),
      );
      if (sent) return;
    }

    fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: payload,
      keepalive: true,
    }).catch(() => {});
  }, [dashboardHref, event]);

  return null;
}
