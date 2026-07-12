import type { ReactNode } from "react";
import type { UnifiedEvent } from "@/lib/types";
import type { PreviewDiff } from "@/lib/agent-risk";

/**
 * The read-only "what am I actually approving" detail under a pending card: the
 * GBP post text / proposed hours for a Google draft, else the field-level
 * before→after diff for a content edit. Reads ONLY `type` + `metadata`, so it
 * renders identically wherever those are available — the client Today queue
 * (QueuePage) and the operator bulk-approve queue (`/admin/actions`) both back
 * onto this one component, so a bulk-approver reads the real change, not a label.
 */
export type QueueEventLike = Pick<UnifiedEvent, "type" | "metadata">;

/**
 * Field-level BEFORE→AFTER diff for a pending content-change event. The AI's
 * proposed edit already computes these (`metadata.diffs`, from
 * `generatePreviewDiffs`), so an approver glances at what actually changed
 * instead of trusting the title's label.
 */
function readDiffs(event: QueueEventLike): PreviewDiff[] {
  if (event.type !== "content_update") return [];
  const raw = event.metadata?.diffs;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (d): d is PreviewDiff =>
      Boolean(d) &&
      typeof d === "object" &&
      typeof (d as PreviewDiff).field === "string" &&
      (["added", "removed", "changed"] as const).includes((d as PreviewDiff).type),
  );
}

const MAX_DIFF_ROWS = 6;
const MAX_DIFF_VALUE = 160;

function truncate(value: string): string {
  const v = value.replace(/\s+/g, " ").trim();
  return v.length > MAX_DIFF_VALUE ? `${v.slice(0, MAX_DIFF_VALUE)}…` : v;
}

function QueueDiff({ diffs }: { diffs: PreviewDiff[] }) {
  const shown = diffs.slice(0, MAX_DIFF_ROWS);
  const extra = diffs.length - shown.length;

  return (
    <div className="rounded-lg border border-glass-border bg-surface-inset px-3 py-2.5">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-muted">
        What changed
      </p>
      <ul className="space-y-2">
        {shown.map((d, i) => (
          <li key={`${d.field}-${i}`} className="text-[12px] leading-snug">
            <span className="font-mono text-[11px] text-gray-muted">{d.field}</span>
            {d.type === "added" ? (
              <div className="mt-0.5 rounded bg-success-dim px-1.5 py-0.5 text-success">
                + {truncate(d.after)}
              </div>
            ) : d.type === "removed" ? (
              <div className="mt-0.5 rounded bg-critical0/10 px-1.5 py-0.5 text-critical0 line-through">
                − {truncate(d.before)}
              </div>
            ) : (
              <div className="mt-0.5 space-y-0.5">
                <div className="rounded bg-critical0/10 px-1.5 py-0.5 text-critical0 line-through">
                  {truncate(d.before)}
                </div>
                <div className="rounded bg-success-dim px-1.5 py-0.5 text-success">
                  {truncate(d.after)}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {extra > 0 && (
        <p className="mt-2 text-[11px] text-gray-subtle">
          +{extra} more field{extra === 1 ? "" : "s"} changed
        </p>
      )}
    </div>
  );
}

/**
 * A pending GBP post draft (`create_gbp_post` → `metadata.kind:"gbp_post_draft"`).
 * The card title only says "Google post draft", so on approval the owner was
 * publishing to their live Google listing without seeing the actual text. Surface
 * the drafted post (and its CTA link) so a bulk-approver reads exactly what goes
 * live.
 */
function readGbpPost(event: QueueEventLike): { summary: string; ctaUrl?: string } | null {
  if (event.type !== "content_update" || event.metadata?.kind !== "gbp_post_draft") return null;
  const summary = typeof event.metadata?.summary === "string" ? event.metadata.summary.trim() : "";
  if (!summary) return null;
  const ctaUrl =
    typeof event.metadata?.ctaUrl === "string" && event.metadata.ctaUrl.trim()
      ? event.metadata.ctaUrl.trim()
      : undefined;
  return { summary, ctaUrl };
}

type GbpHour = { day: string; open: string; close: string };

/**
 * A pending GBP hours draft (`update_business_hours` → `gbp_hours_draft`). The
 * event only carries the PROPOSED hours (the prior listing hours aren't stored
 * on the event), so we show the new hours the approval publishes — no before
 * column to invent. The write itself is governed in `event-actions.ts`.
 */
function readGbpHours(event: QueueEventLike): GbpHour[] | null {
  if (event.type !== "content_update" || event.metadata?.kind !== "gbp_hours_draft") return null;
  const raw = event.metadata?.hours;
  if (!Array.isArray(raw)) return null;
  const hours = raw.filter(
    (h): h is GbpHour =>
      Boolean(h) &&
      typeof h === "object" &&
      typeof (h as GbpHour).day === "string" &&
      typeof (h as GbpHour).open === "string" &&
      typeof (h as GbpHour).close === "string",
  );
  return hours.length ? hours : null;
}

const DAY_LABELS: Record<string, string> = {
  MONDAY: "Monday",
  TUESDAY: "Tuesday",
  WEDNESDAY: "Wednesday",
  THURSDAY: "Thursday",
  FRIDAY: "Friday",
  SATURDAY: "Saturday",
  SUNDAY: "Sunday",
};

/** 24h "HH:MM" → owner-friendly "9:00 AM"; passes through anything unexpected. */
function formatTime(value: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return value;
  const h = Number(m[1]);
  if (h < 0 || h > 23) return value;
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${period}`;
}

function QueueGbpPost({ post }: { post: { summary: string; ctaUrl?: string } }) {
  return (
    <div className="rounded-lg border border-glass-border bg-surface-inset px-3 py-2.5">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-muted">
        What will be posted to Google
      </p>
      <p className="whitespace-pre-wrap rounded bg-success-dim px-2 py-1.5 text-[12px] leading-snug text-success">
        {post.summary}
      </p>
      {post.ctaUrl && (
        <p className="mt-1.5 truncate text-[11px] text-gray-subtle">
          <span className="font-mono text-gray-muted">Button link</span> {post.ctaUrl}
        </p>
      )}
    </div>
  );
}

function QueueGbpHours({ hours }: { hours: GbpHour[] }) {
  return (
    <div className="rounded-lg border border-glass-border bg-surface-inset px-3 py-2.5">
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.14em] text-gray-muted">
        New hours for Google
      </p>
      <ul className="space-y-1.5">
        {hours.map((h, i) => (
          <li key={`${h.day}-${i}`} className="flex items-center justify-between gap-3 text-[12px]">
            <span className="font-medium text-warm-black">{DAY_LABELS[h.day] ?? h.day}</span>
            <span className="rounded bg-success-dim px-1.5 py-0.5 text-success">
              {formatTime(h.open)} – {formatTime(h.close)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** True when this event carries an approval detail worth expanding to (a GBP
 *  post/hours draft or a non-empty content diff). Lets a caller show an expand
 *  affordance only when there's something real behind it. */
export function hasQueueEventDetail(event: QueueEventLike): boolean {
  return Boolean(readGbpPost(event)) || Boolean(readGbpHours(event)) || readDiffs(event).length > 0;
}

export function QueueEventDetail({
  event,
  className = "mt-1.5 ml-11",
}: {
  event: QueueEventLike;
  /** Positioning wrapper. Defaults to the client-queue indent; the operator
   *  bulk-approve list passes its own (no avatar to align under). */
  className?: string;
}) {
  const post = readGbpPost(event);
  const hours = post ? null : readGbpHours(event);
  const diffs = post || hours ? [] : readDiffs(event);

  let body: ReactNode = null;
  if (post) body = <QueueGbpPost post={post} />;
  else if (hours) body = <QueueGbpHours hours={hours} />;
  else if (diffs.length > 0) body = <QueueDiff diffs={diffs} />;

  if (!body) return null;
  return <div className={className}>{body}</div>;
}
