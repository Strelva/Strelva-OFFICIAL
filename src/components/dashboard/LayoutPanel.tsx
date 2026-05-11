"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Loader2 } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { getDefaultPageConfig } from "@/lib/pageConfigDefaults";
import { SECTION_LABELS } from "@/components/ui/section-labels";
import type { PageSectionConfig, SitePageConfig } from "@/lib/types";

const PAGE_LABELS: Record<string, string> = {
  home: "Home",
  about: "About",
  contact: "Contact",
  events: "Events",
  faq: "FAQ",
  providers: "Providers",
  services: "Services",
  shop: "Shop",
};

type LayoutGap = NonNullable<NonNullable<PageSectionConfig["layout"]>["gap"]>;
type LayoutPadding = NonNullable<NonNullable<PageSectionConfig["layout"]>["padding"]>;

const GAP_OPTIONS: LayoutGap[] = [
  "tight",
  "normal",
  "loose",
];

const PADDING_OPTIONS: LayoutPadding[] = [
  "none",
  "normal",
  "spacious",
];

function mergePageConfig(
  stored: SitePageConfig | null,
  fallback: SitePageConfig
): SitePageConfig {
  if (!stored || typeof stored !== "object") return fallback;

  const merged: SitePageConfig = { ...fallback };
  for (const [slug, pageCfg] of Object.entries(stored)) {
    const def = fallback[slug];
    if (!def) {
      merged[slug] = pageCfg;
      continue;
    }
    const storedTypes = new Set(pageCfg.sections.map((s) => s.type));
    const newDefaults = def.sections.filter((s) => !storedTypes.has(s.type));
    merged[slug] = { ...pageCfg, sections: [...pageCfg.sections, ...newDefaults] };
  }
  return merged;
}

function normalizeOrder(sections: PageSectionConfig[]): PageSectionConfig[] {
  return sections.map((section, order) => ({ ...section, order }));
}

export function LayoutPanel() {
  const {
    activePage,
    setActivePage,
    activeSection,
    setActiveSection,
    setRightTab,
    dashboardHref,
    siteModel,
    setHasPageConfigDraft,
    triggerRefresh,
  } = useDashboard();
  const fallbackConfig = useMemo(() => getDefaultPageConfig(siteModel), [siteModel]);
  const [pageConfig, setPageConfig] = useState<SitePageConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(dashboardHref("/api/page-config?draft=true"), { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setPageConfig(mergePageConfig(data, fallbackConfig));
      })
      .catch(() => {
        if (!cancelled) setPageConfig(fallbackConfig);
      });
    return () => {
      cancelled = true;
    };
  }, [dashboardHref, fallbackConfig]);

  const pageOptions = useMemo(() => {
    const source = pageConfig || fallbackConfig;
    return Object.keys(source)
      .sort((a, b) => (a === "home" ? -1 : b === "home" ? 1 : a.localeCompare(b)))
      .map((id) => ({ id, label: PAGE_LABELS[id] || id.charAt(0).toUpperCase() + id.slice(1) }));
  }, [fallbackConfig, pageConfig]);

  const pageSections = useMemo(() => {
    if (!pageConfig?.[activePage]) return [];
    return [...pageConfig[activePage].sections].sort((a, b) => a.order - b.order);
  }, [activePage, pageConfig]);

  const selectedSection = activeSection
    ? pageSections.find((section) => section.type === activeSection)
    : null;

  const saveDraft = useCallback(async (next: SitePageConfig) => {
    setSaving(true);
    setSaveError(false);
    setPageConfig(next);
    try {
      const res = await fetch(dashboardHref("/api/page-config?draft=true"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error("Save failed");
      setHasPageConfigDraft(true);
      triggerRefresh();
    } catch {
      setSaveError(true);
      setTimeout(() => setSaveError(false), 3000);
    } finally {
      setSaving(false);
    }
  }, [dashboardHref, setHasPageConfigDraft, triggerRefresh]);

  const updateActivePageSections = useCallback((sections: PageSectionConfig[]) => {
    if (!pageConfig) return;
    const next = {
      ...pageConfig,
      [activePage]: {
        ...pageConfig[activePage],
        sections: normalizeOrder(sections),
      },
    };
    void saveDraft(next);
  }, [activePage, pageConfig, saveDraft]);

  const toggleVisibility = useCallback((type: string) => {
    updateActivePageSections(
      pageSections.map((section) =>
        section.type === type ? { ...section, visible: !section.visible } : section
      )
    );
  }, [pageSections, updateActivePageSections]);

  const moveSection = useCallback((type: string, direction: "up" | "down") => {
    const sections = [...pageSections];
    const index = sections.findIndex((section) => section.type === type);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    updateActivePageSections(sections);
  }, [pageSections, updateActivePageSections]);

  const updateLayout = useCallback((
    type: string,
    patch: NonNullable<PageSectionConfig["layout"]>
  ) => {
    updateActivePageSections(
      pageSections.map((section) =>
        section.type === type
          ? { ...section, layout: { ...section.layout, ...patch } }
          : section
      )
    );
  }, [pageSections, updateActivePageSections]);

  if (!pageConfig) {
    return (
      <div className="flex h-full items-center justify-center text-gray-muted">
        <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface">
      <div className="border-b border-gray-border px-4 py-3">
        <p className="text-[11px] font-mono uppercase tracking-[0.08em] text-gray-muted">
          Safe layout
        </p>
        <p className="mt-1 text-[12px] text-gray-faint">
          Reorder, show, hide, and adjust approved spacing before Push.
        </p>
        <select
          value={activePage}
          onChange={(event) => {
            setActiveSection(null);
            setActivePage(event.target.value);
          }}
          className="mt-3 h-8 w-full rounded-lg border border-gray-border bg-surface-raised px-3 text-[12px] text-warm-white outline-none focus:border-accent/45"
        >
          {pageOptions.map((page) => (
            <option key={page.id} value={page.id}>
              {page.label}
            </option>
          ))}
        </select>
        <div className="mt-2 h-4">
          {saving && <span className="text-[10px] text-accent">Saving draft...</span>}
          {saveError && <span className="text-[10px] text-red-400">Layout draft could not save.</span>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1 p-3">
          {pageSections.map((section, index) => {
            const active = activeSection === section.type;
            return (
              <div
                key={section.type}
                className={`rounded-lg border px-3 py-2 transition-colors ${
                  active
                    ? "border-accent/40 bg-accent/10"
                    : "border-gray-border bg-surface-raised"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveSection(section.type);
                    setRightTab("layout");
                  }}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="truncate text-[12px] font-medium text-warm-white">
                    {SECTION_LABELS[section.type] || section.type}
                  </span>
                  <span className="text-[10px] text-gray-faint">
                    {section.visible ? "Visible" : "Hidden"}
                  </span>
                </button>
                <div className="mt-2 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveSection(section.type, "up")}
                    disabled={index === 0}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-border text-gray-muted transition-colors hover:text-warm-white disabled:cursor-not-allowed disabled:opacity-35"
                    title="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveSection(section.type, "down")}
                    disabled={index === pageSections.length - 1}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-border text-gray-muted transition-colors hover:text-warm-white disabled:cursor-not-allowed disabled:opacity-35"
                    title="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleVisibility(section.type)}
                    className="ml-auto flex h-7 items-center gap-1 rounded-md border border-gray-border px-2 text-[11px] text-gray-muted transition-colors hover:text-warm-white"
                  >
                    {section.visible ? (
                      <Eye className="h-3.5 w-3.5" strokeWidth={1.5} />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" strokeWidth={1.5} />
                    )}
                    {section.visible ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {selectedSection && (
          <div className="border-t border-gray-border px-4 py-4">
            <p className="text-[11px] font-medium text-warm-white">
              {SECTION_LABELS[selectedSection.type] || selectedSection.type} spacing
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <span className="mb-1.5 block text-[10px] text-gray-faint">Gap</span>
                <div className="grid grid-cols-3 gap-1">
                  {GAP_OPTIONS.map((gap) => (
                    <button
                      key={gap}
                      type="button"
                      onClick={() => gap && updateLayout(selectedSection.type, { gap })}
                      className={`h-8 rounded-md border text-[10px] font-medium capitalize transition-colors ${
                        (selectedSection.layout?.gap || "normal") === gap
                          ? "border-accent/40 bg-accent/15 text-accent"
                          : "border-gray-border text-gray-muted hover:text-warm-white"
                      }`}
                    >
                      {gap}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="mb-1.5 block text-[10px] text-gray-faint">Padding</span>
                <div className="grid grid-cols-3 gap-1">
                  {PADDING_OPTIONS.map((padding) => (
                    <button
                      key={padding}
                      type="button"
                      onClick={() => padding && updateLayout(selectedSection.type, { padding })}
                      className={`h-8 rounded-md border text-[10px] font-medium capitalize transition-colors ${
                        (selectedSection.layout?.padding || "normal") === padding
                          ? "border-accent/40 bg-accent/15 text-accent"
                          : "border-gray-border text-gray-muted hover:text-warm-white"
                      }`}
                    >
                      {padding}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
