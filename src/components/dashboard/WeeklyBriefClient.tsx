"use client";

import { useEffect, useRef, useState } from "react";
import { TrendingUp, MousePointerClick, Star, FileText, Sparkles } from "lucide-react";
import type { WeeklyBrief } from "@/lib/types";

interface WeeklyBriefClientProps {
  brief: WeeklyBrief | null;
  history?: WeeklyBrief[];
}

function CountUp({ end, duration = 800 }: { end: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current || end === 0) {
      const frame = requestAnimationFrame(() => setCount(end));
      return () => cancelAnimationFrame(frame);
    }

    const startTime = performance.now();
    let frame = 0;
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * end));

      if (progress < 1) {
        frame = requestAnimationFrame(animate);
      } else {
        hasAnimated.current = true;
      }
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [end, duration]);

  return <span ref={ref}>{count}</span>;
}

function StatCard({
  label,
  value,
  delta,
  icon: Icon,
}: {
  label: string;
  value: number;
  delta?: number;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  const showDelta = typeof delta === "number" && delta !== 0;

  return (
    <div className="flex-1 min-w-0 p-4 rounded-xl bg-surface-raised border border-glass-border">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="w-4 h-4 text-gray-muted" strokeWidth={1.5} />
        <span className="text-[11px] font-medium text-gray-muted uppercase tracking-wide">
          {label}
        </span>
      </div>
      <div className="text-[28px] font-semibold text-warm-black leading-none">
        <CountUp end={value} />
      </div>
      {showDelta && (
        <p className={`text-[11px] mt-2 ${delta > 0 ? "text-success" : "text-gray-muted"}`}>
          {delta > 0 ? "+" : ""}
          {delta} vs last week
        </p>
      )}
    </div>
  );
}

function formatWeekRange(start: string, end: string): string {
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${startDate.toLocaleDateString("en-US", options)} - ${endDate.toLocaleDateString("en-US", options)}`;
}

export function WeeklyBriefClient({ brief, history = [] }: WeeklyBriefClientProps) {
  if (!brief) {
    return (
      <div className="flex flex-col items-center justify-center h-full animate-route-enter">
        <div className="w-16 h-16 rounded-2xl bg-surface-inset flex items-center justify-center mb-6">
          <FileText className="w-7 h-7 text-gray-muted" strokeWidth={1.5} />
        </div>
        <h1 className="text-[18px] font-semibold text-warm-black mb-2">Weekly Brief</h1>
        <p className="text-[13px] text-gray-muted text-center max-w-xs">
          Your first weekly brief will appear after a week of activity.
        </p>
      </div>
    );
  }

  const topServices = brief.topServices ?? [];
  const topSearchQueries = brief.topSearchQueries ?? [];
  const staleSections = brief.staleSections ?? [];

  return (
    <div className="flex flex-col h-full animate-route-enter">
      <header className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-4 border-b border-glass-border">
        <h1 className="text-[18px] sm:text-[20px] font-semibold text-warm-black">Weekly Brief</h1>
        <p className="text-[13px] text-gray-muted mt-1">
          {formatWeekRange(brief.weekStart, brief.weekEnd)}
        </p>
        <p className="text-[12px] text-gray-muted mt-1">
          Managed by Scaffold Web. No ticket thread needed.
        </p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="max-w-2xl space-y-6">
          <div
            className="text-[15px] text-gray-fg leading-relaxed animate-fade-in-up"
            style={{ animationDelay: "50ms" }}
          >
            {brief.summary}
          </div>

          <div
            className="flex flex-col sm:flex-row gap-3 animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            <StatCard
              label="Page Views"
              value={brief.stats.pageViews}
              delta={brief.stats.pageViewsDelta ?? 0}
              icon={TrendingUp}
            />
            <StatCard
              label="Booking Clicks"
              value={brief.stats.bookingClicks}
              delta={brief.stats.bookingClicksDelta ?? 0}
              icon={MousePointerClick}
            />
            <StatCard
              label="Reviews"
              value={brief.stats.reviewsReceived}
              icon={Star}
            />
            <StatCard
              label="AI Updates"
              value={brief.stats.contentUpdates}
              icon={FileText}
            />
          </div>

          {brief.nextAction && (
            <div
              className="rounded-xl border border-accent/20 bg-accent-dim/40 p-4 animate-fade-in-up"
              style={{ animationDelay: "125ms" }}
            >
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-accent" strokeWidth={1.5} />
                <h2 className="text-[12px] font-medium text-accent uppercase tracking-wide">
                  This week I&apos;d suggest
                </h2>
              </div>
              <p className="text-[14px] font-medium text-warm-black">
                {brief.nextAction.title}
              </p>
              <p className="text-[13px] text-gray-fg mt-1">
                {brief.nextAction.description}
              </p>
            </div>
          )}

          {(topServices.length > 0 || topSearchQueries.length > 0 || staleSections.length > 0) && (
            <div
              className="grid gap-3 sm:grid-cols-3 animate-fade-in-up"
              style={{ animationDelay: "140ms" }}
            >
              {topServices[0] && (
                <div className="rounded-xl border border-glass-border bg-surface-raised p-4">
                  <p className="text-[11px] font-medium text-gray-muted uppercase tracking-wide">
                    Top Service
                  </p>
                  <p className="text-[14px] font-medium text-warm-black mt-2">
                    {topServices[0].name}
                  </p>
                  <p className="text-[12px] text-gray-muted mt-1">
                    {topServices[0].clicks} clicks this week
                  </p>
                </div>
              )}
              {topSearchQueries[0] && (
                <div className="rounded-xl border border-glass-border bg-surface-raised p-4">
                  <p className="text-[11px] font-medium text-gray-muted uppercase tracking-wide">
                    Search Signal
                  </p>
                  <p className="text-[14px] font-medium text-warm-black mt-2">
                    {topSearchQueries[0].query}
                  </p>
                  <p className="text-[12px] text-gray-muted mt-1">
                    {topSearchQueries[0].clicks} clicks from search
                  </p>
                </div>
              )}
              {staleSections[0] && (
                <div className="rounded-xl border border-glass-border bg-surface-raised p-4">
                  <p className="text-[11px] font-medium text-gray-muted uppercase tracking-wide">
                    Freshness
                  </p>
                  <p className="text-[14px] font-medium text-warm-black mt-2 capitalize">
                    {staleSections[0].section}
                  </p>
                  <p className="text-[12px] text-gray-muted mt-1">
                    {staleSections[0].daysSinceUpdate} days since update
                  </p>
                </div>
              )}
            </div>
          )}

          {brief.highlights.length > 0 && (
            <div
              className="animate-fade-in-up"
              style={{ animationDelay: "150ms" }}
            >
              <h2 className="text-[13px] font-medium text-gray-muted uppercase tracking-wide mb-3">
                Highlights
              </h2>
              <ul className="space-y-2">
                {brief.highlights.map((highlight, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-[13px] text-gray-fg"
                  >
                    <span className="shrink-0 w-1 h-1 rounded-full bg-gray-muted mt-2" />
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {history.length > 1 && (
            <div
              className="animate-fade-in-up"
              style={{ animationDelay: "200ms" }}
            >
              <h2 className="text-[13px] font-medium text-gray-muted uppercase tracking-wide mb-3">
                Brief History
              </h2>
              <div className="space-y-2">
                {history.slice(1).map((item) => (
                  <details
                    key={item.id}
                    className="rounded-xl border border-glass-border bg-surface-raised px-4 py-3"
                  >
                    <summary className="cursor-pointer text-[13px] font-medium text-warm-black">
                      {formatWeekRange(item.weekStart, item.weekEnd)}
                    </summary>
                    <p className="text-[13px] text-gray-fg mt-3 leading-relaxed">
                      {item.summary}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
