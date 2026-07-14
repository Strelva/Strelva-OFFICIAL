import { TriangleAlert } from "lucide-react";

export function DataAvailabilityNotice({ sources }: { sources: string[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="mb-5 flex items-start gap-2.5 rounded-[10px] border border-warning/30 bg-warning/10 px-3.5 py-3 text-[12.5px] text-warning">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        <b className="font-semibold">Some operator data is unavailable.</b>{" "}
        Counts may be incomplete for {sources.join(", ")}. Existing actions remain safe.
      </p>
    </div>
  );
}
