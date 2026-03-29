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
  const { setOverlayView } = useDashboard();

  return (
    <div className="hidden md:flex items-center justify-between px-4 h-8 border-t border-[#e8e8e8] bg-white shrink-0">
      {/* Left: site name + status */}
      <div className="flex items-center gap-2">
        <div className="w-[5px] h-[5px] rounded-full bg-emerald-500" />
        <span className="font-mono text-[10px] text-[#999]">{siteName}</span>
        <span className="text-[10px] text-[#ccc]">&middot;</span>
        <span className="font-mono text-[10px] text-[#ccc]">
          LIVE
        </span>
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
