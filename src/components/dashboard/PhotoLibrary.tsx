"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Upload } from "lucide-react";
import Image from "next/image";
import { StEmpty, StHead, StMono, StNotice, StPage, StPill, StRow, StRows, StSkeleton, StState } from "@/components/ui/strelva/Kit";
import styles from "./website-library.module.css";
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

export function PhotoLibrary() {
  const dashboard = useDashboardOptional();
  const apiHref = useMemo(
    () => dashboard?.dashboardHref ?? ((path: string) => path),
    [dashboard?.dashboardHref],
  );
  const readOnly = dashboard?.readOnly ?? false;
  const [loadError, setLoadError] = useState(false);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<MediaAsset | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploadResults, setUploadResults] = useState<UploadResult[]>([]);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
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
      .then((res) => { if (!res.ok) throw new Error("Photos could not be read."); return res.json(); })
      .then((data) => setAssets(data.assets || []))
      .catch(() => { setAssets([]); setLoadError(true); })
      .finally(() => setLoading(false));
  }, [apiHref]);

  // Upload handler
  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    if (readOnly) return;
    const selectedFiles = Array.from(files);
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setUploadResults([]);
    setUploadProgress({ current: 0, total: selectedFiles.length });
    const newAssets: MediaAsset[] = [];
    const results: UploadResult[] = [];

    let processed = 0;
    for (const file of selectedFiles) {
      processed += 1;
      setUploadProgress({ current: processed, total: selectedFiles.length });
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
      setSelected(newAssets[0]!);
    }
    setUploadProgress(null);
    setUploading(false);
  }, [apiHref, readOnly]);

  // Delete handler — invoked from PhotoDetail after the user confirms.
  const deleteAsset = useCallback(
    async (asset: MediaAsset) => {
      const res = await fetch(
        apiHref(`/api/media?id=${encodeURIComponent(asset.id)}`),
        { method: "DELETE", credentials: "same-origin" },
      );
      if (!res.ok) {
        throw new Error("Delete failed");
      }
      setAssets((prev) => prev.filter((a) => a.id !== asset.id));
      setSelected((current) => (current?.id === asset.id ? null : current));
    },
    [apiHref],
  );

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

  return <div className={styles.library} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
    <StPage><StHead title="Photos and files" meta={`${assets.length} photos · uploads are images up to 5 MB`} actions={<StPill variant="soft" busy={uploading} disabled={readOnly} onClick={() => fileInputRef.current?.click()}><Upload size={16} aria-hidden="true" />{uploading ? "Uploading…" : "Upload photos"}</StPill>} />
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} disabled={readOnly} />
      {readOnly ? <StNotice>You can see these photos. Only an owner or admin can upload or remove them.</StNotice> : null}
      {uploading && uploadProgress ? <StNotice><span role="status">Uploading <StMono>{uploadProgress.current} of {uploadProgress.total}</StMono>…</span></StNotice> : null}
      {!uploading && uploadSummary ? <div className={styles.stack}><StState kind={uploadSummary.failed ? "need" : "live"}>{uploadSummary.uploaded} uploaded, {uploadSummary.failed} failed or skipped</StState><StRows label="Upload results">{uploadResults.map((result, index) => <StRow key={`${result.name}-${index}`} title={result.name} end={<StState kind={result.status === "uploaded" ? "live" : "need"}>{result.message}</StState>} />)}</StRows></div> : null}
      {dragging && !readOnly ? <StNotice>Drop photos here to upload them.</StNotice> : null}
      {loading ? <section className={styles.stack} aria-busy="true" aria-label="Loading photos"><StSkeleton /><StSkeleton width="80%" /></section> : loadError ? <StNotice tone="critical">The photos could not be read. Reload this page to try again; the library is unchanged.</StNotice> : assets.length === 0 ? <StEmpty action={<StPill variant="soft" disabled={readOnly} onClick={() => fileInputRef.current?.click()}>Add first photos</StPill>}>No photos yet. Add photos of your space, team, and work for Strelva to use on the site.</StEmpty> : <>
        <p className={styles.description}><StMono>{recentCount}</StMono> added within 30 days of the latest photo.</p>
        <div className={styles.photoGrid}>{assets.map(asset => <div key={asset.id} className={styles.photoItem}><button type="button" aria-label={`Open ${asset.filename}`} aria-pressed={selected?.id === asset.id} onClick={() => setSelected(selected?.id === asset.id ? null : asset)} className={cn(styles.photo, selected?.id === asset.id && styles.selected)}><Image src={asset.url} alt={asset.filename} fill className="object-cover" sizes="(max-width: 767px) 50vw, 25vw" /></button><span>{asset.filename}</span><StMono>{asset.width} × {asset.height}</StMono></div>)}</div>
      </>}
    </StPage>
    <PhotoDetail asset={selected} onClose={() => setSelected(null)} onDelete={readOnly ? undefined : deleteAsset} />
  </div>;
}
