"use client";

import { useEffect, useCallback } from "react";
import { MessageCircle, X } from "lucide-react";
import { useDashboard } from "./DashboardContext";
import { ChatPanel } from "./ChatPanel";

interface ChatDrawerProps {
  ownerName: string;
}

export function ChatDrawer({ ownerName }: ChatDrawerProps) {
  const { chatDrawerOpen, setChatDrawerOpen } = useDashboard();

  const close = useCallback(() => setChatDrawerOpen(false), [setChatDrawerOpen]);

  // Escape key to close
  useEffect(() => {
    if (!chatDrawerOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [chatDrawerOpen, close]);

  // Lock body scroll on mobile when open
  useEffect(() => {
    if (!chatDrawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [chatDrawerOpen]);

  return (
    <>
      {/* Floating action button */}
      {!chatDrawerOpen && (
        <button
          onClick={() => setChatDrawerOpen(true)}
          className="fixed z-40 w-10 h-10 rounded-full bg-[#7c9a8e] text-white shadow-md hover:bg-[#5a7a6e] hover:scale-105 transition-all duration-200 flex items-center justify-center bottom-20 right-4 md:bottom-5 md:right-5"
          title="Open AI Chat"
        >
          <MessageCircle className="w-5 h-5" strokeWidth={1.5} />
        </button>
      )}

      {/* Backdrop */}
      {chatDrawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/10 transition-opacity duration-200"
          onClick={close}
          aria-hidden
        />
      )}

      {/* Drawer panel */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-full max-w-[380px] bg-white border-l border-[#e8e8e8] shadow-[-4px_0_12px_rgba(0,0,0,0.05)] flex flex-col transition-transform duration-300 ease-out ${
          chatDrawerOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between h-12 px-4 border-b border-[#e8e8e8] shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-[#7c9a8e]" strokeWidth={1.5} />
            <span className="text-[12px] font-medium text-[#1a1a1a]">AI Chat</span>
          </div>
          <button
            onClick={close}
            className="w-7 h-7 rounded-md flex items-center justify-center text-[#999] hover:text-[#1a1a1a] hover:bg-[#f5f5f5] transition-colors duration-150"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0">
          <ChatPanel ownerName={ownerName} />
        </div>
      </div>
    </>
  );
}
