import type { ComponentType } from "react";
import { Activity, Bot, Eye, MousePointerClick } from "lucide-react";
import type { OwnerRetentionSignals } from "@/lib/retention";

function StatusBadge({ aiChangesThisWeek }: { aiChangesThisWeek: number }) {
  const isFresh = aiChangesThisWeek > 0;
  const label = isFresh ? "Fresh this week" : "Time for a quick update";
  const className = isFresh
    ? "border-success/20 bg-success-dim text-success"
    : "border-glass-border bg-glass text-gray-muted";

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium ${className}`}>
      {label}
    </span>
  );
}

function RetentionMetric({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <div className="rounded-xl border border-gray-border/70 bg-surface-raised p-4">
      <div className="mb-3 flex items-center gap-2 text-gray-muted">
        <Icon className="h-4 w-4" strokeWidth={1.5} />
        <span className="text-[11px] font-medium uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className="text-[24px] font-semibold leading-none text-warm-black">{value}</p>
      <p className="mt-2 text-[12px] leading-relaxed text-gray-muted">{detail}</p>
    </div>
  );
}

function formatDays(days: number | null): string {
  if (days === null) return "No signal yet";
  if (days === 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

export function RetentionPanel({ signals }: { signals: OwnerRetentionSignals }) {
  return (
    <section className="rounded-2xl border border-glass-border bg-glass p-5">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
            Weekly proof
          </p>
          <h2 className="mt-2 text-[18px] font-semibold text-warm-black">
            Updates and engagement
          </h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-gray-muted">
            See what changed on your site, how many people found you after fresh work, and which proof signals are active.
          </p>
        </div>
        <StatusBadge aiChangesThisWeek={signals.aiChangesThisWeek} />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <RetentionMetric
          label="Updates this week"
          value={signals.aiChangesThisWeek}
          detail={`${formatDays(signals.noAiUsageDays)} since last update`}
          icon={Bot}
        />
        <RetentionMetric
          label="Traffic after updates"
          value={signals.trafficAfterAiUpdates}
          detail="People found you during weeks with fresh site work"
          icon={Eye}
        />
        <RetentionMetric
          label="Engagement signals"
          value={signals.engagementSignalsThisWeek}
          detail={`${signals.aiChatOpensThisWeek} chat, ${signals.reportViewsThisWeek} report, ${signals.referralsThisWeek} referral`}
          icon={MousePointerClick}
        />
      </div>

      <div className="mt-4 rounded-xl border border-gray-border/70 bg-surface-raised p-4">
        <div className="flex items-start gap-3">
          <Activity className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={1.6} />
          <div>
            <p className="text-[13px] font-medium text-warm-black">Your next useful move</p>
            <p className="mt-1 text-[12px] leading-relaxed text-gray-muted">
              {signals.ownerNextAction}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
