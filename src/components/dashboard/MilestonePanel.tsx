import { XaAnswers, XaLabel } from "@/components/ui/strelva/Xa";
import type { Milestone, MilestoneMetric } from "@/lib/milestone";

/** One metric as a plain then-to-now answer. A metric that didn't move is said honestly, never spun. */
function answer(metric: MilestoneMetric): string {
  if (metric.kind === "total") return `${metric.now}. ${metric.caption}`;
  if (metric.then !== null) return `${metric.then} then, ${metric.now} now. ${metric.caption}`;
  return `${metric.now}${metric.trackingSince ? `, tracking since ${metric.trackingSince}` : ""}. ${metric.caption}`;
}

/**
 * The 90-day "prove it" milestone: a concrete before and after, said as
 * answers. Two states: building (young or quiet businesses) and the full
 * then-to-now recap once there's enough measured history.
 */
export function MilestonePanel({ milestone }: { milestone: Milestone; visitorSeries?: number[] }) {
  if (milestone.state === "building") {
    const daysIn = milestone.daysSinceStart;
    const daysRemaining = Math.max(0, 90 - daysIn);
    return (
      <section className="flex flex-col gap-3" aria-labelledby="milestone-label">
        <XaLabel id="milestone-label">Your first 90 days</XaLabel>
        <p className="m-0 max-w-[640px] text-[15px] leading-[1.5] text-[var(--st-text-body)]">
          {daysIn > 0
            ? `${daysIn} ${daysIn === 1 ? "day" : "days"} in. In about ${daysRemaining} more, this shows your visits, reviews and site health against day one.`
            : "After a few weeks of data, this shows what changed since you started: visits, reviews and site health against day one."}
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="milestone-label">
      <XaLabel id="milestone-label">Since you started</XaLabel>
      <p className="m-0 max-w-[640px] text-[17px] leading-[1.45] text-[var(--st-text)]">{milestone.headline}</p>
      <XaAnswers labelWidth={140} rows={milestone.metrics.map((metric) => [metric.label, answer(metric)] as const)} />
    </section>
  );
}
