import { XaLabel, XaLines, XaTextLink } from "@/components/ui/strelva/Xa";
import type { ActivityEntry } from "@/lib/storage/activity-store";
import { buildActivityFeed } from "@/lib/activity-feed";

/**
 * "What Strelva did for you" — the owner-facing proof timeline on Today.
 *
 * The anti-churn surface: it makes the managed service VISIBLE so the owner
 * sees the work instead of feeling like nothing is happening. Every line comes
 * from a real logged action (see activity-feed.ts) — never fabricated.
 */

/**
 * A subtle per-item relative timestamp so the feed reads like a live journal:
 * "2h ago" for the last day, a weekday ("Tue") within the week, then a plain
 * date ("Mar 4"). Fail-soft — an unparseable time renders nothing.
 */
function feedTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Date.now() - then;
  const hour = 3_600_000;
  const day = 24 * hour;
  if (diff < day) return new Date(then).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(" AM", "").replace(" PM", " pm");
  if (diff < 7 * day) return new Date(then).toLocaleDateString("en-US", { weekday: "short" });
  return new Date(then).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Full human-readable date for hover tooltip, e.g. "Tuesday, July 15, 2026, 3:42 PM" */
function feedTimeTitle(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  return new Date(then).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * O1 "Since yesterday": times beside sentences. Each line names Strelva because
 * activity-feed.ts only keeps Strelva's own logged work; the owner's edits stay out.
 */
export function ActivityFeed({
  activity,
  historyHref,
  limit = 6,
}: {
  activity: ActivityEntry[];
  historyHref?: string;
  limit?: number;
}) {
  const groups = buildActivityFeed(activity);
  const items = groups.flatMap((group) => group.items).slice(0, limit);

  return (
    <section className="flex flex-col gap-3" aria-labelledby="activity-feed-label">
      <XaLabel id="activity-feed-label">What Strelva did</XaLabel>
      {items.length === 0 ? (
        <p className="m-0 text-[15px] leading-[1.45] text-[var(--st-text-2)]">
          Nothing yet. The first change Strelva makes to your site shows up here, with the time it landed.
        </p>
      ) : (
        <XaLines
          label="What Strelva did"
          lines={items.map((item) => ({
            time: feedTime(item.time),
            dateTime: item.time,
            text: <span title={feedTimeTitle(item.time)}>{item.label}{item.detail ? <span className="text-[var(--st-text-2)]">. {item.detail}</span> : null}</span>,
          }))}
        />
      )}
      {items.length > 0 && historyHref ? (
        <p className="m-0 text-[14px]"><XaTextLink href={historyHref}>See everything in History</XaTextLink></p>
      ) : null}
    </section>
  );
}
