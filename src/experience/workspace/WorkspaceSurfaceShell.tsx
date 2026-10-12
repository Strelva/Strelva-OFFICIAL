"use client";

import type { ReactNode } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";

/** Native workspace pages retain the common navigation and scoped paper tokens. */
export function WorkspaceSurfaceShell({ children, workspaceId, businessName = "Business workspace", systemsReleased = false }: {
  children: ReactNode;
  workspaceId: string;
  businessName?: string;
  systemsReleased?: boolean;
}) {
  return <StrelvaShell workspaceId={workspaceId} title="" businessContext={businessName} systemsReleased={systemsReleased}>
    {children}
  </StrelvaShell>;
}
