"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Camera, ImageIcon, Loader2, Upload } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import type { MediaAsset } from "@/lib/media";
import { PhotoDetail } from "@/components/dashboard/PhotoDetail";
import { useDashboardOptional } from "@/components/dashboard/DashboardContext";

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

type UploadResult = {
  name: string;
  status: "uploaded" | "too-large" | "unsupported" | "failed";
  message: string;
};

export default function PhotosPage() {
  const dashboard = useDashboardOptional();
  const apiHref = useMemo(
    () => dashboard?.dashboardHref ?? ((path: string) => path),
    [dashboard?.dashboardHref],
  );
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const newestUpload = Math.max(
    0,
    ...assets.map((asset) => new Date(asset.createdAt || 0).getTime()).filter(Number.isFinite),
  );
  const recentCount = newestUpload
    ? assets.filter((asset) => {
        const uploaded = new Date(asset.createdAt || 0).getTime();
        return Number.isFinite(uploaded) && newestUpload - uploaded < 30 * 86_400_000;
      }).length
    : 0;

  // Fetch assets on mount
  useEffect(() => {
    fetch(apiHref("/api/media"), { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : { assets: [] }))
      .then((data) => setAssets(data.assets || []))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, [apiHref]);

  // Upload handler
  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setUploadResults([]);
    const newAssets: MediaAsset[] = [];
    const results: UploadResult[] = [];

    for (const file of selectedFiles) {
      if (!file.type.startsWith("image/")) {
        results.push({
          name: file.name,
          status: "unsupported",
          message: "Unsupported file type. Upload an image file.",
        });
        setUploadResults([...results]);
        continue;
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        results.push({
          name: file.name,
          status: "too-large",
          message: "Too large. Max size is 5MB.",
        });
        setUploadResults([...results]);
        continue;
      }

      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(apiHref("/api/media"), {
          method: "POST",
          credentials: "same-origin",
          body: formData,
        });
        if (res.ok) {
          const asset: MediaAsset = await res.json();
          newAssets.push(asset);
          results.push({
            name: file.name,
            status: "uploaded",
            message: "Uploaded",
          });
        } else {
          results.push({
            name: file.name,
            status: "failed",
            message: "Upload failed. Try again.",
          });
        }
      } catch {
        results.push({
          name: file.name,
          status: "failed",
          message: "Upload failed. Check your connection and try again.",
        });
      }
      setUploadResults([...results]);
    }

    if (newAssets.length > 0) {
      setAssets((prev) => [...newAssets, ...prev]);
      // Select the first newly uploaded photo
      setSelected(newAssets[0]);
    }
    setUploading(false);
  }, [apiHref]);

  const uploadSummary = uploadResults.length
    ? {
        uploaded: uploadResults.filter((result) => result.status === "uploaded").length,
        failed: uploadResults.filter((result) => result.status !== "uploaded").length,
      }
    : null;

  // File input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      uploadFiles(e.target.files);
      e.target.value = "";
    }
  };

  // Drag & drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) setDragging(false);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setDragging(false);
    if (e.dataTransfer.files?.length) {
      uploadFiles(e.dataTransfer.files);
    }
  };

  return (
    <div
      className="flex flex-1 min-h-0 h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Header */}
        <div className="px-4 py-5 sm:px-8 sm:py-7 shrink-0 border-b border-glass-border">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-gray-muted mb-2">
              Visual proof
            </p>
            <h1 className="text-[24px] sm:text-[30px] font-semibold tracking-[-0.02em] text-warm-black">
              Photo library
            </h1>
            <p className="text-[13px] text-gray-muted mt-2 max-w-xl">
              Keep a bank of real photos the site and AI can use for trust, seasonal updates, service pages, and weekly content.
            </p>
          </div>
            <Button
              variant="primary"
              size="md"
              icon={uploading ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : <Upload className="w-4 h-4" strokeWidth={1.5} />}
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? "Uploading..." : "Upload photos"}
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          {uploadSummary && (
            <div
              className={cn(
                "mt-4 rounded-lg border px-4 py-3 text-[12px]",
                uploadSummary.failed > 0
                  ? "border-amber-400/20 bg-amber-400/10 text-amber-300"
                  : "border-emerald-400/20 bg-emerald-400/10 text-emerald-300",
              )}
            >
              <p className="font-medium text-warm-white">
                {uploadSummary.uploaded} uploaded, {uploadSummary.failed} failed or skipped
              </p>
              <div className="mt-2 space-y-1">
                {uploadResults.map((result, index) => (
                  <div key={`${result.name}-${index}`} className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                    <span className="truncate text-gray-muted">{result.name}</span>
                    <span
                      className={cn(
                        "shrink-0 font-medium",
                        result.status === "uploaded" ? "text-emerald-300" : "text-amber-300",
                      )}
                    >
                      {result.message}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Drag overlay */}
        {dragging && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-sage/10 pointer-events-none">
            <div className="border-2 border-dashed border-sage rounded-xl px-12 py-10 bg-surface-raised/80 text-center">
              <Upload className="w-8 h-8 text-sage mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-[14px] font-medium text-sage">Drop photos here</p>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 px-4 sm:px-8 py-5">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="aspect-square bg-gray-bg-hover rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="flex-1 flex items-center justify-center min-h-[400px]">
              <EmptyState
                icon={<ImageIcon className="w-5 h-5 text-gray-muted" strokeWidth={1.5} />}
                title="No visual proof yet"
                description="Start with real photos that prove what customers can expect: your space, team, work, offers, and recent customer-facing moments."
                action={
                  <Button
                    variant="primary"
                    size="md"
                    icon={<Upload className="w-4 h-4" strokeWidth={1.5} />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Add first photos
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-glass-border bg-glass p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-muted">Library</p>
                  <p className="mt-2 text-[26px] font-semibold leading-none text-warm-black">{assets.length}</p>
                  <p className="mt-1 text-[12px] text-gray-muted">photos ready for site updates</p>
                </div>
                <div className="rounded-xl border border-glass-border bg-glass p-4">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-gray-muted">Freshness</p>
                  <p className="mt-2 text-[26px] font-semibold leading-none text-warm-black">{recentCount}</p>
                  <p className="mt-1 text-[12px] text-gray-muted">added in the last 30 days</p>
                </div>
                <div className="rounded-xl border border-accent/20 bg-accent-dim/35 p-4">
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-accent" strokeWidth={1.5} />
                    <p className="text-[13px] font-medium text-warm-black">Next useful upload</p>
                  </div>
                  <p className="mt-2 text-[12px] leading-relaxed text-gray-fg">
                    Add one current photo that proves what changed this week.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => setSelected(selected?.id === asset.id ? null : asset)}
                    className={cn(
                      "group relative aspect-square rounded-lg overflow-hidden border transition-all duration-150",
                      selected?.id === asset.id
                        ? "border-accent ring-2 ring-accent/20"
                        : "border-gray-border hover:border-gray-muted hover:shadow-md",
                    )}
                  >
                    <Image
                      src={asset.url}
                      alt={asset.filename}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                    />
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-warm-black/0 group-hover:bg-warm-black/10 transition-colors duration-150" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel (desktop) / bottom sheet (mobile) */}
      <PhotoDetail asset={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
