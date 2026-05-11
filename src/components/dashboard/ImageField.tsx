"use client";

import { useRef, useState } from "react";
import { Upload, X, Images } from "lucide-react";
import Image from "next/image";
import { AssetPickerModal } from "./AssetPickerModal";
import { useDashboardOptional } from "./DashboardContext";

interface ImageFieldProps {
  value: unknown;
  onChange: (val: string) => void;
  label?: string;
  size?: "sm" | "md" | "lg";
}

export function ImageField({ value, onChange, label, size = "md" }: ImageFieldProps) {
  const dashboard = useDashboardOptional();
  const dashboardHref = dashboard?.dashboardHref ?? ((path: string) => path);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const url = (value as string) || "";

  const dims = size === "lg" ? "w-28 h-28" : size === "sm" ? "w-14 h-14" : "w-20 h-20";
  const pxSize = size === "lg" ? 112 : size === "sm" ? 56 : 80;

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(dashboardHref("/api/upload"), {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });
      if (res.ok) {
        const { url: uploaded } = await res.json();
        onChange(uploaded);
      }
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      {label && (
        <label className="block text-[11px] text-gray-muted mb-1.5">{label}</label>
      )}
      {url ? (
        <div className="flex items-center gap-2">
          <div className="relative inline-block">
            <Image
              src={url}
              alt=""
              width={pxSize}
              height={pxSize}
              className={`${dims} object-cover rounded-lg border border-gray-border`}
            />
            <button
              type="button"
              onClick={() => onChange("")}
              className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-terra text-white flex items-center justify-center hover:bg-[#943a24] transition-colors"
              aria-label="Remove image"
            >
              <X className="w-2.5 h-2.5" strokeWidth={2} />
            </button>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="text-[11px] text-gray-muted hover:text-sage underline underline-offset-2 transition-colors"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed border-gray-border text-[11px] text-gray-muted hover:border-sage hover:text-sage transition-colors"
          >
            <Upload className="w-3 h-3" strokeWidth={1.5} />
            {uploading ? "Uploading..." : "Upload image"}
          </button>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-dashed border-gray-border text-[11px] text-gray-muted hover:border-sage hover:text-sage transition-colors"
          >
            <Images className="w-3 h-3" strokeWidth={1.5} />
            Choose from library
          </button>
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
      <AssetPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(picked) => onChange(picked)}
      />
    </div>
  );
}
