"use client";

import {
  LayoutDashboard,
  CalendarDays,
  Settings,
  ExternalLink,
} from "lucide-react";
import { useDashboard } from "./DashboardContext";

interface BottomToolbarProps {
  siteName: string;
}

export function BottomToolbar({ siteName }: BottomToolbarProps) {
  const { setOverlayView, editMode, setEditMode } = useDashboard();

  return (
    <div className="hidden md:flex items-center justify-between px-4 h-9 border-t border-[#e8e8e8] bg-white shrink-0">
      {/* Left: site name + draft/live toggle */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className={`w-[5px] h-[5px] rounded-full transition-colors ${
            editMode === "draft" ? "bg-amber-400" : "bg-emerald-500"
          }`} />
          <span className="font-mono text-[10px] text-[#999]">{siteName}</span>
        </div>

        {/* Toggle switch */}
        <button
          type="button"
          onClick={() => setEditMode(editMode === "live" ? "draft" : "live")}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#f5f5f5] hover:bg-[#e8e8e8] transition-colors"
          title={editMode === "live" ? "Switch to draft mode" : "Switch to live mode"}
        >
          <span className={`text-[9px] font-medium uppercase tracking-wider transition-colors ${
            editMode === "live" ? "text-emerald-600" : "text-[#ccc]"
          }`}>
            Live
          </span>
          <div className={`relative w-6 h-3.5 rounded-full transition-colors ${
            editMode === "draft" ? "bg-amber-400" : "bg-emerald-500"
          }`}>
            <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow-sm transition-transform ${
              editMode === "draft" ? "left-[13px]" : "left-[1px]"
            }`} />
          </div>
          <span className={`text-[9px] font-medium uppercase tracking-wider transition-colors ${
            editMode === "draft" ? "text-amber-600" : "text-[#ccc]"
          }`}>
            Draft
          </span>
        </button>
      </div>

      {/* Right: secondary nav */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => setOverlayView("overview")}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono text-[#999] hover:text-[#1a1a1a] transition-colors duration-150"
        >
          <LayoutDashboard className="w-3 h-3" strokeWidth={1.5} />
          Overview
        </button>
        <span className="text-[10px] text-[#e8e8e8]">&middot;</span>
        <button
          onClick={() => setOverlayView("bookings")}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono text-[#999] hover:text-[#1a1a1a] transition-colors duration-150"
        >
          <CalendarDays className="w-3 h-3" strokeWidth={1.5} />
          Bookings
        </button>
        <span className="text-[10px] text-[#e8e8e8]">&middot;</span>
        <button
          onClick={() => setOverlayView("settings")}
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono text-[#999] hover:text-[#1a1a1a] transition-colors duration-150"
        >
          <Settings className="w-3 h-3" strokeWidth={1.5} />
          Settings
        </button>
        <span className="text-[10px] text-[#e8e8e8]">&middot;</span>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono text-[#999] hover:text-[#1a1a1a] transition-colors duration-150"
        >
          <ExternalLink className="w-3 h-3" strokeWidth={1.5} />
          Open Site
        </a>
      </div>
    </div>
  );
}
