"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { XaButtonLink, XaHeadline, XaLabel, XaPebbleScene, XaRow, XaRows, XaSays, XaSegmented, XaStatus, XaSystemTile, XaTextLink, XaYes } from "@/components/ui/strelva/Xa";
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
      const next = await readBody<WorkspaceExitOptions>(response, "Leaving Strelva is unavailable right now.");
      if (sequence !== loadSequence.current) return;
      setOptions(next);
      setSuccessorUserId((current) => current || next.successors[0]?.userId || current);
    } catch (cause) {
      if (sequence !== loadSequence.current) return;
      setError(cause instanceof Error ? cause.message : "Leaving Strelva is unavailable right now.");
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
      const result = await readBody<WorkspaceExitResponse>(response, "Leaving Strelva could not be confirmed.");
      if (sequence !== loadSequence.current) return;
      setOptions((current) => current ? { ...current, state: result.state } : current);
    } catch (cause) {
      if (sequence !== loadSequence.current) return;
      setError(cause instanceof Error ? cause.message : "Leaving Strelva could not be confirmed.");
    } finally {
      if (sequence === loadSequence.current) setBusy(false);
    }
  }

  const exportHref = `/workspace/export?workspaceId=${encodeURIComponent(workspaceId)}`;
  const crumb = <nav className={styles.crumb} aria-label="Where you are"><a href={exportHref}>Take it with you</a><span aria-hidden="true">/</span><span>Leaving Strelva</span></nav>;
  const billing = businessBillingReleased ? <XaTextLink href={`/workspace/billing?workspaceId=${encodeURIComponent(workspaceId)}`}>Manage payments or cancel your plan</XaTextLink> : null;
  if (loading) return <RecordLoading title="Leaving Strelva" rows={4} label="Loading what leaving would change" />;
  if (error && !options) return <RecordTrouble title="Leaving Strelva can't be read right now." quiet="Nothing changed. Everything keeps running." retry={{ label: "Try again", onClick: () => void load() }}>{error}</RecordTrouble>;

  const state = options?.state;
  if (state) return <div className={styles.screen}>
    {crumb}
    <XaHeadline quiet="Your records stay here for you to download.">{state.futureWork === "paused" ? "New work is paused." : "New work has been cancelled."}</XaHeadline>
    <XaSays>{`${leaveSentence(state.summary, state.completedAt)}${state.maintainedResources.kind === "successor" ? ` ${state.maintainedResources.successorEmail} looks after what Strelva ran for you.` : ""}`}</XaSays>
    <p className={styles.quietNote}>{"This doesn't change billing or stop an outside service. "}{billing ?? "Billing controls are not open here. Contact your billing provider to end an existing agreement."}</p>
    {state.handoff ? <HandoffPlan plan={state.handoff} /> : null}
    {state.retainedObligations.length ? <section className={styles.section} aria-labelledby="exit-review">
      <XaLabel as="h2" id="exit-review">Still needs a look</XaLabel>
      <XaRows label="Still needs a look">{state.retainedObligations.map(item => <XaRow key={item.workId} title={item.title} detail={obligationSentence(item.status, item.effect)}
        tone={item.status === "waiting" || item.status === "needs_attention" ? "waits" : undefined}
        action={item.status === "waiting" || item.status === "needs_attention" ? <XaTextLink href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}&view=needs-you`}>See it</XaTextLink> : undefined} />)}</XaRows>
    </section> : null}
    <div className={styles.takeActions}><XaButtonLink variant="primary" href={exportHref}>Download your records</XaButtonLink><XaTextLink href={`/workspace?workspaceId=${encodeURIComponent(workspaceId)}`}>Back to Home</XaTextLink></div>
  </div>;

  return <div className={styles.screen}>
    {crumb}
    <XaHeadline quiet="Read each line first. You can stop at any step.">Leaving Strelva</XaHeadline>
    <div className={styles.pebbleLine}><XaPebbleScene pose="fixing" size={88} label="Pebble, keeping your records" /><p>{futureWork === "pause" ? "I'll pause new work; your records stay here to download." : "I'll close work that hasn't started; your records stay here to download."}</p></div>
    {error ? <div role="alert"><XaSays>{error}</XaSays></div> : null}
    {options?.handoff ? <HandoffPlan plan={options.handoff} /> : null}
    <section className={styles.section} aria-label="What happens when you leave">
      <Choice title="Future work" open={editing === "work"} onToggle={() => setEditing(editing === "work" ? null : "work")} now={futureWork === "pause" ? "New work pauses. Its history stays." : "Work that hasn't started closes. Its history stays."} detail="Anything already started or waiting for your yes stays here for you to look at.">
        <XaSegmented label="Future work" value={futureWork} onChange={setFutureWork} options={[{ value: "pause", label: "Pause new work" }, { value: "cancel", label: "Cancel new work" }]} />
      </Choice>
      <Choice title="Agency work" open={editing === "agency"} onToggle={() => setEditing(editing === "agency" ? null : "agency")} now={agencyParticipation === "keep" ? "Your agency keeps what it recorded; new work pauses with everything else." : "Your agency can't start anything new here. What it recorded stays."} detail="If they also work for you outside Strelva, tell them yourself.">
        <XaSegmented label="Agency work" value={agencyParticipation} onChange={setAgencyParticipation} options={[{ value: "keep", label: "Keep recorded work" }, { value: "revoke", label: "Stop new agency work" }]} />
      </Choice>
      <Choice title="What Strelva runs for you" open={editing === "resources"} onToggle={() => setEditing(editing === "resources" ? null : "resources")} now={resourceKind === "stop" ? "What Strelva runs for you stops. Its records stay to download." : "It keeps running, looked after by the person you name."} detail={resourceKind === "stop" ? "Your apps and services here stop taking new work." : "They look after it day to day; you stay the owner."}>
        <XaSegmented label="What Strelva runs for you" value={resourceKind} onChange={setResourceKind} options={[{ value: "stop", label: "Stop them" }, { value: "successor", label: "Name someone", disabled: !options?.successors.length }]} />
        {resourceKind === "successor" ? <SelectInput label="Who looks after them" value={successorUserId} onChange={event => setSuccessorUserId(event.target.value)} options={[{ value: "", label: "Choose someone" }, ...(options?.successors.map(successor => ({ value: successor.userId, label: successor.email })) ?? [])]} helperText="Only people already in this business with a confirmed email." /> : null}
        {!options?.successors.length ? <p className={styles.quietNote}>No one else in this business has a confirmed email, so these stop and their records stay.</p> : null}
      </Choice>
      <div className={styles.choice}><span className={styles.choiceText}><span className={styles.canTitle}>Business record and history</span><span className={styles.canDetail}>They stay here to download until you ask for them to be deleted.</span></span></div>
      <div className={styles.choice}><span className={styles.choiceText}><span className={styles.canTitle}>Billing and outside services</span><span className={styles.canDetail}>{"This doesn't change billing or stop an outside service. "}{billing ?? "Billing controls are not open here. Contact your billing provider to end an existing agreement."}</span></span></div>
    </section>
    <p className={styles.quietNote}>This is final for this business. Nothing is deleted. <XaTextLink href={exportHref}>Download everything first</XaTextLink></p>
    {/* Leaving has no Undo, so the one yes is the confirmation; the page above is its question. */}
    <div><XaYes state={busy ? "going" : "waiting"} block={false} shortcut={false} yesLabel="Leave Strelva" working={{ title: "Recording your choice", steps: [] }}
      disabledReason={resourceKind === "successor" && !successorUserId ? "Choose who looks after them first." : undefined} unblock={<XaTextLink onClick={() => setEditing("resources")}>Choose someone</XaTextLink>} onYes={() => void complete()} /></div>
  </div>;
}

/** One choice, said as it stands. The whole row opens it; "Change" shows on hover or focus. */
function Choice({ title, now, detail, open, onToggle, children }: { title: string; now: string; detail: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return <div className={styles.choice} data-open={open || undefined}>
    <button type="button" className={styles.choiceHead} aria-expanded={open} onClick={onToggle}>
      <span className={styles.choiceText}><span className={styles.canTitle}>{title}</span><span className={styles.choiceNow}>{now}</span><span className={styles.canDetail}>{detail}</span></span>
      <span className={styles.rowAction} aria-hidden="true">{open ? "Done" : "Change"}</span>
    </button>
    {open ? children : null}
  </div>;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** What leaving stopped, in one sentence of owner words. Zero counts are left out. */
export function leaveSentence(summary: { standingPaused: number; standingRevoked: number; scheduledPaused: number; scheduledCancelled: number; assignmentsRevoked: number; providerDeliveriesRevoked: number; investigationsPaused: number; retainedAccepted: number; retainedUnknown: number }, completedAt: string): string {
  const parts = [
    summary.assignmentsRevoked ? `ended ${plural(summary.assignmentsRevoked, "agency assignment", "agency assignments")}` : null,
    summary.providerDeliveriesRevoked ? `stopped ${plural(summary.providerDeliveriesRevoked, "agency delivery", "agency deliveries")}` : null,
    summary.standingPaused + summary.scheduledPaused ? `paused ${plural(summary.standingPaused + summary.scheduledPaused, "piece of scheduled work", "pieces of scheduled work")}` : null,
    summary.standingRevoked + summary.scheduledCancelled ? `cancelled ${plural(summary.standingRevoked + summary.scheduledCancelled, "piece of scheduled work", "pieces of scheduled work")}` : null,
    summary.investigationsPaused ? `paused ${plural(summary.investigationsPaused, "check", "checks")}` : null,
    summary.retainedAccepted ? `kept ${plural(summary.retainedAccepted, "change you accepted", "changes you accepted")}` : null,
    summary.retainedUnknown ? `kept ${plural(summary.retainedUnknown, "change whose result isn't known", "changes whose result isn't known")} for you to check` : null,
  ].filter((part): part is string => Boolean(part));
  const when = new Date(completedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  if (!parts.length) return `On ${when} I stopped new work. Nothing else was running.`;
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `On ${when} I ${list}.`;
}

/** Where a kept piece of work stands, as one plain line. */
function obligationSentence(status: "running" | "waiting" | "needs_attention" | "accepted" | "unknown", effect: "none" | "accepted" | "unknown") {
  if (status === "waiting") return "Still waits for your yes.";
  if (status === "needs_attention") return "Needs a look before anything else happens.";
  if (status === "running") return "Still running.";
  if (effect === "accepted") return "Accepted; it changed something outside Strelva.";
  if (effect === "unknown" || status === "unknown") return "It isn't known whether it changed anything outside Strelva.";
  return "Accepted. Nothing outside Strelva changed.";
}

function HandoffPlan({ plan }: { plan: NonNullable<WorkspaceExitOptions["handoff"]> }) {
  return <section className={styles.section} aria-labelledby="exit-handoff">
    <XaLabel as="h2" id="exit-handoff">Your business goes with you</XaLabel>
    <p className={styles.quietNote}>{plan.systems.length ? `Your business record and ${plan.systems.length} ${plan.systems.length === 1 ? "System" : "Systems"} stay here.` : "Your business record stays here."} A step is done only when Strelva has proof it happened.</p>
    {plan.homeFinder?.length ? <XaRows label="Brokerage search and accepted inquiries">{plan.homeFinder.map(binding => <XaRow key={binding.id} title={binding.brokerageName} detail={`${binding.acceptedInquiries} accepted or open inquiries stay, and their delivery promises continue. ${binding.buyerContentExport}`} />)}</XaRows> : null}
    {plan.sites.map(site => <XaRows key={site.tenantStableId} label={`Handoff for ${site.siteName}`}>{site.steps.map(step => <XaRow key={step.kind}
      lead={<XaSystemTile kind={step.kind === "billing" ? "payments" : step.kind === "export" ? "documents" : "website"} size={32} />}
      title={`${site.siteName} · ${step.kind === "files" ? "website files" : step.kind === "export" ? "business export" : step.kind === "billing" ? "billing" : "domain"}`}
      detail={step.status === "completed" ? step.evidence ?? step.detail : step.kind === "domain" ? `${site.siteName}'s domain stays registered to you. Moving it is arranged with you; nothing changes until you say so.` : step.detail}
      tone={step.status === "completed" ? undefined : "waits"}
      meta={step.status === "completed" ? <XaStatus kind="live" size="sm">Done</XaStatus> : <XaStatus kind="waits" size="sm">Not yet</XaStatus>} />)}</XaRows>)}
  </section>;
}
