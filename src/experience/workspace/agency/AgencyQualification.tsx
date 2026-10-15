"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { StNotice, StPill, StSection, StSkeleton, StState, StTextField, StTextButton } from "@/components/ui/strelva/Kit";
import { TextArea } from "@/components/ui/TextInput";
import type { AgencyEffect } from "@/platform/workspaces/agency-onboarding";
import { qualificationRequirements, qualificationStateSchema, qualificationSubmissionSchema, type QualificationState } from "./qualification-model";

export function AgencyQualification(props: { workspaceId: string; fictionalQualification?: QualificationState }) {
  return <QualificationWorkspace key={props.workspaceId} {...props} />;
}
function QualificationWorkspace({ workspaceId, fictionalQualification }: { workspaceId: string; fictionalQualification?: QualificationState }) {
  const inFlight = useRef(false);
  const [attempt, setAttempt] = useState(0);
  const [stored, setStored] = useState<{ key: string; state?: QualificationState; error?: string } | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const key = `${workspaceId}:${attempt}`;
  const current: { state?: QualificationState; error?: string } | null = fictionalQualification ? { state: fictionalQualification } : stored;
  const state = current?.state;
  useEffect(() => {
    if (fictionalQualification) return;
    const controller = new AbortController();
    void fetch(`/api/agency-qualification?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "Verification could not be loaded.");
        const parsed = qualificationStateSchema.parse(body.qualification);
        if (parsed.workspaceId !== workspaceId) throw new Error("Verification could not be loaded.");
        if (!controller.signal.aborted) { setStored({ key, state: parsed }); setUncertain(false); setMessage(""); }
      }).catch(error => { if (!controller.signal.aborted) setStored(previous => ({ key, state: previous?.state, error: error instanceof Error ? error.message : "Verification could not be loaded." })); });
    return () => controller.abort();
  }, [workspaceId, key, fictionalQualification]);

  const refresh = () => { setUncertain(true); setMessage("Checking the current status…"); setAttempt(value => value + 1); };

  async function submit(effect: AgencyEffect, evidenceUrl: string, evidence: string) {
    if (!state?.canSubmit || inFlight.current || uncertain || current?.error || (!fictionalQualification && stored?.key !== key)) return;
    if (fictionalQualification) { setMessage("Fictional preview. No evidence was submitted."); return; }
    const input = qualificationSubmissionSchema.safeParse({ action: "submit", workspaceId, requestId: crypto.randomUUID(), effect, evidenceUrl, evidence });
    if (!input.success) { setMessage("Use an HTTPS evidence link and at least 20 characters describing your rehearsal."); return; }
    inFlight.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/agency-qualification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.data) });
      if (!response.ok) throw new Error("Outcome not confirmed. Reload status before trying again.");
      const body = await response.json();
      const next = qualificationStateSchema.parse(body.qualification);
      if (next.workspaceId !== workspaceId || !next.submissions.some(item => item.id === input.data.requestId && item.effect === effect && item.evidenceUrl === input.data.evidenceUrl && item.evidence === input.data.evidence)) throw new Error("Outcome not confirmed.");
      setStored({ key, state: next }); setMessage("Evidence submitted to the platform review queue.");
    } catch { setUncertain(true); setMessage("Outcome not confirmed. Reload status before trying again."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  if (!current) return <StSkeleton label="Loading verification submissions" />;
  if (!state) return <StNotice tone="critical">{current.error} Outside changes stay locked.<StPill variant="soft" onClick={() => setAttempt(value => value + 1)}>Reload status</StPill></StNotice>;
  return <>
    <StSection title="Your verification" action={<StTextButton disabled={busy} onClick={refresh}>Refresh status</StTextButton>}>
      <p className="text-sm text-gray-muted">Submit evidence for the work you want to do for clients. You can prepare work while review is pending; publishing, Google updates, email and payments need their own verification.</p>
      {state.independentReviewerAvailable === false ? <StNotice>Your evidence can be submitted now. An independent platform reviewer must be added before it can be approved. Agency members cannot approve their own agency.</StNotice> : null}
    </StSection>
    {current.error ? <StNotice tone="critical">{current.error} The displayed status may be stale. Refresh status before submitting.</StNotice> : null}
    {message ? <StNotice tone={uncertain ? "critical" : undefined}>{message}</StNotice> : null}
    {uncertain ? <StPill variant="soft" onClick={refresh}>Reload status</StPill> : null}
    {!state.canSubmit ? <StNotice>An agency owner or admin submits evidence. You can follow each review here.</StNotice> : null}
    {state.effects.map(effect => {
      const latest = state.submissions.find(submission => submission.effect === effect.effect);
      const pending = latest && latest.decision === null;
      const description = pending ? "In review" : latest?.decision === "changes_requested" ? "Changes requested" : effect.available ? "Verified" : "Not yet verified";
      return <StSection key={effect.effect} title={qualificationRequirements[effect.effect].name}>
        <StState kind={effect.available ? "live" : "draft"}>{description}</StState>
        {latest ? <p className="text-sm text-gray-muted">Submitted {new Date(latest.submittedAt).toLocaleDateString("en-US", { timeZone: "UTC" })}{latest.reason ? ` · ${latest.reason}` : " · Waiting for independent platform review."}</p> : null}
        <EvidenceForm effect={effect.effect} disabled={busy || uncertain || !!current.error || (!fictionalQualification && stored?.key !== key) || !state.canSubmit || !!pending || effect.available} submit={submit} busy={busy} resubmit={!!latest} showForm={state.canSubmit && !pending && !effect.available} />
        {pending ? <p className="text-sm text-gray-muted">Your evidence is saved in the platform review queue. Return here for the decision. This work stays locked until it is verified.</p> : null}
        {latest?.decision === "unavailable" ? <p className="text-sm text-gray-muted">Address the reviewer’s reason, then submit updated evidence for another review.</p> : null}
        {latest ? <EvidenceDetails evidence={latest.evidence} url={latest.evidenceUrl} /> : null}
      </StSection>;
    })}
  </>;
}
function EvidenceForm({ effect, disabled, submit, busy, resubmit, showForm }: { effect: AgencyEffect; disabled: boolean; submit: (effect: AgencyEffect, evidenceUrl: string, evidence: string) => Promise<void>; busy: boolean; resubmit: boolean; showForm: boolean }) {
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const onSubmit = (event: FormEvent) => { event.preventDefault(); void submit(effect, url, notes); };
  return <>
    <ul className="list-disc space-y-2 pl-5 text-sm text-gray-muted">{qualificationRequirements[effect].requirements.map(requirement => <li key={requirement}>{requirement}</li>)}</ul>
    {showForm ? <form onSubmit={onSubmit} className="space-y-4" aria-label={`${qualificationRequirements[effect].name} evidence`}>
      <StTextField label="Evidence link" type="url" disabled={disabled} required maxLength={2000} value={url} onChange={event => setUrl(event.target.value)} description="Use an HTTPS link the reviewer can open. Do not include passwords, credentials or customer private data." />
      <TextArea label="What you tested and how it recovered" disabled={disabled} required minLength={20} maxLength={6000} value={notes} onChange={event => setNotes(event.target.value)} rows={4} />
      <StPill type="submit" variant="soft" disabled={disabled} busy={busy}>{resubmit ? "Submit updated evidence" : "Submit evidence"}</StPill>
    </form> : null}
  </>;
}

function EvidenceDetails({ evidence, url }: { evidence: string; url: string }) {
  const [open, setOpen] = useState(false);
  return <div><StTextButton aria-expanded={open} onClick={() => setOpen(value => !value)}>Submitted evidence</StTextButton>{open ? <div><p className="whitespace-pre-wrap text-sm">{evidence}</p><a href={url} target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-4">Open evidence</a></div> : null}</div>;
}
