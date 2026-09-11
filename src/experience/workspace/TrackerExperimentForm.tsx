"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextInput, TextArea } from "@/components/ui/TextInput";

export function TrackerExperimentForm({ workId, expectedRevision, readOnly = false }: { workId: string; expectedRevision: number; readOnly?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function record(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) {
      setFailed(true);
      setMessage("This tracker is read only. Its owner controls experiment records.");
      return;
    }
    const fields = new FormData(event.currentTarget);
    setBusy(true); setMessage(""); setFailed(false);
    try {
      const response = await fetch("/api/tracker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "experiment", workId, input: {
        hypothesis: fields.get("hypothesis"), workload: fields.get("workload"), evidence: fields.get("evidence"), result: fields.get("result"),
        baselineMinutes: Number(fields.get("baselineMinutes")), setupMinutes: Number(fields.get("setupMinutes")), reviewMinutes: Number(fields.get("reviewMinutes")), correctionMinutes: Number(fields.get("correctionMinutes")),
        providerCostUsd: fields.get("providerCostUsd") === "" ? null : Number(fields.get("providerCostUsd")),
        expectedRevision,
      } }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The experiment could not be recorded.");
      setMessage("Experiment recorded in My work. These are reported observations, not verified customer savings.");
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "The experiment could not be recorded."); }
    finally { setBusy(false); }
  }
  if (readOnly) return <p role="note" className="border-t border-gray-border pt-4 text-sm text-gray-muted">Experiment records require workspace membership.</p>;
  return <details className="border-t border-gray-border pt-4"><summary className="cursor-pointer text-sm">Internal R&amp;D: record an experiment</summary><form onSubmit={(event) => void record(event)} className="mt-4 space-y-4">
    <TextInput label="What are we testing?" name="hypothesis" required maxLength={1000} disabled={busy} />
    <TextInput label="Workload and comparison method" name="workload" required maxLength={1000} disabled={busy} />
    <div className="grid gap-4 sm:grid-cols-2">{[["baselineMinutes", "Previous approach, minutes"], ["setupMinutes", "Setup, minutes"], ["reviewMinutes", "Review, minutes"], ["correctionMinutes", "Corrections, minutes"]].map(([name, label]) => <TextInput key={name} name={name} label={label} type="number" min={0} max={100000} step="any" required disabled={busy} />)}<TextInput name="providerCostUsd" label="Provider cost, USD (leave blank if unknown)" type="number" min={0} max={100000} step="any" disabled={busy} /></div>
    <label className="block text-sm">Result<select name="result" className="ml-3 rounded border border-gray-border bg-surface-inset p-2" disabled={busy}><option value="inconclusive">Inconclusive</option><option value="passed">Passed the stated checks</option><option value="failed">Failed the stated checks</option></select></label>
    <TextArea label="Checks, evidence and failures" name="evidence" required maxLength={2000} disabled={busy} />
    <p className="text-sm text-gray-muted">This records the current tracker version and your observations. It does not promote or publish a capability.</p>
    <Button type="submit" disabled={busy}>{busy ? "Recording…" : "Record experiment"}</Button>
    {message ? <p role={failed ? "alert" : "status"} aria-live={failed ? "assertive" : "polite"} aria-atomic="true" className="text-sm">{message}</p> : null}
  </form></details>;
}
