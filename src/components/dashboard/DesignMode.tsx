"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDashboard } from "./DashboardContext";
import { LayersPanel } from "./design/LayersPanel";
import { DesignCanvas } from "./design/DesignCanvas";
import { DesignPropertiesPanel } from "./design/DesignPropertiesPanel";
import type { PageConfig } from "@/lib/types";

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
  const { siteUrl, activePage, setActiveSection, triggerRefresh, editMode, hasDraft, setHasDraft } = useDashboard();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set(["page"]));
  const [zoom, setZoom] = useState(100);
  const [rightTab, setRightTab] = useState<"design" | "content" | "ai">("content");
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [nodeRect, setNodeRect] = useState<NodeRect | null>(null);
  const [tree, setTree] = useState<DesignNode[]>([]);
  const [pageConfig, setPageConfig] = useState<PageConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Fetch page config
  useEffect(() => {
    async function fetchPageConfig() {
      setIsLoading(true);
      try {
        // Extract tenant from siteUrl (e.g., "https://gldf.scaffoldweb.com" -> "gldf")
        const url = new URL(siteUrl || window.location.origin);
        const tenant = url.hostname.split(".")[0];

        const res = await fetch(`/api/public/page-config/${tenant}`);
        if (res.ok) {
          const config = await res.json();
          const currentPageConfig = config[activePage] || config.home;
          setPageConfig(currentPageConfig);
          setTree(buildTreeFromPageConfig(currentPageConfig, activePage));
          // Auto-expand page node
          setExpandedIds(new Set(["page"]));
        }
      } catch (err) {
        console.error("Failed to fetch page config:", err);
      } finally {
        setIsLoading(false);
      }
    }

    if (siteUrl) {
      fetchPageConfig();
    }
  }, [siteUrl, activePage]);

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
      const url = new URL(siteUrl || window.location.origin);
      const tenant = url.hostname.split(".")[0];

      await fetch(`/api/v1/page-config/${tenant}`, {
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
  }, [pageConfig, siteUrl, activePage, triggerRefresh]);

  // Handle content updates from properties panel
  const handleContentUpdate = useCallback(async (section: string, field: string, value: string) => {
    try {
      const url = new URL(siteUrl || window.location.origin);
      const tenant = url.hostname.split(".")[0];
      const isDraft = editMode === "draft";

      // Fetch current content
      const res = await fetch(`/api/content/${section}`, {
        headers: { "X-Tenant": tenant },
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
      await fetch(`/api/content/${section}${isDraft ? "?draft=true" : ""}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-Tenant": tenant,
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
  }, [siteUrl, editMode, setHasDraft, triggerRefresh]);

  return (
    <div className="flex h-full bg-surface-base">
      <LayersPanel
        tree={tree}
        selectedId={selectedId}
        expandedIds={expandedIds}
        onSelect={handleSelect}
        onToggleExpand={toggleExpand}
        onToggleVisibility={toggleVisibility}
        isLoading={isLoading}
      />
      <DesignCanvas
        siteUrl={siteUrl}
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
        editMode={editMode}
        hasDraft={hasDraft[selectedNode?.sectionType || ""] || false}
      />
    </div>
  );
}
