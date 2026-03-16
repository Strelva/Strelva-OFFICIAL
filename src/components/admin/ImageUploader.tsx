"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { useToast } from "./Toast";
import { ImageCropper } from "./ImageCropper";

interface ImageUploaderProps {
  currentUrl: string;
  onUpload: (url: string) => void;
  label?: string;
  hint?: string;
  aspect?: number;
}

export function ImageUploader({ currentUrl, onUpload, label = "Image", hint, aspect }: ImageUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(currentUrl);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast("File too large — max 5MB", "error");
      return;
    }

    const url = URL.createObjectURL(file);
    setCropSrc(url);
  };

  const uploadBlob = async (blob: Blob) => {
    setUploading(true);
    setCropSrc(null);
    try {
      const formData = new FormData();
      formData.append("file", blob, "cropped.jpg");

      const res = await fetch("/api/upload", { method: "POST", body: formData });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed (${res.status})`);
      }

      const data = await res.json();

      if (data.url) {
        setPreview(data.url);
        onUpload(data.url);
        toast("Image uploaded");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast(message, "error");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <label className="block text-sm font-medium mb-1" style={{ color: "var(--bark-light)" }}>{label}</label>
      {hint && <p className="text-xs mb-2" style={{ color: "var(--bark-faded)" }}>{hint}</p>}
      <div className="flex items-start gap-4">
        {preview && (
          <div className="relative w-24 h-24 rounded-lg overflow-hidden shrink-0" style={{ border: "1px solid var(--cream-dark)" }}>
            <Image src={preview} alt="" fill className="object-cover" sizes="96px" />
          </div>
        )}
        <div className="flex-1">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2 text-sm rounded-lg transition-colors disabled:opacity-50"
            style={{ border: "1px solid var(--cream-dark)", color: "var(--bark-light)" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--cream-dark)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {uploading ? "Uploading..." : "Choose File"}
          </button>
          <p className="text-[0.625rem] mt-1" style={{ color: "var(--bark-faded)" }}>
            JPEG, PNG, WebP, or GIF — max 5MB
          </p>
          <input
            type="text"
            value={preview}
            onChange={(e) => {
              setPreview(e.target.value);
              onUpload(e.target.value);
            }}
            placeholder="Or paste image URL"
            className="mt-2 w-full px-3 py-2 text-sm rounded-lg outline-none transition-all"
            style={{ border: "1px solid var(--cream-dark)", color: "var(--bark)" }}
            onFocus={(e) => {
              e.currentTarget.style.borderColor = "var(--sage)";
              e.currentTarget.style.boxShadow = "0 0 0 3px rgba(124,154,142,0.1)";
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = "var(--cream-dark)";
              e.currentTarget.style.boxShadow = "none";
            }}
          />
        </div>
      </div>

      {cropSrc && (
        <ImageCropper
          src={cropSrc}
          aspect={aspect}
          onCrop={(blob) => {
            URL.revokeObjectURL(cropSrc);
            uploadBlob(blob);
          }}
          onCancel={handleCropCancel}
        />
      )}
    </div>
  );
}
