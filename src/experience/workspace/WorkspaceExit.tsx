"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StEmpty, StHead, StHold, StMono, StNotice, StPage, StPill, StPillLink, StRow, StRows, StSection, StSegmented, StSkeleton, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { SelectInput } from "@/components/ui/TextInput";
import type { WorkspaceExitOptions, WorkspaceExitResponse } from "@/platform/workspace-exit/contracts";

type Props = { workspaceId: string; request?: typeof fetch };

async function readBody<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error || fallback);
  if (!body) throw new Error(fallback);
  return body as T;
}

export function WorkspaceExit({ workspaceId, request = fetch }: Props) {
  const [editing, setEditing] = useState<"work" | "agency" | "resources" | null>(null);
  const [options, setOptions] = useState<WorkspaceExitOptions | null>(null);
  const [futureWork, setFutureWork] = useState<"pause" | "cancel">("pause");
  const [agencyParticipation, setAgencyParticipation] = useState<"keep" | "revoke">("keep");
  const [resourceKind, setResourceKind] = useState<"stop" | "successor">("stop");
  const [successorUserId, setSuccessorUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setError("");
    try {
      const response = await request(`/api/workspace-exit?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
      const next = await readBody<WorkspaceExitOptions>(response, "Workspace exit is unavailable.");
      if (sequence !== loadSequence.current) return;
      setOptions(next);
      setSuccessorUserId((current) => current || next.successors[0]?.userId || current);
    } catch (cause) {
      if (sequence !== loadSequence.current) return;
      setError(cause instanceof Error ? cause.message : "Workspace exit is unavailable.");
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [request, workspaceId]);

  useEffect(() => {
    setOptions(null);
    setSuccessorUserId("");
    setBusy(false);
    void load();
    return () => { loadSequence.current += 1; };
  }, [load]);

  async function complete() {
    if (busy) return;
    if (resourceKind === "successor" && !successorUserId) {
      setError("Choose the verified workspace member who will take responsibility.");
      return;
    }
    const sequence = loadSequence.current;
    setBusy(true);
    setError("");
    try {
      const response = await request("/api/workspace-exit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          futureWork,
          providerParticipation: agencyParticipation,
          maintainedResources: resourceKind === "stop" ? { kind: "stop" } : { kind: "successor", successorUserId },
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      const result = await readBody<WorkspaceExitResponse>(response, "Workspace exit could not be confirmed.");
      if (sequence !== loadSequence.current) return;
      setOptions((current) => current ? { ...current, state: result.state } : current);
    } catch (cause) {
      if (sequence !== loadSequence.current) return;
      setError(cause instanceof Error ? cause.message : "Workspace exit could not be confirmed.");
    } finally {
      if (sequence === loadSequence.current) setBusy(false);
    }
  }

  const crumb = { label: "Business details", href: `/workspace/business-details?workspaceId=${encodeURIComponent(workspaceId)}` };
  const head = <StHead crumb={crumb} title="Leaving Strelva" meta="Read every line before you go · you can stop at any step" />;
  if (loading) return <StPage>{head}<StSkeleton label="Loading workspace exit options" /><StSkeleton width="70%" /><StSkeleton width="85%" /></StPage>;
  if (error && !options) return <StPage>{head}<StNotice tone="critical">{error}</StNotice><div><StPill variant="soft" onClick={() => void load()}>Try again</StPill></div></StPage>;

  const state = options?.state;
  if (state) return <StPage>
    <StHead crumb={crumb} title={state.futureWork === "paused" ? "New work is paused." : "New work has been cancelled."} meta="Your choice is recorded. Retained records and unresolved results remain available for export." />
    <StSurface label="Exit decision receipt">
      <div className="flex flex-col gap-4">
        <StState kind="live">Exit decision recorded</StState>
        <p className="text-sm leading-6 text-gray-muted">Agency work was {state.providerParticipation}. {state.maintainedResources.kind === "successor" ? `A successor was named for ${state.maintainedResources.successorEmail} to review the resources.` : "Resources maintained in this workspace were stopped."}</p>
        <StMono as="time" dateTime={state.completedAt}>{new Date(state.completedAt).toLocaleString()}</StMono>
        <StRows label="Exit results"><Result label="Assignments revoked" value={state.summary.assignmentsRevoked} /><Result label="Scheduled checks paused" value={state.summary.investigationsPaused} /><Result label="Accepted obligations retained" value={state.summary.retainedAccepted} /><Result label="Unknown obligations retained" value={state.summary.retainedUnknown} /></StRows>
      </div>
    </StSurface>
    <StNotice>This decision does not change billing or stop an outside provider service. <StTextButton href={`/workspace/billing?workspaceId=${encodeURIComponent(workspaceId)}`}>Manage payments or cancel your plan</StTextButton></StNotice>
    {state.handoff ? <HandoffPlan plan={state.handoff} /> : null}
    <StSection title="Still needs review">
      {state.retainedObligations.length ? <StRows label="Retained obligations">{state.retainedObligations.map(item => <StRow key={item.workId} title={item.title} detail={obligationEffectLabel(item.effect)} end={<StState kind={item.status === "accepted" ? "live" : "need"}>{obligationStatusLabel(item.status)}</StState>} />)}</StRows> : <StEmpty>No accepted results or unresolved results were found in this exit choice.</StEmpty>}
    </StSection>
    <div className="flex flex-wrap gap-4"><StPillLink href={`/workspace/export?workspaceId=${encodeURIComponent(workspaceId)}`}>Export retained records</StPillLink><StTextButton href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=access`}>Return to workspace</StTextButton></div>
  </StPage>;

  return <StPage>{head}
    {error ? <StNotice tone="critical">{error}</StNotice> : null}
    {options?.handoff ? <HandoffPlan plan={options.handoff} /> : null}
    <StRows label="What happens when you leave">
      <StRow title="Future work" detail="Work already started, accepted, or unresolved stays available for review." end={<StTextButton onClick={() => setEditing(editing === "work" ? null : "work")}>Change</StTextButton>}><p className="text-sm leading-6">{futureWork === "pause" ? "New work pauses. Its history stays." : "Work that has not started closes. Its history stays."}</p></StRow>
      <StRow title="Agency work" detail="This record cannot prove that an outside agency stopped work." end={<StTextButton onClick={() => setEditing(editing === "agency" ? null : "agency")}>Change</StTextButton>}><p className="text-sm leading-6">{agencyParticipation === "keep" ? "Recorded agency work stays available." : "New agency delivery from this workspace is revoked. History stays."}</p></StRow>
      <StRow title="Resources Strelva maintains" detail="Naming someone records responsibility. It does not transfer ownership or access." end={<StTextButton onClick={() => setEditing(editing === "resources" ? null : "resources")}>Change</StTextButton>}><p className="text-sm leading-6">{resourceKind === "stop" ? "Offerings, applications and access maintained here stop. Their records stay." : "Resources stay for the named verified member to review."}</p></StRow>
      <StRow title="Business record and History" detail="Your records stay available for export until you explicitly request deletion." />
      <StRow title="Billing and outside services" detail="This choice does not change billing or stop an outside service." end={<StTextButton href={`/workspace/billing?workspaceId=${encodeURIComponent(workspaceId)}`}>Manage payments or cancel your plan</StTextButton>} />
    </StRows>
    {editing ? <StSurface label="Change exit choice"><div className="flex flex-col gap-4">
      {editing === "work" ? <><StSection title="Future work"><StSegmented label="Future work" value={futureWork} onChange={setFutureWork} options={[{ value: "pause", label: "Pause new work" }, { value: "cancel", label: "Cancel new work" }]} /></StSection><p className="text-sm text-gray-muted">Only work that has not started can change here.</p></> : null}
      {editing === "agency" ? <StSection title="Agency work"><StSegmented label="Agency work" value={agencyParticipation} onChange={setAgencyParticipation} options={[{ value: "keep", label: "Keep recorded work" }, { value: "revoke", label: "Revoke future work" }]} /></StSection> : null}
      {editing === "resources" ? <><StSection title="Resources Strelva maintains"><StSegmented label="Resources Strelva maintains" value={resourceKind} onChange={setResourceKind} options={[{ value: "stop", label: "Stop resources" }, { value: "successor", label: "Name someone" }]} disabledValues={!options?.successors.length ? ["successor"] : []} disabledReason="No other verified workspace member is available to name." /></StSection>{resourceKind === "successor" ? <SelectInput label="Verified workspace member" value={successorUserId} onChange={event => setSuccessorUserId(event.target.value)} options={[{ value: "", label: "Choose a successor" }, ...(options?.successors.map(successor => ({ value: successor.userId, label: successor.email })) ?? [])]} helperText="Naming a person records responsibility; it does not transfer access." /> : null}{!options?.successors.length ? <StEmpty>No other verified workspace member is available to name. You can stop the resources and preserve their records.</StEmpty> : null}</> : null}
      <StTextButton onClick={() => setEditing(null)}>Done</StTextButton>
    </div></StSurface> : null}
    <div className="flex flex-wrap items-center justify-between gap-5">
      <p className="max-w-lg text-[13px] leading-5 text-gray-muted">This choice is permanent for this workspace. Export first if you need an offline copy. No records are deleted by this choice.</p>
      <StHold label={busy ? "Recording your choice…" : "Hold to leave"} disabled={busy || (resourceKind === "successor" && !successorUserId)} onAccept={() => void complete()} />
    </div>
    <StTextButton href={`/workspace/export?workspaceId=${encodeURIComponent(workspaceId)}`}>Export before leaving</StTextButton>
  </StPage>;
}

function Result({ label, value }: { label: string; value: number }) {
  return <StRow title={label} end={<StMono>{value}</StMono>} />;
}

function obligationStatusLabel(status: "running" | "waiting" | "needs_attention" | "accepted" | "unknown") {
  return status === "needs_attention" ? "Needs review" : status[0]!.toUpperCase() + status.slice(1);
}

function obligationEffectLabel(effect: "none" | "accepted" | "unknown") {
  return effect === "none" ? "No external effect confirmed" : effect === "accepted" ? "Accepted effect recorded" : "Effect is unknown";
}

function HandoffPlan({ plan }: { plan: NonNullable<WorkspaceExitOptions["handoff"]> }) {
  return <StSection title="Your business goes with you">
    <p className="text-[13px] leading-5 text-gray-muted">The business record and <StMono>{plan.systems.length}</StMono> Systems stay available. Completed steps have recorded evidence; pending steps still need attention.</p>
    {!plan.sites.length && !plan.systems.length ? <StEmpty>No linked sites or Systems were found. The business record remains available.</StEmpty> : null}
    {plan.homeFinder?.length ? <StRows label="Brokerage search and accepted inquiries">{plan.homeFinder.map(binding => <StRow key={binding.id} title={binding.brokerageName} detail={<>{binding.acceptedInquiries} accepted or unresolved inquiry records remain. Delivery and signed receipt obligations continue. {binding.buyerContentExport}</>}><p className="text-sm leading-6">Exit blocks new native intake. Approved website: {binding.approvedOrigin}</p></StRow>)}</StRows> : null}
    {plan.sites.map(site => <StSection key={site.tenantStableId} title={site.siteName}>
      <StRows label={`Handoff for ${site.siteName}`}>{site.steps.map(step => <StRow key={step.kind} title={step.kind === "files" ? "Website files and assets" : step.kind === "export" ? "Business export" : step.kind === "billing" ? "Billing" : "Domain"} detail={step.evidence ?? "No completed handoff evidence recorded."} end={<StState kind={step.status === "completed" ? "live" : "need"}>{step.status === "completed" ? "Completed" : "Pending"}</StState>}><p className="text-sm leading-6">{step.detail}</p></StRow>)}</StRows>
    </StSection>)}
  </StSection>;
}
