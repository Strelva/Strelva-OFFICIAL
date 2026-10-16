"use client";

import { useCallback, useState, type ReactNode } from "react";
import { XaEntry } from "@/components/ui/strelva/Xa";
import { BusinessSetupPanel, type BusinessDoorDraft, type Keep } from "@/experience/workspace/BusinessSetupPanel";
import styles from "./getting-started.module.css";

/**
 * XA · B2 on the real route: which business, and what Strelva keeps for it.
 * The stage follows the form. Pebble holds a note with the business's name
 * and the first ask exactly as it will be saved, so the owner sees their
 * words before anything is created. No System is shown: none exists yet.
 */
export function BusinessDoor({ account, mode, initialName, initialKeeps, navigate, panelKey }: {
  account?: ReactNode;
  mode?: "light" | "dark";
  /** Preview only. */
  initialName?: string;
  initialKeeps?: readonly Keep[];
  navigate?: (href: string) => void;
  panelKey?: string;
}) {
  const [draft, setDraft] = useState<BusinessDoorDraft>({ name: initialName ?? "", ask: "" });
  const onDraft = useCallback((next: BusinessDoorDraft) => setDraft(current => current.name === next.name && current.ask === next.ask && current.existing === next.existing ? current : next), []);
  const promise = "You own it and everything in it. Nothing goes live without your yes.";
  return <XaEntry account={account} mode={mode} stage={draft.existing
    ? { pose: "alone", label: `Pebble beside ${draft.name || "your business"}`, title: `${draft.name || "Your business"}, on Strelva.`, body: promise, phone: promise }
    : {
      pose: "alone",
      label: "Pebble holding a note with your business name and first ask",
      objectKey: draft.name ? "named" : "unnamed",
      object: <FirstAskNote name={draft.name} ask={draft.ask} />,
      phone: draft.ask ? <>Your first ask: {draft.ask}</> : promise,
    }}>
    <BusinessSetupPanel key={panelKey ?? "help"} startProduct="help" gettingStarted initialName={initialName} initialKeeps={initialKeeps} navigate={navigate} onDraft={onDraft} />
  </XaEntry>;
}

/** The note Pebble holds on B2 (and B5): a business and its first ask, in the owner's words. */
export function FirstAskNote({ name, ask, empty = "Nothing asked yet. Pick below, or skip it." }: { name: string; ask: string; empty?: string }) {
  return <div className={styles.askNote}>
    <p className={styles.noteName}>{name || "Your business"}</p>
    <p className={styles.noteLabel}>Your first ask</p>
    <p className={styles.noteAsk} data-empty={!ask || undefined}>{ask || empty}</p>
  </div>;
}
