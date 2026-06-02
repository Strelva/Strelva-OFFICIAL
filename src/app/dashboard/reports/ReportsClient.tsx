"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import type { StoredWeeklyReport } from "@/lib/storage";

const ACTION_VOCAB = { metric: "Took a high-intent action", action: "took a high-intent action" };

interface ReportsClientProps {
  siteName: string;
  pageViews: { total: number; thisWeek: number; today: number };
  bookingClicks: { total: number; thisWeek: number; today: number };
  staleSections: { section: string; daysSinceUpdate: number }[];
  recentActivity: { text: string; time: string; type?: string }[];
  reportHistory: StoredWeeklyReport[];
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

function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ReportHistoryItem({ report }: { report: StoredWeeklyReport }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-gray-border/50 last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-bg/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {expanded ? (
            <ChevronDown className="w-4 h-4 text-gray-muted" strokeWidth={1.5} />
          ) : (
            <ChevronRight className="w-4 h-4 text-gray-muted" strokeWidth={1.5} />
          )}
          <span className="text-[13px] font-medium text-warm-white">
            Week of {formatWeekLabel(report.weekStart)}
          </span>
        </div>
        <div className="flex items-center gap-4 text-[12px] text-gray-muted">
          <span>{report.pageViews.thisWeek} people found you</span>
          <span>{report.bookingClicks.thisWeek} {ACTION_VOCAB.action}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-5 pb-5 pt-2 border-t border-gray-border/30 bg-surface-inset/50">
          {report.summary ? (
            <p className="text-[13px] text-gray-fg leading-relaxed whitespace-pre-wrap">
              {report.summary}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] font-mono tracking-wider uppercase text-gray-faint mb-1">
                  People found you
                </div>
                <div className="text-[18px] font-medium text-warm-white">
                  {report.pageViews.thisWeek}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-mono tracking-wider uppercase text-gray-faint mb-1">
                  {ACTION_VOCAB.metric}
                </div>
                <div className="text-[18px] font-medium text-warm-white">
                  {report.bookingClicks.thisWeek}
                </div>
              </div>
            </div>
          )}
        </div>
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
  reportHistory,
}: ReportsClientProps) {
  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekLabel = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 lg:p-10">
      <div className="max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-[24px] font-medium text-warm-white">Weekly reports</h1>
          <p className="text-[13px] text-gray-muted mt-1">
            Plain-English proof of what Strelva handled for {siteName}
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
              {bookingClicks.thisWeek} {ACTION_VOCAB.action}
            </p>
          )}
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          <StatCard
            label="People found you"
            value={pageViews.thisWeek}
            subvalue={`${pageViews.total.toLocaleString()} all time`}
          />
          <StatCard
            label={ACTION_VOCAB.metric}
            value={bookingClicks.thisWeek}
            subvalue={`${bookingClicks.total.toLocaleString()} all time`}
          />
          <StatCard
            label="Found you today"
            value={pageViews.today}
            subvalue={bookingClicks.today > 0 ? `${bookingClicks.today} ${ACTION_VOCAB.action}` : undefined}
          />
        </div>

        <div className="rounded-xl border border-accent/20 bg-accent/5 p-5 mb-8">
          <div className="text-[11px] font-mono tracking-wider uppercase text-accent mb-2">
            Why this matters
          </div>
          <p className="text-[14px] leading-relaxed text-gray-fg">
            This week Strelva helped {pageViews.thisWeek.toLocaleString()} people find you, tracked {bookingClicks.thisWeek.toLocaleString()} high-intent action{bookingClicks.thisWeek === 1 ? "" : "s"}, and kept a record of what changed on your site.
          </p>
        </div>

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Content freshness */}
          <div className="rounded-xl border border-gray-border bg-surface overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-border/50">
              <span className="text-[11px] font-mono tracking-wider uppercase text-gray-faint">
                Site areas to refresh
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
                  <p className="text-[13px] text-gray-muted">Your main site areas look current</p>
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

        {/* Report history */}
        <div className="mt-8 rounded-xl border border-gray-border bg-surface overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-border/50">
            <span className="text-[11px] font-mono tracking-wider uppercase text-gray-faint">
              Report history
            </span>
          </div>
          {reportHistory.length > 0 ? (
            <div>
              {reportHistory.map((report) => (
                <ReportHistoryItem key={report.id} report={report} />
              ))}
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="text-[13px] text-gray-muted">
                Weekly reports are generated every Monday. Past reports will appear here.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
