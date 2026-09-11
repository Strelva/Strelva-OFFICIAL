"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { isPublicInquiryForm, loadInquiryForm, submitInquiryForm, type PublicInquiryForm } from "./inquiry-client";

type ConnectedProps = { baseUrl: string; tenant: string; capabilityId: string };

/** Client-site entry. Changing business or capability discards the old form. */
export function StrelvaConnectedInquiryForm(props: ConnectedProps) {
  return <InquiryFormLoader key={`${props.baseUrl}:${props.tenant}:${props.capabilityId}`} {...props} />;
}

function InquiryFormLoader({ baseUrl, tenant, capabilityId }: ConnectedProps) {
  const [result, setResult] = useState<PublicInquiryForm | Error | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void loadInquiryForm(baseUrl, tenant, capabilityId, controller.signal).then(
      (definition) => { if (!controller.signal.aborted) setResult(definition); },
      (error: unknown) => { if (!controller.signal.aborted) setResult(error instanceof Error ? error : new Error("This form is unavailable.")); },
    );
    return () => controller.abort();
  }, [baseUrl, tenant, capabilityId]);
  if (result === null) return <p role="status">Loading inquiry form…</p>;
  if (result instanceof Error) return <p role="alert">{result.message}</p>;
  return <StrelvaInquiryForm definition={result} onSubmit={(fields) => submitInquiryForm(baseUrl, tenant, result, fields)} />;
}

/** Fixed renderer shared by the owner preview and client-site inquiry surface. */
export function StrelvaInquiryForm({ definition, onSubmit, submitLabel = "Send request" }: {
  definition: PublicInquiryForm;
  onSubmit?: (fields: Record<string, string>) => Promise<void>;
  submitLabel?: string;
}) {
  const prefix = useId();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  if (!isPublicInquiryForm(definition)) return <p role="alert">This inquiry form is unavailable.</p>;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onSubmit || pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const fields = Object.fromEntries(definition.form.fields.map((field) => [field.id, String(data.get(field.id) ?? "").trim()]));
    setPending(true);
    setStatus(null);
    try {
      await onSubmit(fields);
      setStatus({ kind: "success", text: "Your request has been received." });
      form.reset();
    } catch (error) {
      setStatus({ kind: "error", text: error instanceof Error ? error.message : "Your request was not confirmed. Please try again." });
    } finally { setPending(false); }
  }

  return <form onSubmit={(event) => void submit(event)} aria-label={definition.form.title}>
    <h2>{definition.form.title}</h2>
    <p>{definition.form.intro}</p>
    <fieldset disabled={pending} style={{ border: 0, padding: 0, margin: "1.5rem 0", display: "grid", gap: "1rem" }}>
      {definition.form.fields.map((field) => {
        const id = `${prefix}-${field.id}`;
        const shared = { id, name: field.id, required: field.required, placeholder: field.placeholder, style: { display: "block", width: "100%", minHeight: "2.75rem", padding: ".65rem", font: "inherit", color: "inherit", background: "transparent", border: "1px solid currentColor", borderRadius: ".35rem", boxSizing: "border-box" as const } };
        return <div key={field.id}><label htmlFor={id}>{field.label}{field.required ? " (required)" : ""}</label>
          {field.kind === "textarea" ? <textarea {...shared} maxLength={5000} rows={4} />
            : field.kind === "select" ? <select {...shared} defaultValue=""><option value="">Choose an option</option>{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select>
              : <input {...shared} maxLength={field.kind === "email" ? 320 : 500} type={field.kind === "phone" ? "tel" : field.kind} />}
        </div>;
      })}
    </fieldset>
    <p>Strelva helps this business handle your request.</p>
    {onSubmit ? <button type="submit" disabled={pending} style={{ minHeight: "2.75rem", padding: ".65rem 1rem", font: "inherit" }}>{pending ? "Sending…" : submitLabel}</button> : <p>Preview only. This form does not send a request.</p>}
    {status ? <p role={status.kind === "error" ? "alert" : "status"}>{status.text}</p> : null}
  </form>;
}
