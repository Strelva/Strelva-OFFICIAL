"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ChevronUp, ChevronDown as MoveDown, Trash2 } from "lucide-react";
import type { ArrayFieldDef, ArraySectionConfig } from "./arrayFieldConfigs";

interface ArrayItemCardProps {
  item: Record<string, unknown>;
  index: number;
  total: number;
  config: ArraySectionConfig;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onChange: (key: string, value: unknown) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const INPUT_CLASS =
  "w-full bg-[#fafafa] border border-[#e8e8e8] rounded-md px-3 py-2 text-[12px] text-[#1a1a1a] placeholder-[#ccc] outline-none focus:border-[#7c9a8e] focus:ring-1 focus:ring-[#7c9a8e]/20 transition-all duration-150";

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ArrayFieldDef;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  if (field.type === "toggle") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={!!value}
        onClick={() => onChange(!value)}
        className={`relative w-9 h-5 rounded-full transition-colors duration-150 ${
          value ? "bg-[#7c9a8e]" : "bg-[#e8e8e8]"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${
            value ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <select
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLASS + " appearance-none"}
      >
        {field.options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        rows={3}
        className={INPUT_CLASS + " resize-none"}
      />
    );
  }

  return (
    <input
      type={field.type === "date" ? "date" : field.type === "url" ? "url" : field.type === "tel" ? "tel" : "text"}
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className={INPUT_CLASS}
    />
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "..." : s;
}

export function ArrayItemCard({
  item,
  index,
  total,
  config,
  isExpanded,
  onToggleExpand,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
}: ArrayItemCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  const name = (item[config.nameKey] as string) || "(untitled)";
  const detail = (item[config.detailKey] as string) || "";

  return (
    <div className="border border-[#e8e8e8] rounded-lg overflow-hidden bg-white">
      {/* Collapsed row */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[#fafafa] transition-colors duration-150 text-left"
      >
        <span className="text-[10px] font-mono text-[#ccc] w-4 shrink-0 text-center">
          {index + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-[#1a1a1a] truncate font-medium">{name}</p>
          {detail && (
            <p className="text-[10px] text-[#999] truncate">{truncate(detail, 50)}</p>
          )}
        </div>
        {isExpanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-[#999] shrink-0" strokeWidth={1.5} />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-[#999] shrink-0" strokeWidth={1.5} />
        )}
      </button>

      {/* Expanded fields */}
      {isExpanded && (
        <div className="border-t border-[#e8e8e8] animate-fade-in-up">
          <div className="p-3 space-y-3">
            {config.fields.map((field) => (
              <div key={field.key}>
                <label className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[#999]">
                    {field.label}
                    {field.required && <span className="text-[#b5634b] ml-0.5">*</span>}
                  </span>
                </label>
                <FieldInput
                  field={field}
                  value={item[field.key]}
                  onChange={(val) => onChange(field.key, val)}
                />
              </div>
            ))}
          </div>

          {/* Card actions */}
          <div className="flex items-center justify-between px-3 py-2 border-t border-[#f5f5f5] bg-[#fafafa]">
            {/* Reorder */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                disabled={index === 0}
                className="p-1 rounded text-[#999] hover:text-[#1a1a1a] hover:bg-[#e8e8e8] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#999] transition-colors duration-150"
                title="Move up"
              >
                <ChevronUp className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                disabled={index === total - 1}
                className="p-1 rounded text-[#999] hover:text-[#1a1a1a] hover:bg-[#e8e8e8] disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#999] transition-colors duration-150"
                title="Move down"
              >
                <MoveDown className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>

            {/* Delete */}
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#b5634b]">Delete?</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="text-[10px] font-medium text-[#b5634b] hover:text-[#943a24] transition-colors"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                  className="text-[10px] text-[#999] hover:text-[#1a1a1a] transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                className="p-1 rounded text-[#999] hover:text-[#b5634b] hover:bg-red-500/[0.06] transition-colors duration-150"
                title="Delete item"
              >
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
