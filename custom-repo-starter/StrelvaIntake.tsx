"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { isPublicIntakeForm, loadIntakeForm, submitIntake, type PublicIntakeField, type PublicIntakeForm } from "./intake-client";

const FALLBACK = "This form isn't available right now. Please call or email the office.";
const EMAIL = /^(?!\.)(?!.*\.\.)[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
const control = { display: "block", width: "100%", minHeight: "2.75rem", padding: ".65rem", font: "inherit", color: "inherit", background: "transparent", border: "1px solid currentColor", borderRadius: ".35rem", boxSizing: "border-box" as const };
const telHref = (phone: string) => `tel:${phone.replace(/[^0-9+]/g, "")}`;

/** The Strelva App form for a connected code site. The fields come from the office's live Release, not from this file. */
export function StrelvaIntake(props: { baseUrl: string; siteKey: string; appId: string; className?: string }) {
  return <IntakeLoader key={`${props.baseUrl}:${props.siteKey}:${props.appId}`} {...props} />;
}

function IntakeLoader({ baseUrl, siteKey, appId, className }: { baseUrl: string; siteKey: string; appId: string; className?: string }) {
  const [result, setResult] = useState<PublicIntakeForm | Error | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void loadIntakeForm(baseUrl, siteKey, appId, controller.signal).then(
      form => { if (!controller.signal.aborted) setResult(form); },
      (error: unknown) => { if (!controller.signal.aborted) setResult(error instanceof Error ? error : new Error(FALLBACK)); },
    );
    return () => controller.abort();
  }, [baseUrl, siteKey, appId]);
  // The wrapper renders on the server too. Its two markers are what Strelva's live-page check looks for.
  return <section data-strelva-app={appId} data-strelva-site={siteKey} aria-label="Request a visit" aria-busy={result === null} className={className}>
    {result instanceof Error ? <p role="alert">{result.message}</p> : result && isPublicIntakeForm(result) ? <IntakeForm form={result} baseUrl={baseUrl} siteKey={siteKey} appId={appId} /> : null}
  </section>;
}

function IntakeForm({ form, baseUrl, siteKey, appId }: { form: PublicIntakeForm; baseUrl: string; siteKey: string; appId: string }) {
  const prefix = useId();
  const [values, setValues] = useState<Record<string, string>>({});
  const [honeypot, setHoneypot] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ fieldId: string | null; text: string } | null>(null);
  const [done, setDone] = useState<"routine" | "urgent" | null>(null);
  const hidden = (field: PublicIntakeField) => Boolean(field.shownWhen && field.shownWhen.notIn.includes(values[field.shownWhen.field] ?? ""));
  const set = (id: string, value: string) => setValues(current => ({ ...current, [id]: value }));
  const toggle = (id: string, option: string, on: boolean) => {
    const picked = (values[id] ?? "").split(",").filter(Boolean).filter(item => item !== option);
    set(id, (on ? [...picked, option] : picked).join(","));
  };
  const rule = form.triage.find(item => (values[item.field] ?? "").split(",").some(value => item.anyOf.includes(value)));
  const phone = form.office.phone;
  const callLink = phone ? <a href={telHref(phone)} style={{ display: "inline-flex", minHeight: "2.75rem", alignItems: "center", fontWeight: 600 }}>Call the office: {phone}</a> : null;
  const call = callLink ? <p>{callLink}</p> : null;

  if (done) return <div><p role="status">{done === "urgent" ? form.thanks.urgent : form.thanks.routine}</p>{done === "urgent" ? call : null}</div>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const answers: Record<string, string> = {};
    for (const field of form.fields) {
      if (hidden(field)) continue;
      const value = (values[field.id] ?? "").trim();
      if (!value) {
        if (field.required) return setError({ fieldId: field.id, text: `Please answer: ${field.label}.` });
        continue;
      }
      if (field.kind === "email" && (value.length > 320 || !EMAIL.test(value))) return setError({ fieldId: field.id, text: "Enter a valid email address, or clear it and use your phone number." });
      if (field.kind === "phone" && !(/^\+?[0-9 ().-]{7,24}$/.test(value) && value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 15)) return setError({ fieldId: field.id, text: "Enter a valid phone number." });
      answers[field.id] = value;
    }
    setPending(true);
    setError(null);
    try {
      const sent = await submitIntake(baseUrl, siteKey, appId, answers, honeypot);
      setDone(sent.triage);
    } catch (failure) {
      setError({ fieldId: null, text: failure instanceof Error ? failure.message : "That didn't send. Please call the office." });
    } finally { setPending(false); }
  }

  return <form onSubmit={event => void submit(event)} noValidate aria-label={form.title}>
    <h2>{form.title}</h2>
    <p>{form.intro}</p>
    <p style={{ fontSize: ".85em", opacity: 0.8 }}>{form.notice}</p>
    <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: "1.5rem 0", display: "grid", gap: "1rem" }}>
      {form.fields.map(field => {
        if (hidden(field)) return null;
        const id = `${prefix}-${field.id}`;
        const label = `${field.label}${field.required ? " (required)" : ""}`;
        const invalid = error?.fieldId === field.id;
        const aria = { "aria-invalid": invalid || undefined, "aria-describedby": [field.hint ? `${id}-hint` : "", invalid ? `${prefix}-status` : ""].filter(Boolean).join(" ") || undefined };
        const hint = field.hint ? <p id={`${id}-hint`} style={{ margin: ".2rem 0 0", fontSize: ".85em", opacity: 0.8 }}>{field.hint}</p> : null;
        if (field.kind === "multi_choice" || (field.kind === "choice" && (field.options?.length ?? 0) <= 3)) {
          const multi = field.kind === "multi_choice";
          return <fieldset key={field.id} style={{ border: 0, padding: 0, margin: 0 }}><legend>{label}</legend>
            {field.options?.map(option => <label key={option.value} style={{ display: "flex", gap: ".5rem", alignItems: "center", minHeight: "2.75rem" }}>
              <input type={multi ? "checkbox" : "radio"} name={id} value={option.value} {...aria}
                checked={multi ? (values[field.id] ?? "").split(",").includes(option.value) : values[field.id] === option.value}
                onChange={event => multi ? toggle(field.id, option.value, event.target.checked) : set(field.id, option.value)} />{option.label}</label>)}
            {hint}</fieldset>;
        }
        return <div key={field.id}><label htmlFor={id}>{label}</label>
          {field.kind === "textarea" ? <textarea id={id} name={field.id} rows={4} maxLength={field.maxLength} style={control} value={values[field.id] ?? ""} onChange={event => set(field.id, event.target.value)} {...aria} />
            : field.kind === "choice" ? <select id={id} name={field.id} style={control} value={values[field.id] ?? ""} onChange={event => set(field.id, event.target.value)} {...aria}><option value="">Choose…</option>{field.options?.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
              : <input id={id} name={field.id} maxLength={field.maxLength} type={field.kind === "phone" ? "tel" : field.kind === "email" ? "email" : "text"} autoComplete={field.autocomplete ?? (field.sensitive ? "off" : undefined)} style={control} value={values[field.id] ?? ""} onChange={event => set(field.id, event.target.value)} {...aria} />}
          {hint}</div>;
      })}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: 1, height: 1, overflow: "hidden" }}><input name="_hp" tabIndex={-1} autoComplete="off" value={honeypot} onChange={event => setHoneypot(event.target.value)} /></div>
    </fieldset>
    {rule ? <div role="region" aria-label="Urgent care" style={{ padding: "1rem", border: "1px solid currentColor", borderRadius: ".35rem", margin: "0 0 1rem" }}>
      <h3>{rule.title}</h3><p>{rule.body}</p>{call}
      {form.office.openNow === false ? <p>The office is closed now. Calling plays their after-hours instructions.</p> : null}
      <p>{rule.emergencyNote}</p><p>{rule.afterSubmit}</p></div> : null}
    <button type="submit" disabled={pending} style={{ minHeight: "2.75rem", padding: ".65rem 1rem", font: "inherit" }}>{pending ? "Sending…" : form.submitLabel}</button>
    <p id={`${prefix}-status`} role={error ? "alert" : "status"}>{error?.text ?? ""}{error && !error.fieldId && callLink ? <> {callLink}</> : null}</p>
  </form>;
}
