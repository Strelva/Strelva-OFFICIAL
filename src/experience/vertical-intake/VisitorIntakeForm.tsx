"use client";
/**
 * XA · E5, the patient form (October 15, 2026). Renders an office's real
 * `PublicIntakeForm` (its live Release: the fields, the insurance plans from
 * the business record, the triage rule) the way a patient meets it on a
 * phone: one question at a time down the page, one Send at the bottom.
 *
 * It checks answers with the same `validateIntakeAnswers` the server runs, so
 * the form never accepts what the door would refuse. Sending belongs to the
 * caller (`onSend`); without it the form is the owner's preview of what
 * patients see and cannot send. Clinical questions cannot appear: the
 * definition refuses them at load (contracts `FORBIDDEN_FIELD_PATTERN`).
 *
 * Colors come from the visitor stylesheet, which reads the office's own
 * --visitor-* variables first.
 */
import { useId, useState, type FormEvent } from "react";
import { validateIntakeAnswers, type PublicIntakeField, type PublicIntakeForm } from "@/products/vertical-intake/contracts";
import styles from "@/experience/bookings/visitor.module.css";
import own from "./visitor-intake.module.css";

export type IntakeSendResult = { ok: true; triage: "routine" | "urgent" } | { ok: false; message: string };

const telHref = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, "")}`;

export function VisitorIntakeForm({ form, onSend, initial, visitLine, initialState }: {
  form: PublicIntakeForm;
  /** Sends the checked answers. Absent: a preview that cannot send. */
  onSend?: (answers: Record<string, string>) => Promise<IntakeSendResult>;
  initial?: Record<string, string>;
  /** "For your visit on Wednesday, Nov 25 at 10:30 AM.", when a visit is already held. */
  visitLine?: string;
  /** Preview only: open in a later state. */
  initialState?: { sent?: "routine" | "urgent"; error?: string };
}) {
  const prefix = useId();
  const [values, setValues] = useState<Record<string, string>>(initial ?? {});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ fieldId: string | null; text: string } | null>(initialState?.error ? { fieldId: null, text: initialState.error } : null);
  const [sent, setSent] = useState<"routine" | "urgent" | null>(initialState?.sent ?? null);
  const hidden = (field: PublicIntakeField) => Boolean(field.shownWhen && field.shownWhen.notIn.includes(values[field.shownWhen.field] ?? ""));
  const set = (id: string, value: string) => setValues(current => ({ ...current, [id]: value }));
  const toggle = (id: string, option: string, on: boolean) => {
    const picked = (values[id] ?? "").split(",").filter(Boolean).filter(item => item !== option);
    set(id, (on ? [...picked, option] : picked).join(","));
  };
  const rule = form.triage.find(item => (values[item.field] ?? "").split(",").some(value => item.anyOf.includes(value)));
  const phone = form.office.phone;
  const office = form.office.name ?? "The office";

  if (sent) return <section className={own.form} aria-live="polite">
    <h1 className={styles.title}>{sent === "urgent" ? "Call the office now" : "Sent"}</h1>
    <p className={styles.intro} role="status">{sent === "urgent" ? form.thanks.urgent : form.thanks.routine}</p>
    {sent === "urgent" && phone ? <a className={`${styles.button} ${styles.block} ${own.call}`} href={telHref(phone)}>Call {phone}</a> : null}
    <p className={own.fine}>Only {office}&rsquo;s team sees what you sent.</p>
  </section>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !onSend) return;
    const shown: Record<string, string> = {};
    for (const field of form.fields) if (!hidden(field) && values[field.id]) shown[field.id] = values[field.id]!;
    const checked = validateIntakeAnswers(form, shown);
    if (!checked.ok) {
      const field = form.fields.find(item => checked.message.includes(item.label))
        ?? (/email/i.test(checked.message) ? form.fields.find(item => item.kind === "email") : /phone/i.test(checked.message) ? form.fields.find(item => item.kind === "phone") : undefined);
      setError({ fieldId: field?.id ?? null, text: checked.message });
      if (field) document.getElementById(`${prefix}-${field.id}`)?.focus();
      return;
    }
    setPending(true); setError(null);
    try {
      const result = await onSend(shown);
      if (result.ok) setSent(result.triage);
      else setError({ fieldId: null, text: result.message });
    } catch {
      setError({ fieldId: null, text: `That didn't send. Nothing was saved. Try again, or call ${phone ?? "the office"}.` });
    } finally { setPending(false); }
  }

  return <form className={own.form} onSubmit={event => void submit(event)} noValidate aria-describedby={`${prefix}-notice`}>
    <h1 className={styles.title}>{visitLine ? "Before your first visit" : form.title}</h1>
    <p className={styles.intro}>{visitLine ? `${visitLine} About three minutes.` : form.intro}</p>
    <p id={`${prefix}-notice`} className={own.hint}>{form.notice}</p>
    <div className={own.fields}>
      {form.fields.filter(field => !hidden(field)).map(field => {
        const id = `${prefix}-${field.id}`;
        const hintId = field.hint ? `${id}-hint` : undefined;
        const errorId = error?.fieldId === field.id ? `${id}-error` : undefined;
        const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
        const triageHere = rule && rule.field === field.id;
        return <div key={field.id} className={own.question}>
          {field.kind === "multi_choice" ? <fieldset className={styles.fieldset} aria-describedby={describedBy}>
            <legend className={own.label}>{field.label}{field.required ? null : <span className={own.optional}> Optional</span>}</legend>
            <div className={styles.choices}>{field.options?.map(option => {
              const on = (values[field.id] ?? "").split(",").includes(option.value);
              return <label key={option.value} className={styles.choice}><input type="checkbox" checked={on} onChange={event => toggle(field.id, option.value, event.target.checked)} /><span>{option.label}</span></label>;
            })}</div>
          </fieldset> : <>
            <label htmlFor={id} className={own.label}>{field.label.replace(/ \(optional\)$/i, "")}{field.required ? null : <span className={own.optional}> Optional</span>}</label>
            {field.kind === "choice" ? <select id={id} className={`${styles.input} ${own.select}`} value={values[field.id] ?? ""} required={field.required} aria-invalid={errorId ? true : undefined} aria-describedby={describedBy} onChange={event => set(field.id, event.target.value)}>
              <option value="" disabled>Choose one</option>
              {field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
              : field.kind === "textarea" ? <textarea id={id} className={`${styles.input} ${own.area}`} rows={3} maxLength={field.maxLength} value={values[field.id] ?? ""} aria-invalid={errorId ? true : undefined} aria-describedby={describedBy} onChange={event => set(field.id, event.target.value)} />
                : <input id={id} className={styles.input} type={field.kind === "email" ? "email" : field.kind === "phone" ? "tel" : "text"} inputMode={field.kind === "phone" ? "tel" : field.kind === "email" ? "email" : undefined} autoComplete={field.autocomplete ?? (field.sensitive ? "off" : undefined)} maxLength={field.maxLength} required={field.required} value={values[field.id] ?? ""} aria-invalid={errorId ? true : undefined} aria-describedby={describedBy} onChange={event => set(field.id, event.target.value)} />}
          </>}
          {field.hint ? <p id={hintId} className={own.hint}>{field.required ? field.hint : field.hint.replace(/^Optional\.\s*/, "")}</p> : null}
          {errorId ? <p id={errorId} className={own.fieldError} role="alert">{error!.text}</p> : null}
          {triageHere ? <div className={own.triage} role="note">
            <p className={own.triageTitle}>{rule.title}</p>
            <p>{rule.body}</p>
            {phone ? <a className={own.callLink} href={telHref(phone)}>Call {phone}</a> : null}
            <p className={own.hint}>{rule.emergencyNote}</p>
            <p className={own.hint}>{rule.afterSubmit}</p>
          </div> : null}
        </div>;
      })}
    </div>
    {error && !error.fieldId ? <p className={own.fieldError} role="alert">{error.text}</p> : null}
    <div className={own.send}>
      <button type="submit" className={`${styles.button} ${styles.block}`} disabled={!onSend || pending} aria-busy={pending || undefined}>{pending ? "Sending" : form.submitLabel}</button>
      <p className={own.fine}>{onSend ? `Only ${office}'s team sees this.` : "Preview. Patients send this from your website."}</p>
    </div>
  </form>;
}
