"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import {
  Layers,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  AlertTriangle,
  Plus,
  Check,
  Eye,
  EyeOff,
} from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { timeAgo } from "@/lib/utils";
import type { PageSectionConfig, SitePageConfig } from "@/lib/types";
import { getDefaultPageConfig } from "@/lib/pageConfigDefaults";
import { SECTION_LABELS, SECTION_ICONS, COMPOSITE_SECTIONS, ALL_SECTION_TYPES } from "@/components/ui/section-labels";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";

const ALL_PAGE_OPTIONS = [
  { id: "home", label: "Home" },
  { id: "about", label: "About" },
  { id: "contact", label: "Contact" },
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
    siteModel,
    dashboardHref,
    activePage,
    setActivePage,
  } = useDashboard();

  const DEFAULT_PAGE_CONFIG = useMemo(() => getDefaultPageConfig(siteModel), [siteModel]);

  const expandedRef = useRef<HTMLDivElement>(null);
  const [pageConfig, setPageConfig] = useState<SitePageConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Build page dropdown options from the live config (union of stored pages
  // and site-model defaults). Falls back to defaults pre-fetch so the dropdown
  // is never empty. `home` is pinned first; remaining pages sort alphabetically.
  // User-created pages that don't have a human label fall back to their slug.
  const pageLabelMap = new Map(ALL_PAGE_OPTIONS.map((p) => [p.id, p.label]));
  const pageSource = pageConfig ?? DEFAULT_PAGE_CONFIG;
  const PAGE_OPTIONS = Object.keys(pageSource)
    .sort((a, b) => (a === "home" ? -1 : b === "home" ? 1 : a.localeCompare(b)))
    .map((id) => ({ id, label: pageLabelMap.get(id) ?? id.charAt(0).toUpperCase() + id.slice(1) }));

  useEffect(() => {
    fetch(dashboardHref("/api/page-config"), { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data) { setPageConfig(DEFAULT_PAGE_CONFIG); return; }
        // Start from defaults, overlay every stored page. This preserves
        // user-created pages (not in defaults) so they appear in the dropdown,
        // and still appends any new default sections to pages that exist in
        // both stored config and defaults.
        const merged: SitePageConfig = { ...DEFAULT_PAGE_CONFIG };
        if (data && typeof data === "object") {
          for (const [slug, pageCfg] of Object.entries(data as SitePageConfig)) {
            const def = DEFAULT_PAGE_CONFIG[slug];
            if (def) {
              const storedTypes = new Set(
                pageCfg.sections.map((s: PageSectionConfig) => s.type)
              );
              const newDefaults = def.sections.filter((s) => !storedTypes.has(s.type));
              merged[slug] = { sections: [...pageCfg.sections, ...newDefaults] };
            } else {
              merged[slug] = pageCfg;
            }
          }
        }
        setPageConfig(merged);
      })
      .catch(() => { setPageConfig(DEFAULT_PAGE_CONFIG); });
  }, [DEFAULT_PAGE_CONFIG, dashboardHref]);

  useEffect(() => {
    if (activeSection && expandedRef.current) {
      expandedRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeSection]);

  const saveConfig = useCallback(async (config: SitePageConfig, previous: SitePageConfig) => {
    setSaving(true);
    try {
      const res = await fetch(dashboardHref("/api/page-config"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(config),
      });
      // A 4xx/5xx (validation, RLS reject) used to be treated as success — the
      // optimistic edit appeared to stick, then vanished on reload. Roll it back.
      if (!res.ok) throw new Error(`page-config save failed: ${res.status}`);
      triggerRefresh();
    } catch {
      setPageConfig(previous);
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
    }
    setSaving(false);
  }, [dashboardHref, triggerRefresh]);

  const pageSections = pageConfig?.[activePage]?.sections || [];
  const sortedSections = [...pageSections].sort((a, b) => a.order - b.order);
  // Show every stored section so the Pages tab count matches the
  // Structure tab. Composite/layout sections used to be hidden here
  // while Structure showed them — the two lists silently diverged.
  // One source of truth: what Amy actually has in config.
  const visibleSections = sortedSections;


  function handleAddSection(type: string) {
    if (!pageConfig || saving) return;
    const sections = [...sortedSections];
    const newSection: PageSectionConfig = { type, visible: true, order: sections.length };
    sections.push(newSection);
    const updated = { ...pageConfig, [activePage]: { sections } };
    setPageConfig(updated);
    saveConfig(updated, pageConfig);
    setShowAddMenu(false);
  }

  function handleToggleVisibility(type: string) {
    if (!pageConfig || saving) return;
    const sections = sortedSections.map((s) =>
      s.type === type ? { ...s, visible: !s.visible } : s
    );
    const updated = { ...pageConfig, [activePage]: { sections } };
    setPageConfig(updated);
    saveConfig(updated, pageConfig);
  }

  function handleMoveSection(type: string, direction: "up" | "down") {
    if (!pageConfig || saving) return;
    const sections = [...sortedSections];
    const idx = sections.findIndex((s) => s.type === type);
    if (idx === -1) return;
    const targetIdx = direction === "up" ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= sections.length) return;
    [sections[idx], sections[targetIdx]] = [sections[targetIdx], sections[idx]];
    // Reassign order values
    const reordered = sections.map((s, i) => ({ ...s, order: i }));
    const updated = { ...pageConfig, [activePage]: { sections: reordered } };
    setPageConfig(updated);
    saveConfig(updated, pageConfig);
  }


  const usedTypes = new Set(sortedSections.map((s) => s.type));
  // Addable types: not already on page, not a composite/layout section
  const addableTypes = ALL_SECTION_TYPES.filter((t) => !usedTypes.has(t) && !COMPOSITE_SECTIONS.has(t));
  // Already-added non-composite types (shown in picker with "On page" badge)
  const onPageTypes = ALL_SECTION_TYPES.filter((t) => usedTypes.has(t) && !COMPOSITE_SECTIONS.has(t));

  // Collapsed state
  if (leftCollapsed) {
    return (
      <div className="flex flex-col items-center py-3 gap-1 bg-surface">
        <button
          onClick={toggleLeft}
          className="w-8 h-8 rounded-full flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors duration-150"
          title="Expand content panel"
        >
          <PanelLeftOpen className="w-4 h-4" strokeWidth={1.5} />
        </button>
        <div className="w-5 h-px bg-gray-border my-1" />
        {visibleSections.filter((s) => s.visible).map((section) => {
          const Icon = SECTION_ICONS[section.type] || Layers;
          const data = sectionData[section.type];
          const isActive = activeSection === section.type;
          return (
            <button
              key={section.type}
              onClick={() => { toggleLeft(); setActiveSection(section.type); }}
              className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-150 ${
                isActive
                  ? "text-sage bg-gray-bg"
                  : "text-gray-muted hover:text-warm-black hover:bg-gray-bg"
              }`}
              title={SECTION_LABELS[section.type] || section.type}
            >
              <Icon className="w-4 h-4" strokeWidth={1.5} />
              {data && (
                <div className={`absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full ${
                  data.status === "live" ? "bg-positive0"
                    : data.status === "configured" ? "bg-gray-muted"
                    : "bg-gray-subtle"
                }`} />
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      {/* Header — page selector as pill tabs */}
      <div className="border-b border-gray-border shrink-0">
        <div className="flex items-center justify-between px-3 h-10">
          <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-gray-muted">
            Pages
          </span>
          <div className="flex items-center gap-1">
            {saving && (
              <span className="text-[11px] font-mono text-sage animate-pulse">saving</span>
            )}
            {saveError && (
              <span className="text-[11px] font-mono text-terra">save failed</span>
            )}
            <button
              onClick={toggleLeft}
              className="hidden md:flex w-6 h-6 rounded-full items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors duration-150"
              title="Collapse panel"
            >
              <PanelLeftClose className="w-[14px] h-[14px]" strokeWidth={1.5} />
            </button>
          </div>
        </div>
        {/* Page pills */}
        <div className="px-3 pb-2.5">
          <Tabs
            variant="pill"
            items={PAGE_OPTIONS.map((p) => ({ value: p.id, label: p.label }))}
            value={activePage}
            onChange={setActivePage}
          />
        </div>
      </div>

      {/* Section rows */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-1 py-2">
          {visibleSections.map((section, i) => {
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
                <button
                  onClick={() => setActiveSection(isExpanded ? null : section.type)}
                  className={`group/row section-row w-full flex items-center h-10 px-3 text-left rounded-lg ${
                    isExpanded
                      ? "section-row-active"
                      : "hover:bg-gray-bg"
                  }`}
                >
                  <Icon
                    className={`w-[14px] h-[14px] mr-2.5 shrink-0 transition-colors duration-150 ${
                      isExpanded ? "text-sage" : "text-gray-muted"
                    }`}
                    strokeWidth={1.5}
                  />
                  <span className={`text-[13px] font-medium flex-1 min-w-0 truncate ${
                    isHidden ? "line-through text-gray-muted" : "text-warm-black"
                  }`}>
                    {label}
                  </span>

                  {data?.count && (
                    <span className="font-mono text-[11px] text-gray-subtle mr-1">{data.count}</span>
                  )}

                  {data?.freshness === "stale" && (
                    <AlertTriangle className="w-3 h-3 text-warning mr-1" strokeWidth={1.5} />
                  )}

                  {/* Visibility toggle */}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); handleToggleVisibility(section.type); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); handleToggleVisibility(section.type); } }}
                    className="w-6 h-6 rounded flex items-center justify-center text-gray-subtle hover:text-warm-black hover:bg-gray-bg transition-colors opacity-0 group-hover/row:opacity-100 focus:opacity-100 mr-0.5"
                    title={isHidden ? "Show section" : "Hide section"}
                  >
                    {isHidden ? (
                      <EyeOff className="w-3 h-3" strokeWidth={1.5} />
                    ) : (
                      <Eye className="w-3 h-3" strokeWidth={1.5} />
                    )}
                  </span>

                  {isExpanded ? (
                    <ChevronDown className="w-3 h-3 text-gray-muted shrink-0" strokeWidth={1.5} />
                  ) : (
                    <ChevronRight className="w-3 h-3 text-gray-subtle shrink-0" strokeWidth={1.5} />
                  )}
                </button>

                {/* Expanded content */}
                {isExpanded && data && (
                  <div className="section-expand bg-gray-bg-alt border-t border-gray-border/50">
                    {data.items && data.items.length > 0 ? (
                      <div className="py-1">
                        {data.items.slice(0, 5).map((item, j) => (
                          <div key={j} className="flex items-center justify-between h-7 px-4 pl-[38px]">
                            <span className="text-[11px] text-gray-fg truncate flex-1">{item.label}</span>
                            {item.detail && (
                              <span className="text-[11px] font-mono text-gray-subtle ml-2 shrink-0">{item.detail}</span>
                            )}
                          </div>
                        ))}
                        {data.items.length > 5 && (
                          <div className="h-7 flex items-center px-4 pl-[38px]">
                            <span className="text-[11px] font-mono text-gray-subtle">+{data.items.length - 5} more</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="h-8 flex items-center px-4 pl-[38px]">
                        <span className="text-[11px] text-gray-muted italic">
                          {data.status === "empty" ? "No content yet" : data.preview}
                        </span>
                      </div>
                    )}

                    {/* Actions row */}
                    <div className="flex items-center justify-between h-9 px-3 pl-[38px] border-t border-gray-border/50 bg-surface-raised/50">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-[5px] h-[5px] rounded-full ${
                          data.freshness === "fresh" ? "bg-positive0" :
                          data.freshness === "aging" ? "bg-warning" :
                          data.freshness === "stale" ? "bg-critical" :
                          "bg-gray-subtle"
                        }`} />
                        <span className="text-[11px] font-mono text-gray-subtle">
                          {ts ? timeAgo(ts) : "never"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleMoveSection(section.type, "up"); }}
                          disabled={i === 0}
                          className="text-[11px] text-gray-muted hover:bg-gray-bg-hover disabled:opacity-40"
                          title="Move up"
                        >
                          ↑
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleMoveSection(section.type, "down"); }}
                          disabled={i === visibleSections.length - 1}
                          className="text-[11px] text-gray-muted hover:bg-gray-bg-hover disabled:opacity-40"
                          title="Move down"
                        >
                          ↓
                        </Button>
                        <div className="w-px h-4 bg-gray-border mx-0.5" />
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setChatPrompt(data.chatPrompt); }}
                          className="text-[11px] text-sage hover:bg-gray-bg-hover"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); setScrollToSection(section.type); }}
                          className="text-[11px] text-sage hover:bg-gray-bg-hover"
                        >
                          View
                        </Button>
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
            <div className="border border-gray-border rounded-xl bg-surface-raised overflow-hidden animate-fade-in-up shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
              <div className="flex items-center justify-between px-3 py-2 border-b border-gray-border bg-gray-bg-alt">
                <span className="text-[11px] font-mono uppercase tracking-[0.06em] text-gray-muted">Add Section</span>
                <button
                  onClick={() => setShowAddMenu(false)}
                  className="text-[11px] text-gray-muted hover:text-warm-black transition-colors"
                >
                  Cancel
                </button>
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {addableTypes.length === 0 && onPageTypes.length === 0 ? (
                  <div className="px-3 py-4 text-[11px] text-gray-muted text-center">
                    All sections added to this page
                  </div>
                ) : (
                  <>
                    {/* Addable sections — full contrast, interactive */}
                    {addableTypes.map((type) => {
                      const Icon = SECTION_ICONS[type] || Layers;
                      return (
                        <button
                          key={type}
                          onClick={() => handleAddSection(type)}
                          className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-bg-hover transition-colors text-left rounded-full mx-1 cursor-pointer group/add"
                          style={{ width: "calc(100% - 8px)" }}
                        >
                          <Icon className="w-[14px] h-[14px] text-gray-fg group-hover/add:text-sage transition-colors" strokeWidth={1.5} />
                          <span className="text-[12px] text-warm-black">{SECTION_LABELS[type] || type}</span>
                          <Plus className="w-3 h-3 ml-auto text-gray-subtle group-hover/add:text-sage transition-colors opacity-0 group-hover/add:opacity-100" strokeWidth={2} />
                        </button>
                      );
                    })}
                    {/* Already on page — visible but clearly not clickable */}
                    {onPageTypes.length > 0 && (
                      <>
                        {addableTypes.length > 0 && (
                          <div className="h-px bg-gray-border mx-3 my-1.5" />
                        )}
                        {onPageTypes.map((type) => {
                          const Icon = SECTION_ICONS[type] || Layers;
                          return (
                            <div
                              key={type}
                              className="w-full flex items-center gap-2.5 px-3 py-2 mx-1"
                              style={{ width: "calc(100% - 8px)" }}
                            >
                              <Icon className="w-[14px] h-[14px] text-gray-subtle" strokeWidth={1.5} />
                              <span className="text-[12px] text-gray-muted">{SECTION_LABELS[type] || type}</span>
                              <span className="ml-auto flex items-center gap-1 text-[11px] text-gray-subtle font-medium">
                                <Check className="w-3 h-3" strokeWidth={2} />
                                On page
                              </span>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAddMenu(true)}
              icon={<Plus className="w-3.5 h-3.5" strokeWidth={1.5} />}
              className="w-full justify-center border border-gray-border md:border-dashed text-gray-muted hover:text-white hover:bg-gray-bg hover:border-gray-faint"
            >
              Add section
            </Button>
          )}
        </div>

        {/* Mobile guidance */}
        <div className="flex-1 flex items-end justify-center pb-6 md:hidden">
          <p className="text-[11px] text-gray-subtle text-center px-8">
            Tap a section to preview it, or use the chat to make changes
          </p>
        </div>
      </div>
    </div>
  );
}
