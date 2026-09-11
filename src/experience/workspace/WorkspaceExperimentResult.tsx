import Link from "next/link";
import type { WorkspaceWork } from "./contracts";

function minutes(value: number): string {
  return `${value} min`;
}

function recordedDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date not recorded" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

/** A compact, typed view for immutable R&D evidence stored in My work. */
export function WorkspaceExperimentResult({ work, onOpenTracker }: { work: WorkspaceWork; onOpenTracker?: (workId: string) => void }) {
  const experiment = work.experiment;
  if (!experiment) {
    return <section className="mx-auto w-full max-w-2xl"><p className="text-sm text-gray-muted">This experiment could not be displayed. Its stored record remains unchanged.</p></section>;
  }
  const trackerHref = work.sourceWorkId
    ? `/workspace?workspaceId=${encodeURIComponent(work.workspaceId)}&view=tracker&work=${encodeURIComponent(work.sourceWorkId)}`
    : null;
  return <article className="mx-auto w-full max-w-3xl space-y-8">
    <header>
      <p className="text-sm text-accent-text">Internal R&amp;D · Tracker experiment</p>
      <h1 className="mt-2 font-display text-3xl font-medium text-warm-black">{work.title}</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-gray-muted">{experiment.hypothesis}</p>
    </header>
    <dl className="grid gap-4 border-y border-gray-border py-5 text-sm sm:grid-cols-2">
      <div><dt className="text-gray-muted">Result</dt><dd className="mt-1 font-medium capitalize">{experiment.result}</dd></div>
      <div><dt className="text-gray-muted">Observed effort</dt><dd className="mt-1 font-medium">{minutes(experiment.observedMinutes)}</dd></div>
      <div><dt className="text-gray-muted">Previous approach</dt><dd className="mt-1 font-medium">{minutes(experiment.baselineMinutes)}</dd></div>
      <div><dt className="text-gray-muted">Reported difference</dt><dd className="mt-1 font-medium">{experiment.differenceMinutes >= 0 ? "−" : "+"}{minutes(Math.abs(experiment.differenceMinutes))}</dd></div>
      <div><dt className="text-gray-muted">Provider cost</dt><dd className="mt-1 font-medium">{experiment.providerCostUsd === null ? "Not recorded" : `$${experiment.providerCostUsd.toFixed(2)}`}</dd></div>
      <div><dt className="text-gray-muted">Tracker version</dt><dd className="mt-1 font-medium">{experiment.targetRevision}</dd></div>
      <div><dt className="text-gray-muted">Recorded</dt><dd className="mt-1 font-medium">{recordedDate(experiment.recordedAt)}</dd></div>
    </dl>
    <section className="space-y-3">
      <h2 className="font-display text-xl font-medium text-warm-black">Reported effort</h2>
      <dl className="grid gap-3 text-sm sm:grid-cols-3">
        <div><dt className="text-gray-muted">Setup</dt><dd className="mt-1 font-medium">{minutes(experiment.setupMinutes)}</dd></div>
        <div><dt className="text-gray-muted">Review</dt><dd className="mt-1 font-medium">{minutes(experiment.reviewMinutes)}</dd></div>
        <div><dt className="text-gray-muted">Corrections</dt><dd className="mt-1 font-medium">{minutes(experiment.correctionMinutes)}</dd></div>
      </dl>
    </section>
    <section className="space-y-3">
      <h2 className="font-display text-xl font-medium text-warm-black">Comparison method</h2>
      <p className="text-[15px] leading-relaxed text-gray-muted">{experiment.workload}</p>
    </section>
    <section className="space-y-3">
      <h2 className="font-display text-xl font-medium text-warm-black">Evidence and checks</h2>
      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-gray-muted">{experiment.evidence}</p>
    </section>
    {trackerHref ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-gray-border px-4 text-sm font-medium text-warm-black" href={trackerHref} onNavigate={onOpenTracker && work.sourceWorkId ? (event) => { event.preventDefault(); onOpenTracker(work.sourceWorkId!); } : undefined}>Open current tracker</Link> : null}
    <p className="border-t border-gray-border pt-4 text-xs leading-relaxed text-gray-muted">Operator reported evidence captured for this tracker version. It is immutable and has not been promoted into a customer capability or verified savings claim.</p>
  </article>;
}
