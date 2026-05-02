"use client";

import { useEffect, useState, useMemo, type RefObject } from "react";
import { Minus, Plus, Maximize2 } from "lucide-react";
import type { NodeRect } from "../DesignMode";

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
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [rectFromMessage, setRectFromMessage] = useState<{ id: string; rect: NodeRect } | null>(null);

  // Listen for rect updates from iframe
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const section = event.data?.section;
      const rect = event.data?.rect;
      if ((event.data?.type === "reb-node-rect" || event.data?.type === "reb-node-selected") && section && rect) {
        setRectFromMessage({ id: section, rect });
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Enable edit mode in iframe when loaded
  useEffect(() => {
    if (iframeLoaded && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: "reb-edit-mode", enabled: true }, "*");
    }
  }, [iframeLoaded, iframeRef]);

  // Use message rect if it matches current selection, otherwise use prop
  const displayRect = useMemo(() => {
    if (rectFromMessage && rectFromMessage.id === selectedId) {
      return rectFromMessage.rect;
    }
    return nodeRect;
  }, [rectFromMessage, selectedId, nodeRect]);

  const handleIframeLoad = () => {
    setIframeLoaded(true);
  };

  return (
    <main className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a] relative">
      <div className="flex-1 overflow-auto flex items-start justify-center p-8">
        <div
          className="relative bg-surface-base rounded-lg shadow-2xl border border-gray-border overflow-hidden"
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
                {selectedId}
              </div>
            </div>
          )}
          {/* Fallback: show label without rect if no rect available */}
          {selectedId && (!displayRect || displayRect.width === 0) && (
            <div className="absolute top-4 left-4 bg-accent text-white text-[10px] font-medium px-2 py-0.5 rounded whitespace-nowrap">
              Selected: {selectedId}
            </div>
          )}
        </div>
      </div>

      {/* Zoom toolbar */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-surface-raised/90 backdrop-blur-lg border border-gray-border rounded-xl px-2 py-1.5 shadow-lg">
        <button
          onClick={() => onZoomChange(Math.max(25, zoom - 25))}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors"
        >
          <Minus className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        <span className="text-[11px] text-gray-muted w-10 text-center tabular-nums">
          {zoom}%
        </span>
        <button
          onClick={() => onZoomChange(Math.min(200, zoom + 25))}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        <div className="w-px h-4 bg-gray-border mx-1" />
        <button
          onClick={() => onZoomChange(100)}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-muted hover:text-warm-black hover:bg-gray-bg transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </main>
  );
}
