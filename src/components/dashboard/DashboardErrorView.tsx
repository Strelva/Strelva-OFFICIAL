"use client";

import { XaButton, XaTextLink } from "@/components/ui/strelva/Xa";
import { DashEmpty } from "./xa/DashboardXa";
import { useDashboardOptional } from "./DashboardContext";

/**
 * What a dashboard page says when its data did not load: Pebble in frame,
 * already on it, what is still true, and one way forward. The route boundary
 * (app/dashboard/error.tsx) logs the error and renders this; the preview
 * renders it directly so no fake error is thrown.
 */
export function DashboardErrorView({ onRetry }: { onRetry: () => void }) {
  const dashboard = useDashboardOptional();
  return (
    <DashEmpty
      pose="fixing"
      title="This page didn't load."
      job="Your site is still up. Nothing on it changed."
      action={<XaButton variant="primary" onClick={onRetry}>Try again</XaButton>}
      secondary={<XaTextLink href={dashboard?.dashboardHref("/dashboard") || "/dashboard"}>Go to Home</XaTextLink>}
    >
      Strelva couldn&apos;t read what this page needs. Trying again usually fixes it.
    </DashEmpty>
  );
}
