"use client";

import { useState, type ReactNode } from "react";
import { XaDot, XaInitial } from "@/components/ui/strelva/Xa";
import x from "@/experience/systems/xa/system-xa.module.css";

/**
 * XA · S3: everyone who reached out on the left, the one person open on the
 * right. A clay dot marks only the people still waiting for a reply. The
 * selected record stays mounted when moving between people so an exact reply
 * attempt is never discarded. On a phone the list and the person take turns.
 */
export function InquiryInbox({ entries }: { entries: readonly { id: string; name: string; summary: string | null; at: string; waiting: boolean; record: ReactNode }[] }) {
  const [selected, setSelected] = useState(entries[0]?.id);
  const [detail, setDetail] = useState(false);
  const selectedId = entries.some(entry => entry.id === selected) ? selected : entries[0]?.id;
  return <div className={x.inbox} data-detail={detail}>
    <div className={x.peopleCol}><ul className={x.people} aria-label="People who reached out">{entries.map(entry => <li key={entry.id}>
      <button type="button" className={x.person} aria-current={entry.id === selectedId || undefined} onClick={() => { setSelected(entry.id); setDetail(true); }}>
        <XaInitial name={entry.name} size={36} shape="round" color={entry.waiting ? "var(--st-text)" : "var(--st-faint)"} />
        <span className={x.personText}>
          <span className={x.personTop}><span className={x.personName}>{entry.name}</span><span className={x.personWhen}>{entry.at}</span></span>
          <span className={x.personSummary} data-quiet={!entry.waiting || undefined}>{entry.summary || "No message"}</span>
        </span>
        <span className={x.personDot}>{entry.waiting ? <XaDot kind="waits" label="Waits for a reply" /> : null}</span>
      </button>
    </li>)}</ul></div>
    <div className={x.threadCol}>
      <button type="button" className={`${x.back} ${x.phoneBack}`} onClick={() => setDetail(false)}>‹ Inquiries</button>
      {entries.map(entry => <section key={entry.id} hidden={entry.id !== selectedId} aria-label={`Inquiry from ${entry.name}`}>{entry.record}</section>)}
    </div>
  </div>;
}
