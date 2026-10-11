"use client";

import { useState, type ReactNode } from "react";
import { StLabel, StMono, StNotice, StSegmented, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import styles from "./possibility.module.css";

/** Comparison is presentation only. The caller retains all approval and refresh authority. */
export function PossibilityComparison({ title, live, candidate, livePath, candidatePath, staleReason, onRefresh, actions, scope }: {
  title: string; live: ReactNode; candidate: ReactNode; livePath?: string; candidatePath?: string;
  staleReason?: string; onRefresh?: () => void; actions?: ReactNode; scope?: ReactNode;
}) {
  const [mode, setMode] = useState<"both" | "live" | "candidate">("both");
  return <section className={styles.comparison} aria-label={`Compare ${title} with live`}>
    {staleReason ? <StNotice tone="need"><div className={styles.noticeLine}><span>{staleReason} Strelva refreshes this before it can become real.</span>{onRefresh ? <StTextButton onClick={onRefresh}>Refresh now</StTextButton> : null}</div></StNotice> : null}
    <div className={styles.phoneChoice}><StSegmented label="What to compare" value={mode} options={[{ value: "both", label: "Side by side" }, { value: "live", label: "Live today" }, { value: "candidate", label: "Possibility" }]} onChange={setMode} /></div>
    <div className={styles.compareGrid}>
      {mode !== "candidate" ? <div className={styles.preview}><StLabel><StState kind="live">Live today</StState>{livePath ? <> · <StMono>{livePath}</StMono></> : null}</StLabel><StSurface pad={false} label="Live today">{live}</StSurface></div> : null}
      {mode !== "live" ? <div className={styles.preview}><StLabel><StState kind="draft">With this Possibility</StState>{candidatePath ? <> · <StMono>{candidatePath}</StMono></> : null}</StLabel><StSurface pad={false} label="With this Possibility">{candidate}</StSurface></div> : null}
    </div>
    <div className={styles.footer}>{scope ? <span>{scope}</span> : null}<div className={styles.actions}>{actions}</div></div>
  </section>;
}
