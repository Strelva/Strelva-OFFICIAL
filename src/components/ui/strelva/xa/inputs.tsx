"use client";
/**
 * XA inputs. Pen: L0 · Field (UzKBr), In · Field · Error (SZgyj),
 * L0 · Choice (jDLle) / selected (GCgEy), L0 · Door · chosen (XkDG8),
 * L0 · Segmented (qIVLf). Native controls underneath, so labels, errors,
 * keyboard and form submission behave the way browsers already do.
 */
import { forwardRef, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { Check } from "lucide-react";
import styles from "./xa.module.css";

/* ---------- Field ---------- */

type FieldBase = { label: ReactNode; hint?: ReactNode; error?: ReactNode };

export const XaField = forwardRef<HTMLInputElement, Omit<InputHTMLAttributes<HTMLInputElement>, "children"> & FieldBase>(function XaField({ label, hint, error, id: givenId, "aria-describedby": describedBy, ...props }, ref) {
  const generated = useId();
  const id = givenId || generated;
  const messageId = hint || error ? `${id}-message` : undefined;
  return <div className={styles.field}>
    <label htmlFor={id} className={styles.fieldLabel}>{label}</label>
    <input {...props} ref={ref} id={id} className={styles.fieldControl} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={[describedBy, messageId].filter(Boolean).join(" ") || undefined} />
    {messageId ? <p id={messageId} className={styles.fieldHint} data-error={error ? true : undefined} role={error ? "alert" : undefined}>{error || hint}</p> : null}
  </div>;
});

export const XaTextArea = forwardRef<HTMLTextAreaElement, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "children"> & FieldBase>(function XaTextArea({ label, hint, error, id: givenId, "aria-describedby": describedBy, ...props }, ref) {
  const generated = useId();
  const id = givenId || generated;
  const messageId = hint || error ? `${id}-message` : undefined;
  return <div className={styles.field}>
    <label htmlFor={id} className={styles.fieldLabel}>{label}</label>
    <textarea {...props} ref={ref} id={id} className={styles.fieldControl} aria-invalid={error ? true : props["aria-invalid"]} aria-describedby={[describedBy, messageId].filter(Boolean).join(" ") || undefined} />
    {messageId ? <p id={messageId} className={styles.fieldHint} data-error={error ? true : undefined} role={error ? "alert" : undefined}>{error || hint}</p> : null}
  </div>;
});

/* ---------- Choice and Door ---------- */

export interface XaOption<T extends string> { value: T; label: ReactNode; detail?: ReactNode; disabled?: boolean; art?: string }

/** One answer from a short list, as open rows with a ring on the chosen one (times, plans, hours). */
/**
 * One answer from a short list. `cards` (the default) frames each option;
 * `list` is a plain radio list with a hairline between rows, for a choice
 * that sits above other fields (XA · B2 "which business"), so the screen
 * never stacks cards on cards. `note` says once what holds for every option.
 */
export function XaChoices<T extends string>({ label, name, value, options, onChange, error, variant = "cards", note }: { label: ReactNode; name?: string; value: T | null; options: readonly XaOption<T>[]; onChange: (value: T) => void; error?: ReactNode; variant?: "cards" | "list"; note?: ReactNode }) {
  const generated = useId();
  const group = name || generated;
  return <fieldset className={styles.choices} data-variant={variant} aria-invalid={error ? true : undefined}>
    <legend className={styles.fieldLabel}>{label}</legend>
    {note ? <p className={styles.fieldHint}>{note}</p> : null}
    {options.map(option => <label key={option.value} className={styles.choice}>
      <input type="radio" name={group} value={option.value} checked={value === option.value} disabled={option.disabled} onChange={() => onChange(option.value)} />
      {variant === "list" ? <span className={styles.radio} aria-hidden="true" /> : null}
      <span className={styles.choiceText}><span>{option.label}</span>{option.detail ? <small>{option.detail}</small> : null}</span>
      {variant === "cards" ? <span className={styles.check} aria-hidden="true"><Check size={12} strokeWidth={2.6} /></span> : null}
    </label>)}
    {error ? <p className={styles.fieldHint} data-error="true" role="alert">{error}</p> : null}
  </fieldset>;
}

/** Two or three doors that change what happens next (a business or an agency). Each says what it leads to. */
export function XaDoors<T extends string>({ label, name, value, options, onChange }: { label: ReactNode; name?: string; value: T | null; options: readonly XaOption<T>[]; onChange: (value: T) => void }) {
  const generated = useId();
  const group = name || generated;
  return <fieldset className={styles.choices}>
    <legend className={styles.fieldLabel}>{label}</legend>
    {options.map(option => <label key={option.value} className={styles.door}>
      <input type="radio" name={group} value={option.value} checked={value === option.value} disabled={option.disabled} onChange={() => onChange(option.value)} />
      <span className={styles.radio} aria-hidden="true" />
      <span className={styles.doorText}><span className={styles.doorTitle}>{option.label}</span>{option.detail ? <span className={styles.doorDetail}>{option.detail}</span> : null}</span>
      {option.art ? <img className={styles.doorArt} src={option.art} alt="" /> : null}
    </label>)}
  </fieldset>;
}

/* ---------- Segmented ---------- */

/**
 * Two to four views of the same thing ("Your page now" / "After your yes").
 * The white thumb glides on Fast; arrow keys move between options.
 */
export function XaSegmented<T extends string>({ value, options, onChange, label, block = false }: { value: T; options: readonly { value: T; label: string; disabled?: boolean }[]; onChange: (value: T) => void; label: string; block?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState<{ x: number; width: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const node = track.current?.querySelector<HTMLElement>('[aria-checked="true"]');
      if (node) setThumb({ x: node.offsetLeft, width: node.offsetWidth });
    };
    measure();
    if (typeof ResizeObserver === "undefined" || !track.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(track.current);
    return () => observer.disconnect();
  }, [value, options.length]);
  const available = options.filter(option => !option.disabled);
  return <div ref={track} className={styles.segmented} data-block={block || undefined} role="radiogroup" aria-label={label}>
    {thumb ? <span className={styles.thumb} style={{ translate: `${thumb.x}px 0`, width: thumb.width }} aria-hidden="true" /> : null}
    {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={value === option.value} tabIndex={value === option.value ? 0 : -1} disabled={option.disabled} className={styles.segment}
      onClick={() => onChange(option.value)}
      onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key) || !available.length) return;
        event.preventDefault();
        const at = available.findIndex(candidate => candidate.value === option.value);
        const next = event.key === "Home" ? available[0] : event.key === "End" ? available[available.length - 1] : available[(at + (event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1) + available.length) % available.length];
        if (!next) return;
        onChange(next.value);
        track.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[options.indexOf(next)]?.focus();
      }}>{option.label}</button>)}
  </div>;
}
