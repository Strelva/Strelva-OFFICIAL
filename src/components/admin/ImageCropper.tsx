"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";

interface ImageCropperProps {
  src: string;
  onCrop: (blob: Blob) => void;
  onCancel: () => void;
  aspect?: number;
}

interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

type DragMode = "move" | "nw" | "ne" | "sw" | "se" | null;

export function ImageCropper({ src, onCrop, onCancel, aspect }: ImageCropperProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });
  const [crop, setCrop] = useState<CropBox>({ x: 0, y: 0, w: 0, h: 0 });
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const dragStart = useRef({ mx: 0, my: 0, crop: { x: 0, y: 0, w: 0, h: 0 } });

  const initCrop = useCallback(
    (iw: number, ih: number) => {
      const margin = 0.1;
      let w = iw * (1 - margin * 2);
      let h = ih * (1 - margin * 2);
      if (aspect) {
        if (w / h > aspect) w = h * aspect;
        else h = w / aspect;
      }
      setCrop({ x: (iw - w) / 2, y: (ih - h) / 2, w, h });
    },
    [aspect]
  );

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    imgRef.current = img;
    const rect = img.getBoundingClientRect();
    setImgSize({ w: rect.width, h: rect.height });
    initCrop(rect.width, rect.height);
  };

  const clamp = useCallback(
    (c: CropBox): CropBox => {
      const minSize = 20;
      let { x, y, w, h } = c;
      w = Math.max(minSize, Math.min(w, imgSize.w));
      h = Math.max(minSize, Math.min(h, imgSize.h));
      if (aspect) {
        if (w / h > aspect) w = h * aspect;
        else h = w / aspect;
      }
      x = Math.max(0, Math.min(x, imgSize.w - w));
      y = Math.max(0, Math.min(y, imgSize.h - h));
      return { x, y, w, h };
    },
    [imgSize, aspect]
  );

  const getPos = (e: React.MouseEvent | MouseEvent) => {
    const rect = containerRef.current?.querySelector("img")?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (mode: DragMode) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragMode(mode);
    const pos = getPos(e);
    dragStart.current = { mx: pos.x, my: pos.y, crop: { ...crop } };
  };

  useEffect(() => {
    if (!dragMode) return;

    const onMove = (e: MouseEvent) => {
      const pos = getPos(e);
      const dx = pos.x - dragStart.current.mx;
      const dy = pos.y - dragStart.current.my;
      const sc = dragStart.current.crop;

      let next: CropBox;
      if (dragMode === "move") {
        next = { ...sc, x: sc.x + dx, y: sc.y + dy };
      } else {
        let nx = sc.x, ny = sc.y, nw = sc.w, nh = sc.h;
        if (dragMode.includes("w")) { nx = sc.x + dx; nw = sc.w - dx; }
        if (dragMode.includes("e")) { nw = sc.w + dx; }
        if (dragMode.includes("n")) { ny = sc.y + dy; nh = sc.h - dy; }
        if (dragMode.includes("s")) { nh = sc.h + dy; }
        if (aspect) {
          if (dragMode === "nw" || dragMode === "se") {
            if (Math.abs(dx) > Math.abs(dy)) nh = nw / aspect;
            else nw = nh * aspect;
            if (dragMode === "nw") { nx = sc.x + sc.w - nw; ny = sc.y + sc.h - nh; }
          } else {
            if (Math.abs(dx) > Math.abs(dy)) nh = nw / aspect;
            else nw = nh * aspect;
            if (dragMode === "ne") { ny = sc.y + sc.h - nh; }
            if (dragMode === "sw") { nx = sc.x + sc.w - nw; }
          }
        }
        next = { x: nx, y: ny, w: nw, h: nh };
      }
      setCrop(clamp(next));
    };

    const onUp = () => setDragMode(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragMode, clamp, crop]);

  const handleCrop = () => {
    const img = imgRef.current;
    if (!img) return;
    const scaleX = img.naturalWidth / imgSize.w;
    const scaleY = img.naturalHeight / imgSize.h;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(crop.w * scaleX);
    canvas.height = Math.round(crop.h * scaleY);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(img, crop.x * scaleX, crop.y * scaleY, crop.w * scaleX, crop.h * scaleY, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => { if (blob) onCrop(blob); }, "image/jpeg", 0.92);
  };

  const handleSize = `10px`;
  const handles: { mode: DragMode; style: React.CSSProperties }[] = [
    { mode: "nw", style: { top: -5, left: -5, cursor: "nw-resize" } },
    { mode: "ne", style: { top: -5, right: -5, cursor: "ne-resize" } },
    { mode: "sw", style: { bottom: -5, left: -5, cursor: "sw-resize" } },
    { mode: "se", style: { bottom: -5, right: -5, cursor: "se-resize" } },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-medium" style={{ color: "var(--bark)" }}>Crop Image</h3>
          <button onClick={onCancel} className="text-xs px-3 py-1 rounded-md" style={{ color: "var(--bark-faded)" }}>Cancel</button>
        </div>
        <div ref={containerRef} className="relative flex-1 overflow-hidden flex items-center justify-center bg-gray-100 p-4 select-none" style={{ minHeight: 200 }}>
          <Image src={src} alt="Crop preview" onLoad={onImgLoad} className="max-w-full max-h-[60vh] block" draggable={false} width={800} height={600} unoptimized style={{ width: "auto", height: "auto", maxWidth: "100%", maxHeight: "60vh" }} />
          {imgSize.w > 0 && (
            <>
              <div className="absolute pointer-events-none" style={{ left: containerRef.current?.querySelector("img")?.offsetLeft ?? 0, top: containerRef.current?.querySelector("img")?.offsetTop ?? 0, width: imgSize.w, height: imgSize.h }}>
                <div className="absolute bg-black/40" style={{ top: 0, left: 0, right: 0, height: crop.y }} />
                <div className="absolute bg-black/40" style={{ top: crop.y + crop.h, left: 0, right: 0, bottom: 0 }} />
                <div className="absolute bg-black/40" style={{ top: crop.y, left: 0, width: crop.x, height: crop.h }} />
                <div className="absolute bg-black/40" style={{ top: crop.y, left: crop.x + crop.w, right: 0, height: crop.h }} />
              </div>
              <div
                className="absolute border-2 border-white"
                style={{ left: (containerRef.current?.querySelector("img")?.offsetLeft ?? 0) + crop.x, top: (containerRef.current?.querySelector("img")?.offsetTop ?? 0) + crop.y, width: crop.w, height: crop.h, cursor: dragMode === "move" ? "grabbing" : "grab", boxShadow: "0 0 0 1px rgba(0,0,0,0.3)" }}
                onMouseDown={onPointerDown("move")}
              >
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute bg-white/20" style={{ left: "33.3%", top: 0, width: 1, bottom: 0 }} />
                  <div className="absolute bg-white/20" style={{ left: "66.6%", top: 0, width: 1, bottom: 0 }} />
                  <div className="absolute bg-white/20" style={{ top: "33.3%", left: 0, height: 1, right: 0 }} />
                  <div className="absolute bg-white/20" style={{ top: "66.6%", left: 0, height: 1, right: 0 }} />
                </div>
                {handles.map(({ mode, style }) => (
                  <div key={mode} className="absolute bg-white rounded-sm border border-gray-400" style={{ width: handleSize, height: handleSize, ...style }} onMouseDown={onPointerDown(mode)} />
                ))}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-200">
          <p className="text-xs" style={{ color: "var(--bark-faded)" }}>
            {Math.round(crop.w)} × {Math.round(crop.h)}px
            {aspect ? ` (${aspect > 1 ? aspect.toFixed(1) : "1"}:${aspect > 1 ? "1" : (1 / aspect).toFixed(1)})` : " (freeform)"}
          </p>
          <button onClick={handleCrop} className="px-5 py-2 text-sm font-medium rounded-lg text-white transition-colors" style={{ background: "var(--sage)" }} onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.9"; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}>
            Apply Crop
          </button>
        </div>
      </div>
    </div>
  );
}
