"use client";

import { useState, useEffect } from "react";
import { WelcomeBanner } from "./WelcomeBanner";
import { ExistingClientWelcome } from "./ExistingClientWelcome";
import { SuggestionCards } from "./SuggestionCards";
import { InboxFeed } from "./InboxFeed";
import { Sparkline } from "@/components/ui/Sparkline";
import { useDashboard } from "./DashboardContext";
import type { SectionData } from "./ContentBrowser";
import { TrendingUp, TrendingDown } from "lucide-react";

const CTA_VOCAB: Record<string, { metric: string; action: string; zeroHint: string }> = {
  wellness: { metric: "Booking clicks", action: "clicked Book Now", zeroHint: "Clicks tracked automatically" },
  "food-brand": { metric: "Shop clicks", action: "clicked Shop Now", zeroHint: "Clicks tracked automatically" },
  restaurant: { metric: "Reservation clicks", action: "clicked Reserve", zeroHint: "Clicks tracked automatically" },
  trades: { metric: "Quote requests", action: "requested a quote", zeroHint: "Clicks tracked automatically" },
  professional: { metric: "Contact clicks", action: "clicked Contact", zeroHint: "Clicks tracked automatically" },
};

function getVocab(template: string) {
  return CTA_VOCAB[template] || CTA_VOCAB.wellness;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

interface AnalyticsData {
  daily: { date: string; pageViews: number; bookingClicks: number }[];
  trends: {
    views: { thisWeek: number; lastWeek: number; change: number };
    clicks: { thisWeek: number; lastWeek: number; change: number };
  };
}

function TrendBadge({ change }: { change: number }) {
  if (change === 0) return null;
  const isUp = change > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-[13px] ${
      isUp ? "text-gray-fg" : "text-gray-muted"
    }`}>
      {isUp ? <TrendingUp className="w-3.5 h-3.5" strokeWidth={1.5} /> : <TrendingDown className="w-3.5 h-3.5" strokeWidth={1.5} />}
      {isUp ? "+" : ""}{change}%
    </span>
  );
}

function useAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  useEffect(() => {
    fetch("/api/analytics?days=30", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);
  return data;
}

interface HubPageProps {
  ownerName: string;
  siteName: string;
  pageViews: { total: number; today: number; thisWeek: number };
  bookingClicks: { total: number; today: number; thisWeek: number };
  siteScore: { score: number; items: { label: string; done: boolean }[] };
  suggestions: string[];
  sectionData: Record<string, SectionData>;
  isInvited?: boolean;
  recentActivity?: Array<{ text: string; time: string }>;
}

export function HubPage({
  ownerName,
  siteName,
  pageViews,
  bookingClicks,
  siteScore,
  suggestions,
  isInvited,
  recentActivity,
}: HubPageProps) {
  const { setChatDrawerOpen, siteUrl, template } = useDashboard();
  const vocab = getVocab(template);
  const analytics = useAnalytics();
  const hasTraffic = pageViews.thisWeek > 0;

  return (
    <div className="p-6 md:p-8 lg:p-10 w-full max-w-3xl mx-auto h-full overflow-y-auto">
      {isInvited ? (
        <ExistingClientWelcome
          ownerName={ownerName}
          siteUrl={siteUrl}
          activity={recentActivity || []}
          onOpenChat={() => setChatDrawerOpen(true)}
        />
      ) : null}

      {/* Greeting — calm, not showy */}
      <div className="mb-10 mt-2">
        <h1 className="text-[24px] md:text-[28px] font-normal tracking-[-0.02em] leading-[1.2] text-warm-black" suppressHydrationWarning>
          {hasTraffic
            ? `${pageViews.thisWeek} people found you this week`
            : ownerName ? `${getGreeting()}, ${ownerName}` : getGreeting()}
        </h1>
        {hasTraffic && (
          <p className="text-[15px] text-gray-muted mt-2">
            {bookingClicks.thisWeek} {vocab.action}
          </p>
        )}
      </div>

      {/* Metrics — inline row, not card grid */}
      <div className="flex flex-wrap gap-x-10 gap-y-6 mb-10">
        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <span className="text-[32px] font-light tracking-[-0.03em] tabular-nums text-warm-black leading-none">
              {pageViews.total > 0 ? pageViews.total.toLocaleString() : "—"}
            </span>
            {analytics && <TrendBadge change={analytics.trends.views.change} />}
          </div>
          <p className="text-[14px] text-gray-muted mt-1.5">visitors</p>
          {analytics && analytics.daily.some((d) => d.pageViews > 0) && (
            <div className="mt-2">
              <Sparkline
                data={analytics.daily.map((d) => d.pageViews)}
                width={140}
                height={24}
                color="#ececec"
                className="opacity-30"
              />
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="flex items-baseline gap-3">
            <span className="text-[32px] font-light tracking-[-0.03em] tabular-nums text-warm-black leading-none">
              {bookingClicks.total > 0 ? bookingClicks.total.toLocaleString() : "—"}
            </span>
            {analytics && <TrendBadge change={analytics.trends.clicks.change} />}
          </div>
          <p className="text-[14px] text-gray-muted mt-1.5">{vocab.metric.toLowerCase()}</p>
          {analytics && analytics.daily.some((d) => d.bookingClicks > 0) && (
            <div className="mt-2">
              <Sparkline
                data={analytics.daily.map((d) => d.bookingClicks)}
                width={140}
                height={24}
                color="#ececec"
                className="opacity-30"
              />
            </div>
          )}
        </div>

        <div className="min-w-0">
          <span className="text-[32px] font-light tracking-[-0.03em] tabular-nums text-warm-black leading-none">
            {siteScore.score}%
          </span>
          <p className="text-[14px] text-gray-muted mt-1.5">site complete</p>
          <div className="mt-3 w-24 h-[3px] bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${siteScore.score}%`, background: "rgba(236,236,236,0.5)" }}
            />
          </div>
        </div>
      </div>

      {/* AI suggestions */}
      <SuggestionCards />

      {/* Static suggestions */}
      {suggestions.length > 0 && (
        <div className="mb-8 space-y-1.5">
          {suggestions.map((s, i) => (
            <p key={i} className="text-[14px] text-gray-muted">
              {s}
            </p>
          ))}
        </div>
      )}

      {/* Activity feed */}
      <InboxFeed />
    </div>
  );
}
