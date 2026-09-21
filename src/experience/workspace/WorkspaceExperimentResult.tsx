import Link from "next/link";
import type { TrackerExperimentComparison, TrackerExperimentEvidenceKind, TrackerExperimentOptionSummary } from "@/products/tracker/client";
import type { WorkspaceExperiment, WorkspaceLegacyExperiment, WorkspaceWork } from "./contracts";

function minutes(value: number): string {
  return `${value} min`;
}

function recordedDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date not recorded" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function evidenceLabel(value: TrackerExperimentEvidenceKind): string {
  if (value === "simulated") return "Simulated";
  if (value === "measured") return "Measured";
  return "Operator reported";
}

function signedMinutes(value: number): string {
  return `${value >= 0 ? "−" : "+"}${minutes(Math.abs(value))}`;
}

function optionCost(option: Pick<TrackerExperimentOptionSummary, "providerCostUsd" | "providerCostStatus">): string {
  if (option.providerCostUsd === null || option.providerCostStatus === "unknown") return "Unknown";
  return `$${option.providerCostUsd.toFixed(2)}`;
}

function comparisonFromExperiment(value: WorkspaceExperiment | undefined): TrackerExperimentComparison | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as unknown as Record<string, unknown>;
  if (candidate.version !== 2 || candidate.kind !== "candidate_comparison" || !Array.isArray(candidate.candidates) || !Array.isArray(candidate.comparisons)) return null;
  return value as unknown as TrackerExperimentComparison;
}

function OptionEffort({ option }: { option: TrackerExperimentOptionSummary }) {
  return (
    <dl className="grid gap-3 text-sm sm:grid-cols-5">
      <div><dt className="text-gray-muted">Setup</dt><dd className="mt-1 font-medium">{minutes(option.setupMinutes)}</dd></div>
      <div><dt className="text-gray-muted">Review</dt><dd className="mt-1 font-medium">{minutes(option.reviewMinutes)}</dd></div>
      <div><dt className="text-gray-muted">Corrections</dt><dd className="mt-1 font-medium">{minutes(option.correctionMinutes)}</dd></div>
      <div><dt className="text-gray-muted">Support</dt><dd className="mt-1 font-medium">{minutes(option.supportMinutes)}</dd></div>
      <div><dt className="text-gray-muted">Maintenance</dt><dd className="mt-1 font-medium">{minutes(option.maintenanceMinutes)}</dd></div>
    </dl>
  );
}

function LegacyExperimentResult({ work, onOpenTracker }: { work: WorkspaceWork; onOpenTracker?: (workId: string) => void }) {
  const experiment = work.experiment;
  if (!experiment || "kind" in experiment) return null;
  const legacyExperiment: WorkspaceLegacyExperiment = experiment;
  const trackerHref = work.sourceWorkId
    ? `/workspace?workspaceId=${encodeURIComponent(work.workspaceId)}&view=tracker&work=${encodeURIComponent(work.sourceWorkId)}`
    : null;
  return (
    <article className="mx-auto w-full max-w-3xl space-y-8">
      <header>
        <p className="text-sm text-accent-text">Internal R&amp;D · Tracker experiment</p>
        <h1 className="mt-2 font-display text-3xl font-medium text-warm-black">{work.title}</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-gray-muted">{experiment.hypothesis}</p>
      </header>
      <dl className="grid gap-4 border-y border-gray-border py-5 text-sm sm:grid-cols-2">
        <div><dt className="text-gray-muted">Result</dt><dd className="mt-1 font-medium capitalize">{legacyExperiment.result}</dd></div>
        <div><dt className="text-gray-muted">Observed effort</dt><dd className="mt-1 font-medium">{minutes(legacyExperiment.observedMinutes)}</dd></div>
        <div><dt className="text-gray-muted">Previous approach</dt><dd className="mt-1 font-medium">{minutes(legacyExperiment.baselineMinutes)}</dd></div>
        <div><dt className="text-gray-muted">Reported difference</dt><dd className="mt-1 font-medium">{signedMinutes(legacyExperiment.differenceMinutes)}</dd></div>
        <div><dt className="text-gray-muted">Provider cost</dt><dd className="mt-1 font-medium">{legacyExperiment.providerCostUsd === null ? "Not recorded" : `$${legacyExperiment.providerCostUsd.toFixed(2)}`}</dd></div>
        <div><dt className="text-gray-muted">Tracker version</dt><dd className="mt-1 font-medium">{legacyExperiment.targetRevision}</dd></div>
        <div><dt className="text-gray-muted">Recorded</dt><dd className="mt-1 font-medium">{recordedDate(legacyExperiment.recordedAt)}</dd></div>
      </dl>
      <section className="space-y-3">
        <h2 className="font-display text-xl font-medium text-warm-black">Reported effort</h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-gray-muted">Setup</dt><dd className="mt-1 font-medium">{minutes(legacyExperiment.setupMinutes)}</dd></div>
          <div><dt className="text-gray-muted">Review</dt><dd className="mt-1 font-medium">{minutes(legacyExperiment.reviewMinutes)}</dd></div>
          <div><dt className="text-gray-muted">Corrections</dt><dd className="mt-1 font-medium">{minutes(legacyExperiment.correctionMinutes)}</dd></div>
        </dl>
      </section>
      <section className="space-y-3">
        <h2 className="font-display text-xl font-medium text-warm-black">Comparison method</h2>
        <p className="text-[15px] leading-relaxed text-gray-muted">{legacyExperiment.workload}</p>
      </section>
      <section className="space-y-3">
        <h2 className="font-display text-xl font-medium text-warm-black">Evidence and checks</h2>
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-muted">{legacyExperiment.evidence}</p>
      </section>
      {trackerHref ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-gray-border px-4 text-sm font-medium text-warm-black" href={trackerHref} onNavigate={onOpenTracker && work.sourceWorkId ? (event) => { event.preventDefault(); onOpenTracker(work.sourceWorkId!); } : undefined}>Open current tracker</Link> : null}
      <p className="border-t border-gray-border pt-4 text-xs leading-relaxed text-gray-muted">Operator reported evidence captured for this tracker version. It is immutable and has not been promoted into a customer capability or verified savings claim.</p>
    </article>
  );
}

function ComparisonResult({ comparison, work, onOpenTracker }: { comparison: TrackerExperimentComparison; work: WorkspaceWork; onOpenTracker?: (workId: string) => void }) {
  const trackerHref = work.sourceWorkId
    ? `/workspace?workspaceId=${encodeURIComponent(work.workspaceId)}&view=tracker&work=${encodeURIComponent(work.sourceWorkId)}`
    : null;
  return (
    <article className="mx-auto w-full max-w-4xl space-y-8">
      <header className="space-y-3">
        <p className="text-sm text-accent-text">Internal R&amp;D · Candidate comparison</p>
        <h1 className="font-display text-3xl font-medium text-warm-black">{work.title}</h1>
        <p className="max-w-3xl text-[15px] leading-relaxed text-gray-muted">{comparison.hypothesis}</p>
        <p className="inline-flex w-fit rounded-full border border-gray-border px-3 py-1 text-xs text-gray-muted">Experimental · {evidenceLabel(comparison.evidenceKind)} evidence · Not promoted</p>
      </header>

      <section aria-labelledby="experiment-workload-title" className="space-y-3 border-y border-gray-border py-5">
        <h2 id="experiment-workload-title" className="font-display text-xl font-medium text-warm-black">Same workload</h2>
        <p className="text-[15px] leading-relaxed text-gray-muted">{comparison.workload}</p>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-gray-muted">Input scope</dt><dd className="mt-1 font-medium text-warm-black">{comparison.inputScope}</dd></div>
          <div><dt className="text-gray-muted">Workload key</dt><dd className="mt-1 font-medium text-warm-black">{comparison.workloadKey || "Not recorded"}</dd></div>
        </dl>
      </section>

      <section aria-labelledby="experiment-options-title" className="space-y-4">
        <div>
          <h2 id="experiment-options-title" className="font-display text-xl font-medium text-warm-black">Baseline and candidates</h2>
          <p className="mt-1 text-sm text-gray-muted">Human effort includes setup, review, corrections, support and maintenance. Provider cost stays unknown when it was not recorded.</p>
        </div>
        <div className="space-y-4">
          <section className="space-y-3 rounded-lg border border-gray-border p-4" aria-labelledby="experiment-baseline-title">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div><h3 id="experiment-baseline-title" className="font-medium text-warm-black">{comparison.baseline.label}</h3><p className="text-sm text-gray-muted">Baseline · {comparison.baseline.version}</p></div>
              <p className="text-sm font-medium text-warm-black">{minutes(comparison.baseline.totalHumanMinutes)} human effort · {optionCost(comparison.baseline)}</p>
            </div>
            <OptionEffort option={comparison.baseline} />
          </section>

          <div className="overflow-x-auto rounded-lg border border-gray-border" tabIndex={0} role="region" aria-labelledby="experiment-candidates-title">
            <table className="w-full min-w-[42rem] text-left text-sm">
              <caption id="experiment-candidates-title" className="border-b border-gray-border p-4 text-left font-medium text-warm-black">Candidate results</caption>
              <thead><tr className="border-b border-gray-border text-gray-muted"><th scope="col" className="p-4">Candidate</th><th scope="col" className="p-4">Human effort</th><th scope="col" className="p-4">Difference vs baseline</th><th scope="col" className="p-4">Provider cost</th><th scope="col" className="p-4">Result</th></tr></thead>
              <tbody>{comparison.comparisons.map((row) => <tr key={row.candidateId} className="border-b border-gray-border last:border-b-0 align-top">
                <th scope="row" className="p-4 font-medium text-warm-black"><span className="block">{row.candidateLabel}</span><span className="mt-1 block text-xs font-normal text-gray-muted">{row.candidateVersion} · {evidenceLabel(row.evidenceKind)}</span></th>
                <td className="p-4">{minutes(row.totalHumanMinutes)}</td>
                <td className="p-4">{signedMinutes(row.humanMinutesDifference)}</td>
                <td className="p-4">{optionCost(row)}</td>
                <td className="p-4 capitalize">{row.result}</td>
              </tr>)}</tbody>
            </table>
          </div>

          <div className="space-y-3">
            {comparison.candidates.map((candidate) => <details key={candidate.id} className="rounded-lg border border-gray-border px-4 py-3">
              <summary className="cursor-pointer text-sm font-medium text-warm-black">{candidate.label} effort detail</summary>
              <div className="mt-4"><OptionEffort option={candidate} /></div>
              {candidate.evidence ? <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-gray-muted">{candidate.evidence}</p> : null}
            </details>)}
          </div>
        </div>
      </section>

      <section aria-labelledby="experiment-evidence-title" className="space-y-3">
        <h2 id="experiment-evidence-title" className="font-display text-xl font-medium text-warm-black">Evidence and decision</h2>
        <p className="text-[15px] leading-relaxed text-gray-muted">{comparison.evidence}</p>
        <dl className="grid gap-3 border-y border-gray-border py-4 text-sm sm:grid-cols-2">
          <div><dt className="text-gray-muted">Evidence type</dt><dd className="mt-1 font-medium text-warm-black">{evidenceLabel(comparison.evidenceKind)}</dd></div>
          <div><dt className="text-gray-muted">Decision</dt><dd className="mt-1 font-medium capitalize text-warm-black">{comparison.decision.replaceAll("_", " ")}</dd></div>
          <div><dt className="text-gray-muted">Test failures</dt><dd className="mt-1 font-medium text-warm-black">{comparison.testFailures.length ? comparison.testFailures.length : "None recorded"}</dd></div>
          <div><dt className="text-gray-muted">Recorded</dt><dd className="mt-1 font-medium text-warm-black">{recordedDate((comparison as unknown as { recordedAt?: string }).recordedAt ?? work.createdAt)}</dd></div>
        </dl>
        {comparison.testFailures.length ? <ul aria-label="Test failures" className="list-disc space-y-1 pl-5 text-sm text-gray-muted">{comparison.testFailures.map((failure, index) => <li key={`${failure}-${index}`}>{failure}</li>)}</ul> : null}
      </section>

      {trackerHref ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-gray-border px-4 text-sm font-medium text-warm-black" href={trackerHref} onNavigate={onOpenTracker && work.sourceWorkId ? (event) => { event.preventDefault(); onOpenTracker(work.sourceWorkId!); } : undefined}>Open current tracker</Link> : null}
      <p className="border-t border-gray-border pt-4 text-xs leading-relaxed text-gray-muted">This comparison is immutable research evidence. It records the selected decision and stays experimental; it does not promote, publish or claim verified customer savings.</p>
    </article>
  );
}

/** A compact, typed view for immutable R&amp;D evidence stored in My work. */
export function WorkspaceExperimentResult({ work, onOpenTracker }: { work: WorkspaceWork; onOpenTracker?: (workId: string) => void }) {
  const comparison = comparisonFromExperiment(work.experiment);
  if (comparison) return <ComparisonResult comparison={comparison} work={work} onOpenTracker={onOpenTracker} />;
  if (!work.experiment) {
    return <section className="mx-auto w-full max-w-2xl"><p className="text-sm text-gray-muted">This experiment could not be displayed. Its stored record remains unchanged.</p></section>;
  }
  return <LegacyExperimentResult work={work} onOpenTracker={onOpenTracker} />;
}
