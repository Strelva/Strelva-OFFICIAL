"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { StMono, StTextButton } from "@/components/ui/strelva/Kit";
import type { SystemView } from "@/experience/systems/model";
import type { WorkspaceSnapshot } from "./contracts";
import type { StrelvaSection } from "@/experience/app-frame/StrelvaShell";
import type { StrelvaClientLink } from "@/experience/app-frame/workspace-places";
import styles from "./workspace-business-switcher.module.css";

/** Navigation hints never grant access. Prefer the serving agency when it is reachable. */
export function clientAgencyWorkspace(snapshot: WorkspaceSnapshot) {
  const current = snapshot.workspaces.find(item => item.id === snapshot.workspaceId);
  if (current?.kind !== "customer" || !["provider_seat", "delegated_read"].includes(current.access || "")) return undefined;
  const agencies = snapshot.workspaces.filter(item => item.kind === "agency");
  return agencies.find(item => item.id === snapshot.ownerBrand?.agencyId) || (agencies.length === 1 ? agencies[0] : undefined);
}

/**
 * XA: the agency's clients for the sidebar, from the same server-authorized
 * workspace list the switcher reads. Opening one switches workspace in place.
 */
export function agencyClientLinks(snapshot: WorkspaceSnapshot, appBase: string, onWorkspace?: (id: string) => void): StrelvaClientLink[] {
  return snapshot.workspaces
    .filter(item => item.kind === "customer" && ["provider_seat", "delegated_read"].includes(item.access || ""))
    .map(item => ({ id: item.id, name: item.name, href: `${appBase}/workspace?workspaceId=${encodeURIComponent(item.id)}`, onOpen: onWorkspace ? () => onWorkspace(item.id) : undefined, current: item.id === snapshot.workspaceId, detail: item.access === "delegated_read" ? "Read-only" : undefined }));
}

/** Only server-authorized workspaces and Systems appear in this scope picker. */
export function WorkspaceBusinessSwitcher({ snapshot, busy, onWorkspace, onNavigate, systems = [], currentSystemId, onSystem }: { systems?: readonly SystemView[]; currentSystemId?: string | null; onSystem?: (id: string) => void; snapshot: WorkspaceSnapshot; busy: boolean; onWorkspace: (id: string) => void; onNavigate: (place: StrelvaSection) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = snapshot.workspaces.find(item => item.id === snapshot.workspaceId);
  const currentSystem = systems.find(item => item.id === currentSystemId);
  const groups = [
    { label: "Your agency", items: snapshot.workspaces.filter(item => item.kind === "agency") },
    { label: "Clients", items: snapshot.workspaces.filter(item => item.kind === "customer" && ["provider_seat", "delegated_read"].includes(item.access || "")) },
    { label: "Your business", items: snapshot.workspaces.filter(item => item.kind !== "agency" && !["provider_seat", "delegated_read"].includes(item.access || "")) },
  ];
  const agency = clientAgencyWorkspace(snapshot);
  const scope = [agency?.name, current?.name || "Your business", currentSystem?.name].filter(Boolean).join(" / ");
  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    function key(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [open]);
  function navigate(place: StrelvaSection) { setOpen(false); onNavigate(place); }
  return <div ref={root} className={styles.switcher}>
    <button ref={trigger} className={styles.trigger} type="button" disabled={busy} aria-label={`Current scope: ${scope}`} aria-expanded={open} aria-controls="owner-business-menu" onClick={() => setOpen(!open)}>
      <span className={styles.initial} aria-hidden="true">{current?.name?.slice(0, 1) || "S"}</span><span>{scope}{current?.access === "provider_seat" ? " · Agency access" : ""}</span><ChevronsUpDown size={14} aria-hidden="true" />
    </button>
    {open ? <div id="owner-business-menu" className={styles.menu} aria-label="Switch scope">
      {groups.filter(group => group.items.length).map(group => <div key={group.label}><p className="px-2 py-1 text-xs text-gray-muted">{group.label}</p>{group.items.map(item => <button className={styles.business} type="button" key={item.id} disabled={busy} aria-current={item.id === snapshot.workspaceId ? "true" : undefined} onClick={() => { setOpen(false); onWorkspace(item.id); }}><span>{item.name}</span><StMono>{item.access === "delegated_read" ? "Read-only" : item.access === "provider_seat" ? "Agency access" : item.role || item.kind}</StMono></button>)}</div>)}
      {systems.length && onSystem ? <div><p className="px-2 py-1 text-xs text-gray-muted">Systems · {current?.name}</p>{systems.map(system => <button type="button" className={styles.business} key={system.id} disabled={busy} aria-current={system.id === currentSystemId ? "true" : undefined} onClick={() => { setOpen(false); onSystem(system.id); }}>{system.name}</button>)}</div> : null}
      <StTextButton onClick={() => navigate("help")}>Ask to add a business</StTextButton>
      <div className={styles.links}><StTextButton onClick={() => navigate("settings")}>Business details</StTextButton><StTextButton onClick={() => navigate("access")}>People & access</StTextButton><StTextButton onClick={() => navigate("help")}>Help</StTextButton></div>
    </div> : null}
  </div>;
}
