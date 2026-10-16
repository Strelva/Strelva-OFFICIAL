"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { XaAnswers, XaButton, XaIconButton, XaTextLink } from "@/components/ui/strelva/Xa";
import { ConfirmDialog } from "@/components/dashboard/ConfirmDialog";
import type { MediaAsset } from "@/lib/media";
import { formatFileSize } from "@/lib/media";
import { timeAgo } from "@/lib/utils";

interface PhotoDetailProps {
  asset: MediaAsset | null;
  onClose: () => void;
  onDelete?: (asset: MediaAsset) => Promise<void> | void;
}

export function PhotoDetail({ asset, onClose, onDelete }: PhotoDetailProps) {
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [prevAssetId, setPrevAssetId] = useState(asset?.id);

  // Reset transient UI state when the selected asset changes (derived-state pattern).
  if (asset?.id !== prevAssetId) {
    setPrevAssetId(asset?.id);
    setCopied(false);
    setConfirmingDelete(false);
    setDeleting(false);
  }

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

  const handleConfirmDelete = async () => {
    if (!asset || !onDelete) return;
    setDeleting(true);
    try {
      await onDelete(asset);
      // Parent closes the panel on success; reset local state defensively.
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  if (!asset) return null;

  const detail = (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 min-w-0 truncate text-[15px] font-medium text-[var(--st-text)]">{asset.filename}</p>
        <XaIconButton label="Close photo" tone="plain" onClick={onClose}><X className="h-4 w-4" strokeWidth={1.7} /></XaIconButton>
      </div>
      <img src={asset.url} alt={asset.filename} className="max-h-[300px] w-full rounded-[12px] object-contain" />
      <XaAnswers labelWidth={96} rows={[
        ["Size", asset.width && asset.height ? `${asset.width} × ${asset.height}, ${formatFileSize(asset.size)}` : formatFileSize(asset.size)],
        ["Added", timeAgo(asset.createdAt)],
      ]} />
      <p className="m-0 text-[14px] text-[var(--st-text-2)]">Ask Strelva to put it on any part of your site, or copy its address.</p>
      <div className="flex flex-wrap items-center gap-4">
        <XaButton onClick={handleCopy}>{copied ? "Copied" : "Copy address"}</XaButton>
        {onDelete ? <XaTextLink onClick={() => setConfirmingDelete(true)}>Delete photo</XaTextLink> : null}
      </div>
    </div>
  );

  return (
    <>
      <ConfirmDialog
        open={confirmingDelete}
        title="Delete this photo?"
        message="It comes out of your photo library. Any part of your site still using it loses the image."
        confirmLabel="Delete the photo"
        destructive
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmingDelete(false)}
      />

      {/* Desktop: the photo opens beside the library */}
      <div className="hidden w-[340px] shrink-0 flex-col overflow-y-auto border-l border-[var(--st-line)] bg-[var(--st-surface)] md:flex">
        {detail}
      </div>

      {/* Mobile: bottom sheet overlay */}
      <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-[#16171566]" onClick={onClose} />
        {/* Sheet */}
        <div className="relative max-h-[85vh] overflow-y-auto rounded-t-[24px] bg-[var(--st-surface)] animate-fade-in-up">
          {detail}
        </div>
      </div>
    </>
  );
}
