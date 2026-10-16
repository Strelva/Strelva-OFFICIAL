"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { StHold } from "@/components/ui/strelva/Kit";
import { XaAnswers, XaButton, XaButtonLink, XaHeadline, XaLabel, XaRow, XaRows, XaSays, XaSegmented, XaStatus, XaSystemTile, XaTextLink } from "@/components/ui/strelva/Xa";
import { RecordLoading, RecordTrouble } from "@/experience/record/RecordStates";
import styles from "@/experience/record/record.module.css";
import { SelectInput } from "@/components/ui/TextInput";
import type { WorkspaceExitOptions, WorkspaceExitResponse } from "@/platform/workspace-exit/contracts";

type Props = { workspaceId: string; request?: typeof fetch; businessBillingReleased?: boolean };

async function readBody<T>(response: Response, fallback: string): Promise<T> {
  const body = await response.json().catch(() => null) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error || fallback);
  if (!body) throw new Error(fallback);
  return body as T;
}

export function WorkspaceExit({ workspaceId, request = fetch, businessBillingReleased = false }: Props) {
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

  const exportHref = `/workspace/export?workspaceId=${encodeURIComponent(workspaceId)}`;
  const crumb = <nav className={styles.crumb} aria-label="Where you are"><a href={exportHref}>Take it with you</a><span aria-hidden="true">/</span><span>Leaving Strelva</span></nav>;
  const billing = businessBillingReleased ? <XaTextLink href={`/workspace/billing?workspaceId=${encodeURIComponent(workspaceId)}`}>Manage payments or cancel your plan</XaTextLink> : null;
  if (loading) return <RecordLoading title="Leaving Strelva" rows={4} label="Loading what leaving would change" />;
  if (error && !options) return <RecordTrouble title="Leaving Strelva can't be read right now." quiet="Nothing changed. Everything keeps running." action={<XaButton onClick={() => void load()}>Try again</XaButton>}><p className={styles.quietNote} role="alert">{error}</p></RecordTrouble>;

  const state = options?.state;
  if (state) return <div className={styles.screen}>
    {crumb}
    <XaHeadline quiet="Your records stay here for you to download.">{state.futureWork === "paused" ? "New work is paused." : "New work has been cancelled."}</XaHeadline>
    <XaSays>{`You chose this on ${new Date(state.completedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}. Agency work was ${state.providerParticipation}. ${state.maintainedResources.kind === "successor" ? `${state.maintainedResources.successorEmail} was named to look after what Strelva maintained.` : "What Strelva maintained here has stopped."}`}</XaSays>
    <XaAnswers labelWidth={220} rows={[
      ["Assignments ended", <Count key="a" value={state.summary.assignmentsRevoked} />],
      ["Scheduled checks paused", <Count key="b" value={state.summary.investigationsPaused} />],
      ["Accepted work kept", <Count key="c" value={state.summary.retainedAccepted} />],
      ["Work with an unknown result kept", <Count key="d" value={state.summary.retainedUnknown} />],
    ]} />
    <p className={styles.quietNote}>This decision does not change billing or stop an outside service. {billing ?? "Billing controls are not open here. Contact your billing provider to end an existing agreement."}</p>
    {state.handoff ? <HandoffPlan plan={state.handoff} /> : null}
    <section className={styles.section} aria-labelledby="exit-review">
      <XaLabel as="h2" id="exit-review">Still needs a look</XaLabel>
      {state.retainedObligations.length ? <XaRows label="Retained obligations">{state.retainedObligations.map(item => <XaRow key={item.workId} title={item.title} detail={`${obligationEffectLabel(item.effect)} · ${obligationStatusLabel(item.status)}`} tone={item.status === "accepted" ? undefined : "waits"} />)}</XaRows> : <p className={styles.quietNote}>Nothing accepted or unresolved was left open.</p>}
    </section>
    <div className={styles.takeActions}><XaButtonLink variant="primary" href={exportHref}>Download your records</XaButtonLink><XaTextLink href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=access`}>Back to your workspace</XaTextLink></div>
  </div>;

  return <div className={styles.screen}>
    {crumb}
    <XaHeadline quiet="Read each line first. You can stop at any step.">Leaving Strelva</XaHeadline>
    {error ? <div role="alert"><XaSays>{error}</XaSays></div> : null}
    {options?.handoff ? <HandoffPlan plan={options.handoff} /> : null}
    <section className={styles.section} aria-label="What happens when you leave">
      <Choice title="Future work" open={editing === "work"} onToggle={() => setEditing(editing === "work" ? null : "work")} now={futureWork === "pause" ? "New work pauses. Its history stays." : "Work that has not started closes. Its history stays."} detail="Work already started, accepted, or unresolved stays here for you to review.">
        <XaSegmented label="Future work" value={futureWork} onChange={setFutureWork} options={[{ value: "pause", label: "Pause new work" }, { value: "cancel", label: "Cancel new work" }]} />
      </Choice>
      <Choice title="Agency work" open={editing === "agency"} onToggle={() => setEditing(editing === "agency" ? null : "agency")} now={agencyParticipation === "keep" ? "Work your agency recorded stays here." : "Your agency can't start new work here. History stays."} detail="Strelva can't prove an outside agency stopped working.">
        <XaSegmented label="Agency work" value={agencyParticipation} onChange={setAgencyParticipation} options={[{ value: "keep", label: "Keep recorded work" }, { value: "revoke", label: "Stop new agency work" }]} />
      </Choice>
      <Choice title="What Strelva maintains" open={editing === "resources"} onToggle={() => setEditing(editing === "resources" ? null : "resources")} now={resourceKind === "stop" ? "Offerings, applications and access maintained here stop. Their records stay." : "They stay, for the person you name to look after."} detail="Naming someone records who looks after them. It does not hand over ownership or access.">
        <XaSegmented label="What Strelva maintains" value={resourceKind} onChange={setResourceKind} options={[{ value: "stop", label: "Stop them" }, { value: "successor", label: "Name someone", disabled: !options?.successors.length }]} />
        {resourceKind === "successor" ? <SelectInput label="Who looks after them" value={successorUserId} onChange={event => setSuccessorUserId(event.target.value)} options={[{ value: "", label: "Choose someone" }, ...(options?.successors.map(successor => ({ value: successor.userId, label: successor.email })) ?? [])]} helperText="Only people already in this business with a confirmed email." /> : null}
        {!options?.successors.length ? <p className={styles.quietNote}>No one else in this business has a confirmed email, so these stop and their records stay.</p> : null}
      </Choice>
      <div className={styles.choice}><span className={styles.canTitle}>Business record and History</span><span className={styles.canDetail}>They stay here for you to download until you ask for them to be deleted.</span></div>
      <div className={styles.choice}><span className={styles.canTitle}>Billing and outside services</span><span className={styles.canDetail}>This choice does not change billing or stop an outside service. {billing ?? "Billing controls are not open here. Contact your billing provider to end an existing agreement."}</span></div>
    </section>
    <p className={styles.quietNote}>This is final for this workspace. Nothing is deleted. <XaTextLink href={exportHref}>Download everything first</XaTextLink></p>
    <div><StHold label={busy ? "Recording your choice…" : "Hold to leave"} disabled={busy || (resourceKind === "successor" && !successorUserId)} onAccept={() => void complete()} /></div>
  </div>;
}

function Choice({ title, now, detail, open, onToggle, children }: { title: string; now: string; detail: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return <div className={styles.choice}>
    <div className={styles.choiceHead}><span><span className={styles.canTitle}>{title}</span><br /><span className={styles.choiceNow}>{now}</span><br /><span className={styles.canDetail}>{detail}</span></span><XaButton size="sm" variant="quiet" aria-expanded={open} onClick={onToggle}>{open ? "Done" : "Change"}</XaButton></div>
    {open ? children : null}
  </div>;
}

function Count({ value }: { value: number }) {
  return <span className={styles.contentEnd}>{value}</span>;
}

function obligationStatusLabel(status: "running" | "waiting" | "needs_attention" | "accepted" | "unknown") {
  return status === "needs_attention" ? "Needs review" : status[0]!.toUpperCase() + status.slice(1);
}

function obligationEffectLabel(effect: "none" | "accepted" | "unknown") {
  return effect === "none" ? "Nothing outside Strelva changed" : effect === "accepted" ? "It changed something outside Strelva" : "Not known whether it changed anything outside Strelva";
}

function HandoffPlan({ plan }: { plan: NonNullable<WorkspaceExitOptions["handoff"]> }) {
  return <section className={styles.section} aria-labelledby="exit-handoff">
    <XaLabel as="h2" id="exit-handoff">Your business goes with you</XaLabel>
    <p className={styles.quietNote}>{plan.systems.length ? `Your business record and ${plan.systems.length} ${plan.systems.length === 1 ? "System" : "Systems"} stay here.` : "Your business record stays here."} A step is done only when Strelva has proof it happened.</p>
    {plan.homeFinder?.length ? <XaRows label="Brokerage search and accepted inquiries">{plan.homeFinder.map(binding => <XaRow key={binding.id} title={binding.brokerageName} detail={`${binding.acceptedInquiries} accepted or open inquiries stay, and their delivery promises continue. ${binding.buyerContentExport}`} />)}</XaRows> : null}
    {plan.sites.map(site => <XaRows key={site.tenantStableId} label={`Handoff for ${site.siteName}`}>{site.steps.map(step => <XaRow key={step.kind}
      lead={<XaSystemTile kind={step.kind === "billing" ? "payments" : step.kind === "export" ? "documents" : "website"} size={32} />}
      title={`${site.siteName} · ${step.kind === "files" ? "website files" : step.kind === "export" ? "business export" : step.kind === "billing" ? "billing" : "domain"}`}
      detail={step.status === "completed" ? step.evidence ?? step.detail : step.detail}
      tone={step.status === "completed" ? undefined : "waits"}
      meta={step.status === "completed" ? <XaStatus kind="live" size="sm">Done</XaStatus> : <XaStatus kind="waits" size="sm">Not yet</XaStatus>} />)}</XaRows>)}
  </section>;
}
