"use client";

import { useRef, useEffect, useState } from "react";
import { useDashboard } from "./DashboardContext";

export function MiniPreview() {
  const { refreshKey, setActivePanel, siteUrl } = useDashboard();
  const [flash, setFlash] = useState(false);
  const prevKeyRef = useRef(refreshKey);

  // Flash green border when content updates
  useEffect(() => {
    if (refreshKey !== prevKeyRef.current) {
      prevKeyRef.current = refreshKey;
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [refreshKey]);

  return (
    <button
      type="button"
      onClick={() => setActivePanel("preview")}
      className={`relative w-full h-[80px] overflow-hidden border-b transition-colors duration-300 ${
        flash ? "border-emerald-400 border-2" : "border-gray-border border-b"
      }`}
      title="Tap to expand preview"
    >
      <div className="absolute inset-0 overflow-hidden">
        <iframe
          key={refreshKey}
          src={siteUrl || "/"}
          className="border-0 pointer-events-none"
          title="Mini preview"
          tabIndex={-1}
          style={{
            width: "400%",
            height: "400%",
            transform: "scale(0.25)",
            transformOrigin: "top left",
          }}
        />
      </div>
      {/* Overlay label */}
      <div className="absolute bottom-1 right-2 bg-surface/80 backdrop-blur-sm rounded px-1.5 py-0.5">
        <span className="text-[11px] text-gray-muted font-mono">PREVIEW</span>
      </div>
    </button>
  );
}
