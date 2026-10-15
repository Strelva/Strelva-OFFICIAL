"use client";

import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { StEmpty, StNotice, StPill, StRows, StRow, StSkeleton, StState, StSurface, StTextButton } from "@/components/ui/strelva/Kit";
import { SelectInput, TextArea } from "@/components/ui/TextInput";
import { qualificationDecisionSchema, qualificationRecordSchema, qualificationRequirements, type QualificationRecord } from "@/experience/workspace/agency/qualification-model";

const decisions = [{ value: "changes_requested", label: "Request changes" }, { value: "verified", label: "Make this effect available" }, { value: "unavailable", label: "Keep this effect unavailable" }];
export function AgencyQualificationDesk() {
  const inFlight = useRef(false);
  const refusedOutcome = useRef(false);
  const pendingOutcome = useRef<{ submissionId: string; decision: string; reason: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [stored, setStored] = useState<{ attempt: number; submissions?: QualificationRecord[]; error?: string } | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const current = stored;
  const refreshing = stored?.attempt !== attempt;
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/agency-qualification?desk=1", { cache: "no-store", signal: controller.signal }).then(async response => {
      const body = await response.json();
      if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "The qualification desk could not be loaded.");
      const submissions = z.array(qualificationRecordSchema).parse(body.submissions);
      if (!controller.signal.aborted) {
        setStored({ attempt, submissions });
        const pending = pendingOutcome.current;
        const confirmed = !pending || decisionRecorded(submissions, pending);
        setUncertain(!confirmed);
        if (pending && confirmed) { pendingOutcome.current = null; setMessage("Operator decision confirmed for this effect."); }
        if (!pending && refusedOutcome.current) { refusedOutcome.current = false; setMessage("The decision was refused. Current records are loaded; you can review another submission."); }
        if (!confirmed) setMessage("Outcome not confirmed. The current records do not contain the attempted decision. Keep its reason and check again.");
      }
    }).catch(error => { if (!controller.signal.aborted) setStored(previous => ({ attempt, submissions: previous?.submissions, error: error instanceof Error ? error.message : "The qualification desk could not be loaded." })); });
    return () => controller.abort();
  }, [attempt]);
  async function decide(submissionId: string, decision: string, reason: string) {
    if (inFlight.current || uncertain) return;
    const input = qualificationDecisionSchema.safeParse({ action: "decide", submissionId, decision, reason });
    if (!input.success) { setMessage("Record at least 10 characters explaining the decision and what the agency should do next."); return; }
    pendingOutcome.current = { submissionId: input.data.submissionId, decision: input.data.decision, reason: input.data.reason };
    inFlight.current = true; setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/agency-qualification", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input.data) });
      const body = await response.json();
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && typeof body.error === "string") {
          pendingOutcome.current = null; refusedOutcome.current = true; setUncertain(true);
          setMessage(`The decision was refused: ${body.error} Reload decisions before another review.`);
          return;
        }
        throw new Error();
      }
      const submissions = z.array(qualificationRecordSchema).parse(body.submissions);
      if (!decisionRecorded(submissions, input.data)) throw new Error("Missing decision receipt");
      pendingOutcome.current = null; setStored({ attempt, submissions }); setMessage("Operator decision recorded for this effect. No client content was approved.");
    } catch { setUncertain(true); setMessage("Outcome not confirmed. Reload decisions before making another decision."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const latest = (current?.submissions ?? []).filter((item, index, all) => all.findIndex(other => other.workspaceId === item.workspaceId && other.effect === item.effect) === index);
  return <>
    <StTextButton disabled={busy} onClick={() => setAttempt(value => value + 1)}>Reload decisions</StTextButton>
    {message ? <StNotice tone={uncertain ? "critical" : undefined}>{message}</StNotice> : null}
    {!current ? <StSkeleton label="Loading agency submissions" /> : current.error ? <StNotice tone="critical">{current.error} Availability has not been confirmed. The displayed records may be stale.</StNotice> : null}
    {current?.submissions && !latest.length ? <StEmpty>No agency evidence is waiting. Agencies submit from their Verification page.</StEmpty> : current ? latest.map(item => <DecisionForm key={item.id} submission={item} disabled={busy || uncertain || refreshing || !!current.error || item.canReview !== true} onDecide={decide} />) : null}
    {(current?.submissions?.length ?? 0) > latest.length ? <StRows>{current!.submissions!.filter(item => !latest.includes(item)).map(item => <StRow key={item.id} title={`${item.agencyName} · ${qualificationRequirements[item.effect].name}`} detail={`${item.decision ?? "In review"} · ${item.reason ?? "No decision recorded"}`} />)}</StRows> : null}
  </>;
}
function DecisionForm({ submission, disabled, onDecide }: { submission: QualificationRecord; disabled: boolean; onDecide: (id: string, decision: string, reason: string) => Promise<void> }) {
  const [decision, setDecision] = useState("changes_requested");
  const [reason, setReason] = useState("");
  return <StSurface label={`${submission.agencyName} evidence`}>
    <div className="space-y-4">
      <h2 className="text-xl">{submission.agencyName} · {qualificationRequirements[submission.effect].name}</h2>
      <StState kind={submission.decision === "verified" ? "live" : "draft"}>{submission.decision === "verified" ? "Available" : submission.decision === null ? "In review" : "Unavailable"}</StState>
      <ul className="list-disc space-y-2 pl-5 text-sm text-gray-muted">{qualificationRequirements[submission.effect].requirements.map(requirement => <li key={requirement}>{requirement}</li>)}</ul>
      <p className="whitespace-pre-wrap text-sm">{submission.evidence}</p>
      <a className="text-sm underline underline-offset-4" href={submission.evidenceUrl} target="_blank" rel="noopener noreferrer">Open submitted evidence</a>
      <p className="text-sm text-gray-muted">Submitted {new Date(submission.submittedAt).toLocaleString("en-US", { timeZone: "UTC" })} UTC by {submission.submittedBy}</p>
      {submission.reason ? <p className="text-sm">Last operator decision: {submission.reason} · {submission.decidedBy}</p> : null}
      {submission.canReview !== true ? <StNotice>{submission.canReview === false ? "You belong to this agency. Its evidence stays in the platform review queue for an independent reviewer; you cannot record its decision." : "Review permission could not be confirmed. Reload decisions before recording a decision."}</StNotice> : null}
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!disabled) void onDecide(submission.id, decision, reason); }}>
        <SelectInput label="Availability for this effect" options={decisions} value={decision} disabled={disabled} onChange={event => setDecision(event.target.value)} />
        <TextArea label="Evidence checked and next action" value={reason} onChange={event => setReason(event.target.value)} required minLength={10} maxLength={500} disabled={disabled} />
        <StPill type="submit" disabled={disabled}>Record qualification decision</StPill>
      </form>
      <p className="text-sm text-gray-muted">An operator who belongs to this agency cannot decide its qualification. Release flags, client grants and provider readiness remain separate checks.</p>
    </div>
  </StSurface>;
}

function decisionRecorded(submissions: QualificationRecord[], expected: { submissionId: string; decision: string; reason: string }) {
  return submissions.some(item => item.id === expected.submissionId && item.decision === expected.decision && item.reason === expected.reason && item.decidedBy !== null && Number.isFinite(Date.parse(item.decidedAt ?? "")));
}
