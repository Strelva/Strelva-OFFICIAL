"use client";

import {
  ChevronRight,
  Eye,
  EyeOff,
  Type,
  Image,
  Square,
  MousePointerClick,
  TextCursorInput,
  Layers,
  Star,
} from "lucide-react";
import type { DesignNode } from "../DesignMode";

interface LayersPanelProps {
  tree: DesignNode[];
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  isLoading?: boolean;
}

const TYPE_ICONS: Record<DesignNode["type"], typeof Square> = {
  frame: Square,
  text: Type,
  image: Image,
  section: Layers,
  button: MousePointerClick,
  input: TextCursorInput,
  icon: Star,
};

export function LayersPanel({
  tree,
  selectedId,
  expandedIds,
  onSelect,
  onToggleExpand,
  onToggleVisibility,
  isLoading,
}: LayersPanelProps) {
  return (
    <aside className="w-[240px] shrink-0 border-r border-gray-border flex flex-col bg-surface">
      <div className="h-10 border-b border-gray-border flex items-center px-3 shrink-0">
        <span className="text-[12px] font-medium text-gray-muted tracking-wide uppercase">
          Layers
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <span className="text-[11px] text-gray-faint">Loading...</span>
          </div>
        ) : tree.length === 0 ? (
          <div className="flex items-center justify-center h-24">
            <span className="text-[11px] text-gray-faint">No sections found</span>
          </div>
        ) : (
          tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onToggleVisibility={onToggleVisibility}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function TreeNode({
  node,
  depth,
  selectedId,
  expandedIds,
  onSelect,
  onToggleExpand,
  onToggleVisibility,
}: {
  node: DesignNode;
  depth: number;
  selectedId: string | null;
  expandedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onToggleVisibility: (id: string) => void;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedId === node.id;
  const Icon = TYPE_ICONS[node.type] || Square;

  return (
    <>
      <div
        className={`group flex items-center h-[30px] px-2 cursor-pointer transition-colors ${
          isSelected
            ? "bg-accent/15 text-accent"
            : "text-gray-muted hover:bg-gray-bg"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggleExpand(node.id);
          }}
          className="w-4 h-4 flex items-center justify-center shrink-0"
        >
          {hasChildren && (
            <ChevronRight
              className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              strokeWidth={1.5}
            />
          )}
        </button>
        <Icon className="w-3.5 h-3.5 mx-1.5 shrink-0 text-gray-faint" strokeWidth={1.5} />
        <span className="text-[12px] truncate flex-1">{node.label}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility(node.id);
          }}
          className="w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        >
          {node.visible === false ? (
            <EyeOff className="w-3 h-3 text-gray-faint" strokeWidth={1.5} />
          ) : (
            <Eye className="w-3 h-3 text-gray-faint" strokeWidth={1.5} />
          )}
        </button>
      </div>
      {hasChildren && isExpanded && (
        <>
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={onSelect}
              onToggleExpand={onToggleExpand}
              onToggleVisibility={onToggleVisibility}
            />
          ))}
        </>
      )}
    </>
  );
}
