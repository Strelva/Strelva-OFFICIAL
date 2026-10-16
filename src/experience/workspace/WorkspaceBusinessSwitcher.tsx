"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { XaInitial, XaMark, XaSystemTile } from "@/components/ui/strelva/Xa";
import { PLACE_LABELS } from "@/platform/presentation/place-labels";
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

/**
 * XA scope switcher (October 16). The trigger is the sidebar's first line:
 * an initial, the scope, and the up-down chevrons (XA · AS1). The menu is a
 * white popover of open rows grouped in sentence case, with a check on the
 * current one and a quiet word only where access differs ("Read-only",
 * "Agency access"). Arrow keys move between rows; Escape returns focus.
 * Only server-authorized workspaces and Systems appear in this scope picker.
 */
export function WorkspaceBusinessSwitcher({ snapshot, busy, onWorkspace, onNavigate, systems = [], currentSystemId, onSystem }: { systems?: readonly SystemView[]; currentSystemId?: string | null; onSystem?: (id: string) => void; snapshot: WorkspaceSnapshot; busy: boolean; onWorkspace: (id: string) => void; onNavigate: (place: StrelvaSection) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
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
    (menu.current?.querySelector<HTMLButtonElement>('[aria-current="true"]:not(:disabled)') ?? menu.current?.querySelector<HTMLButtonElement>("button:not(:disabled)"))?.focus();
    function close(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    function key(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [open]);
  function navigate(place: StrelvaSection) { setOpen(false); onNavigate(place); }
  function arrows(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    if (!buttons.length) return;
    event.preventDefault();
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (at + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next]?.focus();
  }
  // Exceptions only: an agency person is expected to hold agency access to a client; read-only is the one that differs.
  const accessWord = (item: WorkspaceSnapshot["workspaces"][number]) => item.access === "delegated_read" ? "Read-only" : null;
  return <div ref={root} className={styles.switcher}>
    <button ref={trigger} className={styles.trigger} type="button" disabled={busy} aria-label={`Current scope: ${scope}`} aria-expanded={open} aria-controls="owner-business-menu" onClick={() => setOpen(!open)}>
      {current?.name ? <XaInitial name={current.name} size={24} /> : <XaMark size={22} />}<span className={styles.scope}>{scope}{current?.access === "delegated_read" ? <span className={styles.aside}> · Read-only</span> : ""}</span><ChevronsUpDown size={14} aria-hidden="true" className={styles.chevrons} />
    </button>
    {open ? <div id="owner-business-menu" ref={menu} className={styles.menu} aria-label="Switch scope" onKeyDown={arrows}>
      {groups.filter(group => group.items.length).map(group => <div key={group.label} className={styles.group} role="group" aria-label={group.label}><p className={styles.groupLabel}>{group.label}</p>{group.items.map(item => <button className={styles.business} type="button" key={item.id} disabled={busy} aria-current={item.id === snapshot.workspaceId ? "true" : undefined} onClick={() => { setOpen(false); onWorkspace(item.id); }}>
        <XaInitial name={item.name} size={24} /><span className={styles.name}>{item.name}</span>{accessWord(item) ? <span className={styles.aside}>{accessWord(item)}</span> : null}<Check size={15} aria-hidden="true" className={styles.check} />
      </button>)}</div>)}
      {systems.length && onSystem ? <div className={styles.group} role="group" aria-label={`Systems in ${current?.name || "your business"}`}><p className={styles.groupLabel}>Systems in {current?.name || "your business"}</p>{systems.map(system => <button type="button" className={styles.business} key={system.id} disabled={busy} aria-current={system.id === currentSystemId ? "true" : undefined} onClick={() => { setOpen(false); onSystem(system.id); }}>
        <XaSystemTile kind={system.kind} size={24} /><span className={styles.name}>{system.name}</span><Check size={15} aria-hidden="true" className={styles.check} />
      </button>)}</div> : null}
      <div className={styles.links}>
        <button type="button" className={styles.link} onClick={() => navigate("settings")}>{PLACE_LABELS.businessDetails}</button>
        <button type="button" className={styles.link} onClick={() => navigate("access")}>{PLACE_LABELS.access}</button>
        <button type="button" className={styles.link} onClick={() => navigate("help")}>Ask to add a business</button>
      </div>
    </div> : null}
  </div>;
}
