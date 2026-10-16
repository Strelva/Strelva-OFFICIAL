"use client";
/**
 * The agency's own frame for the standalone agency pages (setup, add a
 * client): the real StrelvaShell and XA sidebar, scoped to the agency. The
 * sidebar's client list is only what the caller read through agency scope;
 * when the caller has none, the sidebar shows "All clients" and "Add a client"
 * and nothing it cannot vouch for.
 */
import type { ReactNode } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import type { StrelvaClientLink } from "@/experience/app-frame/workspace-places";

export function AgencyFrame({ agencyWorkspaceId, agencyName, title, children, clients, appBase = "", hrefs, accountName, signOut, notice, mode, active = "home" }: {
  agencyWorkspaceId?: string; agencyName: string; title: string; children: ReactNode;
  clients?: readonly StrelvaClientLink[]; appBase?: string;
  hrefs?: Partial<Record<"home" | "clients" | "queue" | "library" | "team" | "verification" | "minutes", string>>;
  accountName?: string; signOut?: ReactNode; notice?: ReactNode; mode?: "light" | "dark"; active?: "home" | "clients" | "verification";
}) {
  return <StrelvaShell workspaceId={agencyWorkspaceId} workspaceName={agencyName} title={title} appBase={appBase} accountName={accountName} signOut={signOut} notice={notice} mode={mode} systemsReleased
    active="home" agencyNavigation={{ active, clients, hrefs, ...(agencyWorkspaceId ? {} : { leadsAvailable: false }) }}>
    {children}
  </StrelvaShell>;
}
