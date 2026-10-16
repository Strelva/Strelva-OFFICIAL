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
  /** The confirmation once the client has the draft to review, or once Undo took it back. */
  sent?: ReactNode;
  /** The send was undone: the message in `sent` says so, and the edits are back in the editor. */
  takenBack?: boolean;
  onSend: () => void;
  onKeepEditing: () => void;
  /** A plain sentence about the send that isn't the status, e.g. that Undo closed because editing went on. */
  note?: string | null;
}

const clip = (text: string, empty: string) => text.length > 120 ? `${text.slice(0, 117).trimEnd()}…` : text || empty;

export function AgencySendPanel({ clientName, address, changes, blocked, sending, sent, takenBack, onSend, onKeepEditing, note }: AgencySendPanelProps) {
  const count = changes.length;
  return <section className={styles.sendPanel} aria-label={`Draft for ${clientName}`}>
    <div className={styles.panelHead}>
      {sent && !takenBack ? <XaStatus kind="waits">Sent · waiting on {clientName}</XaStatus> : <XaStatus kind="draft">{count ? `Draft · ${count} ${count === 1 ? "change" : "changes"}` : "Draft · no changes yet"}</XaStatus>}
      <small>{address}</small>
    </div>
    {count ? <table className={styles.changes}>
      <caption className="sr-only">What changes for {clientName}</caption>
      <thead><tr><th scope="col" className={styles.changesPart}>Part</th><th scope="col">Now</th><th scope="col">After</th></tr></thead>
      <tbody>{changes.map((change, index) => <tr key={change.id}>
        {/* A part's name shows once; the lines under it line up now beside after. */}
        <td>{index && changes[index - 1]!.label === change.label ? <span className="sr-only">{change.label}</span> : change.label}</td>
        <td data-before data-empty={change.before ? undefined : ""}>{clip(change.before, "New line")}</td>
        <td data-after data-empty={change.after ? undefined : ""}>{clip(change.after, "Removed")}</td>
      </tr>)}</tbody>
    </table> : sent ? null : <p className={styles.note}>Edit a section on the left. Each change shows here as now and after before you send it.</p>}
    {/* After a send the status above says it; the headline and the Undo toast carry the rest. Only Undo's outcome is new news. */}
    {sent && takenBack ? <XaSays>{sent}</XaSays> : null}
    {sent && !takenBack ? <p className={styles.note}><XaTextLink onClick={onKeepEditing}>Keep editing</XaTextLink></p> : null}
    {note ? <p role="status" className={styles.note}>{note}</p> : null}
    {sent && !takenBack ? null : <>
        <p className={styles.note}>{clientName} sees this with the page preview. Nothing changes until {clientName} says yes.</p>
        {/* No grey pill: when there's nothing to send, the sentence says why and what unblocks it. */}
        {blocked ? <p role="status" className={styles.inlineAlert}>{blocked}</p> : null}
        {/* While drafting you are already editing, so Send stands alone. */}
        {count && !blocked ? <div className={styles.sendActions}>
          <XaButton variant="primary" size="lg" block busy={sending} onClick={onSend}>Send to {clientName}</XaButton>
        </div> : null}
      </>}
  </section>;
}
