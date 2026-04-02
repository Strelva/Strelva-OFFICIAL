"use client";

import { useState, useEffect } from "react";
import { ChevronDown, ChevronRight, Filter } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import type { ActivityEntry } from "@/lib/storage";
import { SECTION_LABELS } from "@/components/ui/section-labels";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { SkeletonRow } from "@/components/ui/Skeleton";

function groupByDay(entries: ActivityEntry[]): Record<string, ActivityEntry[]> {
  const groups: Record<string, ActivityEntry[]> = {};
  for (const entry of entries) {
    const day = new Date(entry.time).toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
    if (!groups[day]) groups[day] = [];
    groups[day].push(entry);
  }
  return groups;
}

function ActivityItem({ entry }: { entry: ActivityEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasChanges = entry.changes && entry.changes.length > 0;

  return (
    <div className="group">
      <button
        type="button"
        onClick={() => hasChanges && setExpanded(!expanded)}
        className={`w-full flex items-start gap-2.5 px-3 py-2 text-left rounded-lg transition-colors duration-150 ${
          hasChanges ? "hover:bg-gray-bg-alt cursor-pointer" : "cursor-default"
        }`}
      >
        {/* Actor icon */}
        <Avatar type={entry.actor === "ai" ? "bot" : "user"} size="sm" className="mt-0.5" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-warm-black">{entry.text}</span>
            {entry.section && (
              <Badge variant="sage" className="text-[11px]">
                {SECTION_LABELS[entry.section] || entry.section}
              </Badge>
            )}
          </div>
          <span className="text-[11px] text-gray-subtle font-mono">{timeAgo(entry.time)}</span>
        </div>

        {hasChanges && (
          <div className="shrink-0 mt-1">
            {expanded ? (
              <ChevronDown className="w-3 h-3 text-gray-subtle" strokeWidth={1.5} />
            ) : (
              <ChevronRight className="w-3 h-3 text-gray-subtle" strokeWidth={1.5} />
            )}
          </div>
        )}
      </button>

      {/* Field-level diffs */}
      {expanded && entry.changes && (
        <div className="ml-[30px] mb-2 animate-fade-in-up">
          {entry.changes.map((change, i) => (
            <div key={i} className="flex items-start gap-2 px-3 py-1">
              <span className="text-[11px] font-medium text-gray-muted uppercase tracking-wider w-16 shrink-0">
                {change.field}
              </span>
              <div className="flex-1 min-w-0">
                {change.before && (
                  <p className="text-[11px] text-gray-subtle line-through truncate">{change.before}</p>
                )}
                <p className="text-[11px] text-warm-black truncate">{change.after}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function ActivityTimeline() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionFilter, setSectionFilter] = useState<string>("");
  const [actorFilter, setActorFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (sectionFilter) params.set("section", sectionFilter);
    if (actorFilter) params.set("actor", actorFilter);
    const qs = params.toString();

    setLoading(true);
    fetch(`/api/activity${qs ? `?${qs}` : ""}`, { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setEntries(data))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [sectionFilter, actorFilter]);

  const grouped = groupByDay(entries);
  const hasActiveFilters = !!sectionFilter || !!actorFilter;

  return (
    <div>
      {/* Header with filter toggle */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-medium uppercase tracking-wider text-gray-muted">
          Activity
        </h3>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-[11px] transition-colors duration-150 ${
            hasActiveFilters
              ? "text-sage bg-sage/[0.06]"
              : "text-gray-muted hover:text-warm-black"
          }`}
        >
          <Filter className="w-3 h-3" strokeWidth={1.5} />
          Filter
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex items-center gap-2 mb-3 animate-fade-in-up">
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            className="bg-gray-bg-alt border border-gray-border rounded-md px-2 py-1 text-[11px] text-warm-black outline-none focus:border-sage"
          >
            <option value="">All sections</option>
            {Object.entries(SECTION_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <select
            value={actorFilter}
            onChange={(e) => setActorFilter(e.target.value)}
            className="bg-gray-bg-alt border border-gray-border rounded-md px-2 py-1 text-[11px] text-warm-black outline-none focus:border-sage"
          >
            <option value="">Everyone</option>
            <option value="user">You</option>
            <option value="ai">AI</option>
          </select>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => { setSectionFilter(""); setActorFilter(""); }}
              className="text-[11px] text-gray-muted hover:text-warm-black transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="py-4 space-y-3 px-3">
          {[1, 2, 3].map((i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        hasActiveFilters ? (
          <div className="py-6 text-center">
            <p className="text-[11px] text-gray-faint">No matching activity</p>
          </div>
        ) : (
          <div className="py-4">
            <div className="space-y-3">
              {[
                { step: 1, label: "Share your site link", detail: "Send it to friends, add it to Instagram bio", done: false },
                { step: 2, label: "Get your first visitor", detail: "We'll track every person who finds you", done: false },
                { step: 3, label: "See your first booking click", detail: "Know exactly when someone clicks Book Now", done: false },
              ].map((item) => (
                <div key={item.step} className="flex items-start gap-3 px-1">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-semibold ${
                    item.done
                      ? "bg-sage text-white"
                      : "bg-gray-bg text-gray-muted"
                  }`}>
                    {item.done ? "\u2713" : item.step}
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-medium text-warm-black">{item.label}</p>
                    <p className="text-[11px] text-gray-faint mt-0.5">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([day, items]) => (
            <div key={day}>
              <div className="text-[11px] font-medium text-gray-muted uppercase tracking-wider mb-1 px-3">
                {day}
              </div>
              <div className="space-y-0.5">
                {items.map((entry, i) => (
                  <ActivityItem key={`${entry.time}-${i}`} entry={entry} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
