"use client";

import { useState, useRef, useEffect } from "react";
import { Plus } from "lucide-react";
import { ARRAY_CONFIGS } from "./arrayFieldConfigs";
import { ArrayItemCard } from "./ArrayItemCard";

interface ArrayItemEditorProps {
  section: string;
  data: Record<string, unknown>;
  onDataChange: (updated: Record<string, unknown>) => void;
}

export function ArrayItemEditor({ section, data, onDataChange }: ArrayItemEditorProps) {
  const config = ARRAY_CONFIGS[section];
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [justAdded, setJustAdded] = useState(false);

  // Scroll to bottom when a new item is added
  useEffect(() => {
    if (justAdded && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
      setJustAdded(false);
    }
  }, [justAdded]);

  if (!config) return null;

  const items = (data[config.arrayKey] as Record<string, unknown>[]) || [];

  function updateItems(newItems: Record<string, unknown>[]) {
    onDataChange({ ...data, [config.arrayKey]: newItems });
  }

  function handleFieldChange(index: number, key: string, value: unknown) {
    const updated = items.map((item, i) =>
      i === index ? { ...item, [key]: value } : item
    );
    updateItems(updated);
  }

  function handleDelete(index: number) {
    const updated = items.filter((_, i) => i !== index);
    updateItems(updated);
    if (expandedIndex === index) setExpandedIndex(null);
    else if (expandedIndex !== null && expandedIndex > index) {
      setExpandedIndex(expandedIndex - 1);
    }
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    const updated = [...items];
    [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
    updateItems(updated);
    if (expandedIndex === index) setExpandedIndex(index - 1);
    else if (expandedIndex === index - 1) setExpandedIndex(index);
  }

  function handleMoveDown(index: number) {
    if (index === items.length - 1) return;
    const updated = [...items];
    [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
    updateItems(updated);
    if (expandedIndex === index) setExpandedIndex(index + 1);
    else if (expandedIndex === index + 1) setExpandedIndex(index);
  }

  function handleAdd() {
    const newItem = config.defaultItem();
    const updated = [...items, newItem];
    updateItems(updated);
    setExpandedIndex(updated.length - 1);
    setJustAdded(true);
  }

  return (
    <div className="px-4 pt-2 pb-4">
      {/* Divider with count */}
      <div className="flex items-center gap-2 mb-2">
        <div className="h-px flex-1 bg-[#e8e8e8]" />
        <span className="text-[10px] text-[#bbb] shrink-0">
          {items.length} {items.length === 1 ? "item" : "items"}
        </span>
      </div>

      <div className="space-y-1">
        {items.map((item, i) => (
          <ArrayItemCard
            key={(item.id as string) || i}
            item={item}
            index={i}
            total={items.length}
            config={config}
            isExpanded={expandedIndex === i}
            onToggleExpand={() => setExpandedIndex(expandedIndex === i ? null : i)}
            onChange={(key, val) => handleFieldChange(i, key, val)}
            onDelete={() => handleDelete(i)}
            onMoveUp={() => handleMoveUp(i)}
            onMoveDown={() => handleMoveDown(i)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="mt-2 w-full flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-[11px] text-[#7c9a8e] font-medium hover:bg-[#7c9a8e]/[0.06] transition-colors duration-150"
      >
        <Plus className="w-3 h-3" strokeWidth={2} />
        {config.addLabel}
      </button>

      <div ref={bottomRef} />
    </div>
  );
}
