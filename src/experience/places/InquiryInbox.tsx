"use client";

import { useState, type ReactNode } from "react";
import { StBeacon, StMono, StRow, StRows, StTextButton } from "@/components/ui/strelva/Kit";
import styles from "./WorkspaceInquiries.module.css";

/** The selected record remains mounted when moving between people so an exact reply attempt is never discarded. */
export function InquiryInbox({ entries }: { entries: readonly { id: string; name: string; summary: string | null; at: string; waiting: boolean; record: ReactNode }[] }) {
  const [selected, setSelected] = useState(entries[0]?.id);
  const [detail, setDetail] = useState(false);
  const selectedId = entries.some(entry => entry.id === selected) ? selected : entries[0]?.id;
  return <div className={styles.inbox} data-detail={detail}>
    <div className={styles.people}><StRows label="People who reached out">{entries.map(entry => <StRow key={entry.id} title={entry.name} detail={<span className={styles.summary}>{entry.summary}</span>} lead={<StBeacon kind={entry.waiting ? "need" : "draft"} label={entry.waiting ? "Reply not yet confirmed" : "Inquiry record"} />} end={<StMono>{entry.at}</StMono>} selected={entry.id === selectedId} stackOnPhone={false} onClick={() => { setSelected(entry.id); setDetail(true); }} />)}</StRows></div>
    <div className={styles.record}><div className={styles.back}><StTextButton onClick={() => setDetail(false)}>‹ Inquiries</StTextButton></div>{entries.map(entry => <section key={entry.id} hidden={entry.id !== selectedId} aria-label={`Inquiry from ${entry.name}`}>{entry.record}</section>)}</div>
  </div>;
}
