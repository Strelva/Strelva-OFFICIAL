"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { StMono, StTextButton } from "@/components/ui/strelva/Kit";
import type { WorkspaceSnapshot } from "./contracts";
import type { StrelvaSection } from "@/experience/app-frame/StrelvaShell";
import styles from "./workspace-business-switcher.module.css";

/** Memberships supplied by the server are the only businesses offered here. */
export function WorkspaceBusinessSwitcher({ snapshot, busy, onWorkspace, onNavigate }: { snapshot: WorkspaceSnapshot; busy: boolean; onWorkspace: (id: string) => void; onNavigate: (place: StrelvaSection) => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = snapshot.workspaces.find(item => item.id === snapshot.workspaceId);
  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    function key(event: KeyboardEvent) { if (event.key === "Escape") { setOpen(false); trigger.current?.focus(); } }
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", key); };
  }, [open]);
  function navigate(place: StrelvaSection) { setOpen(false); onNavigate(place); }
  return <div ref={root} className={styles.switcher}>
    <button ref={trigger} className={styles.trigger} type="button" disabled={busy} aria-label={`Current workspace: ${current?.name || "Your business"}`} aria-expanded={open} aria-controls="owner-business-menu" onClick={() => setOpen(!open)}>
      <span className={styles.initial} aria-hidden="true">{current?.name?.slice(0, 1) || "S"}</span><span>{current?.name || "Your business"}</span><ChevronsUpDown size={14} aria-hidden="true" />
    </button>
    {open ? <div id="owner-business-menu" className={styles.menu} aria-label="Your businesses">
      <p>Your businesses</p>
      {snapshot.workspaces.map(item => <button className={styles.business} type="button" key={item.id} disabled={busy} aria-current={item.id === snapshot.workspaceId ? "true" : undefined} onClick={() => { setOpen(false); onWorkspace(item.id); }}><span>{item.name}</span><StMono>{item.access === "delegated_read" ? "Read-only" : item.access === "provider_seat" ? "Agency access" : item.role || item.kind}</StMono></button>)}
      <StTextButton onClick={() => navigate("help")}>Ask to add a business</StTextButton>
      <div className={styles.links}><StTextButton onClick={() => navigate("settings")}>Business details</StTextButton><StTextButton onClick={() => navigate("access")}>People and access</StTextButton><StTextButton onClick={() => navigate("help")}>Help</StTextButton></div>
    </div> : null}
  </div>;
}
