"use client";
import { actorLabel } from "@/platform/presentation/actor";
import { useEffect, useState, type ReactNode } from "react";
import { StPage, StSection, StRows, StRow, StState, StSurface, StNotice, StEmpty, StSkeleton, StPill, StMono } from "@/components/ui/strelva/Kit";
import { TextInput, TextArea, SelectInput } from "@/components/ui/TextInput";
import type { InquirySystemDetail } from "@/products/inquiries";

export function InquirySystemDetailView({ details, records }: { details: InquirySystemDetail[]; records?: ReactNode }) {
  return <StPage>
    <>{details.map(detail => <StSection key={detail.site} title={`The form on ${detail.site}`}>
      <p className="flex flex-wrap gap-2 text-sm text-gray-muted" role="status">{detail.formSource ? null : <StState kind={detail.lifecycle === "live" ? "live" : "draft"}>{detail.lifecycle === "live" ? "Live" : detail.lifecycle === "paused" ? "Paused" : "Draft"}</StState>}{detail.health}</p>
      {detail.lifecycle === "paused" ? <StNotice>New inquiries are kept. Replies and follow-ups are paused.</StNotice> : null}
      {detail.formSource || detail.unavailable ? null : detail.forms.length ? detail.forms.map(form => <StSurface key={form.capabilityId} label={form.form.title}>
        <form className="grid gap-4" aria-label={`${form.form.title}, viewing copy`} onSubmit={event => event.preventDefault()}>
          <h3 className="text-base font-medium">{form.form.title}</h3><p className="text-sm text-gray-muted">{form.form.intro}</p>
          <fieldset disabled className="grid gap-4"><legend className="mb-4 text-xs text-gray-muted">A viewing copy of the published form. Messages are sent from the site.</legend>{form.form.fields.map(field => <label key={field.id} className="grid gap-2 text-sm">{field.label}{field.required ? " (required)" : ""}
            {field.kind === "select" ? <SelectInput defaultValue="" options={[{ value: "", label: "Choose an option" }, ...(field.options ?? []).map(option => ({ value: option, label: option }))]} /> : field.kind === "textarea" ? <TextArea placeholder={field.placeholder} /> : <TextInput type={field.kind === "phone" ? "tel" : field.kind === "email" || field.kind === "date" ? field.kind : "text"} placeholder={field.placeholder} />}
          </label>)}</fieldset><p className="text-xs text-gray-muted">{detail.handlerActors?.[form.capabilityId] ? `Handled by ${actorLabel(detail.handlerActors[form.capabilityId])}.` : actorLabel(null)}</p>
        </form>
      </StSurface>) : <StEmpty>No published form is recorded here yet. Incoming site inquiries still appear below.</StEmpty>}
    </StSection>)}</>
    {records}
    <>{details.map(detail => <details key={detail.site} className="border-t border-gray-border pt-4">
      <summary className="min-h-12 cursor-pointer text-sm font-medium">Connections and History · {detail.site}</summary>
      <div className="grid gap-6 pt-4"><StSection title="Connections"><StRows>{detail.connections.map(connection => <StRow key={`${connection.kind}:${connection.target}`} kind={connection.kind} title={connection.target} detail={connection.sentence} />)}</StRows></StSection>
      <StSection title="History">{detail.history.length ? <StRows>{detail.history.map(row => <StRow key={row.id} title={row.sentence} detail={actorLabel(row.actor)} end={<StMono as="time" dateTime={row.at}>{new Date(row.at).toLocaleDateString()}</StMono>} />)}</StRows> : <StEmpty>{detail.formSource ? "The form’s change history is unavailable here." : "No published changes are recorded yet."}</StEmpty>}</StSection></div>
    </details>)}</>
  </StPage>;
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
  if (!state || state.workspaceId !== workspaceId) return <><StPage><StSkeleton label="Opening the current form" /><p role="status" className="text-sm text-gray-muted">Opening the current form…</p></StPage>{records}</>;
  if (state.failed) return <><StPage><StNotice tone="critical">The form and its history couldn&apos;t load. Your inquiries are below.</StNotice><StPill variant="soft" onClick={() => { setState(undefined); setRetry(value => value + 1); }}>Try again</StPill></StPage>{records}</>;
  return <InquirySystemDetailView details={state.details ?? []} records={records} />;
}
