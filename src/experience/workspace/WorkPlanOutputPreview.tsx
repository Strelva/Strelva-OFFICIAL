"use client";

import { useRef, useState } from "react";
import { ApplicationDraftEditor } from "@/experience/applications/ApplicationDraftEditor";
import { ApplicationDraftPreview } from "@/experience/applications/ApplicationDraftPreview";
import { validateApplicationDraft, type ApplicationDraftSpec } from "@/experience/applications/app-templates";
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
  const [application, setApplication] = useState<ApplicationDraftSpec | null>(() => draft?.kind === "application" ? { title: draft.title, fields: structuredClone(draft.fields), components: structuredClone(draft.components) } : null);
  const [attemptLocked, setAttemptLocked] = useState(false);
  const attempt = useRef<Record<string, unknown> | null>(null);
  const submitting = useRef(false);
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
    if (!draft || !allowed || disabled || submitting.current || needsDetails || execution || (application && validateApplicationDraft(application))) return;
    submitting.current = true;
    setAttemptLocked(true);
    setBusy(true); setError("");
    try {
      attempt.current ??= {
        workspaceId, planWorkId, outputId: output.id, expectedPlanRevision: plan.metadata.revision, operationId,
        inputs: draft.kind === "document" ? { title, text } : draft.kind === "application" ? application : { title, templateId },
      };
      const response = await fetch("/api/work-plans/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(attempt.current) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The output could not be saved. Retry to check the same request.");
      setExecution(result);
      // Application creation already required an explicit reviewed action. Use
      // its authoritative receipt to enter the new app before a concurrent
      // workspace refresh can replace this plan with a pre-receipt snapshot.
      if (draft.kind === "application" && onOpenWork) onOpenWork(result.nativeWorkId, result.nativeProductId);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The output could not be confirmed. Retry the same request."); }
    finally { submitting.current = false; setBusy(false); }
  }
  if (!draft || !allowed) return <p className="text-sm text-gray-muted">This part needs further preparation before it can run.</p>;
  const resultName = draft.kind === "document" ? "document" : draft.kind === "application" ? "app" : "tracker";
  if (execution) return <section className="mt-3 space-y-2 text-sm" aria-label="Creation receipt">
    <p role="status">{draft.kind === "document" ? "Private document" : draft.kind === "application" ? "Application" : "Tracker"} created in this workspace.</p>
    <p className="text-gray-muted">Created {new Date(execution.receipt.completedAt).toLocaleString()}.{draft.kind === "application" ? " Open it to review and publish when ready." : " No message was sent or website published."}</p>
    {onOpenWork ? <Button type="button" onClick={() => onOpenWork(execution.nativeWorkId, execution.nativeProductId)}>Open {resultName}</Button> : <a className="underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(execution.nativeWorkId)}`}>Open {resultName}</a>}
  </section>;
  const blocked = Boolean(disabled || busy || needsDetails);
  return <section className="mt-4 space-y-4" aria-busy={busy}>
    <h4 className="text-sm font-medium">{draft.kind === "application" ? "Review the application" : "Review and edit the draft"}</h4>
    {draft.kind !== "application" ? <TextInput label={draft.kind === "document" ? "Document title" : "Tracker title"} value={title} maxLength={160} required disabled={blocked || attemptLocked} onChange={event => setTitle(event.target.value)} /> : null}
    {draft.kind === "document" ? <TextArea label="Document draft" rows={10} value={text} maxLength={12000} disabled={blocked || attemptLocked} onChange={event => setText(event.target.value)} /> : draft.kind === "application" && application ? <div className="grid min-w-0 gap-6 xl:grid-cols-2">
      <ApplicationDraftEditor value={application} onChange={setApplication} disabled={blocked || attemptLocked} />
      <ApplicationDraftPreview spec={application} />
    </div> : <>
      <label className="block text-sm">Starting fields<select className="mt-1 block w-full rounded border border-gray-border bg-surface p-2" value={templateId} disabled={blocked || attemptLocked} onChange={event => setTemplateId(event.target.value as typeof templateId)}>{TRACKER_TEMPLATES.map(template => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
      <p className="text-sm text-gray-muted">{TRACKER_TEMPLATES.find(template => template.id === templateId)?.fields.join(", ")}. Starts empty, with no invented records.</p>
    </>}
    {error ? <div className="space-y-2 text-sm"><p role="alert" className="text-critical">{error}</p><a className="underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(planWorkId)}`}>Reload the saved plan and its receipts</a></div> : null}
    {attemptLocked && error ? <p className="text-sm text-gray-muted">Retry checks the exact same output. Reload the saved plan before changing this proposal.</p> : null}
    {needsDetails ? <p className="text-sm text-gray-muted">Add the missing details and prepare a revised plan first.</p> : null}
    <Button type="button" onClick={() => void create()} disabled={blocked || (application ? Boolean(validateApplicationDraft(application)) : !title.trim())}>{busy ? "Saving…" : draft.kind === "document" ? "Create private document" : draft.kind === "application" ? "Create application" : "Create this tracker"}</Button>
  </section>;
}
