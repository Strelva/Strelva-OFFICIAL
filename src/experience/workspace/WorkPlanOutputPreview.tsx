"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextArea, TextInput } from "@/components/ui/TextInput";
import { TRACKER_TEMPLATES } from "@/products/tracker/templates";
import type { WorkPlan, WorkPlanOutputExecution } from "@/products/work-plans/contracts";

type Props = {
  workspaceId: string;
  planWorkId: string;
  plan: WorkPlan;
  output: WorkPlan["proposedOutputs"][number];
  disabled?: boolean;
  completed?: WorkPlanOutputExecution;
};

export function WorkPlanOutputPreview({ workspaceId, planWorkId, plan, output, disabled, completed }: Props) {
  const draft = output.draft;
  const [title, setTitle] = useState(draft?.title ?? output.title);
  const [text, setText] = useState(draft?.kind === "document" ? draft.text : "");
  const [templateId, setTemplateId] = useState(draft?.kind === "tracker" ? draft.templateId : "tasks");
  const [execution, setExecution] = useState(completed);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const operationId = draft?.kind === "document" ? "create_document" : draft?.kind === "tracker" ? "create_tracker" : undefined;
  const allowed = Boolean(operationId && output.nativeOperationIds.includes(operationId));
  const needsDetails = plan.status !== "ready" || plan.neededInputs.some(input => input.required) || plan.requiredDecisions.length > 0;
  async function create() {
    if (!draft || !allowed || disabled || busy || needsDetails || execution) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/work-plans/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        workspaceId, planWorkId, outputId: output.id, expectedPlanRevision: plan.metadata.revision, operationId,
        inputs: draft.kind === "document" ? { title, text } : { title, templateId },
      }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The output could not be saved. Retry to check the same request.");
      setExecution(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The output could not be confirmed. Retry the same request."); }
    finally { setBusy(false); }
  }
  if (!draft || !allowed) return <p className="text-sm text-gray-muted">This part needs further preparation before it can run.</p>;
  if (execution) return <section className="mt-3 space-y-2 text-sm" aria-label="Creation receipt">
    <p role="status">{draft.kind === "document" ? "Private document" : "Tracker"} created in this workspace.</p>
    <p className="text-gray-muted">Created {new Date(execution.receipt.completedAt).toLocaleString()}. No message was sent or website published.</p>
    <a className="underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(execution.nativeWorkId)}`}>Open {draft.kind === "document" ? "document" : "tracker"}</a>
  </section>;
  const blocked = Boolean(disabled || busy || needsDetails);
  return <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); void create(); }} aria-busy={busy}>
    <h4 className="text-sm font-medium">Review and edit the draft</h4>
    <TextInput label={draft.kind === "document" ? "Document title" : "Tracker title"} value={title} maxLength={160} required disabled={blocked} onChange={event => setTitle(event.target.value)} />
    {draft.kind === "document" ? <TextArea label="Document draft" rows={10} value={text} maxLength={12000} disabled={blocked} onChange={event => setText(event.target.value)} /> : <>
      <label className="block text-sm">Starting fields<select className="mt-1 block w-full rounded border border-gray-border bg-white p-2" value={templateId} disabled={blocked} onChange={event => setTemplateId(event.target.value as typeof templateId)}>{TRACKER_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
      <p className="text-sm text-gray-muted">{TRACKER_TEMPLATES.find(template => template.id === templateId)?.fields.join(", ")}. Starts empty, with no invented records.</p>
    </>}
    {error ? <div className="space-y-2 text-sm"><p role="alert" className="text-critical">{error}</p><a className="underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(planWorkId)}`}>Reload the saved plan and its receipts</a></div> : null}
    {needsDetails ? <p className="text-sm text-gray-muted">Add the missing details and prepare a revised plan first.</p> : null}
    <Button type="submit" disabled={blocked || !title.trim()}>{busy ? "Saving…" : draft.kind === "document" ? "Create private document" : "Create this tracker"}</Button>
  </form>;
}
