import { FileText, Pencil, Sparkles, Star, MessageSquareQuote } from "lucide-react";
import type { ActivityEntry } from "@/lib/storage/activity-store";
import { buildActivityFeed, type ActivityFeedKind } from "@/lib/activity-feed";

/**
 * "What Strelva did for you" — the owner-facing proof timeline on Today.
 *
 * The anti-churn surface: it makes the managed service VISIBLE so the owner
 * sees the work instead of feeling like nothing is happening. Every line comes
 * from a real logged action (see activity-feed.ts) — never fabricated.
 */

const KIND_ICON: Record<ActivityFeedKind, typeof Pencil> = {
  site: Pencil,
  post: FileText,
  review: Star,
  testimonial: MessageSquareQuote,
  look: Sparkles,
};

function EmptyState() {
  return (
    <p className="rounded-lg border border-gray-border/70 bg-surface-raised px-4 py-4 text-[13px] leading-relaxed text-gray-muted">
      Strelva just started managing your site — the updates we make will show up here as your proof
      trail. Ask Strelva for one small change to see it land.
    </p>
  );
}

export function ActivityFeed({ activity }: { activity: ActivityEntry[] }) {
  const groups = buildActivityFeed(activity);

  return (
    <section className="rounded-2xl border border-glass-border bg-glass p-5">
      <div className="mb-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-gray-muted">
          What Strelva did for you
        </p>
        <h2 className="mt-2 font-[family-name:var(--font-display)] text-[18px] font-normal text-warm-black">
          {groups.length > 0 ? "We've been busy on your site" : "Your updates land here"}
        </h2>
      </div>

      {groups.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map((group) => (
            <div key={group.label}>
              <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-gray-faint">
                {group.label}
              </p>
              <ul className="flex flex-col gap-2">
                {group.items.map((item) => {
                  const Icon = KIND_ICON[item.kind];
                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 rounded-lg border border-gray-border/70 bg-surface-raised px-3 py-2.5"
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/10 text-accent">
                        <Icon className="h-3.5 w-3.5" strokeWidth={1.5} />
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium leading-snug text-warm-black">{item.label}</p>
                        {item.detail ? (
                          <p className="mt-0.5 line-clamp-1 text-[12px] text-gray-muted">{item.detail}</p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
