"use client";

import { useEffect } from "react";
import { XaButton, XaTextLink } from "@/components/ui/strelva/Xa";
import { DashEmpty } from "@/components/dashboard/xa/DashboardXa";
import { useDashboardOptional } from "@/components/dashboard/DashboardContext";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const dashboard = useDashboardOptional();

  useEffect(() => {
    // This boundary catches every thrown error across the dashboard routes.
    // Truncate the message; the digest is the safe correlator to the server log.
    const safeMessage = typeof error.message === "string"
      ? error.message.slice(0, 200)
      : "(no message)";
    console.error("[dashboard] route error", { message: safeMessage, digest: error.digest });
  }, [error]);

  return (
    <DashEmpty
      pose="fixing"
      title="This page didn't load."
      job="Your site is still up. Nothing on it changed."
      action={<XaButton variant="primary" onClick={reset}>Try again</XaButton>}
      secondary={<XaTextLink href={dashboard?.dashboardHref("/dashboard") || "/dashboard"}>Go to Today</XaTextLink>}
    >
      Strelva couldn&apos;t read what this page needs. Trying again usually fixes it.
    </DashEmpty>
  );
}
