"use client";

import { useEffect } from "react";
import { DashboardErrorView } from "@/components/dashboard/DashboardErrorView";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // This boundary catches every thrown error across the dashboard routes.
    // Truncate the message; the digest is the safe correlator to the server log.
    const safeMessage = typeof error.message === "string"
      ? error.message.slice(0, 200)
      : "(no message)";
    console.error("[dashboard] route error", { message: safeMessage, digest: error.digest });
  }, [error]);

  return <DashboardErrorView onRetry={reset} />;
}
