"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { XaButton, XaIconButton, XaTextLink, XaYes } from "@/components/ui/strelva/Xa";
import type { MediaAsset } from "@/lib/media";
import { photoCaption } from "@/lib/media";

interface PhotoDetailProps {
  asset: MediaAsset | null;
  onClose: () => void;
  onDelete?: (asset: MediaAsset) => Promise<void> | void;
  /** Previews only: open with the delete question already asked. */
  askDeleteFirst?: boolean;
}

/**
 * One photo, beside the library. Deleting asks its one question in place
 * (XaYes `question`), never in a sheet over the page: the photo stays in view
 * while the owner decides, and "Keep it" backs out.
 */
export function PhotoDetail({ asset, onClose, onDelete, askDeleteFirst = false }: PhotoDetailProps) {
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(askDeleteFirst);
  const [deleting, setDeleting] = useState(false);
  const [prevAssetId, setPrevAssetId] = useState(asset?.id);

  // Reset transient UI state when the selected asset changes (derived-state pattern).
  if (asset?.id !== prevAssetId) {
    setPrevAssetId(asset?.id);
    setCopied(false);
    setConfirmingDelete(false);
    setDeleting(false);
  }

  // Escape backs out of the delete question first, then closes the photo.
  useEffect(() => {
    if (!asset) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || deleting) return;
      if (confirmingDelete) setConfirmingDelete(false);
      else onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [asset, onClose, confirmingDelete, deleting]);

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

  const caption = photoCaption(asset.filename);
  const added = new Date(asset.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const detail = (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="m-0 min-w-0 text-[15px] font-medium text-[var(--st-text)]">{caption}<span className="block text-[13px] font-normal text-[var(--st-text-3)]">Added {added}</span></p>
        <XaIconButton label="Close photo" tone="plain" onClick={onClose}><X className="h-4 w-4" strokeWidth={1.7} /></XaIconButton>
      </div>
      <img src={asset.url} alt={caption} className="max-h-[300px] w-full rounded-[var(--st-r-md)] object-contain" />
      <p className="m-0 text-[14px] text-[var(--st-text-2)]">Ask Strelva to put it on any part of your site, or copy its address.</p>
      {confirmingDelete && onDelete ? (
        <XaYes
          state="waiting"
          question="Delete this photo? It comes out of your photo library, and any part of your site still using it loses the image."
          yesLabel="Delete the photo"
          notYetLabel="Keep it"
          onYes={() => void handleConfirmDelete()}
          onNotYet={() => setConfirmingDelete(false)}
          disabled={deleting}
          block={false}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <XaButton onClick={handleCopy}>{copied ? "Copied" : "Copy address"}</XaButton>
          {onDelete ? <XaTextLink onClick={() => setConfirmingDelete(true)}>Delete photo</XaTextLink> : null}
        </div>
      )}
    </div>
  );

  return (
    <>
      {/* Desktop: the photo opens beside the library */}
      <div className="hidden w-[340px] shrink-0 flex-col overflow-y-auto border-l border-[var(--st-line)] bg-[var(--st-surface)] md:flex">
        {detail}
      </div>

      {/* Mobile: bottom sheet overlay */}
      <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-[#16171566]" onClick={onClose} />
        {/* Sheet */}
        <div className="relative max-h-[85vh] overflow-y-auto rounded-t-[var(--st-r-lg)] bg-[var(--st-surface)] animate-fade-in-up">
          {detail}
        </div>
      </div>
    </>
  );
}
