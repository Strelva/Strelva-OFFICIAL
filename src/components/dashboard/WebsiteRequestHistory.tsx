import Link from "next/link";
import { XaStatus, XaSystemTile } from "@/components/ui/strelva/Xa";
import { SECTION_LABELS } from "@/components/ui/section-labels";
import styles from "./xa/dashboard-xa.module.css";
import { selectWebsiteRequestHistory, type WebsiteRequestHistoryItem } from "@/lib/website-history";
import type { UnifiedEvent } from "@/lib/types";

function date(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "on an unknown date"
    : parsed.toLocaleString("en-US", { month: "short", day: "numeric" });
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
    <section className="flex flex-col gap-3" aria-labelledby="website-request-history-title">
      <h2 id="website-request-history-title" className="m-0 text-[13px] font-medium text-[var(--st-text-3)]">Requests</h2>
      {items.length === 0 ? (
        <p className="m-0 text-[15px] text-[var(--st-text-2)]">
          No website requests have been recorded yet. Each one you ask for shows up here with where it got to.
        </p>
      ) : (
        <ol className={styles.list} aria-label="Website requests">
          {items.map((item) => {
            const selected = item.requestId === selectedRequestId;
            const last = item.stages.at(-1);
            const label = statusLabel(item);
            const waits = label === "Needs review";
            return (
              <li key={item.requestId} id={`website-request-${item.requestId}`} data-request-id={item.requestId} data-selected={selected || undefined}
                className={selected ? "rounded-[var(--st-r-nav)] bg-[var(--st-tint)] px-3" : undefined}>
                <XaSystemTile kind="website" size={32} />
                <div className={styles.listText}>
                  <span className={styles.listTitle}>{item.title}</span>
                  {item.body ? <span className={styles.listDetail}>{item.body}</span> : null}
                  <span className={styles.listDetail}>Asked {date(item.createdAt)}{item.section ? ` · ${(SECTION_LABELS[item.section] ?? item.section).toLowerCase()}` : ""}{last ? ` · ${last.status.replaceAll("_", " ")} ${date(last.at)}` : ""}</span>
                </div>
                <div className={styles.listEnd}>
                  {waits ? <XaStatus kind="waits" size="sm">Waits for you</XaStatus> : <span>{label}</span>}
                  {waits ? <Link className="font-medium text-[var(--st-accent)] hover:underline" href={dashboardHref("/dashboard/review")}>Review it</Link> : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
