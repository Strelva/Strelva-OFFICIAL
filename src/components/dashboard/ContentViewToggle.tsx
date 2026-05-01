"use client";

import { useState } from "react";
import { Pencil, Layers } from "lucide-react";
import { ContentWorkspace } from "./ContentWorkspace";
import { DesignMode } from "./DesignMode";
import type { SectionData } from "./ContentBrowser";

interface ContentViewToggleProps {
  siteName: string;
  ownerName: string;
  sectionData: Record<string, SectionData>;
  timestamps: Record<string, string>;
}

export function ContentViewToggle({
  siteName,
  ownerName,
  sectionData,
  timestamps,
}: ContentViewToggleProps) {
  const [view, setView] = useState<"edit" | "design">("edit");
  const sections = Object.values(sectionData);
  const staleCount = sections.filter((section) => section.freshness === "stale").length;
  const liveCount = sections.filter((section) => section.status === "live").length;

  return (
    <div className="flex flex-col h-full">
      {/* View toggle bar */}
      <div className="border-b border-gray-border bg-surface flex flex-col gap-3 px-4 py-3 shrink-0 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted">
            Site control
          </p>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-[18px] font-semibold text-warm-black">{siteName}</h1>
            <span className="text-[12px] text-gray-muted">
              {liveCount} live sections
              {staleCount > 0 ? `, ${staleCount} should be refreshed` : ", content is current"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-glass-border bg-surface-inset p-1 w-fit">
          <button
            onClick={() => setView("edit")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
              view === "edit"
                ? "bg-surface-raised text-warm-black"
                : "text-gray-muted hover:text-warm-black hover:bg-gray-bg/50"
            }`}
          >
            <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
            Edit
          </button>
          <button
            onClick={() => setView("design")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
              view === "design"
                ? "bg-surface-raised text-warm-black"
                : "text-gray-muted hover:text-warm-black hover:bg-gray-bg/50"
            }`}
          >
            <Layers className="w-3.5 h-3.5" strokeWidth={1.5} />
            Design
          </button>
        </div>
      </div>

      {/* Active view */}
      <div className="flex-1 min-h-0">
        {view === "edit" ? (
          <ContentWorkspace
            siteName={siteName}
            ownerName={ownerName}
            sectionData={sectionData}
            timestamps={timestamps}
          />
        ) : (
          <DesignMode />
        )}
      </div>
    </div>
  );
}
