"use client";

import { Check } from "lucide-react";
import { timeAgo } from "@/lib/utils";

const CTA_VOCAB: Record<string, { metric: string; action: string }> = {
  wellness: { metric: "Booking clicks", action: "clicked Book Now" },
  "food-brand": { metric: "Shop clicks", action: "clicked Shop Now" },
  restaurant: { metric: "Reservation clicks", action: "clicked Reserve" },
  trades: { metric: "Quote requests", action: "requested a quote" },
  professional: { metric: "Contact clicks", action: "clicked Contact" },
};

interface ReportsClientProps {
  siteName: string;
  pageViews: { total: number; thisWeek: number; today: number };
  bookingClicks: { total: number; thisWeek: number; today: number };
  staleSections: { section: string; daysSinceUpdate: number }[];
  recentActivity: { text: string; time: string; type?: string }[];
  template: string;
}

function StatCard({
  label,
  value,
  subvalue,
}: {
  label: string;
  value: number;
  subvalue?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-border bg-surface p-5">
      <div className="text-[11px] font-mono tracking-wider uppercase text-gray-faint mb-3">
        {label}
      </div>
      <div className="text-[32px] font-medium text-warm-white tracking-tight">
        {value.toLocaleString()}
      </div>
      {subvalue && (
        <div className="text-[12px] text-gray-muted mt-1">{subvalue}</div>
      )}
    </div>
  );
}

export function ReportsClient({
  siteName,
  pageViews,
  bookingClicks,
  staleSections,
  recentActivity,
  template,
}: ReportsClientProps) {
  const vocab = CTA_VOCAB[template] || CTA_VOCAB.wellness;
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10">
      <div className="max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-[24px] font-medium text-warm-white">Weekly Reports</h1>
          <p className="text-[13px] text-gray-muted mt-1">
            Performance summary for {siteName}
          </p>
        </div>

        {/* Current week banner */}
        <div className="rounded-xl border border-accent/20 bg-accent/5 p-5 mb-8">
          <div className="text-[11px] font-mono tracking-wider uppercase text-accent mb-2">
            Week of {weekLabel}
          </div>
          <p className="text-[20px] font-medium text-warm-white">
            {pageViews.thisWeek > 0
              ? `${pageViews.thisWeek} people found you this week`
              : "No visitors yet this week"}
          </p>
          {bookingClicks.thisWeek > 0 && (
            <p className="text-[13px] text-gray-muted mt-1">
              {bookingClicks.thisWeek} {vocab.action.toLowerCase()}
            </p>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <StatCard
            label="Visitors this week"
            value={pageViews.thisWeek}
            subvalue={`${pageViews.total.toLocaleString()} all time`}
          />
          <StatCard
            label={vocab.metric}
            value={bookingClicks.thisWeek}
            subvalue={`${bookingClicks.total.toLocaleString()} all time`}
          />
          <StatCard
            label="Today"
            value={pageViews.today}
            subvalue={bookingClicks.today > 0 ? `${bookingClicks.today} ${vocab.action.toLowerCase()}` : undefined}
          />
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Stale sections */}
          <div className="rounded-xl border border-gray-border bg-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-border/50">
              <span className="text-[11px] font-mono tracking-wider uppercase text-gray-faint">
                Content to refresh
              </span>
            </div>
            <div className="p-5">
              {staleSections.length > 0 ? (
                <ul className="space-y-3">
                  {staleSections.slice(0, 5).map((item) => (
                    <li key={item.section} className="flex items-center justify-between">
                      <span className="text-[13px] text-warm-white capitalize">
                        {item.section}
                      </span>
                      <span className="text-[12px] text-gray-muted">
                        {item.daysSinceUpdate} days ago
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center py-4">
                  <div className="w-8 h-8 rounded-full bg-emerald-400/10 flex items-center justify-center mx-auto mb-3">
                    <Check className="w-4 h-4 text-emerald-400" strokeWidth={2} />
                  </div>
                  <p className="text-[13px] text-gray-muted">All sections are up to date</p>
                </div>
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div className="rounded-xl border border-gray-border bg-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-border/50">
              <span className="text-[11px] font-mono tracking-wider uppercase text-gray-faint">
                Recent activity
              </span>
            </div>
            <div className="p-5">
              {recentActivity.length > 0 ? (
                <ul className="space-y-3">
                  {recentActivity.map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div
                        className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          item.type === "ai" ? "bg-accent" : "bg-gray-faint"
                        }`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-warm-white truncate">{item.text}</p>
                        <p className="text-[11px] text-gray-faint">{timeAgo(new Date(item.time).getTime())}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center py-4">
                  <p className="text-[13px] text-gray-muted">No recent activity</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Report history placeholder */}
        <div className="mt-8 rounded-xl border border-gray-border bg-surface p-6">
          <div className="text-[11px] font-mono tracking-wider uppercase text-gray-faint mb-4">
            Report history
          </div>
          <p className="text-[13px] text-gray-muted">
            Weekly reports are sent to your email every Monday. Past reports will appear here.
          </p>
        </div>
      </div>
    </div>
  );
}
