"use client";

import { useEffect, useState } from "react";
import { X, Copy, Check } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/Button";
import type { MediaAsset } from "@/lib/media";
import { formatFileSize } from "@/lib/media";
import { timeAgo } from "@/lib/utils";

interface PhotoDetailProps {
  asset: MediaAsset | null;
  onClose: () => void;
}

export function PhotoDetail({ asset, onClose }: PhotoDetailProps) {
  const [copied, setCopied] = useState(false);

  // Reset copied state when asset changes
  useEffect(() => {
    setCopied(false);
  }, [asset?.id]);

  // Close on Escape
  useEffect(() => {
    if (!asset) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [asset, onClose]);

  const handleCopy = async () => {
    if (!asset) return;
    await navigator.clipboard.writeText(asset.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!asset) return null;

  const detail = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-border">
        <p className="text-[13px] font-medium text-warm-black truncate pr-2">
          {asset.filename}
        </p>
        <IconButton label="Close" size="sm" variant="ghost" onClick={onClose}>
          <X className="w-4 h-4" strokeWidth={1.5} />
        </IconButton>
      </div>

      {/* Preview */}
      <div className="px-4 py-4 border-b border-gray-border bg-gray-bg flex items-center justify-center">
        <img
          src={asset.url}
          alt={asset.filename}
          className="max-h-[300px] max-w-full object-contain rounded"
        />
      </div>

      {/* Metadata */}
      <div className="px-4 py-3 space-y-2.5">
        <MetaRow label="Filename" value={asset.filename} />
        <MetaRow
          label="Dimensions"
          value={
            asset.width && asset.height
              ? `${asset.width} x ${asset.height}`
              : "Unknown"
          }
        />
        <MetaRow label="File size" value={formatFileSize(asset.size)} />
        <MetaRow label="Uploaded" value={timeAgo(asset.createdAt)} />
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-border">
        <Button
          variant="secondary"
          size="sm"
          icon={
            copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-600" strokeWidth={1.5} />
            ) : (
              <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />
            )
          }
          onClick={handleCopy}
          className="w-full"
        >
          {copied ? "Copied!" : "Copy URL"}
        </Button>
        <p className="text-[11px] text-gray-subtle mt-2 text-center">
          Use this photo in any section of your site
        </p>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop: right side panel */}
      <div className="hidden md:flex flex-col w-[320px] border-l border-gray-border bg-surface shrink-0 overflow-y-auto">
        {detail}
      </div>

      {/* Mobile: bottom sheet overlay */}
      <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-warm-black/30"
          onClick={onClose}
        />
        {/* Sheet */}
        <div className="relative bg-surface rounded-t-xl max-h-[85vh] overflow-y-auto animate-fade-in-up">
          {/* Drag handle */}
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-8 h-1 rounded-full bg-gray-border" />
          </div>
          {detail}
        </div>
      </div>
    </>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-gray-muted shrink-0">{label}</span>
      <span className="text-[12px] text-warm-black truncate text-right">
        {value}
      </span>
    </div>
  );
}
