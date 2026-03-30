"use client";

import { useRef, useEffect, useState, useCallback } from "react";
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
  ChevronUp,
  PanelLeftClose,
  PanelLeftOpen,
  AlertTriangle,
  Eye,
  EyeOff,
  Plus,
  GripVertical,
  Instagram,
  CalendarCheck,
  type LucideIcon,
} from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { timeAgo } from "@/lib/utils";
import type { PageSectionConfig, SitePageConfig } from "@/lib/types";
import { DEFAULT_PAGE_CONFIG } from "@/lib/pageConfigDefaults";

const SECTION_ICONS: Record<string, LucideIcon> = {
  hero: Sparkles,
  services: Layers,
  story: BookOpen,
  testimonials: Star,
  events: Calendar,
  providers: Users,
  contact: Phone,
  settings: Settings,
  faq: BookOpen,
  shop: Layers,
  "trust-strip": Sparkles,
  "testimonial-quote": Star,
  cta: Sparkles,
  "page-header": BookOpen,
  "booking-widget": Calendar,
  "instagram-feed": Instagram,
  "vagaro-booking": CalendarCheck,
};

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  services: "Services",
  story: "About",
  testimonials: "Reviews",
  events: "Events",
  providers: "Providers",
  contact: "Contact",
  settings: "Settings",
  faq: "FAQ",
  shop: "Shop",
  "trust-strip": "Trust Strip",
  "testimonial-quote": "Quote",
  cta: "Call to Action",
  "page-header": "Page Header",
  "booking-widget": "Booking Widget",
  "instagram-feed": "Instagram Feed",
  "vagaro-booking": "Vagaro Booking",
};

const PAGE_OPTIONS = [
  { id: "home", label: "Home" },
  { id: "about", label: "About" },
  { id: "contact", label: "Contact" },
];

const ALL_SECTION_TYPES = [
  "hero", "services", "story", "testimonials", "events", "providers",
  "contact", "faq", "shop", "trust-strip", "testimonial-quote",
  "cta", "page-header", "booking-widget", "instagram-feed", "vagaro-booking",
];

export interface SectionData {
  preview: string;
  status: "live" | "empty" | "configured";
  count?: string;
  chatPrompt: string;
  items?: { label: string; detail?: string }[];
  freshness?: "fresh" | "aging" | "stale" | "unknown";
}

interface ContentBrowserProps {
  sectionData: Record<string, SectionData>;
  timestamps: Record<string, string>;
}

export function ContentBrowser({ sectionData, timestamps }: ContentBrowserProps) {
  const {
    setChatPrompt,
    leftCollapsed,
    toggleLeft,
    activeSection,
    setActiveSection,
    setScrollToSection,
    triggerRefresh,
  } = useDashboard();

  const expandedRef = useRef<HTMLDivElement>(null);
  const [activePage, setActivePage] = useState("home");
  const [pageConfig, setPageConfig] = useState<SitePageConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  useEffect(() => {
    fetch("/api/page-config", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) { setPageConfig(DEFAULT_PAGE_CONFIG); return; }
        // Merge stored config with defaults — add new default sections not yet in stored config
        const merged = { ...DEFAULT_PAGE_CONFIG };
        for (const page of Object.keys(merged) as Array<keyof typeof merged>) {
          const stored = data[page];
          const defaults = DEFAULT_PAGE_CONFIG[page];
          if (stored && defaults) {
            const storedTypes = new Set(stored.sections.map((s: PageSectionConfig) => s.type));
            const newDefaults = defaults.sections.filter((s) => !storedTypes.has(s.type));
            merged[page] = { sections: [...stored.sections, ...newDefaults] };
          } else if (stored) {
            merged[page] = stored;
          }
        }
        setPageConfig(merged);
      })
      .catch(() => { setPageConfig(DEFAULT_PAGE_CONFIG); });
  }, []);

  useEffect(() => {
    if (activeSection && expandedRef.current) {
      expandedRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeSection]);

  const saveConfig = useCallback(async (config: SitePageConfig) => {
    setSaving(true);
    try {
      await fetch("/api/page-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(config),
      });
      triggerRefresh();
    } catch {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
    }
    setSaving(false);
  }, [triggerRefresh]);

  const pageSections = pageConfig?.[activePage]?.sections || [];
  const sortedSections = [...pageSections].sort((a, b) => a.order - b.order);

  function handleMoveUp(index: number) {
    if (!pageConfig || index === 0) return;
    const sections = [...sortedSections];
    [sections[index - 1], sections[index]] = [sections[index], sections[index - 1]];
    sections.forEach((s, i) => { s.order = i; });
    const updated = { ...pageConfig, [activePage]: { sections } };
    setPageConfig(updated);
    saveConfig(updated);
  }

  function handleMoveDown(index: number) {
    if (!pageConfig || index === sortedSections.length - 1) return;
    const sections = [...sortedSections];
    [sections[index], sections[index + 1]] = [sections[index + 1], sections[index]];
    sections.forEach((s, i) => { s.order = i; });
    const updated = { ...pageConfig, [activePage]: { sections } };
    setPageConfig(updated);
    saveConfig(updated);
  }

  function handleToggleVisibility(index: number) {
    if (!pageConfig) return;
    const sections = [...sortedSections];
    sections[index] = { ...sections[index], visible: !sections[index].visible };
    const updated = { ...pageConfig, [activePage]: { sections } };
    setPageConfig(updated);
    saveConfig(updated);
  }

  function handleAddSection(type: string) {
    if (!pageConfig) return;
    const sections = [...sortedSections];
    const newSection: PageSectionConfig = { type, visible: true, order: sections.length };
    sections.push(newSection);
    const updated = { ...pageConfig, [activePage]: { sections } };
    setPageConfig(updated);
    saveConfig(updated);
    setShowAddMenu(false);
  }

  function handleRemoveSection(index: number) {
    if (!pageConfig) return;
    const sections = sortedSections.filter((_, i) => i !== index);
    sections.forEach((s, i) => { s.order = i; });
    const updated = { ...pageConfig, [activePage]: { sections } };
    setPageConfig(updated);
    saveConfig(updated);
  }

  const usedTypes = new Set(sortedSections.map((s) => s.type));
  const availableTypes = ALL_SECTION_TYPES.filter((t) => !usedTypes.has(t));

  // Collapsed state
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
        {sortedSections.filter((s) => s.visible).map((section) => {
          const Icon = SECTION_ICONS[section.type] || Layers;
          const data = sectionData[section.type];
          const isActive = activeSection === section.type;
          return (
            <button
              key={section.type}
              onClick={() => { toggleLeft(); setActiveSection(section.type); }}
              className={`relative w-8 h-8 rounded-md flex items-center justify-center transition-colors duration-150 ${
                isActive
                  ? "text-[#7c9a8e] bg-[#7c9a8e]/[0.06]"
                  : "text-[#999] hover:text-[#1a1a1a] hover:bg-[#f5f5f5]"
              }`}
              title={SECTION_LABELS[section.type] || section.type}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              {data && (
                <div className={`absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full ${
                  data.status === "live" ? "bg-emerald-500"
                    : data.status === "configured" ? "bg-[#999]"
                    : "bg-[#ccc]"
                }`} />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header — page selector as pill tabs */}
      <div className="border-b border-[#e8e8e8] shrink-0">
        <div className="flex items-center justify-between px-3 h-10">
          <span className="text-[10px] font-medium uppercase tracking-wider text-[#999]">
            Pages
          </span>
          <div className="flex items-center gap-1">
            {saving && (
              <span className="text-[9px] font-mono text-[#7c9a8e] animate-pulse">saving</span>
            )}
            {saveError && (
              <span className="text-[9px] font-mono text-[#b5634b]">save failed</span>
            )}
            <button
              onClick={toggleLeft}
              className="hidden md:flex w-6 h-6 rounded-md items-center justify-center text-[#999] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors duration-150"
              title="Collapse panel"
            >
              <PanelLeftClose className="w-[14px] h-[14px]" strokeWidth={1.5} />
            </button>
          </div>
        </div>
        {/* Page pills */}
        <div className="flex flex-wrap gap-1 px-3 pb-2.5">
          {PAGE_OPTIONS.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePage(p.id)}
              className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all duration-150 ${
                activePage === p.id
                  ? "bg-[#7c9a8e] text-white"
                  : "bg-[#f5f5f5] text-[#999] hover:text-[#1a1a1a] hover:bg-[#e8e8e8]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section rows */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-1 py-2">
          {sortedSections.map((section, i) => {
            const Icon = SECTION_ICONS[section.type] || Layers;
            const label = SECTION_LABELS[section.type] || section.type;
            const data = sectionData[section.type];
            const isExpanded = activeSection === section.type;
            const ts = timestamps[section.type];
            const isHidden = !section.visible;

            return (
              <div
                key={`${section.type}-${section.order}`}
                ref={isExpanded ? expandedRef : undefined}
                className={`rounded-lg mx-1 mb-0.5 overflow-hidden ${isHidden ? "opacity-40" : ""}`}
                style={{ animation: "fade-in-up 200ms ease-out both", animationDelay: `${i * 40}ms` }}
              >
                {/* Row */}
                <div className={`flex items-center h-10 transition-colors duration-150 ${
                  isExpanded
                    ? "bg-[#7c9a8e]/[0.06]"
                    : "hover:bg-[#f5f5f5]"
                }`}>
                  {/* Grip + reorder */}
                  <div className="flex items-center w-7 shrink-0 justify-center group/grip">
                    <div className="hidden group-hover/grip:flex flex-col items-center">
                      <button
                        onClick={() => handleMoveUp(i)}
                        disabled={i === 0}
                        className="text-[#999] hover:text-[#1a1a1a] disabled:opacity-0 transition-colors"
                        title="Move up"
                      >
                        <ChevronUp className="w-3 h-3" strokeWidth={2} />
                      </button>
                      <button
                        onClick={() => handleMoveDown(i)}
                        disabled={i === sortedSections.length - 1}
                        className="text-[#999] hover:text-[#1a1a1a] disabled:opacity-0 transition-colors"
                        title="Move down"
                      >
                        <ChevronDown className="w-3 h-3" strokeWidth={2} />
                      </button>
                    </div>
                    <GripVertical className="w-3 h-3 text-[#ccc] group-hover/grip:hidden" strokeWidth={1.5} />
                  </div>

                  {/* Main row button */}
                  <button
                    onClick={() => setActiveSection(isExpanded ? null : section.type)}
                    className="flex-1 flex items-center h-10 pr-1 text-left min-w-0"
                  >
                    <Icon
                      className={`w-[14px] h-[14px] mr-2.5 shrink-0 transition-colors duration-150 ${
                        isExpanded ? "text-[#7c9a8e]" : "text-[#999]"
                      }`}
                      strokeWidth={1.5}
                    />
                    <span className={`text-[12px] font-medium flex-1 min-w-0 truncate ${
                      isHidden ? "line-through text-[#999]" : "text-[#1a1a1a]"
                    }`}>
                      {label}
                    </span>

                    {data?.count && (
                      <span className="font-mono text-[10px] text-[#ccc] mr-1">{data.count}</span>
                    )}

                    {data?.freshness === "stale" && (
                      <AlertTriangle className="w-3 h-3 text-amber-400 mr-1" strokeWidth={1.5} />
                    )}

                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-[#999] shrink-0" strokeWidth={1.5} />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-[#ccc] shrink-0" strokeWidth={1.5} />
                    )}
                  </button>

                  {/* Visibility toggle */}
                  <button
                    onClick={() => handleToggleVisibility(i)}
                    className="w-7 h-7 flex items-center justify-center text-[#ccc] hover:text-[#999] transition-colors shrink-0 rounded-md hover:bg-[#f5f5f5]"
                    title={isHidden ? "Show section" : "Hide section"}
                  >
                    {isHidden ? (
                      <EyeOff className="w-3.5 h-3.5" strokeWidth={1.5} />
                    ) : (
                      <Eye className="w-3.5 h-3.5" strokeWidth={1.5} />
                    )}
                  </button>
                </div>

                {/* Expanded content */}
                {isExpanded && data && (
                  <div className="bg-[#fafafa] border-t border-[#e8e8e8]/50 animate-fade-in-up">
                    {data.items && data.items.length > 0 ? (
                      <div className="py-1">
                        {data.items.slice(0, 5).map((item, j) => (
                          <div key={j} className="flex items-center justify-between h-7 px-4 pl-[42px]">
                            <span className="text-[11px] text-[#666] truncate flex-1">{item.label}</span>
                            {item.detail && (
                              <span className="text-[10px] font-mono text-[#ccc] ml-2 shrink-0">{item.detail}</span>
                            )}
                          </div>
                        ))}
                        {data.items.length > 5 && (
                          <div className="h-7 flex items-center px-4 pl-[42px]">
                            <span className="text-[10px] font-mono text-[#ccc]">+{data.items.length - 5} more</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-8 flex items-center px-4 pl-[42px]">
                        <span className="text-[11px] text-[#999] italic">
                          {data.status === "empty" ? "No content yet" : data.preview}
                        </span>
                      </div>
                    )}

                    {/* Actions row */}
                    <div className="flex items-center justify-between h-9 px-3 pl-[42px] border-t border-[#e8e8e8]/50 bg-white/50">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-[5px] h-[5px] rounded-full ${
                          data.freshness === "fresh" ? "bg-emerald-500" :
                          data.freshness === "aging" ? "bg-amber-400" :
                          data.freshness === "stale" ? "bg-red-400" :
                          "bg-[#ccc]"
                        }`} />
                        <span className="text-[10px] font-mono text-[#ccc]">
                          {ts ? timeAgo(ts) : "never"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); setChatPrompt(data.chatPrompt); }}
                          className="px-2 py-1 rounded text-[10px] font-medium text-[#7c9a8e] hover:bg-[#7c9a8e]/[0.06] transition-colors duration-150"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setScrollToSection(section.type); }}
                          className="px-2 py-1 rounded text-[10px] font-medium text-[#7c9a8e] hover:bg-[#7c9a8e]/[0.06] transition-colors duration-150"
                        >
                          View
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRemoveSection(i); }}
                          className="px-2 py-1 rounded text-[10px] font-medium text-[#999] hover:text-[#b5634b] hover:bg-red-500/[0.04] transition-colors duration-150"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Add Section */}
        <div className="px-3 pb-3">
          {showAddMenu ? (
            <div className="border border-[#e8e8e8] rounded-lg bg-white overflow-hidden animate-fade-in-up shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-[#e8e8e8] bg-[#fafafa]">
                <span className="text-[10px] font-medium uppercase tracking-wider text-[#999]">Add Section</span>
                <button
                  onClick={() => setShowAddMenu(false)}
                  className="text-[10px] text-[#999] hover:text-[#1a1a1a] transition-colors"
                >
                  Cancel
                </button>
              </div>
              <div className="max-h-52 overflow-y-auto py-1">
                {availableTypes.length === 0 ? (
                  <div className="px-3 py-4 text-[11px] text-[#999] text-center">
                    All sections added to this page
                  </div>
                ) : (
                  availableTypes.map((type) => {
                    const Icon = SECTION_ICONS[type] || Layers;
                    return (
                      <button
                        key={type}
                        onClick={() => handleAddSection(type)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-[#f5f5f5] transition-colors text-left rounded-md mx-1"
                        style={{ width: "calc(100% - 8px)" }}
                      >
                        <Icon className="w-[14px] h-[14px] text-[#999]" strokeWidth={1.5} />
                        <span className="text-[12px] text-[#1a1a1a]">{SECTION_LABELS[type] || type}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowAddMenu(true)}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-dashed border-[#e8e8e8] text-[11px] text-[#7c9a8e] font-medium hover:bg-[#7c9a8e]/[0.04] hover:border-[#7c9a8e]/40 transition-all duration-150"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
              Add section
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
