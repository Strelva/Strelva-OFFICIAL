"use client";

import { useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { SelectInput, TextInput, TextArea } from "@/components/ui/TextInput";
import {
  TRACKER_EXPERIMENT_MAX_CANDIDATES,
  trackerExperimentComparisonInputSchema,
  type TrackerExperimentEvidenceKind,
} from "@/products/tracker/comparison";

type Props = {
  workId: string;
  expectedRevision: number;
  readOnly?: boolean;
};

const evidenceOptions = [
  { value: "simulated", label: "Simulated" },
  { value: "operator_reported", label: "Operator reported" },
  { value: "measured", label: "Measured" },
] satisfies Array<{ value: TrackerExperimentEvidenceKind; label: string }>;

const decisionOptions = [
  { value: "continue_testing", label: "Continue testing" },
  { value: "keep_baseline", label: "Keep the baseline" },
  { value: "stop_testing", label: "Stop testing" },
  { value: "needs_more_evidence", label: "Need more evidence" },
];

function numberValue(fields: FormData, name: string, fallback = 0): number {
  const raw = fields.get(name);
  if (raw === null || String(raw).trim() === "") return fallback;
  return Number(raw);
}

function nullableMoney(fields: FormData, name: string): number | null {
  const raw = fields.get(name);
  if (raw === null || String(raw).trim() === "") return null;
  return Number(raw);
}

function textValue(fields: FormData, name: string): string {
  return String(fields.get(name) ?? "").trim();
}

function failureLines(fields: FormData): string[] {
  return textValue(fields, "testFailures")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function optionFromForm(fields: FormData, prefix: string, evidenceKind: TrackerExperimentEvidenceKind) {
  return {
    id: textValue(fields, `${prefix}-id`),
    label: textValue(fields, `${prefix}-label`),
    version: textValue(fields, `${prefix}-version`),
    setupMinutes: numberValue(fields, `${prefix}-setupMinutes`),
    reviewMinutes: numberValue(fields, `${prefix}-reviewMinutes`),
    correctionMinutes: numberValue(fields, `${prefix}-correctionMinutes`),
    supportMinutes: numberValue(fields, `${prefix}-supportMinutes`),
    maintenanceMinutes: numberValue(fields, `${prefix}-maintenanceMinutes`),
    providerCostUsd: nullableMoney(fields, `${prefix}-providerCostUsd`),
    result: textValue(fields, `${prefix}-result`) || "inconclusive",
    evidenceKind,
  };
}

/**
 * Reusable fields for one side of a comparison. The variant is explicit so
 * the baseline and candidate copy stay clear without a growing set of mode
 * booleans.
 */
function ExperimentOptionFields({
  kind,
  index,
}: {
  kind: "baseline" | "candidate";
  index?: number;
}) {
  const prefix = kind === "baseline" ? "baseline" : `candidate-${index ?? 0}`;
  const labelPrefix = kind === "baseline" ? "Baseline" : `Candidate ${(index ?? 0) + 1}`;
  const isFirstCandidate = kind === "candidate" && (index ?? 0) === 0;
  const resultOptions = [
    { value: "inconclusive", label: "Inconclusive" },
    { value: "passed", label: "Passed the stated checks" },
    { value: "failed", label: "Failed the stated checks" },
  ];
  return (
    <fieldset className="space-y-3 rounded-lg border border-gray-border p-4">
      <legend className="px-1 font-display text-lg text-warm-black">{labelPrefix}</legend>
      <input type="hidden" name={`${prefix}-id`} value={kind === "baseline" ? "baseline" : `candidate-${index ?? 0}`} readOnly />
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput
          name={`${prefix}-label`}
          label={kind === "baseline" ? "Baseline approach" : "Candidate approach"}
          defaultValue={kind === "baseline" ? "Current manual process" : `Tracker candidate ${(index ?? 0) + 1}`}
          maxLength={160}
          required
        />
        <TextInput
          name={`${prefix}-version`}
          label={kind === "baseline" ? "Baseline version or date" : "Candidate version"}
          defaultValue={kind === "baseline" ? "current" : "v1"}
          maxLength={160}
          required
        />
      </div>
      {kind === "baseline" ? (
        <TextInput
          name="baselineMinutes"
          label="Previous approach, minutes"
          type="number"
          min={0}
          max={100000}
          step="any"
          helperText="Optional total-time reference. The breakdown below is used when it is filled in."
        />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <TextInput
          name={`${prefix}-setupMinutes`}
          label={isFirstCandidate ? "Setup, minutes" : `${labelPrefix} setup, minutes`}
          type="number"
          min={0}
          max={100000}
          step="any"
          defaultValue="0"
          required
        />
        <TextInput
          name={`${prefix}-reviewMinutes`}
          label={isFirstCandidate ? "Review, minutes" : `${labelPrefix} review, minutes`}
          type="number"
          min={0}
          max={100000}
          step="any"
          defaultValue="0"
          required
        />
        <TextInput
          name={`${prefix}-correctionMinutes`}
          label={isFirstCandidate ? "Corrections, minutes" : `${labelPrefix} corrections, minutes`}
          type="number"
          min={0}
          max={100000}
          step="any"
          defaultValue="0"
          required
        />
        <TextInput
          name={`${prefix}-supportMinutes`}
          label={kind === "baseline" ? "Baseline support, minutes" : isFirstCandidate ? "Support, minutes" : `${labelPrefix} support, minutes`}
          type="number"
          min={0}
          max={100000}
          step="any"
          defaultValue="0"
          required
        />
        <TextInput
          name={`${prefix}-maintenanceMinutes`}
          label={kind === "baseline" ? "Baseline maintenance, minutes" : isFirstCandidate ? "Maintenance, minutes" : `${labelPrefix} maintenance, minutes`}
          type="number"
          min={0}
          max={100000}
          step="any"
          defaultValue="0"
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput
          name={`${prefix}-providerCostUsd`}
          label={kind === "baseline" ? "Baseline provider cost, USD (leave blank if unknown)" : isFirstCandidate ? "Provider cost, USD (leave blank if unknown)" : `${labelPrefix} provider cost, USD (leave blank if unknown)`}
          type="number"
          min={0}
          max={100000}
          step="any"
        />
        <SelectInput
          name={`${prefix}-result`}
          label={kind === "baseline" ? "Baseline check result" : `${labelPrefix} check result`}
          options={resultOptions}
          defaultValue={kind === "baseline" ? "passed" : "inconclusive"}
        />
      </div>
    </fieldset>
  );
}

export function TrackerExperimentForm({ workId, expectedRevision, readOnly = false }: Props) {
  const [candidateCount, setCandidateCount] = useState(2);
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
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const evidenceKind = textValue(fields, "evidenceKind") as TrackerExperimentEvidenceKind;
      const baseline = optionFromForm(fields, "baseline", evidenceKind);
      const baselineReference = fields.get("baselineMinutes");
      const hasBreakdown = [
        baseline.setupMinutes,
        baseline.reviewMinutes,
        baseline.correctionMinutes,
        baseline.supportMinutes,
        baseline.maintenanceMinutes,
      ].some((value) => value > 0);
      // Keep the first form's Previous approach field useful for old saved
      // workflows while allowing new comparisons to use the full breakdown.
      if (!hasBreakdown && baselineReference !== null && String(baselineReference).trim() !== "") {
        baseline.reviewMinutes = Number(baselineReference);
      }
      const candidates = Array.from({ length: candidateCount }, (_, index) => optionFromForm(fields, `candidate-${index}`, evidenceKind));
      const comparison = trackerExperimentComparisonInputSchema.parse({
        hypothesis: textValue(fields, "hypothesis"),
        workload: textValue(fields, "workload"),
        workloadKey: textValue(fields, "workloadKey") || undefined,
        inputScope: textValue(fields, "inputScope"),
        baseline,
        candidates,
        evidenceKind,
        evidence: textValue(fields, "evidence"),
        testFailures: failureLines(fields),
        decision: textValue(fields, "decision"),
        promoted: false,
      });
      const response = await fetch("/api/tracker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "experiment",
          workId,
          input: { ...comparison, expectedRevision },
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "The experiment could not be recorded.");
      setMessage(result?.evidence?.kind === "candidate_comparison" || result?.evidence?.version === 2
        ? "Comparison recorded in My work. Evidence remains experimental and is not a verified customer savings claim."
        : "Experiment recorded in My work. These are reported observations, not verified customer savings.");
    } catch (error) {
      setFailed(true);
      if (error instanceof z.ZodError) {
        setMessage("Complete the baseline, candidate, effort, evidence and decision fields before recording the comparison.");
      } else {
        setMessage(error instanceof Error ? error.message : "The experiment could not be recorded.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (readOnly) return <p role="note" className="border-t border-gray-border pt-4 text-sm text-gray-muted">Experiment records require workspace membership.</p>;

  return (
    <details className="border-t border-gray-border pt-4">
      <summary className="cursor-pointer text-sm">Internal R&amp;D: record an experiment</summary>
      <form onSubmit={(event) => void record(event)} className="mt-4 space-y-5">
        <div className="space-y-3">
          <TextInput label="What are we testing?" name="hypothesis" required maxLength={1000} disabled={busy} />
          <TextInput label="Workload and comparison method" name="workload" helperText="Describe the same job, rows or cases each option receives." required maxLength={1000} disabled={busy} />
          <TextInput label="Input scope" name="inputScope" defaultValue="The same saved tracker revision and imported rows" required maxLength={1000} disabled={busy} />
          <TextInput label="Workload key (optional)" name="workloadKey" helperText="Use a stable fixture or sample ID when one exists." maxLength={160} disabled={busy} />
        </div>

        <section aria-labelledby="tracker-experiment-baseline-title" className="space-y-3">
          <div>
            <h2 id="tracker-experiment-baseline-title" className="font-display text-lg text-warm-black">Explicit baseline</h2>
            <p className="text-sm text-gray-muted">Record the reference approach and include the human effort needed to support and maintain it.</p>
          </div>
          <ExperimentOptionFields kind="baseline" />
        </section>

        <section aria-labelledby="tracker-experiment-candidates-title" className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 id="tracker-experiment-candidates-title" className="font-display text-lg text-warm-black">Candidates</h2>
              <p className="text-sm text-gray-muted">Each candidate runs against the same workload. Costs left blank stay unknown.</p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCandidateCount((current) => Math.min(TRACKER_EXPERIMENT_MAX_CANDIDATES, current + 1))}
                disabled={busy || candidateCount >= TRACKER_EXPERIMENT_MAX_CANDIDATES}
              >
                Add candidate
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCandidateCount((current) => Math.max(1, current - 1))}
                disabled={busy || candidateCount <= 1}
              >
                Remove last
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {Array.from({ length: candidateCount }, (_, index) => <ExperimentOptionFields key={index} kind="candidate" index={index} />)}
          </div>
        </section>

        <section aria-labelledby="tracker-experiment-evidence-title" className="space-y-3">
          <h2 id="tracker-experiment-evidence-title" className="font-display text-lg text-warm-black">Evidence and decision</h2>
          <SelectInput
            name="evidenceKind"
            label="Evidence type"
            options={evidenceOptions}
            defaultValue="operator_reported"
            disabled={busy}
          />
          <p className="text-sm text-gray-muted">Simulated and operator-reported evidence helps plan the next test. Measured evidence needs a repeatable source or instrument.</p>
          <TextArea label="Checks, evidence and failures" name="evidence" required maxLength={2000} disabled={busy} />
          <TextArea label="Test failures (one per line, optional)" name="testFailures" maxLength={10000} disabled={busy} />
          <SelectInput name="decision" label="Decision" options={decisionOptions} defaultValue="needs_more_evidence" disabled={busy} />
          <p className="text-sm text-gray-muted">Recording a comparison keeps it experimental. It never promotes or publishes an offering.</p>
        </section>

        <Button type="submit" disabled={busy}>{busy ? "Recording…" : "Record experiment"}</Button>
        {message ? <p role={failed ? "alert" : "status"} aria-live={failed ? "assertive" : "polite"} aria-atomic="true" className="text-sm">{message}</p> : null}
      </form>
    </details>
  );
}
