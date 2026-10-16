"use client";
/**
 * The agency's one composer, docked in the frame's composer row. Every agency
 * place that asks Strelva about its clients renders this, so the composer is
 * the same everywhere: same field, same column, no "+" it can't act on. On the
 * clients table (`column="every"`) it starts and ends where the table does.
 */
import { XaComposer, XaComposerDock } from "@/components/ui/strelva/Xa";
import styles from "./agency-xa.module.css";

export function AgencyAskDock({ agencyName, value, onChange, onSubmit, column = "column" }: {
  agencyName: string; value: string; onChange: (value: string) => void; onSubmit: () => void;
  /** Which page column the composer lines up with: the Queue and Home column, or the clients table. */
  column?: "column" | "every";
}) {
  return <XaComposerDock><div className={column === "every" ? styles.everyDock : styles.columnDock}>
    <XaComposer value={value} onChange={onChange} onSubmit={onSubmit} placeholder="Ask Strelva about any client" inputLabel={`Ask Strelva about ${agencyName}'s clients`} />
  </div></XaComposerDock>;
}
