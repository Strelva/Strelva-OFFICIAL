"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Upload } from "lucide-react";
import Image from "next/image";
import { StSkeleton } from "@/components/ui/strelva/Kit";
import { XaButton, XaEmpty, XaRow, XaRows } from "@/components/ui/strelva/Xa";
import { DashNote, DashPage } from "@/components/dashboard/xa/DashboardXa";
import styles from "./website-library.module.css";
import { cn } from "@/lib/cn";
import type { MediaAsset } from "@/lib/media";
import { photoCaption } from "@/lib/media";
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
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime();
  const thisMonth = assets.filter((asset) => new Date(asset.createdAt || 0).getTime() >= monthStart).length;

  // Fetch assets on mount
  useEffect(() => {
    fetch(apiHref("/api/media"), { credentials: "same-origin" })
      // Read the refusal's body too, so the request ends instead of hanging open.
      .then(async (res) => { if (!res.ok) { await res.text().catch(() => ""); throw new Error("Photos could not be read."); } return res.json(); })
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
          message: "Not a photo. Add an image file.",
        });
        setUploadResults([...results]);
        continue;
      }

      if (file.size > MAX_UPLOAD_BYTES) {
        results.push({
          name: file.name,
          status: "too-large",
          message: "Too large. Photos can be up to 5 MB.",
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
            message: "Didn't upload. Try again.",
          });
        }
      } catch {
        results.push({
          name: file.name,
          status: "failed",
          message: "Didn't upload. Check your connection and try again.",
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

  const upload = () => fileInputRef.current?.click();

  return <div className={styles.library} onDragEnter={handleDragEnter} onDragLeave={handleDragLeave} onDragOver={handleDragOver} onDrop={handleDrop}>
    <DashPage
      title="Photos."
      quiet={assets.length ? `${assets.length} ${assets.length === 1 ? "photo" : "photos"} Strelva can use on your site.` : "Photos Strelva can use on your site."}
      actions={assets.length > 0 || loading || loadError ? <XaButton busy={uploading} disabled={readOnly} onClick={upload}><Upload size={15} aria-hidden="true" />{uploading ? "Uploading" : "Add photos"}</XaButton> : undefined}
      width="wide"
      label="Photos"
    >
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} disabled={readOnly} aria-label="Choose photos to add" />
      {readOnly ? <DashNote tone="quiet">You can see these photos. Only an owner or admin can add or remove them.</DashNote> : null}
      {uploading && uploadProgress ? <DashNote tone="quiet" role="status">Adding <span className="tabular-nums">{uploadProgress.current} of {uploadProgress.total}</span>.</DashNote> : null}
      {!uploading && uploadSummary ? <section className="flex flex-col gap-2" aria-label="Upload results">
        <DashNote tone={uploadSummary.failed ? "waits" : "live"} role="status">{uploadSummary.uploaded} uploaded, {uploadSummary.failed} failed or skipped</DashNote>
        {uploadSummary.failed ? <XaRows label="Upload results">{uploadResults.filter((result) => result.status !== "uploaded").map((result, index) => <XaRow key={`${result.name}-${index}`} title={result.name} detail={result.message} tone="waits" />)}</XaRows> : null}
      </section> : null}
      {dragging && !readOnly ? <DashNote tone="quiet">Drop the photos anywhere here to add them.</DashNote> : null}
      {loading ? <section className="flex flex-col gap-3" aria-busy="true" aria-label="Loading photos"><StSkeleton /><StSkeleton width="80%" /></section>
        : loadError ? <DashNote tone="down" role="alert">The photos could not be read. Reload this page to try again; the library is unchanged.</DashNote>
        : assets.length === 0 ? <XaEmpty pose="adds" title="No photos yet." job="Ready to place your photos on the site" action={<XaButton variant="primary" disabled={readOnly} onClick={upload}>Add your first photos</XaButton>}>Photos of your space, your team and your work. Images up to 5 MB.</XaEmpty>
        : <>
          <p className="m-0 text-[14px] text-[var(--st-text-2)]">{thisMonth === 0 ? "None added this month." : `${thisMonth} added this month.`} Drop photos anywhere here to add more.</p>
          <div className={styles.photoGrid}>{assets.map(asset => {
            const caption = photoCaption(asset.filename);
            return <div key={asset.id} className={styles.photoItem}>
              <button type="button" aria-label={`Open ${caption}`} aria-pressed={selected?.id === asset.id} onClick={() => setSelected(selected?.id === asset.id ? null : asset)} className={cn(styles.photo, selected?.id === asset.id && styles.selected)}><Image src={asset.url} alt={caption} fill className="object-cover" sizes="(max-width: 767px) 50vw, 25vw" /></button>
              <span>{caption}</span>
              <span className="text-[13px] text-[var(--st-text-3)]">Added {new Date(asset.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
            </div>;
          })}</div>
        </>}
    </DashPage>
    <PhotoDetail asset={selected} onClose={() => setSelected(null)} onDelete={readOnly ? undefined : deleteAsset} />
  </div>;
}
