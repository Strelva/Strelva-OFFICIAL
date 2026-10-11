import { StCopy, StLedger, StMono, StRow, StRows, StSurface } from "@/components/ui/strelva/Kit";
import type { PreviewDiff } from "@/lib/agent-risk";
import type { QueueEventLike } from "@/components/dashboard/QueueEventDetail";

function formatTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return value;
  const hour = Number(match[1]);
  if (hour < 0 || hour > 23) return value;
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? "AM" : "PM"}`;
}

/** The exact draft content, shared by the two operator approval surfaces. */
export function DraftChangePreview({ event }: { event?: QueueEventLike }) {
  const metadata = event?.type === "content_update" ? event.metadata : undefined;
  const post = metadata?.kind === "gbp_post_draft" && typeof metadata.summary === "string" && metadata.summary.trim() ? metadata.summary.trim() : null;
  const hours = !post && metadata?.kind === "gbp_hours_draft" && Array.isArray(metadata.hours) ? metadata.hours.filter((hour): hour is { day: string; open: string; close: string } => Boolean(hour) && typeof hour === "object" && typeof hour.day === "string" && typeof hour.open === "string" && typeof hour.close === "string") : [];
  const diffs = !post && !hours.length && Array.isArray(metadata?.diffs) ? (metadata.diffs as PreviewDiff[]).filter(diff => Boolean(diff) && typeof diff === "object" && typeof diff.field === "string" && ["added", "removed", "changed"].includes(diff.type)) : [];
  if (post) return <StSurface label="Google post draft"><div className="flex flex-col gap-2"><StCopy muted>What will be posted to Google</StCopy><p className="whitespace-pre-wrap text-sm">{post}</p>{typeof metadata?.ctaUrl === "string" && metadata.ctaUrl.trim() ? <StMono>Button link: {metadata.ctaUrl.trim()}</StMono> : null}</div></StSurface>;
  if (hours.length) return <StRows label="New hours for Google">{hours.map((hour, index) => <StRow key={index} title={hour.day.charAt(0).toUpperCase() + hour.day.slice(1).toLowerCase()} end={<StMono>{formatTime(hour.open)} – {formatTime(hour.close)}</StMono>} />)}</StRows>;
  return <>{diffs.map((diff, index) => <StLedger key={`${diff.field}-${index}`} path={diff.field} lines={[
    ...(diff.type !== "added" ? [{ sign: "-" as const, text: diff.before }] : []),
    ...(diff.type !== "removed" ? [{ sign: "+" as const, text: diff.after }] : []),
  ]} />)}</>;
}
