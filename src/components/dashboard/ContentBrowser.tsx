"use client";

import { useRef, useEffect } from "react";
import {
  Sparkles,
  Layers,
  BookOpen,
  Star,
  Calendar,
  Users,
  Phone,
  Settings,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { timeAgo } from "@/lib/utils";

const SECTION_META: { id: string; name: string; icon: LucideIcon; description: string; anchor: string }[] = [
  { id: "hero", name: "Hero", icon: Sparkles, description: "Main banner and headline", anchor: "hero" },
  { id: "services", name: "Services", icon: Layers, description: "What you offer", anchor: "services" },
  { id: "story", name: "About", icon: BookOpen, description: "Your bio and story", anchor: "story" },
  { id: "testimonials", name: "Reviews", icon: Star, description: "Client testimonials", anchor: "testimonials" },
  { id: "events", name: "Events", icon: Calendar, description: "Upcoming events", anchor: "events" },
  { id: "providers", name: "Providers", icon: Users, description: "Your wellness network", anchor: "providers" },
  { id: "contact", name: "Contact", icon: Phone, description: "How to reach you", anchor: "contact" },
  { id: "settings", name: "Settings", icon: Settings, description: "Site configuration", anchor: "settings" },
];

export interface SectionData {
  preview: string;
  status: "live" | "empty" | "configured";
  count?: string;
  chatPrompt: string;
  /** Rich content items for inline preview */
  items?: { label: string; detail?: string }[];
  /** Freshness: "fresh" (<7d), "aging" (7-14d), "stale" (>14d), "unknown" */
  freshness?: "fresh" | "aging" | "stale" | "unknown";
}

interface ContentBrowserProps {
  sectionData: Record<string, SectionData>;
  timestamps: Record<string, string>;
}

export function ContentBrowser({ sectionData, timestamps }: ContentBrowserProps) {
  const { setChatPrompt, leftCollapsed, toggleLeft, activeSection, setActiveSection, setScrollToSection } = useDashboard();
  const expandedRef = useRef<HTMLDivElement>(null);

  // Scroll expanded row into view
  useEffect(() => {
    if (activeSection && expandedRef.current) {
      expandedRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeSection]);

  // Collapsed state — narrow strip with icons
  if (leftCollapsed) {
    return (
      <div className="flex flex-col items-center py-3 gap-1 bg-white">
        <button
          onClick={toggleLeft}
          className="w-8 h-8 rounded-md flex items-center justify-center text-[#999] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors duration-150"
          title="Expand content panel"
        >
          <PanelLeftOpen className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <div className="w-5 h-px bg-[#e8e8e8] my-1" />
        {SECTION_META.map((section) => {
          const data = sectionData[section.id];
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              onClick={() => {
                toggleLeft();
                setActiveSection(section.id);
              }}
              className={`relative w-8 h-8 rounded-md flex items-center justify-center transition-colors duration-150 ${
                isActive
                  ? "text-[#7c9a8e] bg-[#7c9a8e]/[0.06]"
                  : "text-[#999] hover:text-[#1a1a1a] hover:bg-[#f5f5f5]"
              }`}
              title={section.name}
            >
              <section.icon className="w-[14px] h-[14px]" strokeWidth={1.5} />
              <div
                className={`absolute bottom-1 right-1 w-[5px] h-[5px] rounded-full ${
                  data?.status === "live"
                    ? "bg-emerald-500"
                    : data?.status === "configured"
                      ? "bg-[#999]"
                      : "bg-[#ccc]"
                }`}
              />
            </button>
          );
        })}
      </div>
    );
  }

  const liveSections = SECTION_META.filter((s) => sectionData[s.id]?.status === "live").length;

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-9 border-b border-[#e8e8e8] shrink-0">
        <span className="text-[11px] font-medium uppercase tracking-wider text-[#999]">
          Sections
          <span className="ml-2 font-mono text-[10px] text-[#ccc]">
            {liveSections}/{SECTION_META.length}
          </span>
        </span>
        <button
          onClick={toggleLeft}
          className="hidden md:flex w-6 h-6 rounded-md items-center justify-center text-[#999] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors duration-150"
          title="Collapse panel"
        >
          <PanelLeftClose className="w-[14px] h-[14px]" strokeWidth={1.5} />
        </button>
      </div>

      {/* Section rows */}
      <div className="flex-1 overflow-y-auto">
        {SECTION_META.map((section, i) => {
          const data = sectionData[section.id];
          if (!data) return null;
          const isExpanded = activeSection === section.id;
          const ts = timestamps[section.id];

          return (
            <div
              key={section.id}
              ref={isExpanded ? expandedRef : undefined}
              className="animate-card-enter"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              {/* Row — always visible */}
              <button
                onClick={() => setActiveSection(isExpanded ? null : section.id)}
                className={`group w-full flex items-center h-9 px-3 text-left transition-colors duration-150 ${
                  isExpanded
                    ? "bg-[#7c9a8e]/[0.06] border-l-2 border-l-[#7c9a8e]"
                    : "hover:bg-[#f5f5f5] border-l-2 border-l-transparent"
                }`}
              >
                {/* Status dot */}
                <div
                  className={`w-[5px] h-[5px] rounded-full mr-2.5 shrink-0 ${
                    data.status === "live"
                      ? "bg-emerald-500"
                      : data.status === "configured"
                        ? "bg-[#999]"
                        : "bg-[#ccc]"
                  }`}
                />

                {/* Icon */}
                <section.icon
                  className={`w-[14px] h-[14px] mr-2 shrink-0 transition-colors duration-150 ${
                    isExpanded ? "text-[#7c9a8e]" : "text-[#999] group-hover:text-[#666]"
                  }`}
                  strokeWidth={1.5}
                />

                {/* Name */}
                <span className={`text-[12px] font-medium flex-1 min-w-0 truncate ${
                  isExpanded ? "text-[#1a1a1a]" : "text-[#1a1a1a]"
                }`}>
                  {section.name}
                </span>

                {/* Count badge */}
                {data.count && (
                  <span className="font-mono text-[10px] text-[#999] mr-2">
                    {data.count}
                  </span>
                )}

                {/* Stale warning */}
                {data.freshness === "stale" && (
                  <AlertTriangle className="w-3 h-3 text-amber-500 mr-1.5" strokeWidth={1.5} />
                )}

                {/* Chevron */}
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-[#999] shrink-0" strokeWidth={1.5} />
                ) : (
                  <ChevronRight className="w-3 h-3 text-[#ccc] group-hover:text-[#999] shrink-0 transition-colors duration-150" strokeWidth={1.5} />
                )}
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <div className="bg-[#fafafa] border-l-2 border-l-[#7c9a8e] animate-fade-in-up">
                  {/* Inline content preview */}
                  {data.items && data.items.length > 0 ? (
                    <div>
                      {data.items.slice(0, 5).map((item, j) => (
                        <div key={j} className="flex items-center justify-between h-7 px-5 pl-[38px] border-b border-[#e8e8e8]/50 last:border-0">
                          <span className="text-[12px] text-[#1a1a1a] truncate flex-1">{item.label}</span>
                          {item.detail && (
                            <span className="text-[10px] font-mono text-[#999] ml-2 shrink-0">{item.detail}</span>
                          )}
                        </div>
                      ))}
                      {data.items.length > 5 && (
                        <div className="h-7 flex items-center px-5 pl-[38px]">
                          <span className="text-[10px] font-mono text-[#999]">
                            +{data.items.length - 5} more
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="h-7 flex items-center px-5 pl-[38px]">
                      <span className="text-[12px] text-[#999] italic">
                        {data.status === "empty" ? "No content yet" : data.preview}
                      </span>
                    </div>
                  )}

                  {/* Freshness + actions row */}
                  <div className="flex items-center justify-between h-8 px-5 pl-[38px] border-t border-[#e8e8e8]/50">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-[5px] h-[5px] rounded-full ${
                        data.freshness === "fresh" ? "bg-emerald-500" :
                        data.freshness === "aging" ? "bg-amber-400" :
                        data.freshness === "stale" ? "bg-red-400" :
                        "bg-[#ccc]"
                      }`} />
                      <span className="text-[10px] font-mono text-[#999]">
                        {ts ? timeAgo(ts) : "never"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setChatPrompt(data.chatPrompt);
                        }}
                        className="text-[11px] font-medium text-[#7c9a8e] hover:text-[#5a7a6e] transition-colors duration-150"
                      >
                        Edit
                      </button>
                      {section.id !== "settings" && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setScrollToSection(section.anchor);
                          }}
                          className="text-[11px] font-medium text-[#7c9a8e] hover:text-[#5a7a6e] transition-colors duration-150"
                        >
                          View
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
