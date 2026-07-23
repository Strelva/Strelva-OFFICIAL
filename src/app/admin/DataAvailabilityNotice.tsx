import { Info } from "lucide-react";

/** A calm, plain-English note when a live data source didn't answer — NOT a
 *  full-width amber alarm. A missing source means some counts are paused, not
 *  that anything is broken, so it reads as informational and sits quietly. */
export function DataAvailabilityNotice({ sources }: { sources: string[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mb-5 flex items-start gap-2.5 rounded-[10px] border border-glass-border bg-glass px-3.5 py-2.5 text-[12.5px] text-gray-muted">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-gray-faint" aria-hidden="true" />
      <p>
        Live counts are paused for {sources.join(", ")} — everything else is up to date.
      </p>
    </div>
  );
}
