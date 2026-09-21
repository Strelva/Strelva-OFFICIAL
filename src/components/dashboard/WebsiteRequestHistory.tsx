import Link from "next/link";
import { selectWebsiteRequestHistory, type WebsiteRequestHistoryItem } from "@/lib/website-history";
import type { UnifiedEvent } from "@/lib/types";

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Date unavailable"
    : parsed.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusLabel(item: WebsiteRequestHistoryItem): string {
  if (item.kind === "content_update") {
    if (item.status === "published") return "Published";
    if (item.status === "skipped") return "Skipped";
    return "Needs review";
  }
  if (item.status === "shipped") return "Done";
  if (item.status === "declined") return "Declined";
  if (item.status === "in_progress") return "In progress";
  if (item.status === "quoted") return "Quoted";
  if (item.status === "accepted") return "Accepted";
  if (item.status === "triaged") return "Triaged";
  return "Received";
}

function statusClass(item: WebsiteRequestHistoryItem): string {
  if (item.status === "published" || item.status === "shipped") return "bg-success-dim text-success";
  if (item.status === "declined" || item.status === "skipped") return "bg-gray-bg text-gray-muted";
  return "bg-accent-dim text-accent";
}

export function WebsiteRequestHistory({
  events,
  dashboardHref,
  selectedRequestId,
}: {
  events: UnifiedEvent[];
  dashboardHref: (path: string) => string;
  selectedRequestId?: string;
}) {
  const items = selectWebsiteRequestHistory(events);
  return (
    <section className="rounded-2xl border border-glass-border bg-glass p-5" aria-labelledby="website-request-history-title">
      <div className="mb-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">Requests and outcomes</p>
        <h2 id="website-request-history-title" className="mt-2 font-display text-[18px] font-normal text-warm-black">Site work stays together</h2>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-gray-muted">
          Each website request keeps its proposal, review decision, result, and history under one reference. A request can remain here while it is waiting or being recovered.
        </p>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-gray-border/70 bg-surface-raised px-3 py-3 text-[13px] leading-relaxed text-gray-muted">
          No website requests have been recorded yet. A request or governed site edit will appear here after it is saved.
        </p>
      ) : (
        <ol className="space-y-3">
          {items.map((item) => {
            const selected = item.requestId === selectedRequestId;
            return (
              <li
                key={item.requestId}
                id={`website-request-${item.requestId}`}
                data-request-id={item.requestId}
                className={`rounded-xl border px-3 py-3 ${selected ? "border-accent/50 bg-accent-dim/30" : "border-gray-border/70 bg-surface-raised"}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[13px] font-medium text-warm-black">{item.title}</p>
                    {item.body ? <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-gray-muted">{item.body}</p> : null}
                    <p className="mt-1.5 text-[11px] text-gray-faint">
                      Requested {date(item.createdAt)}{item.section ? ` · ${item.section}` : ""} · Reference {item.requestId.slice(-8)}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(item)}`}>
                    {statusLabel(item)}
                  </span>
                </div>
                {item.stages.length > 0 ? (
                  <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-gray-border/60 pt-2 text-[11px] text-gray-muted" aria-label="Request history">
                    {item.stages.map((stage, index) => (
                      <li key={`${stage.status}-${stage.at}-${index}`}>
                        <span className="font-medium text-warm-black">{stage.status.replaceAll("_", " ")}</span> · {date(stage.at)}
                      </li>
                    ))}
                  </ol>
                ) : null}
                <Link
                  href={`${dashboardHref("/dashboard/history")}?request=${encodeURIComponent(item.requestId)}#website-request-${encodeURIComponent(item.requestId)}`}
                  className="mt-2 inline-flex text-[11px] font-medium text-accent hover:text-warm-black"
                >
                  Reopen this request history
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
