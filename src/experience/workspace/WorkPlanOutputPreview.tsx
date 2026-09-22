"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SelectInput, TextArea, TextInput } from "@/components/ui/TextInput";
import { ApplicationDraftEditor } from "@/experience/applications/ApplicationDraftEditor";
import { ApplicationDraftPreview } from "@/experience/applications/ApplicationDraftPreview";
import { validateApplicationDraft, type ApplicationDraftSpec } from "@/experience/applications/app-templates";
import { TRACKER_TEMPLATES } from "@/products/tracker/client";
import { workPlanOutputExecutionSchema, type WorkPlan, type WorkPlanOutputExecution } from "@/products/work-plans/contracts";
import { useWorkspaceRequest } from "./WorkspaceRequest";

type Props = {
  onOpenWork?: (workId: string, productId?: string) => void;
  workspaceId: string;
  planWorkId: string;
  plan: WorkPlan;
  output: WorkPlan["proposedOutputs"][number];
  disabled?: boolean;
  completed?: WorkPlanOutputExecution;
};

/** Inspectable native output. A failed attempt retries the same immutable input. */
export function WorkPlanOutputPreview({ onOpenWork, workspaceId, planWorkId, plan, output, disabled, completed }: Props) {
  const request = useWorkspaceRequest();
  const draft = output.draft;
  const [title, setTitle] = useState(draft?.title ?? output.title);
  const [text, setText] = useState(draft?.kind === "document" ? draft.text : "");
  const [templateId, setTemplateId] = useState(draft?.kind === "tracker" ? draft.templateId : "tasks");
  const [application, setApplication] = useState<ApplicationDraftSpec | null>(() => draft?.kind === "application" ? { title: draft.title, fields: structuredClone(draft.fields), components: structuredClone(draft.components) } : null);
  const [execution, setExecution] = useState(completed);
  const [busy, setBusy] = useState(false);
  const [attemptLocked, setAttemptLocked] = useState(false);
  const [error, setError] = useState("");
  const attempt = useRef<string | null>(null);
  const submitting = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const operationId = draft?.kind === "document" ? "create_document" : draft?.kind === "tracker" ? "create_tracker" : draft?.kind === "application" ? "create_application" : undefined;
  const allowed = Boolean(operationId && output.nativeOperationIds.includes(operationId));
  const needsDetails = plan.status !== "ready" || plan.neededInputs.some(input => input.required) || plan.requiredDecisions.length > 0;
  const applicationError = application ? validateApplicationDraft(application) : null;

  async function create() {
    if (!draft || !allowed || disabled || submitting.current || needsDetails || execution || applicationError) return;
    submitting.current = true;
    setBusy(true); setAttemptLocked(true); setError("");
    attempt.current ??= JSON.stringify({
      workspaceId, planWorkId, outputId: output.id, expectedPlanRevision: plan.metadata.revision, operationId,
      inputs: draft.kind === "document" ? { title, text } : draft.kind === "application" ? application : { title, templateId },
    });
    try {
      const response = await request("/api/work-plans/execute", { method: "POST", headers: { "Content-Type": "application/json" }, body: attempt.current });
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && typeof body === "object" && "error" in body && typeof body.error === "string" ? body.error : "The output could not be confirmed. Retry to check the same request.";
        throw new Error(message);
      }
      const parsed = workPlanOutputExecutionSchema.safeParse(body);
      if (!parsed.success || parsed.data.planWorkId !== planWorkId || parsed.data.outputId !== output.id || parsed.data.receipt.nativeWorkId !== parsed.data.nativeWorkId) throw new Error("The creation receipt could not be confirmed. Reload the saved plan before continuing.");
      if (!mounted.current) return;
      setExecution(parsed.data);
      // Multiple outputs stay together; one completion must not hide unfinished work.
      if (draft.kind === "application" && plan.proposedOutputs.length === 1) onOpenWork?.(parsed.data.nativeWorkId, parsed.data.nativeProductId);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : "The output could not be confirmed. Retry the same request.");
    } finally { submitting.current = false; if (mounted.current) setBusy(false); }
  }

  if (!draft || !allowed) return <p className="text-sm text-gray-muted">This part needs further preparation before it can run.</p>;
  const resultName = draft.kind === "document" ? "document" : draft.kind === "application" ? "app" : "tracker";
  if (execution) return <section className="mt-3 space-y-3 text-sm" aria-label="Creation receipt">
    <p role="status">{draft.kind === "document" ? "Private document" : draft.kind === "application" ? "Application" : "Tracker"} created in this workspace.</p>
    <p className="text-gray-muted">Created {new Date(execution.receipt.completedAt).toLocaleString()}.{draft.kind === "application" ? " Open it to review and publish when ready." : " No message was sent or website published."}</p>
    {onOpenWork ? <Button type="button" onClick={() => onOpenWork(execution.nativeWorkId, execution.nativeProductId)}>Open {resultName}</Button> : <a className="inline-flex min-h-11 items-center underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(execution.nativeWorkId)}`}>Open {resultName}</a>}
  </section>;
  const blocked = Boolean(disabled || busy || needsDetails);
  return <section className="mt-4 space-y-4" aria-busy={busy} aria-label="Review native output">
    <h4 className="text-sm font-medium">{draft.kind === "application" ? "Review the application" : "Review and edit the draft"}</h4>
    {draft.kind !== "application" ? <TextInput label={draft.kind === "document" ? "Document title" : "Tracker title"} value={title} maxLength={160} required disabled={blocked || attemptLocked} onChange={event => setTitle(event.target.value)} /> : null}
    {draft.kind === "document" ? <TextArea label="Document draft" rows={10} value={text} maxLength={12000} disabled={blocked || attemptLocked} onChange={event => setText(event.target.value)} /> : draft.kind === "application" && application ? <div className="grid min-w-0 gap-6 xl:grid-cols-2" aria-label="Proposed app">
      <ApplicationDraftEditor value={application} onChange={setApplication} disabled={blocked || attemptLocked} />
      {applicationError ? <p role="status" className="text-sm text-gray-muted">Complete the fields to preview: {applicationError}</p> : <ApplicationDraftPreview spec={application} />}
    </div> : <>
      <SelectInput label="Starting fields" value={templateId} disabled={blocked || attemptLocked} onChange={event => setTemplateId(event.target.value as typeof templateId)} options={TRACKER_TEMPLATES.map(template => ({ value: template.id, label: template.name }))} />
      <p className="text-sm text-gray-muted">{TRACKER_TEMPLATES.find(template => template.id === templateId)?.fields.join(", ")}. Starts empty, with no invented records.</p>
    </>}
    {error ? <div className="space-y-2 text-sm"><p role="alert" className="text-critical">{error}</p><p className="text-gray-muted">Retry checks the same output with the same inputs. Reload the saved plan before changing this proposal.</p><a className="inline-flex min-h-11 items-center underline" href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&work=${encodeURIComponent(planWorkId)}`}>Reload the saved plan and its receipts</a></div> : null}
    {needsDetails ? <p className="text-sm text-gray-muted">Add the missing details and prepare a revised plan first.</p> : null}
    <Button type="button" onClick={() => void create()} loading={busy} disabled={blocked || (application ? Boolean(applicationError) : !title.trim())}>{draft.kind === "document" ? "Create private document" : draft.kind === "application" ? "Create application" : "Create this tracker"}</Button>
  </section>;
}
