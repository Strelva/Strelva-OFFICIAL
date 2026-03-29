"use client";

import { useEffect, useCallback, type ReactNode } from "react";
import { X } from "lucide-react";

interface OverlaySheetProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function OverlaySheet({ title, onClose, children }: OverlaySheetProps) {
  const handleEscape = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleEscape]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-xl max-h-[80vh] mx-4 overflow-y-auto rounded-xl bg-white border border-[#e8e8e8] shadow-xl animate-overlay-enter">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 h-12 border-b border-[#e8e8e8] bg-white rounded-t-xl">
          <h2 className="text-[13px] font-medium text-[#1a1a1a]">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-[#999] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors duration-150"
          >
            <X className="w-[14px] h-[14px]" strokeWidth={1.5} />
          </button>
        </div>

        {/* Content */}
        {children}
      </div>
    </div>
  );
}
