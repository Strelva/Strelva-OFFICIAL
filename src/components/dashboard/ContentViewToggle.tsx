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

  return (
    <div className="flex flex-col h-full">
      {/* View toggle bar */}
      <div className="h-10 border-b border-gray-border bg-surface flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setView("edit")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
              view === "edit"
                ? "bg-gray-bg text-warm-black"
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
                ? "bg-gray-bg text-warm-black"
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
