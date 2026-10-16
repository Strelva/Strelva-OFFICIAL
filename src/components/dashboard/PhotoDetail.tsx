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
  /** Preview harness: open with the delete question already asked. */
  initialConfirming?: boolean;
}

export function PhotoDetail({ asset, onClose, onDelete, initialConfirming = false }: PhotoDetailProps) {
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(initialConfirming);
  const [deleting, setDeleting] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [prevAssetId, setPrevAssetId] = useState(asset?.id);

  // Reset transient UI state when the selected asset changes (derived-state pattern).
  if (asset?.id !== prevAssetId) {
    setPrevAssetId(asset?.id);
    setCopied(false);
    setConfirmingDelete(initialConfirming);
    setDeleting(false);
    setDeleteFailed(false);
  }

  // Escape backs out of the delete question first, then closes the photo.
  useEffect(() => {
    if (!asset) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (confirmingDelete) { if (!deleting) setConfirmingDelete(false); return; }
      onClose();
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
    setDeleteFailed(false);
    try {
      await onDelete(asset);
      // Parent closes the panel on success; reset local state defensively.
      setConfirmingDelete(false);
    } catch {
      setDeleteFailed(true);
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
      {confirmingDelete && onDelete ? <div className="flex flex-col gap-3 border-t border-[var(--st-line)] pt-4">
        {/* Asked in place, under the photo it deletes: no sheet over the library. The library holds the delete for the Undo window. */}
        <XaYes state={deleting ? "going" : deleteFailed ? "failed" : "waiting"} shortcut={false} block={false}
          question="Delete this photo? It comes out of your photo library, and any part of your site still using it loses the image. Undo brings it back for a few seconds."
          yesLabel="Delete the photo" notYetLabel="Keep it" onYes={() => void handleConfirmDelete()} onNotYet={() => { setConfirmingDelete(false); setDeleteFailed(false); }}
          working={{ title: "Deleting the photo", steps: [{ id: "delete", label: `Taking ${caption} out of your library`, state: "active" }] }}
          failure="The photo couldn't be deleted. It is still in your library." />
      </div> : <div className="flex flex-wrap items-center gap-4">
        <XaButton onClick={handleCopy}>{copied ? "Copied" : "Copy address"}</XaButton>
        {onDelete ? <XaTextLink onClick={() => setConfirmingDelete(true)}>Delete photo</XaTextLink> : null}
      </div>}
    </div>
  );

  // Desktop: beside the library. Phone: in place of the grid, in the page's own flow (no sheet or scrim).
  return (
    <div className="flex w-full shrink-0 flex-col bg-[var(--st-surface)] max-md:rounded-[var(--st-r-lg)] max-md:border max-md:border-[var(--st-line)] md:w-[340px] md:overflow-y-auto md:border-l md:border-[var(--st-line)]" aria-label={`Photo: ${photoCaption(asset.filename)}`} role="region">
      {detail}
    </div>
  );
}
