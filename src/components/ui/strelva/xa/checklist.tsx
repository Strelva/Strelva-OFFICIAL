"use client";
/**
 * XA checklist: several answers from one short list, ticked in place.
 * Pen: XA · B2 "List" (what Strelva keeps for you) and XA · B4 "List" (what
 * Strelva found). One white surface, rows with an inset hairline, a moss
 * circle with a check when ticked. Native checkboxes underneath, so Space,
 * Tab and form semantics behave the way browsers already do.
 *
 * Added by lane XA-1. XaChoices is the one-answer version.
 */
import { useId, type ReactNode } from "react";
import { Check } from "lucide-react";
import styles from "./checklist.module.css";

export interface XaChecklistItem<T extends string> {
  value: T;
  /** The thing itself: "Take bookings", or a found value. */
  label: ReactNode;
  /** A small label above it, for found facts ("Hours"). */
  kicker?: ReactNode;
  /** One quiet line under it: where it came from, what it replaces. */
  detail?: ReactNode;
  /** Right-hand art or fact: a System tile, a source. Decorative unless it says something. */
  end?: ReactNode;
  /** Controls for this row that are not the tick ("Not right"). Kept outside the label. */
  actions?: ReactNode;
  disabled?: boolean;
  /** Accessible name when `label` alone is not enough. */
  ariaLabel?: string;
}

export function XaChecklist<T extends string>({ label, items, checked, onChange, hideLabel = false, listLabel }: {
  label: ReactNode;
  items: readonly XaChecklistItem<T>[];
  checked: ReadonlySet<T>;
  onChange: (value: T, checked: boolean) => void;
  hideLabel?: boolean;
  /** Names the list for assistive tech and tests ("Found facts"). */
  listLabel?: string;
}) {
  const id = useId();
  return <fieldset className={styles.checklist}>
    <legend className={hideLabel ? styles.srOnly : styles.legend}>{label}</legend>
    <ul className={styles.list} aria-label={listLabel}>
      {items.map(item => {
        const on = checked.has(item.value);
        const inputId = `${id}-${item.value}`;
        return <li key={item.value} className={styles.item} data-checked={on || undefined}>
          <label className={styles.row} htmlFor={inputId} data-disabled={item.disabled || undefined}>
            <input id={inputId} type="checkbox" className={styles.input} checked={on} disabled={item.disabled} aria-label={item.ariaLabel} onChange={event => onChange(item.value, event.target.checked)} />
            <span className={styles.circle} aria-hidden="true"><Check size={13} strokeWidth={2.6} /></span>
            <span className={styles.text}>
              {item.kicker ? <span className={styles.kicker}>{item.kicker}</span> : null}
              <span className={styles.label}>{item.label}</span>
              {item.detail ? <span className={styles.detail}>{item.detail}</span> : null}
            </span>
            {item.end ? <span className={styles.end}>{item.end}</span> : null}
          </label>
          {item.actions ? <div className={styles.actions}>{item.actions}</div> : null}
        </li>;
      })}
    </ul>
  </fieldset>;
}
