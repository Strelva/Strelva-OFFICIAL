"use client";

import { useEffect, useRef, useState } from "react";
import { TrendingUp, MousePointerClick, Star, FileText } from "lucide-react";
import type { WeeklyBrief } from "@/lib/types";

interface WeeklyBriefClientProps {
  brief: WeeklyBrief | null;
}

function CountUp({ end, duration = 800 }: { end: number; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    if (hasAnimated.current || end === 0) {
      setCount(end);
      return;
    }

    const startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * end));

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        hasAnimated.current = true;
      }
    };

    requestAnimationFrame(animate);
  }, [end, duration]);

  return <span ref={ref}>{count}</span>;
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
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
    </div>
  );
}

function formatWeekRange(start: string, end: string): string {
  const startDate = new Date(start + "T00:00:00");
  const endDate = new Date(end + "T00:00:00");
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${startDate.toLocaleDateString("en-US", options)} - ${endDate.toLocaleDateString("en-US", options)}`;
}

export function WeeklyBriefClient({ brief }: WeeklyBriefClientProps) {
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

  return (
    <div className="flex flex-col h-full animate-route-enter">
      <header className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-4 border-b border-glass-border">
        <h1 className="text-[18px] sm:text-[20px] font-semibold text-warm-black">Weekly Brief</h1>
        <p className="text-[13px] text-gray-muted mt-1">
          {formatWeekRange(brief.weekStart, brief.weekEnd)}
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
              icon={TrendingUp}
            />
            <StatCard
              label="Booking Clicks"
              value={brief.stats.bookingClicks}
              icon={MousePointerClick}
            />
            <StatCard
              label="Reviews"
              value={brief.stats.reviewsReceived}
              icon={Star}
            />
          </div>

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
        </div>
      </div>
    </div>
  );
}
