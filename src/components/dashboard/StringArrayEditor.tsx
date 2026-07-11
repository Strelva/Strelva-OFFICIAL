"use client";

import { ChevronUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { TextArea, TextInput } from "@/components/ui/TextInput";
import { IconButton } from "@/components/ui/Button";

interface StringArrayEditorProps {
  config: {
    kind: "strings";
    arrayKey: string;
    label: string;
    addLabel: string;
    placeholder?: string;
    multiline?: boolean;
  };
  data: Record<string, unknown>;
  onDataChange: (updated: Record<string, unknown>) => void;
}

/**
 * Repeatable editor for string[] fields (e.g. story.paragraphs).
 * Each row is one string. No expand/collapse — everything's visible.
 */
export function StringArrayEditor({ config, data, onDataChange }: StringArrayEditorProps) {
  const items = (data[config.arrayKey] as string[]) || [];

  function updateItems(next: string[]) {
    onDataChange({ ...data, [config.arrayKey]: next });
  }

  function handleChange(index: number, value: string) {
    const next = items.map((s, i) => (i === index ? value : s));
    updateItems(next);
  }

  function handleAdd() {
    updateItems([...items, ""]);
  }

  function handleDelete(index: number) {
    updateItems(items.filter((_, i) => i !== index));
  }

  function handleMoveUp(index: number) {
    if (index === 0) return;
    const next = [...items];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    updateItems(next);
  }

  function handleMoveDown(index: number) {
    if (index === items.length - 1) return;
    const next = [...items];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    updateItems(next);
  }

  return (
    <div className="px-4 pt-2 pb-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="h-px flex-1 bg-gray-border" />
        <span className="text-[11px] text-gray-faint shrink-0">
          {config.label}: {items.length}
        </span>
      </div>

      <div className="space-y-2">
        {items.map((value, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <div className="flex-1 min-w-0">
              {config.multiline ? (
                <TextArea
                  value={value}
                  onChange={(e) => handleChange(i, e.target.value)}
                  placeholder={config.placeholder}
                  rows={3}
                />
              ) : (
                <TextInput
                  value={value}
                  onChange={(e) => handleChange(i, e.target.value)}
                  placeholder={config.placeholder}
                />
              )}
            </div>
            <div className="flex flex-col items-center gap-0.5 pt-1">
              <IconButton
                label="Move up"
                size="sm"
                variant="ghost"
                disabled={i === 0}
                onClick={() => handleMoveUp(i)}
                className="disabled:opacity-0"
              >
                <ChevronUp className="w-3 h-3" strokeWidth={2} />
              </IconButton>
              <IconButton
                label="Move down"
                size="sm"
                variant="ghost"
                disabled={i === items.length - 1}
                onClick={() => handleMoveDown(i)}
                className="disabled:opacity-0"
              >
                <ChevronDown className="w-3 h-3" strokeWidth={2} />
              </IconButton>
              <IconButton
                label="Remove"
                size="sm"
                variant="danger"
                onClick={() => handleDelete(i)}
              >
                <Trash2 className="w-3 h-3" strokeWidth={1.5} />
              </IconButton>
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="mt-2 w-full flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-[11px] text-sage font-medium hover:bg-sage/[0.06] transition-colors duration-150"
      >
        <Plus className="w-3 h-3" strokeWidth={2} />
        {config.addLabel}
      </button>
    </div>
  );
}
