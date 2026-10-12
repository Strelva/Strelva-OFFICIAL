"use client";

import { useId } from "react";
import Link from "next/link";
import styles from "./choice-cards.module.css";

export type StChoiceOption<T extends string> = { value: T; label: string; detail: string };

/** Native radio semantics, with a full-card target and the kit's selected state. */
export function StChoiceCards<T extends string>({ label, value, options, onChange, disabled = false }: {
  label: string;
  value: T;
  options: readonly StChoiceOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const name = useId();
  return <fieldset className={styles.group} disabled={disabled}>
    <legend className={styles.legend}>{label}</legend>
    {options.map(option => <label key={option.value} className={styles.card} data-selected={value === option.value || undefined}>
      <input className={styles.input} type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />
      <span className={styles.mark} aria-hidden="true" />
      <span><span className={styles.title}>{option.label}</span><span className={styles.detail}>{option.detail}</span></span>
    </label>)}
  </fieldset>;
}

/** The same choice card for route-backed account-type selection. */
export function StChoiceLink({ href, label, detail, selected }: { href: string; label: string; detail: string; selected?: boolean }) {
  return <Link href={href} className={styles.card} data-selected={selected || undefined} aria-current={selected ? "page" : undefined}>
    <span className={styles.mark} aria-hidden="true" />
    <span><span className={styles.title}>{label}</span><span className={styles.detail}>{detail}</span></span>
  </Link>;
}
