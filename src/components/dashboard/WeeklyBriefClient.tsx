"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TrendingUp, MousePointerClick, Star, FileText, Sparkles, ExternalLink, MessageCircle, ShieldCheck } from "lucide-react";
import type { WeeklyBrief } from "@/lib/types";
import type { DailyMetric } from "@/lib/storage";
import { useDashboardOptional } from "./DashboardContext";

interface WeeklyBriefClientProps {
  brief: WeeklyBrief | null;
  history?: WeeklyBrief[];
  dailyMetrics?: DailyMetric[];
}

/** Plain-English verdict on whether the site is working, from the week's numbers. */
export function buildVerdict(stats: WeeklyBrief["stats"]): string {
  const views = stats.pageViews;
  const delta = stats.pageViewsDelta ?? 0;
  if (views === 0) return "A quiet week — no visitors yet. Let's change that.";
  const people = `${views.toLocaleString()} ${views === 1 ? "person" : "people"} found you`;
  if (delta > 0) return `It's working — ${people}, up from last week.`;
  if (delta < 0) return `${people} this week — down from last week.`;
  return `${people} this week.`;
}

/** A lightweight 30-day traffic sparkline (no chart dependency). */
function TrendChart({ metrics }: { metrics: DailyMetric[] }) {
  if (metrics.length < 2) return null;
  const values = metrics.map((m) => m.pageViews);
  const total = values.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...values);
  const w = 300;
  const h = 56;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - (v / max) * (h - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const line = `M ${pts.join(" L ")}`;
  const area = `M 0,${h} L ${pts.join(" L ")} L ${w},${h} Z`;
  return (
    <div className="rounded-xl border border-glass-border bg-glass p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-gray-muted">Last 30 days</p>
        <p className="text-[12px] text-gray-muted">
          <span className="font-semibold text-warm-black">{total.toLocaleString()}</span> visitors
        </p>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-14 w-full" aria-hidden="true">
        <path d={area} fill="var(--accent-dim)" opacity={0.5} />
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
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
    <div className="flex-1 min-w-[140px] rounded-xl dashboard-panel p-4">
      <div className="flex items-center gap-2 mb-3">
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

export function WeeklyBriefClient({ brief, history = [], dailyMetrics = [] }: WeeklyBriefClientProps) {
  const dashboard = useDashboardOptional();

  if (!brief) {
    return (
      <div className="h-full overflow-y-auto animate-route-enter px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto w-full max-w-4xl">
          <div className="mb-5 max-w-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted mb-2">
              Analytics
            </p>
            <h1 className="text-[24px] sm:text-[30px] font-semibold text-warm-black tracking-[-0.02em]">
              Your first weekly report is still warming up
            </h1>
            <p className="text-[14px] sm:text-[15px] text-gray-muted mt-3 leading-relaxed">
              The Today view already shows the short version. Your first full report lands at the end of your first week, then a fresh one arrives every week. It builds once there is enough visitor, click, and site-change activity for a real summary.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl dashboard-panel p-4">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-dim text-accent">
                <TrendingUp className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <h2 className="text-[14px] font-medium text-warm-black">See what&apos;s working</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-fg">
                Weekly reports turn visits, clicks, reviews, and updates into plain English.
              </p>
            </div>
            <div className="rounded-xl dashboard-panel p-4">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-dim text-accent">
                <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <h2 className="text-[14px] font-medium text-warm-black">Tell AI what to change</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-fg">
                Ask for a small update, like new hours, a service tweak, or a timely announcement.
              </p>
            </div>
            <div className="rounded-xl dashboard-panel p-4">
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-dim text-accent">
                <ShieldCheck className="h-4 w-4" strokeWidth={1.5} />
              </div>
              <h2 className="text-[14px] font-medium text-warm-black">Stay in control</h2>
              <p className="mt-1 text-[12px] leading-relaxed text-gray-fg">
                When something needs your review, it opens in Needs You from Ask AI before it goes live.
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href={dashboard?.dashboardHref("/dashboard") || "/dashboard"}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg bg-accent px-5 text-[13px] font-medium text-on-accent transition-colors hover:bg-accent/85"
            >
              <TrendingUp className="h-4 w-4" strokeWidth={1.5} />
              Open dashboard
            </Link>
            <Link
              href={dashboard?.dashboardHref("/dashboard/chat") || "/dashboard/chat"}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-glass-border bg-glass px-5 text-[13px] font-medium text-warm-black transition-colors hover:bg-gray-bg"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.5} />
              Ask AI for a small change
            </Link>
            <a
              href={dashboard?.siteUrl || dashboard?.dashboardHref("/dashboard/site") || "/dashboard/site"}
              target={dashboard?.siteUrl ? "_blank" : undefined}
              rel={dashboard?.siteUrl ? "noopener noreferrer" : undefined}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-glass-border bg-glass px-5 text-[13px] font-medium text-warm-black transition-colors hover:bg-gray-bg"
            >
              <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
              View your live site
            </a>
          </div>
        </div>
      </div>
    );
  }

  const topServices = brief.topServices ?? [];
  const topSearchQueries = brief.topSearchQueries ?? [];
  const staleSections = brief.staleSections ?? [];

  return (
    <div className="flex flex-col h-full animate-route-enter">
      <header className="shrink-0 px-4 sm:px-8 pt-5 sm:pt-7 pb-5 border-b border-glass-border">
        <div className="max-w-5xl">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted mb-2">
            {formatWeekRange(brief.weekStart, brief.weekEnd)}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="max-w-xl font-[family-name:var(--font-display)] text-[24px] font-normal leading-snug text-warm-black tracking-[-0.01em] sm:text-[30px]">
                {buildVerdict(brief.stats)}
              </h1>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-glass-border bg-glass px-3 py-1.5 text-[12px] text-gray-fg">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Managed
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-5 sm:py-8">
        <div className="max-w-5xl space-y-6">
          <div
            className="max-w-3xl text-[16px] text-gray-fg leading-relaxed animate-fade-in-up"
            style={{ animationDelay: "50ms" }}
          >
            {brief.summary}
          </div>

          {dailyMetrics.length >= 2 && (
            <div className="animate-fade-in-up" style={{ animationDelay: "75ms" }}>
              <TrendChart metrics={dailyMetrics} />
            </div>
          )}

          <div
            className="grid grid-cols-2 xl:grid-cols-4 gap-3 animate-fade-in-up"
            style={{ animationDelay: "100ms" }}
          >
            <StatCard
              label="People found you"
              value={brief.stats.pageViews}
              delta={brief.stats.pageViewsDelta ?? 0}
              icon={TrendingUp}
            />
            <StatCard
              label="Customer actions"
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
              label="Site updates"
              value={brief.stats.contentUpdates}
              icon={FileText}
            />
          </div>

          {brief.nextAction && (
            <div
              className="rounded-xl border border-accent/20 bg-accent-dim/40 p-4 sm:p-5 animate-fade-in-up"
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
              className="grid gap-3 md:grid-cols-3 animate-fade-in-up"
              style={{ animationDelay: "140ms" }}
            >
              {topServices[0] && (
                <div className="rounded-xl border border-glass-border bg-glass p-4">
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
                <div className="rounded-xl border border-glass-border bg-glass p-4">
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
                <div className="rounded-xl border border-glass-border bg-glass p-4">
                  <p className="text-[11px] font-medium text-gray-muted uppercase tracking-wide">
                    Could use a refresh
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
              <ul className="grid gap-2 md:grid-cols-2">
                {brief.highlights.map((highlight, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-lg border border-glass-border bg-glass px-3 py-2.5 text-[13px] text-gray-fg"
                  >
                    <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-accent mt-1.5" />
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
