"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput, TextArea, SelectInput } from "@/components/ui/TextInput";
import type { InquirySystemDetail } from "@/products/inquiries";

export function InquirySystemDetailView({ details, records }: { details: InquirySystemDetail[]; records?: ReactNode }) {
  return <><div className="grid gap-8 p-6">{details.map(detail => <section key={detail.site} aria-label={`Inquiry form on ${detail.site}`}>
    <h2 className="font-display text-lg font-medium">The form on {detail.site}</h2>
    <p className="mt-2 text-sm text-gray-muted" role="status">{detail.lifecycle === "live" ? "Live" : detail.lifecycle === "paused" ? "Paused" : "Draft"} · {detail.health}</p>
    {detail.lifecycle === "paused" ? <p className="mt-2 text-sm">New inquiries are kept. Replies and follow-ups are paused.</p> : null}
    {detail.unavailable ? null : detail.forms.length ? detail.forms.map(form => <form key={form.capabilityId} className="mt-6 grid max-w-xl gap-4" aria-label={`${form.form.title}, viewing copy`} onSubmit={event => event.preventDefault()}>
      <h3 className="font-display text-base font-medium">{form.form.title}</h3><p className="text-sm text-gray-muted">{form.form.intro}</p>
      <fieldset disabled className="grid gap-4"><legend className="mb-4 text-xs text-gray-muted">A viewing copy of the published form. Messages are sent from the site.</legend>{form.form.fields.map(field => <label key={field.id} className="grid gap-2 text-sm">{field.label}{field.required ? " (required)" : ""}
        {field.kind === "select" ? <SelectInput defaultValue="" options={[{ value: "", label: "Choose an option" }, ...(field.options ?? []).map(option => ({ value: option, label: option }))]} /> : field.kind === "textarea" ? <TextArea placeholder={field.placeholder} /> : <TextInput type={field.kind === "phone" ? "tel" : field.kind === "email" || field.kind === "date" ? field.kind : "text"} placeholder={field.placeholder} />}
      </label>)}</fieldset><p className="text-xs text-gray-muted">Handled by Strelva.</p>
    </form>) : <p className="mt-4 text-sm text-gray-muted">No published form is recorded here yet. Incoming site inquiries still appear below.</p>}
  </section>)}</div>{records}<div className="grid gap-8 p-6">{details.map(detail => <details key={detail.site} className="border-t border-gray-border pt-4"><summary className="min-h-12 cursor-pointer text-sm font-medium">Connections and History · {detail.site}</summary>
      <h3 className="mt-4 text-sm font-medium">Connections</h3><ul className="mt-3 grid gap-3 text-sm">{detail.connections.map(connection => <li key={connection.kind}><strong>{connection.kind} {connection.target}</strong><p className="mt-1 text-gray-muted">{connection.sentence}</p></li>)}</ul>
      <h3 className="mt-6 text-sm font-medium">History</h3>{detail.history.length ? <ul className="mt-3 grid gap-3 text-sm">{detail.history.map(row => <li key={row.id}><p>{row.sentence}</p><time className="text-xs text-gray-muted" dateTime={row.at}>{new Date(row.at).toLocaleDateString()}</time></li>)}</ul> : <p className="mt-3 text-sm text-gray-muted">No published changes are recorded yet.</p>}
    </details>)}</div></>;
}

/** Each business owns its fetch and state; stale responses are discarded on switching. */
export function InquirySystemDetails({ workspaceId, records }: { workspaceId: string; records?: ReactNode }) {
  const [state, setState] = useState<{ workspaceId: string; details?: InquirySystemDetail[]; failed?: boolean }>();
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/workspace/inquiries/system?workspaceId=${encodeURIComponent(workspaceId)}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
      .then(async response => {
        const result = await response.json() as { details?: InquirySystemDetail[] };
        if (!response.ok || !Array.isArray(result.details)) throw new Error("unavailable");
        if (!controller.signal.aborted) setState({ workspaceId, details: result.details });
      }).catch(() => { if (!controller.signal.aborted) setState({ workspaceId, failed: true }); });
    return () => controller.abort();
  }, [workspaceId, retry]);
  if (!state || state.workspaceId !== workspaceId) return <><p className="p-6 text-sm text-gray-muted" role="status">Opening the current form…</p>{records}</>;
  if (state.failed) return <><div className="p-6"><p role="status" className="mb-4 text-sm text-gray-muted">The form and its history couldn&apos;t load. Your inquiries are below.</p><Button variant="secondary" onClick={() => { setState(undefined); setRetry(value => value + 1); }}>Try again</Button></div>{records}</>;
  return <InquirySystemDetailView details={state.details ?? []} records={records} />;
}
