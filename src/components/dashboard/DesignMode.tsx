"use client";

import { useState, useCallback } from "react";
import { useDashboard } from "./DashboardContext";
import { LayersPanel } from "./design/LayersPanel";
import { DesignCanvas } from "./design/DesignCanvas";
import { DesignPropertiesPanel } from "./design/DesignPropertiesPanel";

export type DesignNode = {
  id: string;
  label: string;
  type: "frame" | "text" | "image" | "section" | "button" | "input" | "icon";
  children?: DesignNode[];
  visible?: boolean;
  locked?: boolean;
};

export type SelectedNode = {
  id: string;
  label: string;
  type: DesignNode["type"];
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
};

const MOCK_TREE: DesignNode[] = [
  {
    id: "page",
    label: "Home Page",
    type: "frame",
    children: [
      {
        id: "hero",
        label: "Hero Section",
        type: "section",
        children: [
          { id: "hero-heading", label: "Heading", type: "text" },
          { id: "hero-subtext", label: "Subtext", type: "text" },
          { id: "hero-cta", label: "Book Now Button", type: "button" },
          { id: "hero-image", label: "Hero Image", type: "image" },
        ],
      },
      {
        id: "services",
        label: "Services Section",
        type: "section",
        children: [
          { id: "services-heading", label: "Section Title", type: "text" },
          {
            id: "services-grid",
            label: "Services Grid",
            type: "frame",
            children: [
              { id: "service-1", label: "Service One", type: "frame" },
              { id: "service-2", label: "Service Two", type: "frame" },
              { id: "service-3", label: "Service Three", type: "frame" },
            ],
          },
        ],
      },
      {
        id: "about",
        label: "About Section",
        type: "section",
        children: [
          { id: "about-image", label: "Portrait", type: "image" },
          { id: "about-text", label: "Bio Text", type: "text" },
        ],
      },
      {
        id: "contact",
        label: "Contact Section",
        type: "section",
        children: [
          { id: "contact-heading", label: "Get in Touch", type: "text" },
          { id: "contact-form", label: "Contact Form", type: "frame" },
        ],
      },
      {
        id: "footer",
        label: "Footer",
        type: "section",
        children: [
          { id: "footer-links", label: "Links", type: "frame" },
          { id: "footer-copyright", label: "Copyright", type: "text" },
        ],
      },
    ],
  },
];

export function DesignMode() {
  const { siteUrl } = useDashboard();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(
    new Set(["page", "hero", "services", "about"])
  );
  const [zoom, setZoom] = useState(100);
  const [rightTab, setRightTab] = useState<"design" | "content" | "ai">("design");

  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
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
    const node = find(MOCK_TREE);
    if (node) {
      setSelectedNode({
        id: node.id,
        label: node.label,
        type: node.type,
        x: 0,
        y: 0,
        width: 360,
        height: node.type === "text" ? 48 : 200,
        fill: node.type === "section" ? "#171717" : undefined,
        fontSize: node.type === "text" ? 16 : undefined,
        fontWeight: node.id.includes("heading") ? "600" : "400",
        opacity: 1,
        cornerRadius: 0,
        layout: node.children ? "vertical" : "none",
        gap: node.children ? 16 : 0,
        padding: node.type === "section" ? 24 : 0,
        content: node.type === "text" ? node.label : undefined,
      });
    }
  }, []);

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    console.log("Toggle visibility:", id);
  }, []);

  return (
    <div className="flex h-full bg-surface-base">
      <LayersPanel
        tree={MOCK_TREE}
        selectedId={selectedId}
        expandedIds={expandedIds}
        onSelect={handleSelect}
        onToggleExpand={toggleExpand}
        onToggleVisibility={toggleVisibility}
      />
      <DesignCanvas
        siteUrl={siteUrl}
        zoom={zoom}
        onZoomChange={setZoom}
        selectedId={selectedId}
      />
      <DesignPropertiesPanel
        selectedNode={selectedNode}
        activeTab={rightTab}
        onTabChange={setRightTab}
      />
    </div>
  );
}
