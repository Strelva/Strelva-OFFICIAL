"use client";

import { useState, useRef } from "react";
import { ChevronDown, ChevronUp, Trash2, Upload, X, GripVertical } from "lucide-react";
import Image from "next/image";
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
  "w-full bg-white border border-[#e8e8e8] rounded-md px-3 py-1.5 text-[13px] text-[#1a1a1a] placeholder-[#ccc] outline-none focus:border-[#7c9a8e] focus:ring-1 focus:ring-[#7c9a8e]/20 transition-all duration-150";

function ImageField({ value, onChange }: { value: unknown; onChange: (val: unknown) => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const url = value as string;

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (res.ok) {
        const { url } = await res.json();
        onChange(url);
      }
    } catch {} finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {url ? (
        <div className="relative inline-block">
          <Image src={url} alt="" width={80} height={80} className="w-16 h-16 object-cover rounded-lg border border-[#e8e8e8]" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#b5634b] text-white flex items-center justify-center hover:bg-[#943a24] transition-colors"
          >
            <X className="w-2.5 h-2.5" strokeWidth={2} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed border-[#e8e8e8] text-[11px] text-[#999] hover:border-[#7c9a8e] hover:text-[#7c9a8e] transition-colors"
        >
          <Upload className="w-3 h-3" strokeWidth={1.5} />
          {uploading ? "Uploading..." : "Upload"}
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: ArrayFieldDef;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  if (field.type === "image") {
    return <ImageField value={value} onChange={onChange} />;
  }

  if (field.type === "toggle") {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={!!value}
        onClick={() => onChange(!value)}
        className={`relative w-8 h-[18px] rounded-full transition-colors duration-150 ${
          value ? "bg-[#7c9a8e]" : "bg-[#e0e0e0]"
        }`}
      >
        <span
          className={`absolute top-[2px] left-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform duration-150 ${
            value ? "translate-x-[14px]" : "translate-x-0"
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
        rows={2}
        className={INPUT_CLASS + " resize-none leading-relaxed"}
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
    <div className={`rounded-lg overflow-hidden transition-all duration-150 ${
      isExpanded
        ? "bg-[#fafafa] ring-1 ring-[#e8e8e8]"
        : "bg-white hover:bg-[#fafafa] border border-[#f0f0f0]"
    }`}>
      {/* Header row */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="group w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-[#1a1a1a] truncate font-medium leading-tight">{name}</p>
          {detail && !isExpanded && (
            <p className="text-[10px] text-[#aaa] truncate mt-0.5 leading-tight">{truncate(detail, 60)}</p>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[#ccc] shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}
          strokeWidth={1.5}
        />
      </button>

      {/* Expanded editor */}
      {isExpanded && (
        <div className="px-3 pb-3">
          <div className="space-y-2.5">
            {config.fields.map((field) => (
              <div key={field.key}>
                {field.type === "toggle" ? (
                  <div className="flex items-center justify-between py-0.5">
                    <span className="text-[11px] text-[#666]">{field.label}</span>
                    <FieldInput field={field} value={item[field.key]} onChange={(val) => onChange(field.key, val)} />
                  </div>
                ) : (
                  <>
                    <label className="block text-[10px] text-[#999] mb-0.5">
                      {field.label}
                    </label>
                    <FieldInput
                      field={field}
                      value={item[field.key]}
                      onChange={(val) => onChange(field.key, val)}
                    />
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Actions row — compact, inline */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-[#e8e8e8]/60">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                disabled={index === 0}
                className="p-1 rounded text-[#ccc] hover:text-[#666] disabled:opacity-0 transition-all duration-150"
                title="Move up"
              >
                <ChevronUp className="w-3 h-3" strokeWidth={2} />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                disabled={index === total - 1}
                className="p-1 rounded text-[#ccc] hover:text-[#666] disabled:opacity-0 transition-all duration-150"
                title="Move down"
              >
                <ChevronDown className="w-3 h-3" strokeWidth={2} />
              </button>
            </div>

            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#b5634b]">Remove?</span>
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
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                className="p-1 rounded text-[#ccc] hover:text-[#b5634b] transition-colors duration-150"
                title="Remove"
              >
                <Trash2 className="w-3 h-3" strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
