import { ArrowRight, Flag, Gauge, MessageSquareText, Star, Users } from "lucide-react";
import type { ComponentType } from "react";
import type { Milestone, MilestoneMetric } from "@/lib/milestone";

const METRIC_ICON: Record<MilestoneMetric["key"], ComponentType<{ className?: string; strokeWidth?: number }>> = {
  visitors: Users,
  reviews: MessageSquareText,
  rating: Star,
  health: Gauge,
};

/** Up is the only celebrated direction. Flat/down/new render neutrally — the
 *  product rule is that a metric that didn't move is shown honestly, never spun. */
function valueClass(direction: MilestoneMetric["direction"]): string {
  return direction === "up" ? "text-positive" : "text-warm-black";
}

function MetricTile({ metric }: { metric: MilestoneMetric }) {
  const Icon = METRIC_ICON[metric.key];

  return (
    <div className="rounded-xl border border-gray-border/70 bg-surface-raised p-4">
      <div className="mb-3 flex items-center gap-2 text-gray-muted">
        <Icon className="h-4 w-4" strokeWidth={1.5} />
        <span className="text-[11px] font-medium uppercase tracking-[0.12em]">{metric.label}</span>
      </div>

      {metric.kind === "total" ? (
        <p className={`text-[28px] font-semibold leading-none ${valueClass(metric.direction)}`}>
          {metric.now}
        </p>
      ) : metric.then !== null ? (
        // then -> now, the before/after the whole panel exists to show.
        <div className="flex items-baseline gap-2">
          <span className="text-[20px] font-medium leading-none text-gray-muted">{metric.then}</span>
          <ArrowRight className="h-4 w-4 shrink-0 text-gray-muted" strokeWidth={1.6} />
          <span className={`text-[28px] font-semibold leading-none ${valueClass(metric.direction)}`}>
            {metric.now}
          </span>
        </div>
      ) : (
        // No earlier baseline yet: show where you are now + when tracking began,
        // never a fabricated "then".
        <div>
          <p className={`text-[28px] font-semibold leading-none ${valueClass(metric.direction)}`}>
            {metric.now}
          </p>
          {metric.trackingSince && (
            <p className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-gray-muted">
              tracking since {metric.trackingSince}
            </p>
          )}
        </div>
      )}

      <p className="mt-2 text-[12px] leading-relaxed text-gray-muted">{metric.caption}</p>
    </div>
  );
}

/**
 * The 90-day "prove it" milestone. Surfaces a concrete before/after so a client
 * sees a real win before the churn window — the retention wedge. Two states:
 * a forward-looking "building" state for young/quiet tenants, and the full
 * then -> now recap once there's enough measured history.
 */
export function MilestonePanel({ milestone }: { milestone: Milestone }) {
  if (milestone.state === "building") {
    return (
      <section className="rounded-2xl border border-glass-border bg-glass p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
          Your first 90 days
        </p>
        <div className="mt-3 flex items-start gap-2.5">
          <Flag className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.6} />
          <div className="min-w-0">
            <h2 className="text-[16px] font-semibold text-warm-black">Your recap is building</h2>
            <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-gray-muted">
              {milestone.buildingNote}
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-glass-border bg-glass p-5">
      <div className="flex items-start gap-2.5">
        <Flag className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.6} />
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
            Since you started
          </p>
          <h2 className="mt-1.5 text-[18px] font-semibold leading-snug text-warm-black">
            {milestone.headline}
          </h2>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {milestone.metrics.map((metric) => (
          <MetricTile key={metric.key} metric={metric} />
        ))}
      </div>
    </section>
  );
}
