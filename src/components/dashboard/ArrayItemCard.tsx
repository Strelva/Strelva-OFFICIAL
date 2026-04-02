"use client";

import { useState, useRef } from "react";
import { ChevronDown, ChevronUp, Trash2, Upload, X } from "lucide-react";
import Image from "next/image";
import type { ArrayFieldDef, ArraySectionConfig } from "./arrayFieldConfigs";
import { TextInput, TextArea, SelectInput } from "@/components/ui/TextInput";
import { Toggle } from "@/components/ui/Toggle";
import { Card } from "@/components/ui/Card";
import { IconButton } from "@/components/ui/Button";

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
          <Image src={url} alt="" width={80} height={80} className="w-16 h-16 object-cover rounded-lg border border-gray-border" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-terra text-white flex items-center justify-center hover:bg-[#943a24] transition-colors"
          >
            <X className="w-2.5 h-2.5" strokeWidth={2} />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed border-gray-border text-[11px] text-gray-muted hover:border-sage hover:text-sage transition-colors"
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
      <Toggle
        checked={!!value}
        onChange={(checked) => onChange(checked)}
        label={field.label}
        size="sm"
      />
    );
  }

  if (field.type === "select" && field.options) {
    return (
      <SelectInput
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        options={field.options}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <TextArea
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        rows={2}
      />
    );
  }

  return (
    <TextInput
      type={field.type === "date" ? "date" : field.type === "url" ? "url" : field.type === "tel" ? "tel" : "text"}
      value={(value as string) || ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
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
    <Card padding="none" className={`overflow-hidden transition-all duration-150 ${
      isExpanded
        ? "bg-gray-bg-alt ring-1 ring-gray-border"
        : "hover:bg-gray-bg-alt border-gray-bg-hover"
    }`}>
      {/* Header row */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="group w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-warm-black truncate font-medium leading-tight">{name}</p>
          {detail && !isExpanded && (
            <p className="text-[11px] text-gray-faint truncate mt-0.5 leading-tight">{truncate(detail, 60)}</p>
          )}
        </div>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-subtle shrink-0 transition-transform duration-150 ${isExpanded ? "rotate-180" : ""}`}
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
                    <span className="text-[11px] text-gray-fg">{field.label}</span>
                    <FieldInput field={field} value={item[field.key]} onChange={(val) => onChange(field.key, val)} />
                  </div>
                ) : (
                  <>
                    <label className="block text-[11px] text-gray-muted mb-0.5">
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
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-border/60">
            <div className="flex items-center gap-1">
              <IconButton
                label="Move up"
                size="sm"
                variant="ghost"
                disabled={index === 0}
                onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
                className="disabled:opacity-0"
              >
                <ChevronUp className="w-3 h-3" strokeWidth={2} />
              </IconButton>
              <IconButton
                label="Move down"
                size="sm"
                variant="ghost"
                disabled={index === total - 1}
                onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
                className="disabled:opacity-0"
              >
                <ChevronDown className="w-3 h-3" strokeWidth={2} />
              </IconButton>
            </div>

            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-terra">Remove?</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="text-[11px] font-medium text-terra hover:text-[#943a24] transition-colors"
                >
                  Yes
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); }}
                  className="text-[11px] text-gray-muted hover:text-warm-black transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <IconButton
                label="Remove"
                size="sm"
                variant="danger"
                onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
              >
                <Trash2 className="w-3 h-3" strokeWidth={1.5} />
              </IconButton>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
