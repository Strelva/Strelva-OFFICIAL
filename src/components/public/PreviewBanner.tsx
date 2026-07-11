"use client";

import { Eye } from "lucide-react";

export function PreviewBanner() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] flex items-center justify-center gap-2 py-1.5 px-4 bg-warning/90 text-black text-xs font-medium backdrop-blur-sm">
      <Eye className="w-3.5 h-3.5" strokeWidth={2} />
      <span>Preview mode</span>
    </div>
  );
}
