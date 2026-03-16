"use client";

import { useState } from "react";

interface ArrayEditorProps<T> {
  items: T[];
  onChange: (items: T[]) => void;
  renderItem: (item: T, index: number, update: (item: T) => void) => React.ReactNode;
  createItem: () => T;
  label: string;
}

export function ArrayEditor<T>({
  items,
  onChange,
  renderItem,
  createItem,
  label,
}: ArrayEditorProps<T>) {
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const addItem = () => {
    onChange([...items, createItem()]);
  };

  const removeItem = (index: number) => {
    onChange(items.filter((_, i) => i !== index));
    setConfirmDelete(null);
  };

  const updateItem = (index: number, item: T) => {
    const next = [...items];
    next[index] = item;
    onChange(next);
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= items.length) return;
    const next = [...items];
    [next[index], next[newIndex]] = [next[newIndex], next[index]];
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <label className="text-sm font-medium" style={{ color: "var(--bark-light)" }}>{label}</label>
        <button
          type="button"
          onClick={addItem}
          className="px-3 py-1.5 text-sm font-semibold rounded-lg transition-colors"
          style={{ background: "var(--sage)", color: "var(--pure-white)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sage-light)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "var(--sage)"; }}
        >
          + Add
        </button>
      </div>
      <div className="space-y-4">
        {items.map((item, index) => (
          <div
            key={index}
            className="relative rounded-lg p-4"
            style={{ border: "1px solid var(--cream-dark)", background: "var(--pure-white)" }}
          >
            <div className="absolute top-2 right-2 flex items-center gap-1">
              <button
                type="button"
                onClick={() => moveItem(index, -1)}
                disabled={index === 0}
                className="p-1 disabled:opacity-30 transition-colors"
                style={{ color: "var(--bark-faded)" }}
                title="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveItem(index, 1)}
                disabled={index === items.length - 1}
                className="p-1 disabled:opacity-30 transition-colors"
                style={{ color: "var(--bark-faded)" }}
                title="Move down"
              >
                ↓
              </button>
              {confirmDelete === index ? (
                <span className="flex items-center gap-1 ml-1">
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="px-2 py-0.5 text-xs font-semibold rounded transition-colors"
                    style={{ background: "var(--terra)", color: "var(--pure-white)" }}
                  >
                    Delete
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(null)}
                    className="px-2 py-0.5 text-xs rounded transition-colors"
                    style={{ color: "var(--bark-faded)" }}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(index)}
                  className="p-1 transition-colors"
                  style={{ color: "var(--terra)" }}
                  title="Remove"
                >
                  ✕
                </button>
              )}
            </div>
            {renderItem(item, index, (updated) => updateItem(index, updated))}
          </div>
        ))}
      </div>
    </div>
  );
}
