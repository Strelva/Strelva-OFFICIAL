"use client";
/**
 * XA · AG4 · Prepare a change, send it to the owner (Pen QbF4l), right side.
 *
 * The draft as one object: what each changed line says now and after, the
 * one sentence about what happens next, and the screen's one ink pill. The
 * caller owns the save; sending never puts anything live. The owner's yes
 * happens on their side, with the same preview.
 */
import type { ReactNode } from "react";
import { XaButton, XaSays, XaStatus, XaTextLink } from "@/components/ui/strelva/Xa";
import styles from "./agency-xa.module.css";

export interface AgencyDraftChange {
  id: string;
  label: string;
  before: string;
  after: string;
}

export interface AgencySendPanelProps {
  clientName: string;
  /** Where the change shows, e.g. "harbordental.com/hours" or the website's name. */
  address: string;
  changes: readonly AgencyDraftChange[];
  /** Set when the draft can't be sent: why, in one sentence. */
  blocked?: string | null;
  sending: boolean;
  /** The confirmation once the client has the draft to review. */
  sent?: ReactNode;
  onSend: () => void;
  onKeepEditing: () => void;
}

const clip = (text: string) => text.length > 120 ? `${text.slice(0, 117).trimEnd()}…` : text || "Empty";

export function AgencySendPanel({ clientName, address, changes, blocked, sending, sent, onSend, onKeepEditing }: AgencySendPanelProps) {
  const count = changes.length;
  return <section className={styles.sendPanel} aria-label={`Draft for ${clientName}`}>
    <div className={styles.panelHead}>
      {sent ? <XaStatus kind="waits">Sent · waiting on {clientName}</XaStatus> : <XaStatus kind="draft">{count ? `Draft · ${count} ${count === 1 ? "change" : "changes"}` : "Draft · no changes yet"}</XaStatus>}
      <small>{address}</small>
    </div>
    {count ? <table className={styles.changes}>
      <caption className="sr-only">What changes for {clientName}</caption>
      <thead><tr><th scope="col">Part</th><th scope="col">Now</th><th scope="col">After</th></tr></thead>
      <tbody>{changes.map(change => <tr key={change.id} data-changed><td>{change.label}</td><td data-before>{clip(change.before)}</td><td data-after>{clip(change.after)}</td></tr>)}</tbody>
    </table> : sent ? null : <p className={styles.note}>Edit a section on the left. Each change shows here as now and after before you send it.</p>}
    {sent ? <XaSays links={[<XaTextLink key="edit" onClick={onKeepEditing}>Keep editing</XaTextLink>]}>{sent}</XaSays>
      : <>
        <p className={styles.note}>{clientName} sees this with the page preview. Nothing changes until {clientName} says yes.</p>
        {blocked ? <p role="status" className={styles.inlineAlert}>{blocked}</p> : null}
        <div className={styles.sendActions}>
          <XaButton variant="primary" size="lg" block busy={sending} disabled={!count || Boolean(blocked)} onClick={onSend}>Send to {clientName}</XaButton>
          <XaButton variant="quiet" onClick={onKeepEditing} disabled={sending}>Keep editing</XaButton>
        </div>
      </>}
  </section>;
}
