"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, MousePointerClick, Eye, Info } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SectionSignals {
  clicks?: number;
  views?: number;
  trend?: "up" | "down" | "flat";
  trendPercent?: number;
  topService?: string;
  period?: string;
}

interface SignalIndicatorProps {
  signals: SectionSignals;
  section: string;
  compact?: boolean;
  className?: string;
}

const SECTION_INSIGHTS: Record<string, (signals: SectionSignals) => string> = {
  hero: (s) =>
    s.clicks
      ? `Your hero CTA got ${s.clicks} click${s.clicks === 1 ? "" : "s"} this week`
      : "No CTA clicks tracked yet",
  services: (s) =>
    s.topService
      ? `"${s.topService}" is your most clicked service`
      : s.clicks
      ? `Services section got ${s.clicks} click${s.clicks === 1 ? "" : "s"}`
      : "Add action links to track clicks",
  testimonials: () => "Testimonials build trust - customers spend time here",
  story: (s) =>
    s.views
      ? `${s.views} people scrolled to your story this week`
      : "Your story section helps visitors connect",
  contact: (s) =>
    s.clicks
      ? `${s.clicks} people clicked contact info this week`
      : "Contact section drives direct reach-outs",
  faq: (s) =>
    s.views
      ? `FAQ section was viewed ${s.views} time${s.views === 1 ? "" : "s"}`
      : "FAQs reduce support questions",
};

export function SignalIndicator({
  signals,
  section,
  compact = false,
  className,
}: SignalIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const hasData = signals.clicks || signals.views;
  const trend = signals.trend || "flat";
  const trendPercent = signals.trendPercent || 0;

  const TrendIcon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;

  const trendColor =
    trend === "up"
      ? "text-success"
      : trend === "down"
      ? "text-red-400"
      : "text-gray-muted";

  const insight =
    SECTION_INSIGHTS[section]?.(signals) ||
    (hasData
      ? `${signals.clicks || signals.views} interaction${(signals.clicks || signals.views) === 1 ? "" : "s"} this week`
      : "No data yet");

  if (compact) {
    return (
      <div
        className={cn(
          "relative inline-flex items-center gap-1 cursor-help",
          className
        )}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {hasData ? (
          <>
            <TrendIcon className={cn("w-3 h-3", trendColor)} strokeWidth={1.5} />
            <span className="text-[10px] text-gray-muted tabular-nums">
              {signals.clicks || signals.views}
            </span>
          </>
        ) : (
          <Info className="w-3 h-3 text-gray-faint" strokeWidth={1.5} />
        )}

        {showTooltip && (
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 rounded-lg bg-warm-black text-white text-[11px] whitespace-nowrap shadow-lg z-50 animate-fade-in">
            {insight}
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-warm-black" />
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-glass-border bg-glass/50 p-3",
        className
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-medium text-gray-muted uppercase tracking-wide">
          Performance
        </span>
        {hasData && (
          <div className="flex items-center gap-1">
            <TrendIcon className={cn("w-3 h-3", trendColor)} strokeWidth={1.5} />
            {trendPercent > 0 && (
              <span className={cn("text-[10px] tabular-nums", trendColor)}>
                {trend === "up" ? "+" : ""}
                {trendPercent}%
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-4">
        {signals.clicks !== undefined && (
          <div className="flex items-center gap-1.5">
            <MousePointerClick
              className="w-3.5 h-3.5 text-accent"
              strokeWidth={1.5}
            />
            <span className="text-[13px] font-semibold text-warm-black tabular-nums">
              {signals.clicks}
            </span>
            <span className="text-[11px] text-gray-muted">clicks</span>
          </div>
        )}
        {signals.views !== undefined && (
          <div className="flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-sage" strokeWidth={1.5} />
            <span className="text-[13px] font-semibold text-warm-black tabular-nums">
              {signals.views}
            </span>
            <span className="text-[11px] text-gray-muted">views</span>
          </div>
        )}
      </div>

      <p className="text-[11px] text-gray-fg mt-2 leading-relaxed">{insight}</p>

      {signals.period && (
        <p className="text-[10px] text-gray-faint mt-1">{signals.period}</p>
      )}
    </div>
  );
}
