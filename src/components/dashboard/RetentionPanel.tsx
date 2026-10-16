import { XaAnswers, XaLabel, XaSays } from "@/components/ui/strelva/Xa";
import type { OwnerRetentionSignals } from "@/lib/retention";

function sinceLastChange(days: number | null): string {
  if (days === null) return "no change yet";
  if (days === 0) return "the last one today";
  if (days === 1) return "the last one yesterday";
  return `the last one ${days} days ago`;
}

/**
 * This week's proof as plain answers, then Strelva's one suggestion. The
 * numbers are the owner's own (retention.ts); nothing here is a KPI tile.
 */
export function RetentionPanel({ signals }: { signals: OwnerRetentionSignals }) {
  const changes = signals.aiChangesThisWeek;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="retention-label">
      <XaLabel id="retention-label">This week</XaLabel>
      <XaAnswers labelWidth={168} rows={[
        ["Changes to your site", `${changes === 0 ? "None" : changes} this week, ${sinceLastChange(signals.noAiUsageDays)}`],
        ["Visits after a change", `${signals.trafficAfterAiUpdates.toLocaleString()} ${signals.trafficAfterAiUpdates === 1 ? "person" : "people"} in weeks with fresh work`],
      ]} />
      {signals.ownerNextAction ? <XaSays>{signals.ownerNextAction}</XaSays> : null}
    </section>
  );
}
