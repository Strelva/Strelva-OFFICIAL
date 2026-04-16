"use client";

import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
} from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import type { SelectedNode } from "../DesignMode";

interface DesignPropertiesPanelProps {
  selectedNode: SelectedNode | null;
  activeTab: "design" | "content" | "ai";
  onTabChange: (tab: "design" | "content" | "ai") => void;
}

export function DesignPropertiesPanel({
  selectedNode,
  activeTab,
  onTabChange,
}: DesignPropertiesPanelProps) {
  return (
    <aside className="w-[280px] shrink-0 border-l border-gray-border flex flex-col bg-surface">
      <div className="h-10 border-b border-gray-border shrink-0 flex items-center">
        <Tabs
          variant="underline"
          items={[
            { value: "design", label: "Design" },
            { value: "content", label: "Content" },
            { value: "ai", label: "AI" },
          ]}
          value={activeTab}
          onChange={(v) => onTabChange(v as "design" | "content" | "ai")}
          className="h-full"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {!selectedNode ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-[12px] text-gray-faint">Select a layer to edit</p>
          </div>
        ) : activeTab === "design" ? (
          <DesignTab node={selectedNode} />
        ) : activeTab === "content" ? (
          <ContentTab node={selectedNode} />
        ) : (
          <AITab node={selectedNode} />
        )}
      </div>
    </aside>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-2 border-b border-gray-border">
      <span className="text-[10px] font-medium text-gray-faint uppercase tracking-wider">
        {children}
      </span>
    </div>
  );
}

function PropertyRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-1.5">
      <span className="text-[11px] text-gray-muted">{label}</span>
      <div className="flex items-center gap-1.5">{children}</div>
    </div>
  );
}

function NumberInput({
  value,
  unit,
  width = 56,
}: {
  value: number;
  unit?: string;
  width?: number;
}) {
  return (
    <div
      className="flex items-center bg-surface-base border border-gray-border rounded-md px-2 h-[26px]"
      style={{ width }}
    >
      <input
        type="text"
        value={value}
        readOnly
        className="w-full bg-transparent text-[11px] text-warm-black text-right outline-none tabular-nums"
      />
      {unit && (
        <span className="text-[10px] text-gray-faint ml-0.5">{unit}</span>
      )}
    </div>
  );
}

function ColorSwatch({ color }: { color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div
        className="w-5 h-5 rounded-md border border-gray-border"
        style={{ backgroundColor: color }}
      />
      <span className="text-[11px] text-gray-muted font-mono">{color}</span>
    </div>
  );
}

function DesignTab({ node }: { node: SelectedNode }) {
  return (
    <div className="py-2">
      <SectionLabel>Layout</SectionLabel>
      <div className="px-4 py-3 space-y-2.5">
        <div className="flex items-center gap-1">
          {(["horizontal", "vertical", "none"] as const).map((dir) => (
            <button
              key={dir}
              className={`flex-1 h-[28px] rounded-md text-[10px] font-medium transition-colors ${
                node.layout === dir
                  ? "bg-accent/15 text-accent border border-accent/30"
                  : "bg-surface-base text-gray-muted border border-gray-border hover:border-gray-muted"
              }`}
            >
              {dir === "none" ? "Abs" : dir === "horizontal" ? "Row" : "Col"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {[AlignStartVertical, AlignCenterVertical, AlignEndVertical].map(
            (Icon, i) => (
              <button
                key={i}
                className="w-7 h-7 rounded-md flex items-center justify-center text-gray-faint hover:text-gray-muted hover:bg-surface-base border border-transparent hover:border-gray-border transition-colors"
              >
                <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            )
          )}
          <div className="w-px h-4 bg-gray-border mx-1" />
          {[AlignLeft, AlignCenter, AlignRight].map((Icon, i) => (
            <button
              key={i}
              className="w-7 h-7 rounded-md flex items-center justify-center text-gray-faint hover:text-gray-muted hover:bg-surface-base border border-transparent hover:border-gray-border transition-colors"
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
          ))}
        </div>
      </div>

      <SectionLabel>Size</SectionLabel>
      <div className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <span className="text-[10px] text-gray-faint mb-1 block">W</span>
            <NumberInput value={node.width} unit="px" width={80} />
          </div>
          <div className="flex-1">
            <span className="text-[10px] text-gray-faint mb-1 block">H</span>
            <NumberInput value={node.height} unit="px" width={80} />
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <div className="flex-1">
            <span className="text-[10px] text-gray-faint mb-1 block">X</span>
            <NumberInput value={node.x} width={80} />
          </div>
          <div className="flex-1">
            <span className="text-[10px] text-gray-faint mb-1 block">Y</span>
            <NumberInput value={node.y} width={80} />
          </div>
        </div>
      </div>

      <SectionLabel>Fill</SectionLabel>
      <div className="px-4 py-3">
        <ColorSwatch color={node.fill || "#transparent"} />
      </div>

      {node.layout !== "none" && (
        <>
          <SectionLabel>Spacing</SectionLabel>
          <div className="px-4 py-3 space-y-1.5">
            <PropertyRow label="Gap">
              <NumberInput value={node.gap || 0} unit="px" />
            </PropertyRow>
            <PropertyRow label="Padding">
              <NumberInput value={node.padding || 0} unit="px" />
            </PropertyRow>
          </div>
        </>
      )}

      <SectionLabel>Corner Radius</SectionLabel>
      <div className="px-4 py-3">
        <PropertyRow label="Radius">
          <NumberInput value={node.cornerRadius || 0} unit="px" />
        </PropertyRow>
      </div>

      <SectionLabel>Opacity</SectionLabel>
      <div className="px-4 py-3">
        <PropertyRow label="Opacity">
          <NumberInput value={(node.opacity ?? 1) * 100} unit="%" />
        </PropertyRow>
      </div>

      {node.type === "text" && (
        <>
          <SectionLabel>Typography</SectionLabel>
          <div className="px-4 py-3 space-y-1.5">
            <PropertyRow label="Font">
              <span className="text-[11px] text-gray-muted">
                {node.fontFamily || "Inter"}
              </span>
            </PropertyRow>
            <PropertyRow label="Size">
              <NumberInput value={node.fontSize || 16} unit="px" />
            </PropertyRow>
            <PropertyRow label="Weight">
              <span className="text-[11px] text-gray-muted">
                {node.fontWeight || "400"}
              </span>
            </PropertyRow>
          </div>
        </>
      )}
    </div>
  );
}

function ContentTab({ node }: { node: SelectedNode }) {
  return (
    <div className="py-2">
      <SectionLabel>Content</SectionLabel>
      <div className="px-4 py-3">
        {node.type === "text" || node.type === "button" ? (
          <div>
            <span className="text-[10px] text-gray-faint mb-1.5 block">
              Text
            </span>
            <textarea
              value={node.content || node.label}
              readOnly
              rows={3}
              className="w-full bg-surface-base border border-gray-border rounded-lg px-3 py-2 text-[12px] text-warm-black outline-none resize-none focus:border-accent/50 transition-colors"
            />
          </div>
        ) : node.type === "image" ? (
          <div>
            <span className="text-[10px] text-gray-faint mb-1.5 block">
              Image
            </span>
            <div className="w-full h-24 bg-surface-base border border-gray-border rounded-lg flex items-center justify-center">
              <span className="text-[11px] text-gray-faint">
                Click to replace image
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-gray-faint">
            Select a text or image layer to edit content.
          </p>
        )}
      </div>

      {node.type === "button" && (
        <>
          <SectionLabel>Link</SectionLabel>
          <div className="px-4 py-3">
            <input
              type="text"
              placeholder="https://"
              readOnly
              className="w-full bg-surface-base border border-gray-border rounded-md px-3 py-1.5 text-[11px] text-warm-black outline-none"
            />
          </div>
        </>
      )}
    </div>
  );
}

function AITab({ node }: { node: SelectedNode }) {
  return (
    <div className="py-2">
      <SectionLabel>AI Edit</SectionLabel>
      <div className="px-4 py-3">
        <p className="text-[11px] text-gray-muted mb-3">
          Describe changes for{" "}
          <span className="text-accent font-medium">{node.label}</span>
        </p>
        <textarea
          placeholder={`e.g. "Make the heading larger and more bold" or "Change the background to a gradient"`}
          rows={4}
          className="w-full bg-surface-base border border-gray-border rounded-lg px-3 py-2 text-[12px] text-warm-black outline-none resize-none placeholder:text-gray-faint focus:border-accent/50 transition-colors"
        />
        <button className="mt-2 w-full h-[32px] rounded-lg bg-accent text-white text-[12px] font-medium hover:bg-accent/80 transition-colors">
          Apply with AI
        </button>
      </div>

      <SectionLabel>Quick Actions</SectionLabel>
      <div className="px-4 py-3 flex flex-wrap gap-1.5">
        {[
          "Rewrite copy",
          "Add animation",
          "Change style",
          "Generate image",
          "Improve layout",
        ].map((action) => (
          <button
            key={action}
            className="px-2.5 py-1 rounded-md bg-surface-base border border-gray-border text-[10px] text-gray-muted hover:text-warm-black hover:border-gray-muted transition-colors"
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}
