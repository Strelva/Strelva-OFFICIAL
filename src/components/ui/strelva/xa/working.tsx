"use client";
/**
 * Strelva at work. Pen: LX · Working (rYq00); motion moment "Ask Strelva,
 * streamed" (design/motion/xa-motion, sguEC).
 *
 * The title stays still while work runs (no shimmer: the pulse dot and the
 * real step text carry it); each step appears when it really
 * starts (Base, rising 8 px); done steps settle to gray with a check.
 * Steps are the caller's real progress events, never timers.
 */
import type { CSSProperties, ReactNode } from "react";
import { Check, X } from "lucide-react";
import styles from "./xa.module.css";

export interface XaWorkingStep { id?: string; label: ReactNode; state: "done" | "active" | "pending" | "failed" }

export function XaWorking({ title, steps, state = "working" }: { title: ReactNode; steps: readonly XaWorkingStep[]; state?: "working" | "done" | "failed" }) {
  const shown = steps.filter(step => step.state !== "pending");
  return <div className={styles.working} data-state={state} role="status" aria-live="polite">
    <p className={styles.workingHead}><span className={styles.pulse} aria-hidden="true" /><span>{title}</span></p>
    {shown.length ? <ol className={styles.trail}>
      {shown.map((step, index) => <li key={step.id ?? index} className={styles.trailStep} data-state={step.state}>
        <span className={styles.trailMark} aria-hidden="true">{step.state === "done" ? <Check size={15} strokeWidth={2.2} /> : step.state === "failed" ? <X size={15} strokeWidth={2.2} /> : <span className={styles.spinner} />}</span>
        <span>{step.label}<span className={styles.srOnly}>{step.state === "done" ? ", done" : step.state === "failed" ? ", did not finish" : ", in progress"}</span></span>
      </li>)}
    </ol> : null}
  </div>;
}

/**
 * A reply that streams in word by word at --motion-word (28 ms). The full
 * text is read once by assistive tech; the visible words are decorative.
 * Re-keys on `text` so a new reply streams from the start.
 */
export function XaStream({ text, as: Tag = "p", className }: { text: string; as?: "p" | "span" | "div"; className?: string }) {
  const words = text.split(/(\s+)/);
  let index = 0;
  return <Tag className={`${styles.stream}${className ? ` ${className}` : ""}`}>
    <span className={styles.srOnly}>{text}</span>
    <span aria-hidden="true" key={text}>{words.map((word, position) => /^\s+$/.test(word) ? word : <span key={position} className={styles.word} style={{ "--w": index++ } as CSSProperties}>{word}</span>)}</span>
  </Tag>;
}
