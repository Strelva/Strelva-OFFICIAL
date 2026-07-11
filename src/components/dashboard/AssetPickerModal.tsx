"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Image from "next/image";
import { X, Search, Upload, Clock, Loader2 } from "lucide-react";
import type { MediaAsset } from "@/lib/media";
import { useDashboardOptional } from "./DashboardContext";

type FilterTab = "all" | "recent" | "proof";

interface AssetPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
}

export function AssetPickerModal({ open, onClose, onSelect }: AssetPickerModalProps) {
  const dashboard = useDashboardOptional();
  const dashboardHref = useMemo(
    () => dashboard?.dashboardHref ?? ((path: string) => path),
    [dashboard?.dashboardHref],
  );
  const [assets, setAssets] = useState<MediaAsset[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterTab>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // Reset fetch state when the modal is opened
    setLoading(true);
    setAssets(null);
    setSelectedId(null);
    setSearch("");
    setFilter("all");
    fetch(dashboardHref("/api/media"), { credentials: "same-origin" })
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
  }, [dashboardHref, open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Filter and search assets
  const filteredAssets = useMemo(() => {
    if (!assets) return [];

    let filtered = [...assets];

    // Apply tab filter
    if (filter === "recent") {
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      filtered = filtered.filter((a) => {
        const created = new Date(a.createdAt || 0).getTime();
        return Number.isFinite(created) && created >= weekAgo;
      });
    } else if (filter === "proof") {
      // "Proof" photos - typically photos showing work, team, etc.
      // For now, filter by keywords in filename or recent uploads
      filtered = filtered.filter((a) => {
        const name = a.filename.toLowerCase();
        return (
          name.includes("proof") ||
          name.includes("team") ||
          name.includes("work") ||
          name.includes("before") ||
          name.includes("after") ||
          name.includes("result")
        );
      });
    }

    // Apply search
    if (search.trim()) {
      const query = search.toLowerCase().trim();
      filtered = filtered.filter((a) =>
        a.filename.toLowerCase().includes(query)
      );
    }

    return filtered;
  }, [assets, filter, search]);

  // Upload handler
  async function handleUpload(file: File) {
    if (!file.type.startsWith("image/")) return;

    setUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(dashboardHref("/api/media"), {
        method: "POST",
        credentials: "same-origin",
        body: formData,
      });
      if (res.ok) {
        const asset: MediaAsset = await res.json();
        setAssets((prev) => (prev ? [asset, ...prev] : [asset]));
        // Auto-select the newly uploaded photo
        handlePick(asset);
      } else {
        // Don't swallow the failure — surface the server's real reason (e.g.
        // "File too large (max 5MB)") instead of a vague catch-all.
        const reason = await res
          .json()
          .then((j: { error?: string }) => j.error)
          .catch(() => null);
        setUploadError(reason || "Upload failed. Try a smaller image, or check your connection.");
      }
    } catch {
      setUploadError("Upload failed. Check your connection and try again.");
    } finally {
      setUploading(false);
    }
  }

  if (!open) return null;

  function handlePick(asset: MediaAsset) {
    setSelectedId(asset.id);
    window.setTimeout(() => {
      onSelect(asset.url);
      onClose();
    }, 150);
  }

  const recentCount = assets
    ? assets.filter((a) => {
        const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
        const created = new Date(a.createdAt || 0).getTime();
        return Number.isFinite(created) && created >= weekAgo;
      }).length
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay-scrim p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Choose from library"
        className="relative w-full max-w-3xl max-h-[80vh] overflow-hidden rounded-xl bg-surface-raised shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
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

        {/* Search and filters */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-border bg-gray-bg-alt">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-muted" strokeWidth={1.5} />
            <input
              type="text"
              placeholder="Search photos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-gray-border bg-surface text-[13px] text-warm-black placeholder:text-gray-faint outline-none focus:border-sage transition-colors"
            />
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-gray-border bg-surface p-0.5">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                filter === "all"
                  ? "bg-sage/10 text-sage"
                  : "text-gray-muted hover:text-warm-black"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("recent")}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                filter === "recent"
                  ? "bg-sage/10 text-sage"
                  : "text-gray-muted hover:text-warm-black"
              }`}
            >
              <Clock className="w-3 h-3" strokeWidth={1.5} />
              Recent
              {recentCount > 0 && (
                <span className="ml-0.5 px-1 py-0.5 text-[11px] rounded bg-sage/20 text-sage">
                  {recentCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilter("proof")}
              className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-colors ${
                filter === "proof"
                  ? "bg-sage/10 text-sage"
                  : "text-gray-muted hover:text-warm-black"
              }`}
            >
              Proof
            </button>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-gray-border text-[11px] font-medium text-gray-muted hover:border-sage hover:text-sage transition-colors disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
            ) : (
              <Upload className="w-3.5 h-3.5" strokeWidth={1.5} />
            )}
            Upload
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])}
          />
        </div>

        {uploadError && (
          <div className="px-5 pt-2 text-[12px] text-critical" role="alert">{uploadError}</div>
        )}

        {/* Content */}
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
          ) : filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              {assets.length === 0 ? (
                <>
                  <p className="text-sm text-gray-muted mb-3">No photos yet</p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sage text-white text-[13px] font-medium hover:bg-sage/90 transition-colors"
                  >
                    <Upload className="w-4 h-4" strokeWidth={1.5} />
                    Upload your first photo
                  </button>
                </>
              ) : (
                <p className="text-sm text-gray-muted">
                  No photos match your search
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {filteredAssets.map((asset) => {
                const isSelected = selectedId === asset.id;
                const isRecent = (() => {
                  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                  const created = new Date(asset.createdAt || 0).getTime();
                  return Number.isFinite(created) && created >= weekAgo;
                })();

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
                    {isRecent && (
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-accent/90 text-on-accent text-[11px] font-medium">
                        New
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer with count */}
        {assets && assets.length > 0 && (
          <div className="border-t border-gray-border px-5 py-2.5 bg-gray-bg-alt">
            <p className="text-[11px] text-gray-muted">
              {filteredAssets.length === assets.length
                ? `${assets.length} photo${assets.length === 1 ? "" : "s"} in library`
                : `Showing ${filteredAssets.length} of ${assets.length} photos`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
