"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui/TextInput";
import { TRACKER_TEMPLATES } from "@/products/tracker/client";
import type { WorkPlan, WorkPlanOutputExecution } from "@/products/work-plans/contracts";

type Props = {
  onOpenWork?: (workId: string, productId?: string) => void;
  workspaceId: string;
  planWorkId: string;
  plan: WorkPlan;
  output: WorkPlan["proposedOutputs"][number];
  disabled?: boolean;
  completed?: WorkPlanOutputExecution;
};

export function WorkPlanOutputPreview({ onOpenWork, workspaceId, planWorkId, plan, output, disabled, completed }: Props) {
  const draft = output.draft;
  const [title, setTitle] = useState(draft?.title ?? output.title);
  const [text, setText] = useState(draft?.kind === "document" ? draft.text : "");
  const [templateId, setTemplateId] = useState(draft?.kind === "tracker" ? draft.templateId : "tasks");
  const [execution, setExecution] = useState(completed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const operationId = draft?.kind === "document" ? "create_document" : draft?.kind === "tracker" ? "create_tracker" : draft?.kind === "application" ? "create_application" : undefined;
  const allowed = Boolean(operationId && output.nativeOperationIds.includes(operationId));
  const needsDetails = plan.status !== "ready" || plan.neededInputs.some(input => input.required) || plan.requiredDecisions.length > 0;
  async function create() {
    if (!draft || !allowed || disabled || busy || needsDetails || execution) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/work-plans/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        workspaceId, planWorkId, outputId: output.id, expectedPlanRevision: plan.metadata.revision, operationId,
        inputs: draft.kind === "document" ? { title, text } : draft.kind === "application" ? { title, fields: draft.fields, components: draft.components } : { title, templateId },
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The output could not be saved. Retry to check the same request.");
      setExecution(result);
      // Application creation already required an explicit reviewed action. Use
      // its authoritative receipt to enter the new app before a concurrent
      // workspace refresh can replace this plan with a pre-receipt snapshot.
      if (draft.kind === "application" && onOpenWork) onOpenWork(result.nativeWorkId, result.nativeProductId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The output could not be confirmed. Retry the same request."); }
    finally { setBusy(false); }
  }
  if (!draft || !allowed) return <p className="text-sm text-gray-muted">This part needs further preparation before it can run.</p>;
  const resultName = draft.kind === "document" ? "document" : draft.kind === "application" ? "app" : "tracker";
  if (execution) return <section className="mt-3 space-y-2 text-sm" aria-label="Creation receipt">
    <p role="status">{draft.kind === "document" ? "Private document" : draft.kind === "application" ? "Application" : "Tracker"} created in this workspace.</p>
    <p className="text-gray-muted">Created {new Date(execution.receipt.completedAt).toLocaleString()}.{draft.kind === "application" ? " Open it to review and publish when ready." : " No message was sent or website published."}</p>
    {onOpenWork ? <Button type="button" onClick={() => onOpenWork(execution.nativeWorkId, execution.nativeProductId)}>Open {resultName}</Button> : <a className="underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(execution.nativeWorkId)}`}>Open {resultName}</a>}
  </section>;
  const blocked = Boolean(disabled || busy || needsDetails);
  return <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); void create(); }} aria-busy={busy}>
    <h4 className="text-sm font-medium">{draft.kind === "application" ? "Review the application" : "Review and edit the draft"}</h4>
    <TextInput label={draft.kind === "document" ? "Document title" : draft.kind === "application" ? "App name" : "Tracker title"} value={title} maxLength={160} required disabled={blocked} onChange={event => setTitle(event.target.value)} />
    {draft.kind === "document" ? <TextArea label="Document draft" rows={10} value={text} maxLength={12000} disabled={blocked} onChange={event => setText(event.target.value)} /> : draft.kind === "application" ? <section className="space-y-3 text-sm" aria-label="Proposed app">
      <h5 className="font-medium">Information it will keep</h5><dl className="space-y-2">{draft.fields.map(field => <div key={field.id} className="flex flex-wrap justify-between gap-3 border-b border-gray-border py-2"><dt>{field.label}</dt><dd className="text-gray-muted">{field.type === "boolean" ? "Yes or no" : field.type === "number" ? "Number" : field.type === "select" ? `Choose one${field.options?.length ? `: ${field.options.join(", ")}` : ""}` : "Text"}{field.required ? " · Required" : ""}</dd></div>)}</dl>
      <p className="text-gray-muted">People can {draft.components.map(component => component.kind === "form" ? "add records" : component.kind === "list" ? "browse records" : component.kind === "detail" ? "inspect a record" : "read a record as a document").join(", ")}.</p>
      <p className="text-gray-muted">Starts with no records. Review it in your business before publishing and giving people access.</p>
    </section> : <>
      <label className="block text-sm">Starting fields<select className="mt-1 block w-full rounded border border-gray-border bg-surface p-2" value={templateId} disabled={blocked} onChange={event => setTemplateId(event.target.value as typeof templateId)}>{TRACKER_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
      <p className="text-sm text-gray-muted">{TRACKER_TEMPLATES.find(template => template.id === templateId)?.fields.join(", ")}. Starts empty, with no invented records.</p>
    </>}
    {error ? <div className="space-y-2 text-sm"><p role="alert" className="text-critical">{error}</p><a className="underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(planWorkId)}`}>Reload the saved plan and its receipts</a></div> : null}
    {needsDetails ? <p className="text-sm text-gray-muted">Add the missing details and prepare a revised plan first.</p> : null}
    <Button type="submit" disabled={blocked || !title.trim()}>{busy ? "Saving…" : draft.kind === "document" ? "Create private document" : draft.kind === "application" ? "Create application" : "Create this tracker"}</Button>
  </form>;
}
