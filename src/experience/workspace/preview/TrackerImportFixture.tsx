"use client";

import { useState } from "react";
import { createTracker, previewTrackerImport } from "@/products/tracker";
import type { TrackerSnapshot } from "@/products/tracker/contracts";
import { SelectInput, TextInput } from "@/components/ui/TextInput";
import { StEmpty, StHead, StMono, StNotice, StPage, StPill, StRow, StRows, StSection, StSkeleton, StState } from "@/components/ui/strelva/Kit";
import styles from "./tracker-import-fixture.module.css";

const columns = ["Matter", "Parties", "Opened", "Status", "Notes", "Col F"];
const targets = ["Matter name", "Number of parties", "Opened on", "Stage", "Notes · private", "Skip"];
const badRows = [7, 19, 31];
/** Fictional data, mappings and recipients. Every change stays in browser memory. */
const records = Array.from({ length: 48 }, (_, index) => [
  index === 0 ? "Harbor & Lane / Cole Supply" : `[Matter ${index + 1}]`, "2",
  badRows.includes(index + 2) ? "date to confirm" : "2026-09-14",
  ["scheduled", "open", "waiting", "complete", "sched."][index % 5]!,
  index === 0 ? "called back, wants Fri" : "Private note", "",
]);

export function TrackerImportFixture({ state }: { state: string }) {
  const [mapping, setMapping] = useState(targets);
  const [dates, setDates] = useState<Record<number, string>>({});
  const [recipient, setRecipient] = useState("Sheri, by email");
  const [saved, setSaved] = useState<TrackerSnapshot | null>(null);
  const [error, setError] = useState("");
  const readOnly = state === "read-only";
  const dateReady = mapping[2] === "Skip" || badRows.every(row => /^\d{4}-\d{2}-\d{2}$/.test(dates[row] ?? "") && Number.isFinite(Date.parse(dates[row]!)));
  const duplicate = mapping.some((target, index) => target !== "Skip" && mapping.indexOf(target) !== index);

  function finish() {
    if (readOnly || !dateReady || duplicate) return;
    try {
      const kept = columns.map((_, index) => index).filter(index => mapping[index] !== "Skip");
      if (!kept.length) throw new Error("Keep at least one column before bringing in records.");
      const input = { fileName: "matters.csv", mimeType: "text/csv", content:
        [kept.map(index => mapping[index]!), ...records.map((record, index) => kept.map(column => column === 2 && dates[index + 2] ? dates[index + 2]! : column === 3 && mapping[column] === "Stage" && record[column] === "sched." ? "scheduled" : record[column]!))]
          .map(row => row.map(value => `"${value.replace(/"/g, '""')}"`).join(",")).join("\n") };
      setSaved(createTracker(previewTrackerImport(input), { actorId: "preview-owner", title: "Matter tracker", trackerId: "1a000000-0000-4000-8000-000000000001" }));
      setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The preview could not be saved."); }
  }

  if (state === "loading") return <StPage><StHead title="Bring in matters.csv" /><div role="status">Reading the file…<StSkeleton width="80%" /><StSkeleton width="60%" /></div></StPage>;
  if (state === "denied" || state === "error") return <StPage><StHead title="Bring in matters.csv" /><div role="alert"><StNotice tone="critical">{state === "denied" ? "You need workspace membership to bring in records." : "The file could not be read. Choose your CSV again."}</StNotice></div><StEmpty>Nothing has been saved.</StEmpty></StPage>;
  if (state === "empty") return <StPage><StHead title="Bring in matters.csv" /><StEmpty>This file has no rows. Add records to your spreadsheet, then choose the CSV again.</StEmpty></StPage>;
  if (saved) return <StPage><StHead title={saved.title} meta={<><StState kind="draft">Preview only</StState> · <StMono>{saved.rows.length}</StMono> records</>} />
    <div role="status"><StNotice>The records are kept in this preview only. No email was sent and no reminder was enabled.</StNotice></div>
    <StSection title="Records" meta="First 8 shown"><StRows>{saved.rows.slice(0, 8).map(row => <StRow key={row.id} title={row.cells[saved.columns[0]!.id]?.value} detail={saved.columns.slice(1).map(column => row.cells[column.id]?.value).join(" · ")} />)}</StRows></StSection>
  </StPage>;

  return <StPage>
    <StHead title="Bring in matters.csv" crumb={{ label: "Matter tracker" }} meta={<><StMono>48</StMono> rows · <StMono>6</StMono> columns · nothing is saved until you finish</>} />
    {readOnly ? <StNotice>You have read-only access. You can inspect the file; bringing in records needs workspace membership.</StNotice> : null}
    <div>
      <div className={styles.header} aria-hidden="true"><span>Column in your file</span><span>First row</span><span>Becomes</span><span /></div>
      <StRows label="Column mapping">{columns.map((column, index) => <StRow key={column} title={<div className={styles.mapping}>
        <StMono>{column}</StMono><span className={styles.sample}>{index === 2 ? "9/14/2026" : records[0]![index]}</span>
        <SelectInput aria-label={`${column} becomes`} value={mapping[index]} disabled={readOnly} options={targets.map(target => ({ value: target, label: target }))} onChange={event => setMapping(current => current.map((value, field) => field === index ? event.target.value : value))} />
        <span className={index === 2 && !dateReady ? styles.issue : styles.sample}>{index === 2 && mapping[index] !== "Skip" ? "3 dates unreadable, shown below" : index === 3 && mapping[index] === "Stage" ? "5 values → 4 stages" : index === 5 ? "empty" : "48 filled"}</span>
      </div>} />)}</StRows>
    </div>
    {mapping[2] !== "Skip" ? <StSection title="Dates that need fixing" meta="Source rows from your file"><StRows>{badRows.map(row => <StRow key={row} title={<div className={styles.correction}><StMono>Row {row}</StMono><span className={styles.sample}>date to confirm</span><TextInput type="date" label={`Opened on for source row ${row}`} value={dates[row] ?? ""} disabled={readOnly} onChange={event => setDates(current => ({ ...current, [row]: event.target.value }))} /></div>} />)}</StRows></StSection> : null}
    <div className={styles.finish}>
      <div className={styles.recipient}><SelectInput label="When someone adds a matter, tell" aria-label="Person to tell when someone adds a matter" value={recipient} disabled={readOnly} options={[{ value: "Sheri, by email", label: "Sheri, by email" }, { value: "No one", label: "No one" }]} helperText="Preview choice only; no email is sent." onChange={event => setRecipient(event.target.value)} /></div>
      <div className={styles.actions}><span className={styles.sample}>{duplicate ? "Choose a different field for each column" : !dateReady ? "Fix the 3 dates first" : "Ready to bring in"}</span><StPill disabled={readOnly || !dateReady || duplicate} onClick={finish}>Bring in 48 matters</StPill></div>
    </div>
    {error ? <div role="alert"><StNotice tone="critical">{error}</StNotice></div> : null}
  </StPage>;
}
