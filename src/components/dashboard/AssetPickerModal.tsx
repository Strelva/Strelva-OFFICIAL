"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X } from "lucide-react";
import type { MediaAsset } from "@/lib/media";

interface AssetPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}

export function AssetPickerModal({ open, onClose, onSelect }: AssetPickerModalProps) {
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Reset fetch state when the modal is opened. React 19 flags these as
    // cascading renders, but they only run on the open→true transition so
    // the cascade is bounded.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setAssets(null);
    setSelectedId(null);
    fetch("/api/media", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load media"))))
      .then((data: { assets: MediaAsset[] }) => {
        if (!cancelled) setAssets(data.assets ?? []);
      })
      .catch(() => {
        if (!cancelled) setAssets([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  function handlePick(asset: MediaAsset) {
    setSelectedId(asset.id);
    window.setTimeout(() => {
      onSelect(asset.url);
      onClose();
    }, 150);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl max-h-[80vh] overflow-hidden rounded-xl bg-surface-raised shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-border px-5 py-3">
          <h2 className="text-sm font-medium text-warm-black">Choose from library</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-muted hover:bg-gray-bg hover:text-warm-black transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {loading || assets === null ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-lg bg-gray-bg animate-pulse"
                />
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-sm text-gray-muted">
              No photos yet. Upload from the Photos tab.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {assets.map((asset) => {
                const isSelected = selectedId === asset.id;
                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => handlePick(asset)}
                    className={`relative aspect-square overflow-hidden rounded-lg border transition-all ${
                      isSelected
                        ? "border-sage ring-2 ring-sage scale-95"
                        : "border-gray-border hover:border-sage"
                    }`}
                    aria-label={`Select ${asset.filename}`}
                  >
                    <Image
                      src={asset.url}
                      alt={asset.filename}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      className="object-cover"
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
