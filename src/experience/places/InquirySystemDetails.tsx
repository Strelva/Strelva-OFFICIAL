"use client";
import { actorLabel, actorPresentation } from "@/platform/presentation/actor";
import { useEffect, useState, type ReactNode } from "react";
import { StPage, StSection, StRows, StRow, StState, StNotice, StEmpty, StSkeleton, StPill, StMono } from "@/components/ui/strelva/Kit";
import { XaPage } from "@/components/ui/strelva/Xa";
import { TextInput, TextArea, SelectInput } from "@/components/ui/TextInput";
import type { InquirySystemDetail } from "@/products/inquiries";

/** One form as visitors see it, inside its page frame. A read-only viewing copy; nothing is sent from here. */
function FormPage({ detail, form }: { detail: InquirySystemDetail; form: InquirySystemDetail["forms"][number] }) {
  const handler = detail.handlerActors?.[form.capabilityId];
  return <XaPage flat address={detail.site} label={form.form.title}>
    <form className="grid gap-4" aria-label={`${form.form.title}, viewing copy`} onSubmit={event => event.preventDefault()}>
      <h3 className="text-lg font-semibold">{form.form.title}</h3><p className="text-sm text-gray-muted">{form.form.intro}</p>
      <fieldset disabled className="grid gap-4"><legend className="sr-only">A viewing copy of this form. Nothing is sent from here.</legend>{form.form.fields.map(field => <label key={field.id} className="grid gap-2 text-sm">{field.label}{field.required ? " (required)" : ""}
        {field.kind === "select" ? <SelectInput defaultValue="" options={[{ value: "", label: "Choose an option" }, ...(field.options ?? []).map(option => ({ value: option, label: option }))]} /> : field.kind === "textarea" ? <TextArea placeholder={field.placeholder} /> : <TextInput type={field.kind === "phone" ? "tel" : field.kind === "email" || field.kind === "date" ? field.kind : "text"} placeholder={field.placeholder} />}
      </label>)}</fieldset>
      {/* Who handles answers, only when recorded: an unknown actor is never shown to an owner as a phrase. */}
      {actorPresentation(handler).name ? <p className="text-xs text-gray-muted">Handled by {actorLabel(handler)}.</p> : null}
    </form>
  </XaPage>;
}

export function InquirySystemDetailView({ details, records, formOnly = false }: { details: InquirySystemDetail[]; records?: ReactNode; /** Only the form page itself, as a Draft decision holds it (XA · S4). */ formOnly?: boolean }) {
  if (formOnly) return <>{details.map(detail => detail.formSource || detail.unavailable ? null : detail.forms.length ? detail.forms.map(form => <FormPage key={form.capabilityId} detail={detail} form={form} />)
    : <p key={detail.site} className="text-sm text-gray-muted">No form is recorded on {detail.site} yet.</p>)}</>;
  return <StPage>
    <>{details.map(detail => <StSection key={detail.site} title={`The form on ${detail.site}`}>
      <p className="flex flex-wrap gap-2 text-sm text-gray-muted" role="status">{detail.formSource ? null : <StState kind={detail.lifecycle === "live" ? "live" : "draft"}>{detail.lifecycle === "live" ? "Live" : detail.lifecycle === "paused" ? "Paused" : "Draft"}</StState>}{detail.health}</p>
      {detail.lifecycle === "paused" ? <StNotice>New inquiries are kept. Replies and follow-ups are paused.</StNotice> : null}
      {detail.formSource || detail.unavailable ? null : detail.forms.length ? detail.forms.map(form => <FormPage key={form.capabilityId} detail={detail} form={form} />) : <StEmpty>No published form is recorded here yet. Incoming site inquiries still appear below.</StEmpty>}
    </StSection>)}</>
    {records}
    <>{details.map(detail => <details key={detail.site} className="border-t border-gray-border pt-4">
      <summary className="min-h-12 cursor-pointer text-sm font-medium">Connections and History · {detail.site}</summary>
      <div className="grid gap-6 pt-4"><StSection title="Connections"><StRows>{detail.connections.map(connection => <StRow key={`${connection.kind}:${connection.target}`} kind={connection.kind} title={connection.target} detail={connection.sentence} />)}</StRows></StSection>
      <StSection title="History">{detail.history.length ? <StRows>{detail.history.map(row => <StRow key={row.id} title={row.sentence} detail={actorPresentation(row.actor).name ? actorLabel(row.actor) : undefined} end={<StMono as="time" dateTime={row.at}>{new Date(row.at).toLocaleDateString()}</StMono>} />)}</StRows> : <StEmpty>{detail.formSource ? "The form’s change history is unavailable here." : "No published changes are recorded yet."}</StEmpty>}</StSection></div>
    </details>)}</>
  </StPage>;
}

/** Each business owns its fetch and state; stale responses are discarded on switching. */
export function InquirySystemDetails({ workspaceId, records, formOnly = false }: { workspaceId: string; records?: ReactNode; formOnly?: boolean }) {
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
  if (formOnly && (!state || state.workspaceId !== workspaceId)) return <StSkeleton label="Opening the form" />;
  if (formOnly && state?.failed) return <p role="alert" className="text-sm">The form couldn&apos;t be read just now. <button type="button" className="underline" onClick={() => { setState(undefined); setRetry(value => value + 1); }}>Reload</button></p>;
  if (formOnly) return <InquirySystemDetailView details={state?.details ?? []} formOnly />;
  if (!state || state.workspaceId !== workspaceId) return <><StPage><StSkeleton label="Opening the current form" /><p role="status" className="text-sm text-gray-muted">Opening the current form…</p></StPage>{records}</>;
  if (state.failed) return <><StPage><StNotice tone="critical">The form and its history couldn&apos;t load. Your inquiries are below.</StNotice><StPill variant="soft" onClick={() => { setState(undefined); setRetry(value => value + 1); }}>Try again</StPill></StPage>{records}</>;
  return <InquirySystemDetailView details={state.details ?? []} records={records} />;
}
