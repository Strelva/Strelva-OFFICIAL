"use client";

import { useState, type ReactNode } from "react";
import { XaDot } from "@/components/ui/strelva/Xa";
import x from "@/experience/systems/xa/system-xa.module.css";

/**
 * XA · S3: the people who still wait lead the list; the answered ones are
 * shown under Done (the header's Open / Done), never mixed in as equals.
 * Rows are a name, when and what they asked, with no avatar disc; a clay dot
 * marks only someone still waiting for a reply. Every record stays mounted
 * while moving between people (and between Open and Done) so an exact reply
 * attempt is never discarded. On a phone the list and the person take turns.
 */
export function InquiryInbox({ entries, show = "all", onShowDone }: {
  entries: readonly { id: string; name: string; summary: string | null; at: string; waiting: boolean; record: ReactNode }[];
  /** Which people the list shows. Records of the others stay mounted, hidden. */
  show?: "all" | "open" | "done";
  /** Offered under an Open list that has answered people behind it. */
  onShowDone?: () => void;
}) {
  const listed = entries.filter(entry => show === "all" || (show === "open" ? entry.waiting : !entry.waiting));
  const [selected, setSelected] = useState(listed[0]?.id);
  const [detail, setDetail] = useState(false);
  const selectedId = listed.some(entry => entry.id === selected) ? selected : listed[0]?.id;
  const others = show === "open" ? entries.length - listed.length : 0;
  return <div className={x.inbox} data-detail={detail}>
    <div className={x.peopleCol}>
      {listed.length ? <ul className={x.people} aria-label="People who reached out">{listed.map(entry => <li key={entry.id}>
        <button type="button" className={x.person} aria-current={entry.id === selectedId || undefined} onClick={() => { setSelected(entry.id); setDetail(true); }}>
          <span className={x.personText}>
            <span className={x.personTop}><span className={x.personName}>{entry.name}</span><span className={x.personWhen}>{entry.at}</span></span>
            <span className={x.personSummary} data-quiet={!entry.waiting || undefined}>{entry.summary || "No message"}</span>
          </span>
          <span className={x.personDot}>{entry.waiting ? <XaDot kind="waits" label="Waits for a reply" /> : null}</span>
        </button>
      </li>)}</ul> : <p className={x.note}>{show === "open" ? "Nobody is waiting on a reply." : "Nothing answered yet."}</p>}
      {others > 0 && onShowDone ? <p className={x.textLinks}><button type="button" className={x.linkButton} onClick={onShowDone}>{others} answered</button></p> : null}
    </div>
    <div className={x.threadCol}>
      <button type="button" className={`${x.back} ${x.phoneBack}`} onClick={() => setDetail(false)}>‹ Inquiries</button>
      {entries.map(entry => <section key={entry.id} hidden={entry.id !== selectedId} aria-label={`Inquiry from ${entry.name}`}>{entry.record}</section>)}
    </div>
  </div>;
}
