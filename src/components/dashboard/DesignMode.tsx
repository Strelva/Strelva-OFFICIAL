"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDashboard } from "./DashboardContext";
import { LayersPanel } from "./design/LayersPanel";
import { DesignCanvas } from "./design/DesignCanvas";
import { DesignPropertiesPanel } from "./design/DesignPropertiesPanel";
import { PageSelector } from "./design/PageSelector";
import { PublishBar } from "./design/PublishBar";
import type { PageConfig, PageSectionConfig } from "@/lib/types";

export type DesignNode = {
  id: string;
  label: string;
  type: "frame" | "text" | "image" | "section" | "button" | "input" | "icon";
  children?: DesignNode[];
  visible?: boolean;
  locked?: boolean;
  sectionType?: string; // Maps to content section for API calls
};

export type SelectedNode = {
  id: string;
  label: string;
  type: DesignNode["type"];
  sectionType?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  fontSize?: number;
  fontWeight?: string;
  fontFamily?: string;
  opacity?: number;
  cornerRadius?: number;
  layout?: "horizontal" | "vertical" | "none";
  gap?: number;
  padding?: number;
  content?: string;
  field?: string; // Field path for content editing
};

export type NodeRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

// Section type to human-readable label
const SECTION_LABELS: Record<string, string> = {
  hero: "Hero Section",
  services: "Services",
  story: "About / Story",
  testimonials: "Testimonials",
  faq: "FAQ",
  contact: "Contact",
  footer: "Footer",
  navigation: "Navigation",
  "page-header": "Page Header",
  "page-cta": "Call to Action",
  events: "Events",
  providers: "Team / Providers",
  products: "Products",
  shop: "Shop",
};

function buildTreeFromPageConfig(pageConfig: PageConfig | null, pageName: string): DesignNode[] {
  if (!pageConfig?.sections) {
    return [{
      id: "page",
      label: `${pageName.charAt(0).toUpperCase() + pageName.slice(1)} Page`,
      type: "frame",
      children: [],
    }];
  }

  const sortedSections = [...pageConfig.sections]
    .filter(s => s.visible !== false)
    .sort((a, b) => a.order - b.order);

  const children: DesignNode[] = sortedSections.map((section) => ({
    id: section.type,
    label: SECTION_LABELS[section.type] || section.type,
    type: "section" as const,
    visible: section.visible,
    sectionType: section.type,
    children: [], // Could be expanded with field-level nodes later
  }));

  return [{
    id: "page",
    label: `${pageName.charAt(0).toUpperCase() + pageName.slice(1)} Page`,
    type: "frame",
    children,
  }];
}

export function DesignMode() {
  const { tenantId, siteUrl, previewUrl, activePage, setActiveSection, triggerRefresh, editMode, hasDraft, setHasDraft, dashboardHref } = useDashboard();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(["page"]));
  const [zoom, setZoom] = useState(100);
  const [rightTab, setRightTab] = useState<"design" | "content" | "ai">("content");
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [nodeRect, setNodeRect] = useState<NodeRect | null>(null);
  const [tree, setTree] = useState<DesignNode[]>([]);
  const [pageConfig, setPageConfig] = useState<PageConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sectionAnalytics, setSectionAnalytics] = useState<Record<string, { clicks?: number; views?: number; trend?: "up" | "down" | "flat" }>>({});
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Fetch page config
  useEffect(() => {
    async function fetchPageConfig() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/public/page-config/${tenantId}`);
        if (res.ok) {
          const config = await res.json();
          const currentPageConfig = config[activePage] || config.home;
          setPageConfig(currentPageConfig);
          setTree(buildTreeFromPageConfig(currentPageConfig, activePage));
          // Auto-expand page node
          setExpandedIds(new Set(["page"]));
        }

        // Fetch section analytics
        try {
          const analyticsRes = await fetch(dashboardHref("/api/section-analytics"), { credentials: "same-origin" });
          if (analyticsRes.ok) {
            const analytics = await analyticsRes.json();
            setSectionAnalytics(analytics);
          }
        } catch {
          // Analytics not available — skip
        }
      } catch (err) {
        console.error("Failed to fetch page config:", err);
      } finally {
        setIsLoading(false);
      }
    }

    if (tenantId) {
      fetchPageConfig();
    }
  }, [activePage, dashboardHref, tenantId]);

  // Listen for iframe messages (node selection with rect)
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "reb-node-selected") {
        const { section, field, rect, label, nodeType } = event.data;

        setSelectedId(section);
        setActiveSection(section);
        setNodeRect(rect);

        // Build selected node from message data
        setSelectedNode({
          id: section,
          label: label || SECTION_LABELS[section] || section,
          type: nodeType || "section",
          sectionType: section,
          field,
          x: rect?.left || 0,
          y: rect?.top || 0,
          width: rect?.width || 0,
          height: rect?.height || 0,
          layout: "vertical",
          gap: 16,
          padding: 24,
          opacity: 1,
        });
      }

      // Also handle legacy reb-section-clicked for backwards compat
      if (event.data?.type === "reb-section-clicked") {
        const section = event.data.section;
        setSelectedId(section);
        setActiveSection(section);

        // Find section in tree
        const node = tree[0]?.children?.find(n => n.id === section);
        if (node) {
          setSelectedNode({
            id: node.id,
            label: node.label,
            type: "section",
            sectionType: node.sectionType,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            layout: "vertical",
            gap: 16,
            padding: 24,
            opacity: 1,
          });
        }
      }
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [tree, setActiveSection]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);

    // Find node in tree
    const find = (nodes: DesignNode[]): DesignNode | null => {
      for (const n of nodes) {
        if (n.id === id) return n;
        if (n.children) {
          const found = find(n.children);
          if (found) return found;
        }
      }
      return null;
    };

    const node = find(tree);
    if (node) {
      setActiveSection(node.sectionType || null);
      setSelectedNode({
        id: node.id,
        label: node.label,
        type: node.type,
        sectionType: node.sectionType,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        layout: node.children ? "vertical" : "none",
        gap: node.children ? 16 : 0,
        padding: node.type === "section" ? 24 : 0,
        opacity: 1,
      });

      // Request rect from iframe
      if (iframeRef.current?.contentWindow && node.sectionType) {
        iframeRef.current.contentWindow.postMessage({
          type: "reb-request-rect",
          section: node.sectionType,
        }, "*");
      }
    }
  }, [tree, setActiveSection]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleVisibility = useCallback(async (id: string) => {
    if (!pageConfig) return;

    // Find section and toggle visibility
    const updatedSections = pageConfig.sections.map(s =>
      s.type === id ? { ...s, visible: !s.visible } : s
    );

    try {
      await fetch(`/api/v1/page-config/${tenantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [activePage]: { ...pageConfig, sections: updatedSections }
        }),
      });

      // Update local state
      setPageConfig({ ...pageConfig, sections: updatedSections });
      setTree(buildTreeFromPageConfig({ ...pageConfig, sections: updatedSections }, activePage));
      triggerRefresh();
    } catch (err) {
      console.error("Failed to toggle visibility:", err);
    }
  }, [pageConfig, tenantId, activePage, triggerRefresh]);

  const handleReorder = useCallback(async (id: string, direction: 'up' | 'down') => {
    if (!pageConfig) return;

    const sections = [...pageConfig.sections].sort((a, b) => a.order - b.order);
    const idx = sections.findIndex(s => s.type === id);
    if (idx === -1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) return;

    // Swap orders
    const currentOrder = sections[idx].order;
    const swapOrder = sections[swapIdx].order;
    const updatedSections = pageConfig.sections.map(s => {
      if (s.type === id) return { ...s, order: swapOrder };
      if (s.type === sections[swapIdx].type) return { ...s, order: currentOrder };
      return s;
    });

    try {
      await fetch(`/api/v1/page-config/${tenantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [activePage]: { ...pageConfig, sections: updatedSections }
        }),
      });

      setPageConfig({ ...pageConfig, sections: updatedSections });
      setTree(buildTreeFromPageConfig({ ...pageConfig, sections: updatedSections }, activePage));
      triggerRefresh();
    } catch (err) {
      console.error("Failed to reorder:", err);
    }
  }, [pageConfig, tenantId, activePage, triggerRefresh]);

  // Handle layout updates from properties panel
  const handleLayoutUpdate = useCallback(async (sectionType: string, layout: NonNullable<PageSectionConfig['layout']>) => {
    if (!pageConfig) return;

    const updatedSections = pageConfig.sections.map(s =>
      s.type === sectionType ? { ...s, layout } : s
    );

    try {
      await fetch(`/api/v1/page-config/${tenantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [activePage]: { ...pageConfig, sections: updatedSections }
        }),
      });

      setPageConfig({ ...pageConfig, sections: updatedSections });
      triggerRefresh();
    } catch (err) {
      console.error("Failed to update layout:", err);
    }
  }, [pageConfig, tenantId, activePage, triggerRefresh]);

  // Get current section layout
  const currentSectionLayout = pageConfig?.sections.find(s => s.type === selectedNode?.sectionType)?.layout;

  // Handle content updates from properties panel
  const handleContentUpdate = useCallback(async (section: string, field: string, value: string) => {
    try {
      const isDraft = editMode === "draft";

      // Fetch current content
      const res = await fetch(dashboardHref(`/api/content/${section}`), {
        headers: { "X-Tenant": tenantId },
      });
      if (!res.ok) throw new Error("Failed to fetch content");
      const current = await res.json();

      // Update the field (handle nested paths like "services[0].name")
      const updated = { ...current };
      const parts = field.replace(/\[(\d+)\]/g, ".$1").split(".");
      let obj = updated;
      for (let i = 0; i < parts.length - 1; i++) {
        obj = obj[parts[i]];
      }
      obj[parts[parts.length - 1]] = value;

      // Save
      await fetch(dashboardHref(`/api/content/${section}${isDraft ? "?draft=true" : ""}`), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant": tenantId,
        },
        body: JSON.stringify(updated),
      });

      if (isDraft) {
        setHasDraft(prev => ({ ...prev, [section]: true }));
      } else {
        triggerRefresh();
      }
    } catch (err) {
      console.error("Failed to update content:", err);
    }
  }, [dashboardHref, tenantId, editMode, setHasDraft, triggerRefresh]);

  // Check if any section has a draft
  const hasAnyDraft = Object.values(hasDraft).some(Boolean);

  // Publish all drafts
  const handlePublishAll = useCallback(async () => {
    const sectionsWithDrafts = Object.entries(hasDraft)
      .filter(([, has]) => has)
      .map(([section]) => section);

    for (const section of sectionsWithDrafts) {
      try {
        // Fetch draft content
        const res = await fetch(dashboardHref(`/api/content/${section}?draft=true`), {
          headers: { "X-Tenant": tenantId },
        });
        if (!res.ok) continue;
        const draftData = await res.json();

        // Publish it (write without draft flag)
        await fetch(dashboardHref(`/api/content/${section}`), {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "X-Tenant": tenantId,
          },
          body: JSON.stringify(draftData),
        });
      } catch (err) {
        console.error(`Failed to publish ${section}:`, err);
      }
    }

    // Clear all draft flags
    setHasDraft({});
    triggerRefresh();
  }, [dashboardHref, hasDraft, tenantId, setHasDraft, triggerRefresh]);

  return (
    <div className="flex flex-col h-full bg-surface-base">
      {/* Top bar with page selector */}
      <div className="h-11 border-b border-gray-border flex items-center justify-between px-4 shrink-0 bg-surface">
        <div className="flex items-center gap-3">
          <span className="text-[11px] font-medium uppercase tracking-wide text-gray-muted">
            Page
          </span>
          <PageSelector />
        </div>
        <div className="flex items-center gap-2 text-[11px] text-gray-faint">
          {editMode === "draft" && (
            <span className="px-2 py-0.5 rounded bg-amber-400/10 text-amber-400 font-medium">
              Draft mode
            </span>
          )}
        </div>
      </div>

      {/* Main workspace */}
      <div className="flex flex-1 min-h-0">
        <LayersPanel
          tree={tree}
          selectedId={selectedId}
          expandedIds={expandedIds}
          onSelect={handleSelect}
          onToggleExpand={toggleExpand}
          onToggleVisibility={toggleVisibility}
          onReorder={handleReorder}
          isLoading={isLoading}
        />
        <DesignCanvas
          siteUrl={previewUrl || siteUrl}
          zoom={zoom}
          onZoomChange={setZoom}
          selectedId={selectedId}
          nodeRect={nodeRect}
          iframeRef={iframeRef}
        />
        <DesignPropertiesPanel
          selectedNode={selectedNode}
          activeTab={rightTab}
          onTabChange={setRightTab}
          onContentUpdate={handleContentUpdate}
          onLayoutUpdate={handleLayoutUpdate}
          sectionLayout={currentSectionLayout}
          editMode={editMode}
          hasDraft={hasDraft[selectedNode?.sectionType || ""] || false}
          sectionAnalytics={sectionAnalytics}
        />
      </div>

      {/* Publish bar */}
      <PublishBar
        hasDrafts={hasAnyDraft}
        onPublish={handlePublishAll}
      />
    </div>
  );
}
