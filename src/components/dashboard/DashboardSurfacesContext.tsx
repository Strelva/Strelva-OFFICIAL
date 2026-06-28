"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { DashboardSurface } from "@/lib/dashboard-surfaces";

/**
 * Holds the conditional dashboard nav surfaces (computed server-side in the
 * dashboard layout from business type + connections) so the sidebar and mobile
 * nav render the same tab set without a client fetch. Replaces the old
 * fail-open capability no-op (audit M10) — this does real work and never fetches.
 */
const SurfacesContext = createContext<DashboardSurface[]>([]);

export function useDashboardSurfaces(): DashboardSurface[] {
  return useContext(SurfacesContext);
}

export function DashboardSurfacesProvider({
  surfaces,
  children,
}: {
  surfaces: DashboardSurface[];
  children: ReactNode;
}) {
  return <SurfacesContext.Provider value={surfaces}>{children}</SurfacesContext.Provider>;
}
