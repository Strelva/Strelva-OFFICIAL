import Link from "next/link";
import type { ScanHistoryPoint, ScanSummary } from "@/lib/scan-store";

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Date unavailable"
    : parsed.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
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
    <section className="rounded-2xl border border-glass-border bg-glass p-5" aria-labelledby="dated-site-check-history-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">Canonical site checks</p>
          <h2 id="dated-site-check-history-title" className="mt-2 font-display text-[18px] font-normal text-warm-black">Recorded health over time</h2>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-gray-muted">
            These are the dated receipts from the existing site-health scan. Opening this history does not run another scan.
          </p>
        </div>
        <Link href={dashboardHref("/dashboard/health")} className="text-[12px] font-medium text-accent hover:text-warm-black">
          Reopen Site Health
        </Link>
      </div>
      {latest ? (
        <div className="mt-4 rounded-xl border border-gray-border/70 bg-surface-raised px-3 py-3">
          <p className="text-[11px] uppercase tracking-[0.12em] text-gray-muted">Latest recorded check</p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[22px] font-medium text-warm-black">{latest.overallScore}</span>
            <span className="text-[13px] font-medium text-warm-black">Grade {latest.grade}</span>
            <span className="text-[12px] text-gray-muted">{date(latest.scannedAt)}</span>
          </div>
          <p className="mt-1 truncate text-[11px] text-gray-faint">{latest.url}</p>
        </div>
      ) : null}
      {history.length > 0 ? (
        <ol className="mt-3 divide-y divide-gray-border/60 rounded-xl border border-gray-border/70 bg-surface-raised" aria-label="Dated site checks">
          {history.slice().reverse().map((point) => (
            <li key={`${point.scannedAt}-${point.overallScore}`} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 text-[12px]">
              <span className="text-gray-muted">{date(point.scannedAt)}</span>
              <span className="font-medium text-warm-black">{point.overallScore} · Grade {point.grade}</span>
            </li>
          ))}
        </ol>
      ) : !latest ? (
        <p className="mt-4 rounded-lg border border-gray-border/70 bg-surface-raised px-3 py-3 text-[13px] leading-relaxed text-gray-muted">
          No canonical site check has been recorded yet.
        </p>
      ) : null}
    </section>
  );
}
