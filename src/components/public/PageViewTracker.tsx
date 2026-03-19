"use client";

import { useEffect } from "react";

export function PageViewTracker() {
  useEffect(() => {
    // Skip tracking in development to avoid inflated counts
    if (process.env.NODE_ENV === "development") return;

    // Track page view via beacon — non-blocking, won't affect performance
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/track",
        new Blob([JSON.stringify({ event: "page-view" })], {
          type: "application/json",
        })
      );
    } else {
      fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "page-view" }),
        keepalive: true,
      }).catch(() => {});
    }
  }, []);

  return null;
}
