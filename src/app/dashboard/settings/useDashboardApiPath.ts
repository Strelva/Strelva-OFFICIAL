"use client";

import { useCallback } from "react";
import { useDashboardOptional } from "@/components/dashboard/DashboardContext";

export function useDashboardApiPath() {
  const dashboard = useDashboardOptional();
  return useCallback(
    (path: string) => dashboard?.dashboardHref(path) ?? path,
    [dashboard]
  );
}
