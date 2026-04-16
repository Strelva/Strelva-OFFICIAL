"use client";

import { Minus, Plus, Maximize2 } from "lucide-react";

interface DesignCanvasProps {
  siteUrl: string;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  selectedId: string | null;
}

export function DesignCanvas({
  siteUrl,
  zoom,
  onZoomChange,
  selectedId,
}: DesignCanvasProps) {
  const scale = zoom / 100;

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
            src={siteUrl || "/preview"}
            className="w-full h-full min-h-[800px] border-0"
            title="Site preview"
          />
          {selectedId && (
            <div
              className="absolute pointer-events-none border-2 border-accent rounded-sm"
              style={{
                top: "120px",
                left: "40px",
                width: "calc(100% - 80px)",
                height: "300px",
                boxShadow:
                  "0 0 0 1px rgba(91, 141, 239, 0.2), 0 0 0 4000px rgba(0,0,0,0.05)",
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
              <div className="absolute -top-7 left-0 bg-accent text-white text-[10px] font-medium px-2 py-0.5 rounded">
                {selectedId}
              </div>
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
