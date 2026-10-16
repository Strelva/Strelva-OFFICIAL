"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Image from "next/image";
import { X, Search } from "lucide-react";
import { XaIconButton, XaSegmented, XaTextLink } from "@/components/ui/strelva/Xa";
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
        setUploadError(reason || "That photo didn't upload. Try a smaller one, or check your connection.");
      }
    } catch {
      setUploadError("That photo didn't upload. Check your connection and try again.");
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
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-[#1617155c] p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-picker-title"
        className="relative flex max-h-[86vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[24px] bg-[var(--st-surface)] shadow-[var(--st-shadow-lg)] sm:rounded-[24px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-4 px-6 pb-4 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 id="asset-picker-title" className="m-0 text-[20px] font-medium tracking-[-0.3px] text-[var(--st-text)]">Choose a photo</h2>
              <p className="m-0 text-[14px] text-[var(--st-text-2)]">{assets && assets.length > 0 ? (filteredAssets.length === assets.length ? `${assets.length} photo${assets.length === 1 ? "" : "s"} in your library.` : `Showing ${filteredAssets.length} of ${assets.length} photos.`) : "From your photo library."}</p>
            </div>
            <XaIconButton label="Close" tone="plain" onClick={onClose}><X className="h-4 w-4" strokeWidth={1.7} /></XaIconButton>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-h-[40px] min-w-[200px] flex-1 items-center gap-2 rounded-full bg-[var(--st-inset)] px-4">
              <Search className="h-4 w-4 shrink-0 text-[var(--st-text-3)]" strokeWidth={1.7} aria-hidden="true" />
              <span className="sr-only">Search photos</span>
              <input type="text" placeholder="Search photos" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent text-[14px] text-[var(--st-text)] outline-none placeholder:text-[var(--st-faint)]" />
            </label>
            <XaSegmented label="Which photos" value={filter} onChange={setFilter} options={[
              { value: "all", label: "All" },
              { value: "recent", label: recentCount > 0 ? `This week ${recentCount}` : "This week" },
              { value: "proof", label: "Proof" },
            ]} />
            <XaTextLink onClick={() => fileInputRef.current?.click()}>{uploading ? "Adding" : "Add a photo"}</XaTextLink>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" aria-label="Choose a photo to add" onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0])} />
          </div>
          {uploadError ? <p className="m-0 text-[14px] text-[var(--st-critical)]" role="alert">{uploadError}</p> : null}
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-6">
          {loading || assets === null ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-busy="true" aria-label="Loading photos">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-square rounded-[12px] bg-[var(--st-inset)]" />)}
            </div>
          ) : filteredAssets.length === 0 ? (
            <p className="m-0 py-10 text-[15px] text-[var(--st-text-2)]">
              {assets.length === 0 ? <>No photos yet. <XaTextLink onClick={() => fileInputRef.current?.click()}>Add your first photo</XaTextLink></> : "No photo matches that."}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {filteredAssets.map((asset) => {
                const isSelected = selectedId === asset.id;
                return (
                  <button key={asset.id} type="button" onClick={() => handlePick(asset)} aria-label={`Use ${asset.filename}`} aria-pressed={isSelected}
                    className={`relative aspect-square overflow-hidden rounded-[12px] outline-none transition-[box-shadow,transform] duration-(--motion-fast) focus-visible:ring-2 focus-visible:ring-[var(--st-accent)] ${isSelected ? "ring-2 ring-[var(--st-text)]" : "hover:ring-1 hover:ring-[var(--st-line-strong)]"}`}>
                    <Image src={asset.url} alt={asset.filename} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover" />
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
