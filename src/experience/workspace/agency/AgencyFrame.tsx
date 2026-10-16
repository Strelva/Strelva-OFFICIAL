"use client";
/**
 * The agency's own frame for the standalone agency pages (setup, add a
 * client): the real StrelvaShell and XA sidebar, scoped to the agency. The
 * sidebar's client list is only what the caller read through agency scope;
 * when the caller has none, the sidebar shows "All clients" and "Add a client"
 * and nothing it cannot vouch for.
 */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { StrelvaShell } from "@/experience/app-frame/StrelvaShell";
import type { StrelvaClientLink } from "@/experience/app-frame/workspace-places";

/**
 * A page inside the frame that reads the agency's clients itself (Add a
 * client) hands them up here, so the sidebar lists them, the one just added
 * included, without a second read.
 */
const FrameClients = createContext<((clients: readonly StrelvaClientLink[]) => void) | null>(null);
export function useAgencyFrameClients() { return useContext(FrameClients); }

export function AgencyFrame({ agencyWorkspaceId, agencyName, title, children, clients, appBase = "", hrefs, accountName, signOut, notice, mode, active = "home" }: {
  agencyWorkspaceId?: string; agencyName: string; title: string; children: ReactNode;
  clients?: readonly StrelvaClientLink[]; appBase?: string;
  hrefs?: Partial<Record<"home" | "clients" | "queue" | "library" | "team" | "verification" | "minutes", string>>;
  accountName?: string; signOut?: ReactNode; notice?: ReactNode; mode?: "light" | "dark"; active?: "home" | "clients" | "verification";
}) {
  const [read, setRead] = useState<readonly StrelvaClientLink[] | null>(null);
  // The caller's list first; a client the page read (or just added) joins it once, by id.
  const listed = useMemo(() => {
    if (!read) return clients;
    const known = new Set((clients ?? []).map(client => client.id));
    const merged = [...(clients ?? []).map(client => read.find(item => item.id === client.id) ?? client), ...read.filter(item => !known.has(item.id))];
    return merged;
  }, [clients, read]);
  return <FrameClients.Provider value={setRead}><StrelvaShell workspaceId={agencyWorkspaceId} workspaceName={agencyName} title={title} appBase={appBase} accountName={accountName} signOut={signOut} notice={notice} mode={mode} systemsReleased
    active="home" agencyNavigation={{ active, clients: listed, hrefs, ...(agencyWorkspaceId ? {} : { leadsAvailable: false }) }}>
    {children}
  </StrelvaShell></FrameClients.Provider>;
}
