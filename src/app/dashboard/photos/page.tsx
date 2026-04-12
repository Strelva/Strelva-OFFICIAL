"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Upload, ImageIcon, Loader2 } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import type { MediaAsset } from "@/lib/media";
import { PhotoDetail } from "@/components/dashboard/PhotoDetail";

export default function PhotosPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Fetch assets on mount
  useEffect(() => {
    fetch("/api/media", { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : { assets: [] }))
      .then((data) => setAssets(data.assets || []))
      .catch(() => setAssets([]))
      .finally(() => setLoading(false));
  }, []);

  // Upload handler
  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;

    setUploading(true);
    const newAssets: MediaAsset[] = [];

    for (const file of imageFiles) {
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch("/api/media", {
          method: "POST",
          credentials: "same-origin",
          body: formData,
        });
        if (res.ok) {
          const asset: MediaAsset = await res.json();
          newAssets.push(asset);
        }
      } catch {
        // Skip failed uploads silently
      }
    }

    if (newAssets.length > 0) {
      setAssets((prev) => [...newAssets, ...prev]);
      // Select the first newly uploaded photo
      setSelected(newAssets[0]);
    }
    setUploading(false);
  }, []);

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
        <div className="flex items-center justify-between px-6 py-5 shrink-0">
          <div>
            <h1 className="text-[20px] font-medium tracking-tight text-warm-black">
              Photos
            </h1>
            <p className="text-[12px] text-gray-muted mt-0.5">
              {assets.length > 0
                ? `${assets.length} photo${assets.length === 1 ? "" : "s"}`
                : "Upload photos of your business"}
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            icon={uploading ? <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} /> : <Upload className="w-4 h-4" strokeWidth={1.5} />}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading..." : "Upload"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
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
        <div className="flex-1 px-6 pb-6">
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
                title="No photos yet"
                description="Upload photos of your business, services, or team"
                action={
                  <Button
                    variant="primary"
                    size="md"
                    icon={<Upload className="w-4 h-4" strokeWidth={1.5} />}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload photos
                  </Button>
                }
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {assets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => setSelected(selected?.id === asset.id ? null : asset)}
                  className={cn(
                    "group relative aspect-square rounded-lg overflow-hidden border transition-all duration-150",
                    selected?.id === asset.id
                      ? "border-sage ring-2 ring-sage/20"
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
          )}
        </div>
      </div>

      {/* Detail panel (desktop) / bottom sheet (mobile) */}
      <PhotoDetail asset={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
