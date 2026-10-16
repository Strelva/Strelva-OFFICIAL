import Link from "next/link";
import { XaRow, XaRows } from "@/components/ui/strelva/Xa";
import type { ScanHistoryPoint, ScanSummary } from "@/lib/scan-store";

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "an unknown date"
    : parsed.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function DatedSiteCheckHistory({
  latest,
  history,
  dashboardHref,
}: {
  latest: ScanSummary | null;
  history: ScanHistoryPoint[];
  dashboardHref: (path: string) => string;
}) {
  return (
    <section className="flex flex-col gap-3" aria-labelledby="dated-site-check-history-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="dated-site-check-history-title" className="m-0 text-[13px] font-medium text-[var(--st-text-3)]">Site checks</h2>
        <Link href={dashboardHref("/dashboard/health")} className="text-[14px] font-medium text-[var(--st-accent)] hover:underline">See site health</Link>
      </div>
      {latest ? (
        <p className="m-0 text-[15px] leading-[1.5] text-[var(--st-text)]">
          The last check, {date(latest.scannedAt)}, scored <span className="tabular-nums">{latest.overallScore}</span>, grade {latest.grade}. Opening this page doesn&apos;t run another check.
        </p>
      ) : null}
      {history.length > 0 ? (
        <XaRows label="Dated site checks">
          {history.slice().reverse().map((point) => (
            <XaRow key={`${point.scannedAt}-${point.overallScore}`} title={date(point.scannedAt)} meta={`${point.overallScore} · grade ${point.grade}`} />
          ))}
        </XaRows>
      ) : !latest ? (
        <p className="m-0 text-[15px] text-[var(--st-text-2)]">No site check has been recorded yet. The first one runs on its own.</p>
      ) : null}
    </section>
  );
}
