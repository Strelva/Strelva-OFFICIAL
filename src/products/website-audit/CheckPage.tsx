"use client";

/**
 * The free check's one dominant object (XA B3/B4): the business's page as
 * the check reads it, with every fact and fix marked in place. Found facts
 * read quietly with a check; missing facts and fixes read clay, and fixes
 * carry the number the column refers to. While the check runs, the same
 * places show what is being looked for, so the page fills where it stands.
 */
import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { XaPage } from "@/components/ui/strelva/Xa";
import styles from "./check-page.module.css";

export interface CheckMark {
  id: string;
  label: string;
  detail?: string;
  /** `waiting`: before the check runs, what it will look for. */
  state: "found" | "missing" | "fix" | "reading" | "waiting";
  /** Fix number, matching the column ("Start here" is 1). */
  n?: number;
}

export function CheckPage({ address, title, source, facts, fixes, note, label }: {
  address: string; title: ReactNode;
  /** Where the marks came from, in words: "Read from harbordental.com", "From Gemini’s answer". */
  source: ReactNode;
  facts: readonly CheckMark[]; fixes?: readonly CheckMark[]; note?: ReactNode; label?: string;
}) {
  return <XaPage address={address} title={title} label={label ?? `${address}, as the check read it`}>
    <p className={styles.source}>{source}</p>
    {facts.length ? <ul className={styles.marks} aria-label="Facts on the page">{facts.map(mark => <Mark key={mark.id} mark={mark} />)}</ul> : null}
    {fixes?.length ? <ul className={styles.marks} data-fixes="true" aria-label="Fixes on the site">{fixes.map(mark => <Mark key={mark.id} mark={mark} />)}</ul> : null}
    {note ? <p className={styles.note}>{note}</p> : null}
  </XaPage>;
}

function Mark({ mark }: { mark: CheckMark }) {
  const word = mark.state === "found" ? "Found" : mark.state === "missing" ? "Missing" : mark.state === "reading" ? "Looking" : null;
  return <li className={styles.mark} data-state={mark.state}>
    <span className={styles.dot} aria-hidden="true">{mark.state === "found" ? <Check size={13} strokeWidth={2.4} /> : mark.state === "fix" ? mark.n : mark.state === "reading" ? <span className={styles.spin} /> : null}</span>
    <span className={styles.text}>
      <span className={styles.label}>{mark.state === "fix" && mark.n ? <span className={styles.srOnly}>Fix {mark.n}: </span> : null}{mark.label}{word ? <span className={styles.word}> · {word}</span> : null}</span>
      {mark.detail ? <span className={styles.detail}>{mark.detail}</span> : null}
    </span>
  </li>;
}
