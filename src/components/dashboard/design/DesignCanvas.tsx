"use client";

import { useEffect, useRef, useState, useMemo, useCallback, type RefObject } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import type { NodeRect } from "../DesignMode";
import { SECTION_LABELS } from "@/components/ui/section-labels";

function sectionLabel(id: string): string {
  return SECTION_LABELS[id] || id.charAt(0).toUpperCase() + id.slice(1);
}

interface DesignCanvasProps {
  siteUrl: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  selectedId: string | null;
  nodeRect: NodeRect | null;
  iframeRef: RefObject<HTMLIFrameElement | null>;
}

export function DesignCanvas({
  siteUrl,
  zoom,
  onZoomChange,
  selectedId,
  nodeRect,
  iframeRef,
}: DesignCanvasProps) {
  const scale = zoom / 100;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [rectFromMessage, setRectFromMessage] = useState<{ id: string; rect: NodeRect } | null>(null);
  const [hoveredSection, setHoveredSection] = useState<{ id: string; rect: NodeRect } | null>(null);

  // Derive the preview origin for postMessage validation
  const previewOrigin = useMemo(() => {
    if (!siteUrl) return null;
    try { return new URL(siteUrl).origin; } catch { return null; }
  }, [siteUrl]);

  // Listen for rect updates and hover events from iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      // Validate message origin
      if (!event.origin || event.origin === 'null') return;
      const allowedOrigins = [window.location.origin];
      if (previewOrigin) allowedOrigins.push(previewOrigin);
      if (!allowedOrigins.includes(event.origin)) return;

      const section = event.data?.section;
      const rect = event.data?.rect;

      if ((event.data?.type === "reb-node-rect" || event.data?.type === "reb-node-selected") && section && rect) {
        setRectFromMessage({ id: section, rect });
      }

      // Handle hover events from EditModeOverlay (now includes rect)
      if (event.data?.type === "reb-section-hovered") {
        if (section && rect) {
          setHoveredSection({ id: section, rect });
        } else if (section) {
          // Fallback: request rect if not included
          if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({
              type: "reb-request-rect",
              section,
            }, previewOrigin || "*");
          }
          setHoveredSection((prev) => prev?.id === section ? prev : { id: section, rect: { top: 0, left: 0, width: 0, height: 0 } });
        } else {
          setHoveredSection(null);
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [iframeRef, previewOrigin]);

  // Enable edit mode in iframe when loaded
  useEffect(() => {
    if (iframeLoaded && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: "reb-edit-mode", enabled: true }, previewOrigin || "*");
    }
  }, [iframeLoaded, iframeRef, previewOrigin]);

  // Cmd/Ctrl + scroll to zoom
  useEffect(() => {
    const handleWheel = (e: Event) => {
      const we = e as WheelEvent;
      if (we.metaKey || we.ctrlKey) {
        we.preventDefault();
        const delta = we.deltaY > 0 ? -10 : 10;
        onZoomChange(Math.min(200, Math.max(25, zoomRef.current + delta)));
      }
    };
    const el = document.querySelector("[data-canvas-viewport]");
    if (el) {
      el.addEventListener("wheel", handleWheel, { passive: false });
      return () => el.removeEventListener("wheel", handleWheel);
    }
  }, [onZoomChange]);

  // Use message rect if it matches current selection, otherwise use prop
  const displayRect = useMemo(() => {
    if (rectFromMessage && rectFromMessage.id === selectedId) {
      return rectFromMessage.rect;
    }
    return nodeRect;
  }, [rectFromMessage, selectedId, nodeRect]);

  // Don't show hover overlay on the selected section
  const showHover = hoveredSection && hoveredSection.id !== selectedId && hoveredSection.rect.width > 0;

  const handleIframeLoad = useCallback(() => {
    setIframeLoaded(true);
  }, []);

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a] relative">
      <div data-canvas-viewport className="flex-1 overflow-auto flex items-start justify-center p-8">
        <div
          className="relative bg-surface-base rounded-lg shadow-2xl border border-gray-border overflow-hidden transition-transform duration-150"
          style={{
            transform: `scale(${scale})`,
            transformOrigin: "top center",
            width: "1280px",
            minHeight: "800px",
          }}
        >
          <iframe
            ref={iframeRef}
            src={siteUrl ? `${siteUrl}?edit=true` : "/preview?edit=true"}
            className="w-full h-full min-h-[800px] border-0"
            title="Site preview"
            onLoad={handleIframeLoad}
          />

          {/* Hover overlay - subtle highlight before click */}
          {showHover && (
            <div
              className="absolute pointer-events-none border border-accent/40 rounded-sm transition-all duration-100"
              style={{
                top: hoveredSection.rect.top,
                left: hoveredSection.rect.left,
                width: hoveredSection.rect.width,
                height: hoveredSection.rect.height,
                backgroundColor: "rgba(91, 141, 239, 0.04)",
              }}
            >
              <div className="absolute -top-6 left-0 bg-accent/80 text-white text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap">
                {sectionLabel(hoveredSection.id)}
              </div>
            </div>
          )}

          {/* Selection overlay - positioned based on real DOM rect */}
          {selectedId && displayRect && displayRect.width > 0 && (
            <div
              className="absolute pointer-events-none border-2 border-accent rounded-sm transition-all duration-150"
              style={{
                top: displayRect.top,
                left: displayRect.left,
                width: displayRect.width,
                height: displayRect.height,
                boxShadow:
                  "0 0 0 1px rgba(91, 141, 239, 0.2), 0 0 0 4000px rgba(0,0,0,0.03)",
              }}
            >
              {(["top-left", "top-right", "bottom-left", "bottom-right"] as const).map(
                (pos) => (
                  <div
                    key={pos}
                    className="absolute w-2 h-2 bg-accent rounded-full border-2 border-white"
                    style={{
                      top: pos.includes("top") ? -4 : undefined,
                      bottom: pos.includes("bottom") ? -4 : undefined,
                      left: pos.includes("left") ? -4 : undefined,
                      right: pos.includes("right") ? -4 : undefined,
                    }}
                  />
                )
              )}
              <div className="absolute -top-7 left-0 bg-accent text-white text-[10px] font-medium px-2 py-0.5 rounded whitespace-nowrap">
                {sectionLabel(selectedId)}
              </div>
            </div>
          )}

          {/* Fallback: show label without rect if no rect available */}
          {selectedId && (!displayRect || displayRect.width === 0) && (
            <div className="absolute top-4 left-4 bg-accent text-white text-[10px] font-medium px-2 py-0.5 rounded whitespace-nowrap">
              Selected: {sectionLabel(selectedId)}
            </div>
          )}
        </div>
      </div>

      {/* Zoom toolbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-surface-raised/90 backdrop-blur-lg border border-gray-border rounded-xl px-2 py-1.5 shadow-lg">
        <button
          onClick={() => onZoomChange(Math.max(25, zoom - 25))}
          aria-label="Zoom out"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors"
        >
          <Minus className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        <span className="text-[11px] text-gray-muted w-10 text-center tabular-nums">
          {zoom}%
        </span>
        <button
          onClick={() => onZoomChange(Math.min(200, zoom + 25))}
          aria-label="Zoom in"
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        <div className="w-px h-4 bg-gray-border mx-1" />
        <button
          onClick={() => onZoomChange(100)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors"
          title="Reset to 100%"
          aria-label="Reset zoom to 100%"
        >
          <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </main>
  );
}
