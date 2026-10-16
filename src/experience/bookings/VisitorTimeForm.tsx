"use client";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import styles from "./visitor.module.css";

/**
 * The one form a visitor uses to pick a time (XA · E4): the times, then the
 * time they picked said back in words, then one button. The browser's own
 * "Please select one of these options" bubble never appears: the form is
 * `noValidate`, and an empty submit says so in a sentence beside the button
 * and moves focus to the first time. Without JavaScript the post still goes,
 * and the action route answers an empty pick with the same sentence.
 *
 * Each choice carries `data-picked`, the words said back ("Tuesday, Nov 24
 * at 9:15 AM"). Nothing here preselects a time; a choice the page checks
 * ahead (the time the visitor tapped in their email) is said back on load.
 */
export function VisitorTimeForm({ action, name, submitLabel, children, hiddenFields, emptyMessage = "Pick a time first. Nothing is requested until you do.", tone = "primary", sticky = false, className }: {
  action: string;
  /** The radio group's name the form must carry. */
  name: string;
  submitLabel: string;
  children: ReactNode;
  hiddenFields?: Record<string, string>;
  emptyMessage?: string;
  tone?: "primary" | "plain";
  /** On a phone the button rides at the bottom of the screen while the times scroll. */
  sticky?: boolean;
  className?: string;
}) {
  const id = useId();
  const [picked, setPicked] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const field = (form: HTMLFormElement) => Array.from(form.querySelectorAll<HTMLInputElement>("input[type=radio]")).filter(input => input.name === name);

  useEffect(() => {
    const checked = form.current ? field(form.current).find(input => input.checked) : undefined;
    if (checked) setPicked(checked.dataset.picked || checked.getAttribute("aria-label"));
    // Only the page's first render can carry a checked time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function change(event: FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement;
    if (target.type !== "radio" || target.name !== name || !target.checked) return;
    setPicked(target.dataset.picked || target.getAttribute("aria-label"));
    setMissing(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    const choices = field(event.currentTarget);
    if (choices.some(input => input.checked)) return;
    event.preventDefault();
    setMissing(true);
    choices[0]?.focus();
  }

  return <form ref={form} action={action} method="post" noValidate onChange={change} onSubmit={submit} className={className} aria-describedby={missing ? `${id}-missing` : undefined}>
    {hiddenFields ? Object.entries(hiddenFields).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />) : null}
    {children}
    <div className={`${styles.submitRow} ${sticky ? styles.sticky : ""}`}>
      <p className={styles.picked} aria-live="polite">{picked ? <>You picked <b>{picked}</b>.</> : null}</p>
      {missing ? <p id={`${id}-missing`} className={styles.missing} role="alert">{emptyMessage}</p> : null}
      <button type="submit" {...(tone === "primary" ? { "data-xa-primary": true } : {})} className={`${styles.button} ${styles.block}`}>{submitLabel}</button>
    </div>
  </form>;
}
